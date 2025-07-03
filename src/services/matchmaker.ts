import { supabase } from '../lib/supabase';

export interface MatchmakingOptions {
  gameMode: 'ranked' | 'casual' | 'private';
  deckId: number;
  userLevel: number;
  privateCode?: string;
}

export interface MatchResult {
  success: boolean;
  roomId?: string;
  error?: string;
  estimatedWait?: number;
}

export class Matchmaker {
  private static readonly LEVEL_TOLERANCE = 5;
  private static readonly MAX_WAIT_TIME = 300000; // 5 minutes

  // Rechercher un match
  static async findMatch(userId: string, options: MatchmakingOptions): Promise<MatchResult> {
    try {
      if (options.gameMode === 'private' && options.privateCode) {
        return await this.joinPrivateRoom(userId, options.privateCode, options.deckId);
      }

      // Vérifier si l'utilisateur est déjà en file
      const existingQueue = await this.getExistingQueueEntry(userId);
      if (existingQueue) {
        return {
          success: false,
          error: 'Déjà en file d\'attente'
        };
      }

      // Chercher un adversaire compatible
      const opponent = await this.findCompatibleOpponent(userId, options);
      
      if (opponent) {
        // Créer une salle de match
        const roomId = await this.createMatchRoom(userId, opponent.user_id, options);
        
        // Nettoyer les entrées de file d'attente
        await this.cleanupQueueEntries([userId, opponent.user_id]);
        
        return {
          success: true,
          roomId
        };
      } else {
        // Ajouter à la file d'attente
        await this.addToQueue(userId, options);
        
        return {
          success: true,
          estimatedWait: this.estimateWaitTime(options)
        };
      }
    } catch (error) {
      console.error('Erreur matchmaking:', error);
      return {
        success: false,
        error: 'Erreur lors de la recherche de match'
      };
    }
  }

