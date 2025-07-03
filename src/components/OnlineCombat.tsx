import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { Wifi, WifiOff, AlertCircle, Clock, Check, Users } from 'lucide-react';
import GameBoard from './GameBoard';

interface OnlineCombatProps {
  user: any;
  userDecks: any[];
  onBack: () => void;
}

const OnlineCombat: React.FC<OnlineCombatProps> = ({ user, userDecks, onBack }) => {
  const [currentView, setCurrentView] = useState<'menu' | 'matchmaking' | 'room' | 'game'>('menu');
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [roomParticipants, setRoomParticipants] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [gameStartCountdown, setGameStartCountdown] = useState(0);

  // Hook de matchmaking
  const matchmaking = useMatchmaking(user);

  // Entrer en file d'attente
  const enterMatchmaking = async () => {
    if (!selectedDeck) {
      setError('Veuillez sélectionner un deck');
      return;
    }

    try {
      setCurrentView('matchmaking');
      await matchmaking.startSearch('casual', selectedDeck.id, user.level);
    } catch (err) {
      console.error('Erreur matchmaking:', err);
      setError('Impossible de démarrer la recherche');
      setCurrentView('menu');
    }
  };

  // Charger les participants d'une salle avec gestion d'erreur
  const loadRoomParticipants = useCallback(async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('room_participants')
        .select(`
          *,
          profile:profiles!room_participants_user_id_fkey(username, level)
        `)
        .eq('room_id', roomId);

      if (error) {
        console.error('Erreur chargement participants:', error);
        return;
      }

      // Filtrer les participants avec des profils valides
      const validParticipants = (data || []).map(participant => {
        if (!participant.profile) {
          // Si le profil n'est pas chargé, essayer de le récupérer directement
          console.warn('Profil manquant pour participant:', participant.user_id);
          return {
            ...participant,
            profile: {
              username: 'Utilisateur inconnu',
              level: 1
            }
          };
        }
        return participant;
      });

      setRoomParticipants(validParticipants);
    } catch (err) {
      console.error('Erreur participants:', err);
    }
  }, []);

  // Formatage du temps
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Gérer les résultats du matchmaking
  useEffect(() => {
    if (matchmaking.status === 'match_found' && matchmaking.roomId) {
      console.log('Match trouvé, redirection vers la salle:', matchmaking.roomId);
      
      // Arrêter le matchmaking
      matchmaking.cancelSearch();
      
      // Rediriger vers la salle trouvée
      setCurrentView('room');
      
      // Charger les détails de la salle
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
        });
    }
  }, [matchmaking.status, matchmaking.roomId]);

  // Charger les participants quand on entre dans une salle
  useEffect(() => {
    if (currentRoom && currentView === 'room') {
      loadRoomParticipants(currentRoom.id);
      
      // Recharger périodiquement pour s'assurer d'avoir les dernières données
      const interval = setInterval(() => {
        loadRoomParticipants(currentRoom.id);
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [currentRoom, currentView, loadRoomParticipants]);

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
        console.log('Changement de participants détecté');
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
        console.log('Changement de salle détecté:', payload);
        const updatedRoom = payload.new;
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
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-colors"
                  >
                    {matchmaking.isSearching ? 'Recherche en cours...' : '🎮 Rechercher un match'}
                  </button>
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-8 text-center max-w-md w-full">
          {matchmaking.status === 'searching' && (
            <>
              <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6"></div>
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
            <button
              onClick={() => setCurrentView('menu')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
            >
              Quitter
            </button>
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

          <div className="bg-slate-800 rounded-lg p-6">
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
                            <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                              👑
                            </div>
                          )}
                          <div>
                            <p className="text-white font-bold">
                              {player.profile?.username || 'Chargement...'}
                            </p>
                            <p className="text-gray-300 text-sm">
                              Niveau {player.profile?.level || 'N/A'}
                            </p>
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default OnlineCombat;