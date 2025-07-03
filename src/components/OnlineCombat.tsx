import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { Wifi, WifiOff, AlertCircle, Clock, Check, Users, RefreshCw, AlertTriangle, Loader } from 'lucide-react';
import GameBoard from './GameBoard';

// Interfaces pour typer les données
interface UserProfile {
  username: string;
  level: number;
}

interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  role: string;
  player_number?: number;
  deck_id?: number;
  status: string;
  joined_at: string;
  profile?: UserProfile | null;
}

interface GameRoom {
  id: string;
  name: string;
  host_id: string;
  status: string;
  max_players: number;
  current_players: number;
  game_mode: string;
  created_at: string;
}

interface User {
  id: string;
  username: string;
  level: number;
}

interface Deck {
  id: number;
  name: string;
  cards: any[];
  is_active: boolean;
}

interface OnlineCombatProps {
  user: User;
  userDecks: Deck[];
  onBack: () => void;
}

const OnlineCombat: React.FC<OnlineCombatProps> = ({ user, userDecks, onBack }) => {
  const [currentView, setCurrentView] = useState<'menu' | 'matchmaking' | 'room' | 'game'>('menu');
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [gameStartCountdown, setGameStartCountdown] = useState(0);
  const [matchmakingTimeout, setMatchmakingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionRetries, setConnectionRetries] = useState(0);

  // Constantes
  const MATCHMAKING_TIMEOUT = 300000; // 5 minutes
  const MAX_CONNECTION_RETRIES = 3;
  const PROFILE_RETRY_DELAY = 2000; // 2 secondes

  // Hook de matchmaking
  const matchmaking = useMatchmaking(user);

  // Gestion robuste des erreurs de profil
  const loadRoomParticipants = useCallback(async (roomId: string, retryCount = 0): Promise<void> => {
    try {
      setRefreshing(true);
      
      const { data, error } = await supabase
        .from('room_participants')
        .select(`
          *,
          profile:profiles!room_participants_user_id_fkey(username, level)
        `)
        .eq('room_id', roomId);

      if (error) {
        console.error('Erreur chargement participants:', error);
        
        if (retryCount < MAX_CONNECTION_RETRIES) {
          console.log(`Tentative ${retryCount + 1}/${MAX_CONNECTION_RETRIES} de rechargement des participants`);
          setTimeout(() => {
            loadRoomParticipants(roomId, retryCount + 1);
          }, PROFILE_RETRY_DELAY);
          return;
        }
        
        setError('Impossible de charger les participants de la salle');
        return;
      }

      // Traitement robuste des participants avec gestion des profils manquants
      const processedParticipants: RoomParticipant[] = [];
      
      for (const participant of data || []) {
        let processedParticipant: RoomParticipant = {
          ...participant,
          profile: participant.profile
        };

        // Si le profil est manquant, essayer de le récupérer directement
        if (!participant.profile) {
          console.warn(`Profil manquant pour participant ${participant.user_id}, tentative de récupération`);
          
          try {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('username, level')
              .eq('id', participant.user_id)
              .single();

            if (!profileError && profileData) {
              processedParticipant.profile = profileData;
              console.log(`Profil récupéré pour ${participant.user_id}:`, profileData);
            } else {
              console.error(`Impossible de récupérer le profil pour ${participant.user_id}:`, profileError);
              
              // Profil de fallback
              processedParticipant.profile = {
                username: `Joueur ${participant.user_id.slice(-4)}`,
                level: 1
              };
            }
          } catch (profileFetchError) {
            console.error('Erreur lors de la récupération du profil:', profileFetchError);
            
            // Profil de fallback en cas d'erreur
            processedParticipant.profile = {
              username: `Joueur ${participant.user_id.slice(-4)}`,
              level: 1
            };
          }
        }

        processedParticipants.push(processedParticipant);
      }

      setRoomParticipants(processedParticipants);
      setConnectionRetries(0); // Reset des tentatives en cas de succès
      
    } catch (err) {
      console.error('Erreur participants:', err);
      
      if (retryCount < MAX_CONNECTION_RETRIES) {
        console.log(`Tentative ${retryCount + 1}/${MAX_CONNECTION_RETRIES} de rechargement après erreur`);
        setTimeout(() => {
          loadRoomParticipants(roomId, retryCount + 1);
        }, PROFILE_RETRY_DELAY);
      } else {
        setError('Erreur de connexion persistante. Veuillez rafraîchir manuellement.');
        setConnectionRetries(retryCount);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Rafraîchissement manuel de l'état de la salle
  const refreshRoomState = useCallback(async () => {
    if (!currentRoom) return;

    setRefreshing(true);
    setError(null);

    try {
      // Recharger les informations de la salle
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', currentRoom.id)
        .single();

      if (roomError) {
        throw new Error(`Erreur chargement salle: ${roomError.message}`);
      }

      if (roomData) {
        setCurrentRoom(roomData);
      }

      // Recharger les participants
      await loadRoomParticipants(currentRoom.id);

      console.log('État de la salle rafraîchi avec succès');
      
    } catch (err) {
      console.error('Erreur rafraîchissement:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du rafraîchissement');
    } finally {
      setRefreshing(false);
    }
  }, [currentRoom, loadRoomParticipants]);

  // Timeout pour le matchmaking
  const startMatchmakingTimeout = useCallback(() => {
    if (matchmakingTimeout) {
      clearTimeout(matchmakingTimeout);
    }

    const timeout = setTimeout(() => {
      console.log('Timeout du matchmaking atteint');
      matchmaking.cancelSearch();
      setError('Aucun adversaire trouvé dans les temps. Veuillez réessayer.');
      setCurrentView('menu');
    }, MATCHMAKING_TIMEOUT);

    setMatchmakingTimeout(timeout);
  }, [matchmaking, matchmakingTimeout]);

  // Nettoyer le timeout
  const clearMatchmakingTimeout = useCallback(() => {
    if (matchmakingTimeout) {
      clearTimeout(matchmakingTimeout);
      setMatchmakingTimeout(null);
    }
  }, [matchmakingTimeout]);

  // Entrer en file d'attente avec timeout
  const enterMatchmaking = async () => {
    if (!selectedDeck) {
      setError('Veuillez sélectionner un deck');
      return;
    }

    try {
      setCurrentView('matchmaking');
      setError(null);
      
      // Démarrer le timeout
      startMatchmakingTimeout();
      
      await matchmaking.startSearch('casual', selectedDeck.id, user.level);
    } catch (err) {
      console.error('Erreur matchmaking:', err);
      setError('Impossible de démarrer la recherche');
      setCurrentView('menu');
      clearMatchmakingTimeout();
    }
  };

  // Formatage du temps
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Démarrer le jeu avec gestion d'erreur
  const startGame = async () => {
    if (!currentRoom) return;

    setLoading(true);
    setError(null);
    
    try {
      // Vérifier que tous les joueurs sont prêts
      const players = roomParticipants.filter(p => p.role === 'player');
      const readyPlayers = players.filter(p => p.status === 'ready');
      
      if (players.length !== 2) {
        throw new Error('Il faut exactement 2 joueurs pour commencer');
      }
      
      if (readyPlayers.length !== 2) {
        throw new Error('Tous les joueurs doivent être prêts');
      }

      // Démarrer le compte à rebours
      setGameStartCountdown(5);
      
      const countdown = setInterval(() => {
        setGameStartCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            actuallyStartGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Erreur démarrage jeu:', err);
      setError(err instanceof Error ? err.message : 'Impossible de démarrer le jeu');
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
      setError(err instanceof Error ? err.message : 'Impossible de démarrer le jeu');
    } finally {
      setLoading(false);
    }
  };

  // Basculer le statut prêt avec gestion d'erreur
  const toggleReady = async () => {
    if (!currentRoom) return;

    setLoading(true);
    setError(null);

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
      setError(err instanceof Error ? err.message : 'Impossible de changer le statut');
    } finally {
      setLoading(false);
    }
  };

  // Gérer les résultats du matchmaking
  useEffect(() => {
    if (matchmaking.status === 'match_found' && matchmaking.roomId) {
      console.log('Match trouvé, redirection vers la salle:', matchmaking.roomId);
      
      // Arrêter le matchmaking et le timeout
      matchmaking.cancelSearch();
      clearMatchmakingTimeout();
      
      // Rediriger vers la salle trouvée
      setCurrentView('room');
      
      // Charger les détails de la salle avec gestion d'erreur
      supabase
        .from('game_rooms')
        .select('*')
        .eq('id', matchmaking.roomId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Erreur chargement salle:', error);
            setError('Impossible de charger la salle');
            setCurrentView('menu');
            return;
          }
          
          if (data) {
            setCurrentRoom(data);
            setIsReady(false);
          }
        })
        .catch(err => {
          console.error('Erreur inattendue:', err);
          setError('Erreur inattendue lors du chargement de la salle');
          setCurrentView('menu');
        });
    }

    // Gérer les erreurs de matchmaking
    if (matchmaking.status === 'error') {
      clearMatchmakingTimeout();
      setCurrentView('menu');
    }
  }, [matchmaking.status, matchmaking.roomId, clearMatchmakingTimeout]);

  // Charger les participants quand on entre dans une salle
  useEffect(() => {
    if (currentRoom && currentView === 'room') {
      loadRoomParticipants(currentRoom.id);
      
      // Recharger périodiquement avec gestion d'erreur
      const interval = setInterval(() => {
        if (!refreshing) { // Éviter les rechargements multiples
          loadRoomParticipants(currentRoom.id);
        }
      }, 5000); // Toutes les 5 secondes
      
      return () => clearInterval(interval);
    }
  }, [currentRoom, currentView, loadRoomParticipants, refreshing]);

  // Subscriptions temps réel avec gestion d'erreur
  useEffect(() => {
    if (!currentRoom) return;

    let participantsSubscription: any = null;
    let roomSubscription: any = null;

    try {
      // Écouter les changements de participants
      participantsSubscription = supabase
        .channel(`room_participants_${currentRoom.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${currentRoom.id}`
        }, (payload) => {
          console.log('Changement de participants détecté:', payload);
          if (!refreshing) {
            loadRoomParticipants(currentRoom.id);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Abonné aux changements de participants');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Erreur d\'abonnement aux participants');
            setError('Erreur de connexion temps réel');
          }
        });

      // Écouter les changements de salle
      roomSubscription = supabase
        .channel(`room_${currentRoom.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_rooms',
          filter: `id=eq.${currentRoom.id}`
        }, (payload) => {
          console.log('Changement de salle détecté:', payload);
          const updatedRoom = payload.new as GameRoom;
          setCurrentRoom(updatedRoom);
          
          // Si le jeu a commencé, passer à l'interface de jeu
          if (updatedRoom.status === 'in_progress') {
            setCurrentView('game');
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Abonné aux changements de salle');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Erreur d\'abonnement à la salle');
            setError('Erreur de connexion temps réel');
          }
        });

    } catch (err) {
      console.error('Erreur lors de la création des subscriptions:', err);
      setError('Erreur de connexion temps réel');
    }

    return () => {
      try {
        if (participantsSubscription) {
          participantsSubscription.unsubscribe();
        }
        if (roomSubscription) {
          roomSubscription.unsubscribe();
        }
      } catch (err) {
        console.error('Erreur lors de la désinscription:', err);
      }
    };
  }, [currentRoom, loadRoomParticipants, refreshing]);

  // Nettoyer les timeouts au démontage
  useEffect(() => {
    return () => {
      clearMatchmakingTimeout();
    };
  }, [clearMatchmakingTimeout]);

  // Gérer la fin de partie
  const handleGameEnd = (winner: string) => {
    alert(`${winner} a gagné la partie !`);
    setCurrentView('menu');
    setCurrentRoom(null);
    setIsReady(false);
    setGameStartCountdown(0);
    setError(null);
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
              <div className="flex-1">
                {error || matchmaking.error}
                {connectionRetries > 0 && (
                  <div className="text-sm text-red-300 mt-1">
                    Tentatives de reconnexion: {connectionRetries}/{MAX_CONNECTION_RETRIES}
                  </div>
                )}
              </div>
              <button 
                onClick={() => {
                  setError(null);
                  setConnectionRetries(0);
                }} 
                className="ml-auto text-red-400 hover:text-red-200"
              >
                ✕
              </button>
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

          {/* Matchmaking */}
          {selectedDeck && (
            <div className="flex justify-center">
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 max-w-md w-full">
                <div className="text-center">
                  <Users className="w-16 h-16 text-blue-200 mx-auto mb-6" />
                  <h3 className="text-2xl font-bold text-white mb-4">Combat Décontracté</h3>
                  <p className="text-blue-100 text-sm mb-6">Trouvez un adversaire de votre niveau pour un combat amical</p>
                  
                  <div className="bg-blue-700/50 rounded-lg p-4 mb-6">
                    <div className="text-white font-bold mb-2">Deck sélectionné:</div>
                    <div className="text-blue-200">{selectedDeck.name}</div>
                    <div className="text-blue-300 text-sm">{selectedDeck.cards.length} cartes</div>
                  </div>

                  <button
                    onClick={enterMatchmaking}
                    disabled={loading || matchmaking.isSearching}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {matchmaking.isSearching ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        Recherche en cours...
                      </>
                    ) : (
                      <>
                        🎮 Rechercher un match
                      </>
                    )}
                  </button>

                  <div className="text-blue-200 text-xs mt-2">
                    Timeout automatique: {Math.floor(MATCHMAKING_TIMEOUT / 60000)} minutes
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
    const timeoutProgress = (matchmaking.queueTime / (MATCHMAKING_TIMEOUT / 1000)) * 100;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-8 text-center max-w-md w-full">
          {matchmaking.status === 'searching' && (
            <>
              <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold text-white mb-4">🔍 Recherche d'adversaire</h2>
              <p className="text-gray-300 mb-4">Temps d'attente: {formatTime(matchmaking.queueTime)}</p>
              
              {/* Barre de progression du timeout */}
              <div className="w-full bg-gray-700 rounded-full h-2 mb-6">
                <div 
                  className="bg-yellow-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, timeoutProgress)}%` }}
                ></div>
              </div>
              
              {timeoutProgress > 80 && (
                <div className="bg-yellow-900 border border-yellow-600 text-yellow-200 px-3 py-2 rounded-lg mb-4 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  Timeout dans {Math.ceil((MATCHMAKING_TIMEOUT / 1000) - matchmaking.queueTime)} secondes
                </div>
              )}
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
                  clearMatchmakingTimeout();
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

  // Interface de salle d'attente
  if (currentView === 'room' && currentRoom) {
    const isHost = currentRoom.host_id === user.id;
    const players = roomParticipants.filter(p => p.role === 'player');
    const readyPlayers = players.filter(p => p.status === 'ready');
    const canStart = players.length === 2 && readyPlayers.length === 2 && isHost;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">🎮 Salle de Combat</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshRoomState}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
                title="Rafraîchir l'état de la salle"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Actualisation...' : 'Actualiser'}
              </button>
              <button
                onClick={() => setCurrentView('menu')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                Quitter
              </button>
            </div>
          </div>

          {/* Erreurs spécifiques à la salle */}
          {error && (
            <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <div className="flex-1">{error}</div>
              <button
                onClick={refreshRoomState}
                className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
              >
                Réessayer
              </button>
              <button 
                onClick={() => setError(null)} 
                className="ml-2 text-red-400 hover:text-red-200"
              >
                ✕
              </button>
            </div>
          )}

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

          <div className="bg-slate-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">⚔️ Joueurs ({players.length}/2)</h2>
              {refreshing && (
                <div className="flex items-center gap-2 text-blue-400">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Actualisation...</span>
                </div>
              )}
            </div>
            
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
                            <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                              👑
                            </div>
                          )}
                          <div>
                            <p className="text-white font-bold">
                              {player.profile?.username || `Joueur ${player.user_id.slice(-4)}`}
                              {player.user_id === user.id && ' (Vous)'}
                            </p>
                            <p className="text-gray-300 text-sm">
                              Niveau {player.profile?.level || 'N/A'}
                            </p>
                            {!player.profile && (
                              <p className="text-yellow-400 text-xs">
                                ⚠️ Profil en cours de chargement...
                              </p>
                            )}
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
                  className={`w-full px-6 py-3 rounded-lg font-bold text-lg transition-colors flex items-center justify-center gap-2 ${
                    isReady 
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {loading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {isReady ? '⏳ Pas prêt' : '✅ Prêt'}
                    </>
                  )}
                </button>
              )}

              {/* Bouton démarrer pour l'hôte */}
              {canStart && (
                <button
                  onClick={startGame}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-bold text-lg animate-pulse flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      🚀 Démarrer le combat !
                    </>
                  )}
                </button>
              )}

              {/* Messages d'attente */}
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

              {connectionRetries > 0 && (
                <div className="bg-yellow-900 border border-yellow-600 text-yellow-200 px-3 py-2 rounded-lg text-sm text-center">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  Problèmes de connexion détectés. Utilisez le bouton "Actualiser" si nécessaire.
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