  // Rejoindre une salle privée
  private static async joinPrivateRoom(userId: string, roomCode: string, deckId: number): Promise<MatchResult> {
    try {
      // Chercher la salle avec le code
      const { data: room, error } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .eq('status', 'waiting')
        .single();

      if (error || !room) {
        return {
          success: false,
          error: 'Code de salle invalide ou salle non disponible'
        };
      }

      // Vérifier s'il y a de la place
      if (room.current_players >= room.max_players) {
        return {
          success: false,
          error: 'Salle complète'
        };
      }

      // Rejoindre la salle
      const { error: joinError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: userId,
          role: 'player',
          player_number: room.current_players + 1,
          deck_id: deckId
        });

      if (joinError) throw joinError;

      // Mettre à jour le nombre de joueurs
      await supabase
        .from('game_rooms')
        .update({ 
          current_players: room.current_players + 1,
          status: room.current_players + 1 >= room.max_players ? 'starting' : 'waiting'
        })
        .eq('id', room.id);

      return {
        success: true,
        roomId: room.id
      };
    } catch (error) {
      console.error('Erreur rejoindre salle privée:', error);
      return {
        success: false,
        error: 'Impossible de rejoindre la salle'
      };
    }
  }

  // Vérifier si l'utilisateur est déjà en file
  private static async getExistingQueueEntry(userId: string) {
    const { data } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'searching')
      .single();

    return data;
  }

  // Chercher un adversaire compatible
  private static async findCompatibleOpponent(userId: string, options: MatchmakingOptions) {
    const levelMin = Math.max(1, options.userLevel - this.LEVEL_TOLERANCE);
    const levelMax = options.userLevel + this.LEVEL_TOLERANCE;

    const { data: opponents } = await supabase
      .from('matchmaking_queue')
      .select(`
        *,
        profile:profiles!matchmaking_queue_user_id_fkey(level, username)
      `)
      .eq('status', 'searching')
      .eq('game_mode', options.gameMode)
      .neq('user_id', userId)
      .gte('preferred_level_min', levelMin)
      .lte('preferred_level_max', levelMax)
      .order('created_at', { ascending: true })
      .limit(1);

    return opponents && opponents.length > 0 ? opponents[0] : null;
  }

  // Créer une salle de match
  private static async createMatchRoom(player1Id: string, player2Id: string, options: MatchmakingOptions): Promise<string> {
    // Créer la salle
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .insert({
        name: `Match ${options.gameMode}`,
        host_id: player1Id,
        game_mode: options.gameMode,
        status: 'starting',
        max_players: 2,
        current_players: 2,
        allow_spectators: true
      })
      .select()
      .single();

    if (roomError) throw roomError;

    // Ajouter les participants
    const { error: participantsError } = await supabase
      .from('room_participants')
      .insert([
        {
          room_id: room.id,
          user_id: player1Id,
          role: 'player',
          player_number: 1,
          deck_id: options.deckId,
          status: 'ready'
        },
        {
          room_id: room.id,
          user_id: player2Id,
          role: 'player',
          player_number: 2,
          deck_id: options.deckId, // Utiliser le deck de l'adversaire trouvé
          status: 'ready'
        }
      ]);

    if (participantsError) throw participantsError;

    return room.id;
  }

  // Ajouter à la file d'attente
  private static async addToQueue(userId: string, options: MatchmakingOptions) {
    const levelMin = Math.max(1, options.userLevel - this.LEVEL_TOLERANCE);
    const levelMax = options.userLevel + this.LEVEL_TOLERANCE;

    const { error } = await supabase
      .from('matchmaking_queue')
      .insert({
        user_id: userId,
        game_mode: options.gameMode,
        deck_id: options.deckId,
        preferred_level_min: levelMin,
        preferred_level_max: levelMax,
        status: 'searching'
      });

    if (error) throw error;
  }

  // Nettoyer les entrées de file d'attente
  private static async cleanupQueueEntries(userIds: string[]) {
    await supabase
      .from('matchmaking_queue')
      .update({ status: 'matched', matched_at: new Date().toISOString() })
      .in('user_id', userIds);
  }

  // Estimer le temps d'attente
  private static estimateWaitTime(options: MatchmakingOptions): number {
    // Logique simple d'estimation basée sur le mode de jeu
    switch (options.gameMode) {
      case 'casual':
        return 30000; // 30 secondes
      case 'ranked':
        return 60000; // 1 minute
      default:
        return 45000; // 45 secondes
    }
  }

  // Annuler la recherche
  static async cancelSearch(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('matchmaking_queue')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'searching');

      return !error;
    } catch (error) {
      console.error('Erreur annulation recherche:', error);
      return false;
    }
  }

  // Créer une salle privée
  static async createPrivateRoom(hostId: string, deckId: number, roomName?: string): Promise<MatchResult> {
    try {
      const { data: room, error } = await supabase
        .from('game_rooms')
        .insert({
          name: roomName || 'Salle Privée',
          host_id: hostId,
          game_mode: 'private',
          status: 'waiting',
          max_players: 2,
          current_players: 1,
          allow_spectators: true
        })
        .select()
        .single();

      if (error) throw error;

      // Ajouter l'hôte comme participant
      await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: hostId,
          role: 'player',
          player_number: 1,
          deck_id: deckId
        });

      return {
        success: true,
        roomId: room.id
      };
    } catch (error) {
      console.error('Erreur création salle privée:', error);
      return {
        success: false,
        error: 'Impossible de créer la salle'
      };
    }
  }

  // Obtenir le statut de la file d'attente
  static async getQueueStatus(userId: string) {
    try {
      const { data } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['searching', 'matched'])
        .single();

      if (!data) {
        return { status: 'not_in_queue' };
      }

      if (data.status === 'matched') {
        // Chercher la salle créée
        const { data: room } = await supabase
          .from('game_rooms')
          .select('*')
          .eq('host_id', userId)
          .eq('status', 'starting')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (room) {
          return {
            status: 'match_found',
            room_id: room.id
          };
        }
      }

      return {
        status: data.status,
        queue_time: Math.floor((new Date().getTime() - new Date(data.created_at).getTime()) / 1000)
      };
    } catch (error) {
      console.error('Erreur statut file d\'attente:', error);
      return { status: 'error' };
    }
  }
}