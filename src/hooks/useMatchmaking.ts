import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Interfaces pour typer les données
interface UserProfile {
  username: string;
  level: number;
}

interface QueueEntry {
  id: string;
  user_id: string;
  game_mode: string;
  deck_id: number;
  preferred_level_min: number;
  preferred_level_max: number;
  status: string;
  created_at: string;
  matched_at?: string;
  profile?: UserProfile;
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

interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  role: string;
  player_number?: number;
  deck_id?: number;
  status: string;
  joined_at: string;
  profile?: UserProfile;
}

interface MatchResult {
  status: 'match_found' | 'searching';
  room_id?: string;
  queue_id?: string;
  opponent?: {
    username: string;
    level: number;
  };
}

interface MatchmakingState {
  isSearching: boolean;
  queueTime: number;
  status: 'idle' | 'searching' | 'match_found' | 'error';
  roomId?: string;
  opponent?: {
    username: string;
    level: number;
  };
  error?: string;
  selectedDeckId?: number;
}

interface User {
  id: string;
  username: string;
  level: number;
}

export const useMatchmaking = (user: User) => {
  const [state, setState] = useState<MatchmakingState>({
    isSearching: false,
    queueTime: 0,
    status: 'idle'
  });

  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  // Nettoyer les anciennes entrées de file d'attente
  const cleanupOldQueueEntries = async (): Promise<void> => {
    try {
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', user.id);
      
      console.log('Anciennes entrées de file d\'attente nettoyées');
    } catch (error) {
      console.error('Erreur nettoyage file d\'attente:', error);
    }
  };

  // Vérifier si l'utilisateur a déjà une salle active
  const checkExistingRoom = async (): Promise<boolean> => {
    try {
      const { data: existingParticipation } = await supabase
        .from('room_participants')
        .select(`
          room_id,
          room:game_rooms!room_participants_room_id_fkey(*)
        `)
        .eq('user_id', user.id)
        .in('room.status', ['waiting', 'starting', 'in_progress'])
        .order('joined_at', { ascending: false })
        .limit(1);

      if (existingParticipation && existingParticipation.length > 0) {
        const room = existingParticipation[0].room as GameRoom;
        console.log('Salle existante trouvée:', room);
        
        setState(prev => ({
          ...prev,
          status: 'match_found',
          roomId: room.id,
          isSearching: false
        }));
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Erreur vérification salle existante:', error);
      return false;
    }
  };

  // Recherche directe d'un match avec la fonction PostgreSQL
  const findMatchWithFunction = async (gameMode: string, deckId: number, userLevel: number): Promise<MatchResult> => {
    try {
      console.log('Recherche de match avec fonction PostgreSQL...');
      
      const { data, error } = await supabase
        .rpc('try_create_match', {
          p_user_id: user.id,
          p_game_mode: gameMode,
          p_deck_id: deckId,
          p_user_level: userLevel,
          p_username: user.username || 'Joueur'
        });

      if (error) {
        console.error('Erreur fonction try_create_match:', error);
        throw error;
      }

      console.log('Résultat fonction try_create_match:', data);

      if (data && data.length > 0) {
        const result = data[0];
        
        if (result.status === 'match_found') {
          return {
            status: 'match_found',
            room_id: result.room_id,
            opponent: {
              username: result.opponent_username,
              level: result.opponent_level
            }
          };
        } else {
          return {
            status: 'searching',
            queue_id: result.queue_id
          };
        }
      }

      // Fallback si la fonction ne retourne rien
      return await findMatchFallback(gameMode, deckId, userLevel);
    } catch (error) {
      console.error('Erreur fonction PostgreSQL, utilisation du fallback:', error);
      return await findMatchFallback(gameMode, deckId, userLevel);
    }
  };

  // Fallback pour la recherche de match
  const findMatchFallback = async (gameMode: string, deckId: number, userLevel: number): Promise<MatchResult> => {
    try {
      console.log('Utilisation du fallback pour la recherche de match...');
      
      // Nettoyer d'abord
      await cleanupOldQueueEntries();

      const levelMin = Math.max(1, userLevel - 5);
      const levelMax = userLevel + 5;

      // Chercher un adversaire compatible
      const { data: potentialOpponents } = await supabase
        .from('matchmaking_queue')
        .select(`
          *,
          profile:profiles!matchmaking_queue_user_id_fkey(level, username)
        `)
        .eq('status', 'searching')
        .eq('game_mode', gameMode)
        .neq('user_id', user.id)
        .gte('preferred_level_min', levelMin)
        .lte('preferred_level_max', levelMax)
        .order('created_at', { ascending: true })
        .limit(1);

      if (potentialOpponents && potentialOpponents.length > 0) {
        const opponent = potentialOpponents[0] as QueueEntry;
        
        // Vérifier que l'adversaire a un profil valide
        if (!opponent.profile) {
          console.log('Adversaire sans profil valide, ajout à la file');
          return await addToQueue(gameMode, deckId, userLevel);
        }
        
        // Vérifier que l'adversaire est toujours disponible
        const { data: stillAvailable } = await supabase
          .from('matchmaking_queue')
          .select('id')
          .eq('id', opponent.id)
          .eq('status', 'searching')
          .single();

        if (!stillAvailable) {
          console.log('Adversaire plus disponible, ajout à la file');
          return await addToQueue(gameMode, deckId, userLevel);
        }

        console.log('Création de salle avec adversaire:', opponent.profile.username);

        // Créer la salle
        const { data: room, error: roomError } = await supabase
          .from('game_rooms')
          .insert({
            name: `Match ${gameMode}`,
            host_id: user.id,
            game_mode: gameMode,
            status: 'waiting',
            max_players: 2,
            current_players: 2,
            allow_spectators: true,
            min_level: Math.min(userLevel, opponent.profile.level),
            max_level: Math.max(userLevel, opponent.profile.level)
          })
          .select()
          .single();

        if (roomError) throw roomError;

        const createdRoom = room as GameRoom;

        // Ajouter les deux joueurs à la salle
        const { error: participant1Error } = await supabase
          .from('room_participants')
          .insert({
            room_id: createdRoom.id,
            user_id: user.id,
            role: 'player',
            player_number: 1,
            deck_id: deckId,
            status: 'connected'
          });

        if (participant1Error) throw participant1Error;

        const { error: participant2Error } = await supabase
          .from('room_participants')
          .insert({
            room_id: createdRoom.id,
            user_id: opponent.user_id,
            role: 'player',
            player_number: 2,
            deck_id: opponent.deck_id,
            status: 'connected'
          });

        if (participant2Error) throw participant2Error;

        // Supprimer les entrées de file d'attente
        await supabase
          .from('matchmaking_queue')
          .delete()
          .in('user_id', [user.id, opponent.user_id]);

        return { 
          status: 'match_found', 
          room_id: createdRoom.id,
          opponent: {
            username: opponent.profile.username,
            level: opponent.profile.level
          }
        };
      } else {
        console.log('Aucun adversaire trouvé, ajout à la file');
        return await addToQueue(gameMode, deckId, userLevel);
      }
    } catch (error) {
      console.error('Erreur find_match fallback:', error);
      throw error;
    }
  };

  // Ajouter à la file d'attente
  const addToQueue = async (gameMode: string, deckId: number, userLevel: number): Promise<MatchResult> => {
    const levelMin = Math.max(1, userLevel - 5);
    const levelMax = userLevel + 5;

    console.log('Ajout à la file d\'attente...');

    const { data: queueEntry, error: queueError } = await supabase
      .from('matchmaking_queue')
      .insert({
        user_id: user.id,
        game_mode: gameMode,
        deck_id: deckId,
        preferred_level_min: levelMin,
        preferred_level_max: levelMax,
        status: 'searching'
      })
      .select()
      .single();

    if (queueError) {
      if (queueError.code === '23505') {
        // Entrée existante, la mettre à jour
        const { data: updatedEntry, error: updateError } = await supabase
          .from('matchmaking_queue')
          .update({
            game_mode: gameMode,
            deck_id: deckId,
            preferred_level_min: levelMin,
            preferred_level_max: levelMax,
            status: 'searching',
            created_at: new Date().toISOString(),
            matched_at: null
          })
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) throw updateError;
        
        const updatedQueueEntry = updatedEntry as QueueEntry;
        return { 
          status: 'searching', 
          queue_id: updatedQueueEntry.id
        };
      }
      throw queueError;
    }

    const createdQueueEntry = queueEntry as QueueEntry;
    return { 
      status: 'searching', 
      queue_id: createdQueueEntry.id
    };
  };

  // Démarrer la recherche
  const startSearch = useCallback(async (gameMode: string, deckId: number, userLevel: number): Promise<void> => {
    try {
      console.log('Démarrage de la recherche de match...');
      
      setState(prev => ({ 
        ...prev, 
        isSearching: true, 
        status: 'searching', 
        error: undefined, 
        queueTime: 0,
        selectedDeckId: deckId
      }));

      // Vérifier d'abord s'il y a une salle existante
      const hasExistingRoom = await checkExistingRoom();
      if (hasExistingRoom) {
        console.log('Salle existante trouvée, arrêt de la recherche');
        return;
      }

      // Essayer de trouver un match
      const result = await findMatchWithFunction(gameMode, deckId, userLevel);

      if (result.status === 'match_found') {
        console.log('Match trouvé immédiatement:', result);
        setState(prev => ({
          ...prev,
          status: 'match_found',
          roomId: result.room_id,
          opponent: result.opponent,
          isSearching: false
        }));
      } else if (result.status === 'searching') {
        console.log('Ajouté à la file d\'attente, démarrage de l\'écoute...');
        // Démarrer l'écoute en temps réel pour les nouveaux adversaires
        startRealtimeListening(gameMode, deckId, userLevel);
      }
    } catch (error) {
      console.error('Erreur démarrage recherche:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Impossible de démarrer la recherche: ' + (error as Error).message,
        isSearching: false
      }));
    }
  }, [user.id]);

  // Écoute en temps réel pour les nouveaux adversaires
  const startRealtimeListening = (gameMode: string, deckId: number, userLevel: number): void => {
    console.log('Démarrage de l\'écoute en temps réel...');
    
    // Arrêter l'ancienne subscription
    if (subscription) {
      subscription.unsubscribe();
    }

    // Créer une nouvelle subscription pour écouter les nouvelles entrées
    const newSubscription = supabase
      .channel('matchmaking_queue_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'matchmaking_queue',
        filter: `game_mode=eq.${gameMode}`
      }, async (payload) => {
        const newEntry = payload.new as QueueEntry;
        
        console.log('Nouvelle entrée dans la file:', newEntry);
        
        // Vérifier si c'est un adversaire compatible
        if (newEntry.user_id !== user.id && 
            newEntry.status === 'searching' &&
            newEntry.preferred_level_min <= userLevel + 5 &&
            newEntry.preferred_level_max >= userLevel - 5) {
          
          console.log('Adversaire potentiel trouvé, tentative de match...');
          
          // Attendre un peu pour éviter les conditions de course
          setTimeout(async () => {
            try {
              const result = await findMatchWithFunction(gameMode, deckId, userLevel);
              if (result.status === 'match_found') {
                console.log('Match créé via écoute temps réel:', result);
                setState(prev => ({
                  ...prev,
                  status: 'match_found',
                  roomId: result.room_id,
                  opponent: result.opponent,
                  isSearching: false
                }));
                
                // Arrêter l'écoute
                newSubscription.unsubscribe();
                if (pollInterval) {
                  clearInterval(pollInterval);
                  setPollInterval(null);
                }
              }
            } catch (error) {
              console.error('Erreur création match automatique:', error);
            }
          }, Math.random() * 1000 + 500); // Délai aléatoire entre 500ms et 1.5s
        }
      })
      .subscribe();

    setSubscription(newSubscription);

    // Démarrer aussi un polling de sécurité moins fréquent
    const interval = setInterval(async () => {
      try {
        console.log('Vérification périodique de match...');
        const result = await findMatchWithFunction(gameMode, deckId, userLevel);
        if (result.status === 'match_found') {
          console.log('Match trouvé via polling:', result);
          setState(prev => ({
            ...prev,
            status: 'match_found',
            roomId: result.room_id,
            opponent: result.opponent,
            isSearching: false
          }));
          
          clearInterval(interval);
          newSubscription.unsubscribe();
        }
      } catch (error) {
        console.error('Erreur polling:', error);
      }
    }, 10000); // Vérifier toutes les 10 secondes

    setPollInterval(interval);
  };

  // Annuler la recherche
  const cancelSearch = useCallback(async (): Promise<void> => {
    try {
      console.log('Annulation de la recherche...');
      
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }

      if (subscription) {
        subscription.unsubscribe();
        setSubscription(null);
      }

      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', user.id);
      
      setState({
        isSearching: false,
        queueTime: 0,
        status: 'idle'
      });
    } catch (error) {
      console.error('Erreur annulation recherche:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Impossible d\'annuler la recherche',
        isSearching: false
      }));
    }
  }, [pollInterval, subscription]);

  // Nettoyer les intervals et subscriptions au démontage
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [pollInterval, subscription]);

  // Timer local pour l'affichage
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (state.isSearching && state.status === 'searching') {
      timer = setInterval(() => {
        setState(prev => ({
          ...prev,
          queueTime: prev.queueTime + 1
        }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [state.isSearching, state.status]);

  // Nettoyer au montage du composant
  useEffect(() => {
    cleanupOldQueueEntries();
  }, []);

  return {
    ...state,
    startSearch,
    cancelSearch
  };
};