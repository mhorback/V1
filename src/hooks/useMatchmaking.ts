import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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

export const useMatchmaking = (user: any) => {
  const [state, setState] = useState<MatchmakingState>({
    isSearching: false,
    queueTime: 0,
    status: 'idle'
  });

  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  // Nettoyer les anciennes entrées de file d'attente
  const cleanupOldQueueEntries = async () => {
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

  // Recherche directe d'un match
  const findMatchDirect = async (gameMode: string, deckId: number, userLevel: number) => {
    try {
      // Nettoyer d'abord
      await cleanupOldQueueEntries();

      // Chercher un adversaire compatible
      const levelMin = Math.max(1, userLevel - 5);
      const levelMax = userLevel + 5;

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
        // Match trouvé ! Créer une salle de jeu
        const opponent = potentialOpponents[0];
        
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

        // Ajouter les deux joueurs à la salle
        const { error: participant1Error } = await supabase
          .from('room_participants')
          .insert({
            room_id: room.id,
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
            room_id: room.id,
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
          room_id: room.id,
          opponent: {
            username: opponent.profile.username,
            level: opponent.profile.level
          }
        };
      } else {
        // Aucun adversaire trouvé, ajouter à la file d'attente
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
            
            return { 
              status: 'searching', 
              queue_id: updatedEntry.id
            };
          }
          throw queueError;
        }

        return { 
          status: 'searching', 
          queue_id: queueEntry.id
        };
      }
    } catch (error) {
      console.error('Erreur find_match:', error);
      throw error;
    }
  };

  // Démarrer la recherche
  const startSearch = useCallback(async (gameMode: string, deckId: number, userLevel: number) => {
    try {
      setState(prev => ({ 
        ...prev, 
        isSearching: true, 
        status: 'searching', 
        error: undefined, 
        queueTime: 0,
        selectedDeckId: deckId
      }));

      const result = await findMatchDirect(gameMode, deckId, userLevel);

      if (result.status === 'match_found') {
        setState(prev => ({
          ...prev,
          status: 'match_found',
          roomId: result.room_id,
          opponent: result.opponent,
          isSearching: false
        }));
      } else if (result.status === 'searching') {
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
  const startRealtimeListening = (gameMode: string, deckId: number, userLevel: number) => {
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
        const newEntry = payload.new;
        
        // Vérifier si c'est un adversaire compatible
        if (newEntry.user_id !== user.id && 
            newEntry.status === 'searching' &&
            newEntry.preferred_level_min <= userLevel + 5 &&
            newEntry.preferred_level_max >= userLevel - 5) {
          
          console.log('Adversaire potentiel trouvé:', newEntry);
          
          // Essayer de créer un match
          try {
            const result = await findMatchDirect(gameMode, deckId, userLevel);
            if (result.status === 'match_found') {
              setState(prev => ({
                ...prev,
                status: 'match_found',
                roomId: result.room_id,
                opponent: result.opponent,
                isSearching: false
              }));
              
              // Arrêter l'écoute
              newSubscription.unsubscribe();
            }
          } catch (error) {
            console.error('Erreur création match automatique:', error);
          }
        }
      })
      .subscribe();

    setSubscription(newSubscription);

    // Démarrer aussi un polling de sécurité
    const interval = setInterval(async () => {
      try {
        const result = await findMatchDirect(gameMode, deckId, userLevel);
        if (result.status === 'match_found') {
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
    }, 5000); // Vérifier toutes les 5 secondes

    setPollInterval(interval);
  };

  // Annuler la recherche
  const cancelSearch = useCallback(async () => {
    try {
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