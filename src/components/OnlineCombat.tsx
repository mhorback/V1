import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Swords, Users, Clock, Trophy, ArrowLeft, Play, UserCheck, UserX } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  host_id: string;
  max_players: number;
  is_public: boolean;
  status: 'waiting' | 'playing' | 'finished';
  created_at: string;
  settings: {
    time_limit: number;
    rounds: number;
  };
}

interface RoomParticipant {
  id: string;
  user_id: string;
  room_id: string;
  role: 'player' | 'spectator';
  status: 'waiting' | 'ready' | 'playing';
  joined_at: string;
  profile: {
    username: string;
    level: number;
  };
}

interface OnlineCombatProps {
  onBack: () => void;
}

const OnlineCombat: React.FC<OnlineCombatProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'lobby' | 'room' | 'game'>('lobby');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ CORRECTION : Fonction loadRoomParticipants améliorée
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

      // ✅ CORRECTION : Filtrer les participants invalides complètement
      const validParticipants = (data || []).filter(participant => {
        if (!participant.profile || !participant.profile.username) {
          console.warn('Participant avec profil invalide ignoré:', participant.user_id);
          return false;
        }
        return true;
      });

      setRoomParticipants(validParticipants);
      
      // Mettre à jour le statut prêt de l'utilisateur actuel
      const currentUserParticipant = validParticipants.find(p => p.user_id === user.id);
      if (currentUserParticipant) {
        setIsReady(currentUserParticipant.status === 'ready');
      }
    } catch (err) {
      console.error('Erreur participants:', err);
    }
  }, [user.id]);

  // ✅ CORRECTION : Fonction de nettoyage automatique
  const cleanupInvalidParticipants = useCallback(async (roomId: string) => {
    try {
      // Supprimer les participants sans profil valide
      const { error } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_id', roomId)
        .is('profile.username', null);

      if (error) {
        console.error('Erreur nettoyage participants:', error);
      }
    } catch (err) {
      console.error('Erreur nettoyage:', err);
    }
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('status', 'waiting')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement salles:', error);
        return;
      }

      setRooms(data || []);
    } catch (err) {
      console.error('Erreur salles:', err);
    }
  }, []);

  const createRoom = async () => {
    if (!newRoomName.trim()) return;

    setLoading(true);
    try {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert([
          {
            name: newRoomName.trim(),
            host_id: user.id,
            max_players: 2,
            is_public: true,
            status: 'waiting',
            settings: {
              time_limit: 300,
              rounds: 1
            }
          }
        ])
        .select()
        .single();

      if (roomError) {
        console.error('Erreur création salle:', roomError);
        return;
      }

      // Rejoindre la salle en tant qu'hôte
      const { error: participantError } = await supabase
        .from('room_participants')
        .insert([
          {
            user_id: user.id,
            room_id: roomData.id,
            role: 'player',
            status: 'waiting'
          }
        ]);

      if (participantError) {
        console.error('Erreur rejoindre salle:', participantError);
        return;
      }

      setCurrentRoom(roomData);
      setIsHost(true);
      setCurrentView('room');
      setShowCreateRoom(false);
      setNewRoomName('');
    } catch (err) {
      console.error('Erreur création:', err);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (room: Room) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('room_participants')
        .insert([
          {
            user_id: user.id,
            room_id: room.id,
            role: 'player',
            status: 'waiting'
          }
        ]);

      if (error) {
        console.error('Erreur rejoindre salle:', error);
        return;
      }

      setCurrentRoom(room);
      setIsHost(false);
      setCurrentView('room');
    } catch (err) {
      console.error('Erreur rejoindre:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleReady = async () => {
    if (!currentRoom) return;

    const newStatus = isReady ? 'waiting' : 'ready';
    
    try {
      const { error } = await supabase
        .from('room_participants')
        .update({ status: newStatus })
        .eq('room_id', currentRoom.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Erreur changement statut:', error);
        return;
      }

      setIsReady(!isReady);
    } catch (err) {
      console.error('Erreur statut:', err);
    }
  };

  const leaveRoom = async () => {
    if (!currentRoom) return;

    try {
      const { error } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_id', currentRoom.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Erreur quitter salle:', error);
        return;
      }

      if (isHost) {
        // Si c'est l'hôte, supprimer la salle
        await supabase
          .from('rooms')
          .delete()
          .eq('id', currentRoom.id);
      }

      setCurrentRoom(null);
      setIsHost(false);
      setIsReady(false);
      setCurrentView('lobby');
    } catch (err) {
      console.error('Erreur quitter:', err);
    }
  };

  const startGame = async () => {
    if (!currentRoom || !isHost) return;

    try {
      const { error } = await supabase
        .from('rooms')
        .update({ status: 'playing' })
        .eq('id', currentRoom.id);

      if (error) {
        console.error('Erreur démarrage:', error);
        return;
      }

      setCurrentView('game');
    } catch (err) {
      console.error('Erreur démarrage:', err);
    }
  };

  // ✅ CORRECTION : useEffect amélioré avec nettoyage
  useEffect(() => {
    if (currentRoom && currentView === 'room') {
      loadRoomParticipants(currentRoom.id);
      cleanupInvalidParticipants(currentRoom.id);
      
      const interval = setInterval(() => {
        loadRoomParticipants(currentRoom.id);
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [currentRoom, currentView, loadRoomParticipants, cleanupInvalidParticipants]);

  useEffect(() => {
    if (currentView === 'lobby') {
      loadRooms();
      const interval = setInterval(loadRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [currentView, loadRooms]);

  // ✅ CORRECTION : Logique de démarrage améliorée
  const players = roomParticipants.filter(p => 
    p.role === 'player' && 
    p.profile && 
    p.profile.username && 
    p.profile.username !== 'Utilisateur inconnu'
  );
  const readyPlayers = players.filter(p => p.status === 'ready');
  const canStart = players.length === 2 && readyPlayers.length === 2 && isHost;

  // Debug pour identifier le problème
  console.log('Debug participants:', {
    totalParticipants: roomParticipants.length,
    validPlayers: players.length,
    readyPlayers: readyPlayers.length,
    isHost,
    canStart,
    participants: roomParticipants.map(p => ({
      user_id: p.user_id,
      username: p.profile?.username,
      status: p.status,
      role: p.role
    }))
  });

  if (currentView === 'game') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-8">Combat en Cours</h1>
            <p className="text-xl text-gray-300">Implémentation du combat multijoueur à venir...</p>
            <button
              onClick={() => setCurrentView('room')}
              className="mt-8 bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Retour à la Salle
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'room' && currentRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={leaveRoom}
              className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Quitter la Salle</span>
            </button>
            <h1 className="text-3xl font-bold">{currentRoom.name}</h1>
            <div className="w-32"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Participants */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-4 flex items-center">
                  <Users className="w-6 h-6 mr-2" />
                  Participants ({players.length}/2)
                </h2>
                <div className="space-y-4">
                  {players.map((participant) => (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between bg-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                          {participant.profile.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold">{participant.profile.username}</div>
                          <div className="text-sm text-gray-400">Niveau {participant.profile.level}</div>
                        </div>
                        {participant.user_id === currentRoom.host_id && (
                          <div className="bg-yellow-600 text-black px-2 py-1 rounded text-xs font-semibold">
                            HÔTE
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {participant.status === 'ready' ? (
                          <div className="flex items-center space-x-1 text-green-400">
                            <UserCheck className="w-4 h-4" />
                            <span className="text-sm">Prêt</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1 text-gray-400">
                            <UserX className="w-4 h-4" />
                            <span className="text-sm">En attente</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Contrôles */}
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4">Contrôles</h3>
                <div className="space-y-4">
                  <button
                    onClick={toggleReady}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                      isReady
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    {isReady ? 'Prêt ✓' : 'Pas Prêt'}
                  </button>
                  
                  {isHost && (
                    <button
                      onClick={startGame}
                      disabled={!canStart}
                      className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                        canStart
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-gray-600 cursor-not-allowed'
                      }`}
                    >
                      <Play className="w-5 h-5" />
                      <span>Démarrer le Combat</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4">Paramètres</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Temps limite:</span>
                    <span>{currentRoom.settings.time_limit}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rounds:</span>
                    <span>{currentRoom.settings.rounds}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Joueurs max:</span>
                    <span>{currentRoom.max_players}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ✅ CORRECTION : Composant Debug */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-gray-900 p-4 rounded mt-4">
              <h4 className="text-white font-bold mb-2">🔧 Debug Info</h4>
              <div className="text-sm text-gray-300 space-y-1">
                <div>Total participants: {roomParticipants.length}</div>
                <div>Joueurs valides: {players.length}</div>
                <div>Joueurs prêts: {readyPlayers.length}</div>
                <div>Est hôte: {isHost ? 'Oui' : 'Non'}</div>
                <div>Peut démarrer: {canStart ? 'Oui' : 'Non'}</div>
                <div className="mt-2">
                  <div className="font-bold">Participants:</div>
                  {roomParticipants.map(p => (
                    <div key={p.user_id} className="ml-2">
                      {p.profile?.username || 'PROFIL MANQUANT'} - {p.status} - {p.role}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Retour au Menu</span>
          </button>
          <h1 className="text-4xl font-bold flex items-center">
            <Swords className="w-8 h-8 mr-3" />
            Combat en Ligne
          </h1>
          <button
            onClick={() => setShowCreateRoom(true)}
            className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Créer une Salle
          </button>
        </div>

        {/* Liste des salles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.id} className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">{room.name}</h3>
                <div className="flex items-center space-x-2 text-sm text-gray-400">
                  <Users className="w-4 h-4" />
                  <span>0/{room.max_players}</span>
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-gray-300 mb-4">
                <div className="flex justify-between">
                  <span>Temps limite:</span>
                  <span>{room.settings.time_limit}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Rounds:</span>
                  <span>{room.settings.rounds}</span>
                </div>
                <div className="flex justify-between">
                  <span>Créée:</span>
                  <span>{new Date(room.created_at).toLocaleTimeString()}</span>
                </div>
              </div>

              <button
                onClick={() => joinRoom(room)}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Connexion...' : 'Rejoindre'}
              </button>
            </div>
          ))}
        </div>

        {rooms.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚔️</div>
            <h2 className="text-2xl font-bold mb-4">Aucune salle disponible</h2>
            <p className="text-gray-400 mb-8">Créez une nouvelle salle pour commencer un combat!</p>
            <button
              onClick={() => setShowCreateRoom(true)}
              className="bg-red-600 hover:bg-red-700 px-8 py-4 rounded-lg font-semibold transition-colors"
            >
              Créer une Salle
            </button>
          </div>
        )}

        {/* Modal création de salle */}
        {showCreateRoom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold mb-4">Créer une Salle</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom de la salle</label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Ma salle de combat"
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="flex space-x-4 mt-6">
                <button
                  onClick={() => setShowCreateRoom(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded-lg font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={createRoom}
                  disabled={!newRoomName.trim() || loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Création...' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnlineCombat;