import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { Users, Wifi, WifiOff, Eye, Play, Search, Copy, Check, Crown, Sword, Shield, Zap, AlertCircle, Clock } from 'lucide-react';
import GameBoard from './GameBoard';

interface GameRoom {
  id: string;
  name: string;
  room_code?: string;
  host_id: string;
  status: 'waiting' | 'starting' | 'in_progress' | 'finished' | 'cancelled';
  game_mode: 'ranked' | 'casual' | 'private' | 'tournament';
  current_players: number;
  max_players: number;
  allow_spectators: boolean;
  min_level: number;
  max_level: number;
  entry_cost: number;
  prize_pool: number;
  created_at: string;
  started_at?: string;
  host_profile?: {
    username: string;
    level: number;
  };
}

interface RoomParticipant {
  id: string;
  user_id: string;
  role: 'player' | 'spectator';
  player_number?: number;
  status: string;
  profile: {
    username: string;
    level: number;
  };
}

interface OnlineCombatProps {
  user: any;
  userDecks: any[];
  onBack: () => void;
}

const OnlineCombat: React.FC<OnlineCombatProps> = ({ user, userDecks, onBack }) => {
  const [currentView, setCurrentView] = useState<'menu' | 'browse' | 'create' | 'room' | 'matchmaking' | 'game'>('menu');
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [gameStartCountdown, setGameStartCountdown] = useState(0);

  // Hook de matchmaking
  const matchmaking = useMatchmaking(user);

  // Formulaire de création de salle
  const [roomForm, setRoomForm] = useState({
    name: '',
    game_mode: 'casual' as const,
    allow_spectators: true,
    min_level: 1,
    max_level: 100,
    entry_cost: 0
  });

  // Code pour rejoindre une salle privée
  const [joinCode, setJoinCode] = useState('');

  // Charger les salles disponibles
  const loadRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('game_rooms')
        .select(`
          *,
          host_profile:profiles!game_rooms_host_id_fkey(username, level)
        `)
        .in('status', ['waiting', 'in_progress'])
        .in('game_mode', ['ranked', 'casual'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des salles:', err);
      setError('Impossible de charger les salles');
    }
  }, []);

  // Créer une nouvelle salle
  const createRoom = async () => {
    if (!selectedDeck) {
      setError('Veuillez sélectionner un deck');
      return;
    }

    setLoading(true);
    try {
      // Créer la salle
      const { data: room, error: roomError } = await supabase
        .from('game_rooms')
        .insert({
          name: roomForm.name || `Salle de ${user.username}`,
          host_id: user.id,
          game_mode: roomForm.game_mode,
          allow_spectators: roomForm.allow_spectators,
          min_level: roomForm.min_level,
          max_level: roomForm.max_level,
          entry_cost: roomForm.entry_cost,
          prize_pool: roomForm.entry_cost * 2
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Rejoindre la salle en tant qu'hôte
      const { error: participantError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          role: 'player',
          player_number: 1,
          deck_id: selectedDeck.id,
          status: 'connected'
        });

      if (participantError) throw participantError;

      setCurrentRoom(room);
      setIsReady(false);
      setCurrentView('room');
    } catch (err) {
      console.error('Erreur lors de la création de la salle:', err);
      setError('Impossible de créer la salle');
    } finally {
      setLoading(false);
    }
  };

  // Rejoindre une salle
  const joinRoom = async (room: GameRoom, asSpectator = false) => {
    if (!asSpectator && !selectedDeck) {
      setError('Veuillez sélectionner un deck pour jouer');
      return;
    }

    setLoading(true);
    try {
      const playerNumber = asSpectator ? null : (room.current_players + 1);
      
      const { error } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          role: asSpectator ? 'spectator' : 'player',
          player_number: playerNumber,
          deck_id: asSpectator ? null : selectedDeck.id,
          status: 'connected'
        });

      if (error) throw error;

      // Mettre à jour le nombre de joueurs si c'est un joueur
      if (!asSpectator) {
        const { error: updateError } = await supabase
          .from('game_rooms')
          .update({ current_players: room.current_players + 1 })
          .eq('id', room.id);

        if (updateError) throw updateError;
      }

      setCurrentRoom(room);
      setIsReady(false);
      setCurrentView('room');
    } catch (err) {
      console.error('Erreur lors de la connexion à la salle:', err);
      setError('Impossible de rejoindre la salle');
    } finally {
      setLoading(false);
    }
  };

  // Rejoindre avec un code
  const joinWithCode = async () => {
    if (!joinCode.trim()) {
      setError('Veuillez entrer un code de salle');
      return;
    }

    if (!selectedDeck) {
      setError('Veuillez sélectionner un deck');
      return;
    }

    setLoading(true);
    try {
      const { data: room, error } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('room_code', joinCode.toUpperCase())
        .eq('status', 'waiting')
        .single();

      if (error || !room) {
        setError('Code de salle invalide ou salle non disponible');
        return;
      }

      await joinRoom(room);
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de rejoindre la salle');
    } finally {
      setLoading(false);
    }
  };

  // Entrer en file d'attente
  const enterMatchmaking = async () => {
    if (!selectedDeck) {
      setError('Veuillez sélectionner un deck');
      return;
    }

    try {
      setCurrentView('matchmaking');
      await matchmaking.startSearch('ranked', selectedDeck.id, user.level);
    } catch (err) {
      console.error('Erreur matchmaking:', err);
      setError('Impossible de démarrer la recherche');
      setCurrentView('menu');
    }
  };

  // Charger les participants d'une salle
  const loadRoomParticipants = useCallback(async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('room_participants')
        .select(`
          *,
          profile:profiles!room_participants_user_id_fkey(username, level)
        `)
        .eq('room_id', roomId);

      if (error) throw error;
      setRoomParticipants(data || []);
    } catch (err) {
      console.error('Erreur participants:', err);
    }
  }, []);

  // Démarrer le jeu
  const startGame = async () => {
    if (!currentRoom) return;

    setLoading(true);
    try {
      // Démarrer le compte à rebours
      setGameStartCountdown(5);
      
      const countdown = setInterval(() => {
        setGameStartCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            // Démarrer réellement le jeu
            actuallyStartGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Erreur démarrage jeu:', err);
      setError('Impossible de démarrer le jeu');
      setLoading(false);
    }
  };

  const actuallyStartGame = async () => {
    if (!currentRoom) return;

    try {
      // Mettre à jour le statut de la salle
      const { error: roomError } = await supabase
        .from('game_rooms')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', currentRoom.id);

      if (roomError) throw roomError;

      // Mettre à jour le statut des participants
      const { error: participantsError } = await supabase
        .from('room_participants')
        .update({ status: 'playing' })
        .eq('room_id', currentRoom.id)
        .eq('role', 'player');

      if (participantsError) throw participantsError;

      // Passer à l'interface de jeu
      setCurrentView('game');
    } catch (err) {
      console.error('Erreur démarrage réel du jeu:', err);
      setError('Impossible de démarrer le jeu');
    } finally {
      setLoading(false);
    }
  };

  // Basculer le statut prêt
  const toggleReady = async () => {
    if (!currentRoom) return;

    try {
      const newStatus = isReady ? 'connected' : 'ready';
      
      const { error } = await supabase
        .from('room_participants')
        .update({ status: newStatus })
        .eq('room_id', currentRoom.id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setIsReady(!isReady);
    } catch (err) {
      console.error('Erreur changement statut:', err);
      setError('Impossible de changer le statut');
    }
  };

  // Copier le code de salle
  const copyRoomCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('Erreur copie:', err);
    }
  };

  // Formatage du temps
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Charger les données initiales
  useEffect(() => {
    if (currentView === 'browse') {
      loadRooms();
    }
  }, [currentView, loadRooms]);

  // Charger les participants quand on entre dans une salle
  useEffect(() => {
    if (currentRoom && currentView === 'room') {
      loadRoomParticipants(currentRoom.id);
    }
  }, [currentRoom, currentView, loadRoomParticipants]);

  // Gérer les résultats du matchmaking
  useEffect(() => {
    if (matchmaking.status === 'match_found' && matchmaking.roomId) {
      // Rediriger vers la salle trouvée
      setCurrentView('room');
      // Charger les détails de la salle
      supabase
        .from('game_rooms')
        .select('*')
        .eq('id', matchmaking.roomId)
        .single()
        .then(({ data }) => {
          if (data) {
            setCurrentRoom(data);
            setIsReady(false);
          }
        });
    }
  }, [matchmaking.status, matchmaking.roomId]);

  // Subscriptions temps réel
  useEffect(() => {
    if (!currentRoom) return;

    // Écouter les changements de participants
    const participantsSubscription = supabase
      .channel(`room_participants_${currentRoom.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_participants',
        filter: `room_id=eq.${currentRoom.id}`
      }, () => {
        loadRoomParticipants(currentRoom.id);
      })
      .subscribe();

    // Écouter les changements de salle
    const roomSubscription = supabase
      .channel(`room_${currentRoom.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${currentRoom.id}`
      }, (payload) => {
        const updatedRoom = payload.new as GameRoom;
        setCurrentRoom(updatedRoom);
        
        // Si le jeu a commencé, passer à l'interface de jeu
        if (updatedRoom.status === 'in_progress') {
          setCurrentView('game');
        }
      })
      .subscribe();

    return () => {
      participantsSubscription.unsubscribe();
      roomSubscription.unsubscribe();
    };
  }, [currentRoom, loadRoomParticipants]);

  // Gérer la fin de partie
  const handleGameEnd = (winner: string) => {
    alert(`${winner} a gagné la partie !`);
    setCurrentView('menu');
    setCurrentRoom(null);
    setIsReady(false);
    setGameStartCountdown(0);
  };

  // Interface de jeu
  if (currentView === 'game' && currentRoom) {
    return (
      <GameBoard
        roomId={currentRoom.id}
        playerId={user.id}
        onGameEnd={handleGameEnd}
        onBack={() => setCurrentView('room')}
      />
    );
  }

  // Interface principale
  if (currentView === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white">⚔️ Combat en Ligne</h1>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isConnected ? 'bg-green-900' : 'bg-red-900'}`}>
                {isConnected ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                <span className="text-white text-sm">{isConnected ? 'Connecté' : 'Déconnecté'}</span>
              </div>
              <button
                onClick={onBack}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                🏠 Retour
              </button>
            </div>
          </div>

          {(error || matchmaking.error) && (
            <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error || matchmaking.error}
              <button onClick={() => {setError(null);}} className="ml-auto text-red-400 hover:text-red-200">✕</button>
            </div>
          )}

          {/* Sélection de deck */}
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">🃏 Sélectionnez votre deck</h2>
            {userDecks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">Vous devez créer un deck pour jouer en ligne</p>
                <button
                  onClick={onBack}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                >
                  Créer un deck
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {userDecks.map(deck => (
                  <div
                    key={deck.id}
                    onClick={() => setSelectedDeck(deck)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedDeck?.id === deck.id
                        ? 'border-blue-500 bg-blue-900/50'
                        : 'border-gray-600 bg-slate-700 hover:border-gray-500'
                    }`}
                  >
                    <h3 className="text-white font-bold">{deck.name}</h3>
                    <p className="text-gray-300 text-sm">{deck.cards.length} cartes</p>
                    {deck.is_active && (
                      <span className="inline-block bg-green-600 text-white text-xs px-2 py-1 rounded mt-2">
                        Deck actif
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Options de jeu */}
          {selectedDeck && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Matchmaking Classé */}
              <div className="bg-gradient-to-br from-yellow-600 to-orange-700 p-6 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <Crown className="w-12 h-12 text-yellow-200 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Classé</h3>
                  <p className="text-yellow-100 text-sm mb-4">Matchmaking automatique par niveau</p>
                  <button
                    onClick={enterMatchmaking}
                    disabled={loading || matchmaking.isSearching}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                  >
                    {matchmaking.isSearching ? 'Recherche...' : 'Rechercher un match'}
                  </button>
                </div>
              </div>

              {/* Parcourir les salles */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <Search className="w-12 h-12 text-blue-200 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Parcourir</h3>
                  <p className="text-blue-100 text-sm mb-4">Rejoindre une salle existante</p>
                  <button
                    onClick={() => setCurrentView('browse')}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                  >
                    Voir les salles
                  </button>
                </div>
              </div>

              {/* Créer une salle */}
              <div className="bg-gradient-to-br from-green-600 to-green-800 p-6 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <Play className="w-12 h-12 text-green-200 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Créer</h3>
                  <p className="text-green-100 text-sm mb-4">Créer votre propre salle</p>
                  <button
                    onClick={() => setCurrentView('create')}
                    className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                  >
                    Nouvelle salle
                  </button>
                </div>
              </div>

              {/* Salle privée */}
              <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-6 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <Users className="w-12 h-12 text-purple-200 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Code privé</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Code de salle"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="w-full bg-purple-700 text-white px-3 py-2 rounded text-center font-mono"
                      maxLength={6}
                    />
                    <button
                      onClick={joinWithCode}
                      disabled={loading || !joinCode.trim()}
                      className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                    >
                      Rejoindre
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Interface de matchmaking
  if (currentView === 'matchmaking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-yellow-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-8 text-center max-w-md w-full">
          {matchmaking.status === 'searching' && (
            <>
              <div className="animate-spin w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold text-white mb-4">🔍 Recherche d'adversaire</h2>
              <p className="text-gray-300 mb-6">Temps d'attente: {formatTime(matchmaking.queueTime)}</p>
            </>
          )}

          {matchmaking.status === 'match_found' && (
            <>
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">✅ Adversaire trouvé !</h2>
              {matchmaking.opponent && (
                <div className="bg-slate-700 rounded-lg p-4 mb-6">
                  <p className="text-white font-bold">{matchmaking.opponent.username}</p>
                  <p className="text-gray-300">Niveau {matchmaking.opponent.level}</p>
                </div>
              )}
              <p className="text-gray-300 mb-6">Connexion à la salle de jeu...</p>
            </>
          )}

          {matchmaking.status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">❌ Erreur</h2>
              <p className="text-red-300 mb-6">{matchmaking.error}</p>
            </>
          )}

          <div className="space-y-4">
            <div className="bg-slate-700 rounded-lg p-4">
              <p className="text-white font-bold">Deck sélectionné:</p>
              <p className="text-gray-300">{selectedDeck?.name}</p>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <p className="text-white font-bold">Niveau recherché:</p>
              <p className="text-gray-300">{Math.max(1, user.level - 5)} - {user.level + 5}</p>
            </div>
            
            {matchmaking.status !== 'match_found' && (
              <button
                onClick={() => {
                  matchmaking.cancelSearch();
                  setCurrentView('menu');
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold transition-colors"
              >
                Annuler la recherche
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Interface de navigation des salles
  if (currentView === 'browse') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">🏛️ Salles disponibles</h1>
            <button
              onClick={() => setCurrentView('menu')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
            >
              ← Retour
            </button>
          </div>

          <div className="grid gap-4">
            {rooms.length === 0 ? (
              <div className="bg-slate-800 rounded-lg p-8 text-center">
                <p className="text-gray-400 text-xl">Aucune salle disponible</p>
                <button
                  onClick={() => setCurrentView('create')}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                >
                  Créer la première salle
                </button>
              </div>
            ) : (
              rooms.map(room => (
                <div key={room.id} className="bg-slate-800 rounded-lg p-6 border border-slate-600">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-white">{room.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          room.game_mode === 'ranked' ? 'bg-yellow-600 text-white' :
                          room.game_mode === 'casual' ? 'bg-blue-600 text-white' :
                          'bg-purple-600 text-white'
                        }`}>
                          {room.game_mode === 'ranked' ? '👑 Classé' :
                           room.game_mode === 'casual' ? '🎮 Décontracté' :
                           '🔒 Privé'}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          room.status === 'waiting' ? 'bg-green-600 text-white' :
                          room.status === 'in_progress' ? 'bg-orange-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}>
                          {room.status === 'waiting' ? 'En attente' :
                           room.status === 'in_progress' ? 'En cours' :
                           'Terminé'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Hôte:</span>
                          <p className="text-white font-bold">{room.host_profile?.username}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Joueurs:</span>
                          <p className="text-white font-bold">{room.current_players}/{room.max_players}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Niveau:</span>
                          <p className="text-white font-bold">{room.min_level}-{room.max_level}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Mise:</span>
                          <p className="text-white font-bold">{room.entry_cost} PO</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      {room.status === 'waiting' && room.current_players < room.max_players && (
                        <button
                          onClick={() => joinRoom(room)}
                          disabled={loading}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
                        >
                          <Sword className="w-4 h-4" />
                          Jouer
                        </button>
                      )}
                      
                      {room.allow_spectators && room.status === 'in_progress' && (
                        <button
                          onClick={() => joinRoom(room, true)}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          Observer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Interface de création de salle
  if (currentView === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">🏗️ Créer une salle</h1>
            <button
              onClick={() => setCurrentView('menu')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
            >
              ← Retour
            </button>
          </div>

          <div className="bg-slate-800 rounded-lg p-6">
            <div className="space-y-6">
              <div>
                <label className="block text-white font-bold mb-2">Nom de la salle</label>
                <input
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={`Salle de ${user.username}`}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-white font-bold mb-2">Mode de jeu</label>
                <select
                  value={roomForm.game_mode}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, game_mode: e.target.value as any }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg"
                >
                  <option value="casual">🎮 Décontracté</option>
                  <option value="ranked">👑 Classé</option>
                  <option value="private">🔒 Privé</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-bold mb-2">Niveau min</label>
                  <input
                    type="number"
                    value={roomForm.min_level}
                    onChange={(e) => setRoomForm(prev => ({ ...prev, min_level: parseInt(e.target.value) || 1 }))}
                    min="1"
                    max="100"
                    className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-white font-bold mb-2">Niveau max</label>
                  <input
                    type="number"
                    value={roomForm.max_level}
                    onChange={(e) => setRoomForm(prev => ({ ...prev, max_level: parseInt(e.target.value) || 100 }))}
                    min="1"
                    max="100"
                    className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-white font-bold mb-2">Mise d'entrée (PO)</label>
                <input
                  type="number"
                  value={roomForm.entry_cost}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, entry_cost: parseInt(e.target.value) || 0 }))}
                  min="0"
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg"
                />
                {roomForm.entry_cost > 0 && (
                  <p className="text-gray-400 text-sm mt-1">
                    Cagnotte: {roomForm.entry_cost * 2} PO
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="allow_spectators"
                  checked={roomForm.allow_spectators}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, allow_spectators: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="allow_spectators" className="text-white">
                  Autoriser les spectateurs
                </label>
              </div>

              <button
                onClick={createRoom}
                disabled={loading || !selectedDeck}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-colors"
              >
                {loading ? 'Création...' : 'Créer la salle'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Interface de salle d'attente
  if (currentView === 'room' && currentRoom) {
    const isHost = currentRoom.host_id === user.id;
    const players = roomParticipants.filter(p => p.role === 'player');
    const spectators = roomParticipants.filter(p => p.role === 'spectator');
    const readyPlayers = players.filter(p => p.status === 'ready');
    const canStart = players.length === 2 && readyPlayers.length === 2 && isHost;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">{currentRoom.name}</h1>
            <div className="flex items-center gap-4">
              {currentRoom.room_code && (
                <div className="flex items-center gap-2 bg-purple-900 px-4 py-2 rounded-lg">
                  <span className="text-white font-mono text-lg">{currentRoom.room_code}</span>
                  <button
                    onClick={() => copyRoomCode(currentRoom.room_code!)}
                    className="text-purple-300 hover:text-white transition-colors"
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <button
                onClick={() => setCurrentView('menu')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                Quitter
              </button>
            </div>
          </div>

          {/* Compte à rebours de démarrage */}
          {gameStartCountdown > 0 && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <Clock className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-white mb-4">Le combat commence dans</h2>
                <div className="text-6xl font-bold text-yellow-400 mb-4">{gameStartCountdown}</div>
                <p className="text-gray-300">Préparez-vous !</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Joueurs */}
            <div className="lg:col-span-2 bg-slate-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4">⚔️ Joueurs ({players.length}/2)</h2>
              <div className="space-y-4">
                {[1, 2].map(playerNum => {
                  const player = players.find(p => p.player_number === playerNum);
                  return (
                    <div key={playerNum} className={`p-4 rounded-lg border-2 ${
                      player ? 'border-green-500 bg-green-900/20' : 'border-gray-600 bg-slate-700'
                    }`}>
                      {player ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {player.user_id === currentRoom.host_id && (
                              <Crown className="w-5 h-5 text-yellow-400" />
                            )}
                            <div>
                              <p className="text-white font-bold">{player.profile.username}</p>
                              <p className="text-gray-300 text-sm">Niveau {player.profile.level}</p>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded text-sm font-bold ${
                            player.status === 'ready' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'
                          }`}>
                            {player.status === 'ready' ? '✅ Prêt' : '⏳ En attente'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400">
                          <Users className="w-8 h-8 mx-auto mb-2" />
                          <p>En attente d'un joueur...</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Contrôles de la salle */}
              <div className="mt-6 space-y-4">
                {/* Bouton Prêt/Pas prêt pour les joueurs */}
                {players.some(p => p.user_id === user.id) && (
                  <button
                    onClick={toggleReady}
                    disabled={loading}
                    className={`w-full px-6 py-3 rounded-lg font-bold text-lg transition-colors ${
                      isReady 
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {loading ? 'Changement...' : isReady ? '⏳ Pas prêt' : '✅ Prêt'}
                  </button>
                )}

                {/* Bouton démarrer pour l'hôte */}
                {canStart && (
                  <button
                    onClick={startGame}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-bold text-lg animate-pulse"
                  >
                    {loading ? 'Démarrage...' : '🚀 Démarrer le combat !'}
                  </button>
                )}

                {/* Message d'attente */}
                {players.length === 2 && readyPlayers.length < 2 && (
                  <div className="text-center text-yellow-400 font-bold">
                    En attente que tous les joueurs soient prêts...
                  </div>
                )}

                {players.length < 2 && (
                  <div className="text-center text-blue-400 font-bold">
                    En attente d'un second joueur...
                  </div>
                )}
              </div>
            </div>

            {/* Spectateurs et infos */}
            <div className="space-y-6">
              {/* Infos de la salle */}
              <div className="bg-slate-800 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4">ℹ️ Informations</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mode:</span>
                    <span className="text-white font-bold">
                      {currentRoom.game_mode === 'ranked' ? '👑 Classé' :
                       currentRoom.game_mode === 'casual' ? '🎮 Décontracté' :
                       '🔒 Privé'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Niveau:</span>
                    <span className="text-white font-bold">{currentRoom.min_level}-{currentRoom.max_level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mise:</span>
                    <span className="text-white font-bold">{currentRoom.entry_cost} PO</span>
                  </div>
                  {currentRoom.prize_pool > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cagnotte:</span>
                      <span className="text-yellow-400 font-bold">{currentRoom.prize_pool} PO</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Spectateurs */}
              {currentRoom.allow_spectators && (
                <div className="bg-slate-800 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-4">👁️ Spectateurs ({spectators.length})</h3>
                  {spectators.length === 0 ? (
                    <p className="text-gray-400 text-sm">Aucun spectateur</p>
                  ) : (
                    <div className="space-y-2">
                      {spectators.map(spectator => (
                        <div key={spectator.id} className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-blue-400" />
                          <span className="text-white">{spectator.profile.username}</span>
                          <span className="text-gray-400 text-sm">Niv. {spectator.profile.level}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default OnlineCombat;