import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

interface MatchmakingRequest {
  action: 'find_match' | 'cancel_search' | 'check_status'
  user_id?: string
  game_mode?: string
  deck_id?: number
  level?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, user_id, game_mode, deck_id, level }: MatchmakingRequest = await req.json()

    switch (action) {
      case 'find_match':
        return await findMatch(supabaseClient, user_id!, game_mode!, deck_id!, level!)
      
      case 'cancel_search':
        return await cancelSearch(supabaseClient, user_id!)
      
      case 'check_status':
        return await checkStatus(supabaseClient, user_id!)
      
      default:
        return new Response(
          JSON.stringify({ error: 'Action non supportée' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Erreur matchmaking:', error)
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function findMatch(supabase: any, userId: string, gameMode: string, deckId: number, userLevel: number) {
  try {
    // Nettoyer d'abord toutes les anciennes entrées de cet utilisateur
    await supabase
      .from('matchmaking_queue')
      .delete()
      .eq('user_id', userId)

    // Chercher un adversaire compatible
    const levelMin = Math.max(1, userLevel - 5)
    const levelMax = userLevel + 5

    const { data: potentialOpponents } = await supabase
      .from('matchmaking_queue')
      .select(`
        *,
        profile:profiles!matchmaking_queue_user_id_fkey(level, username)
      `)
      .eq('status', 'searching')
      .eq('game_mode', gameMode)
      .neq('user_id', userId)
      .gte('preferred_level_min', levelMin)
      .lte('preferred_level_max', levelMax)
      .order('created_at', { ascending: true })
      .limit(1)

    if (potentialOpponents && potentialOpponents.length > 0) {
      // Match trouvé ! Créer une salle de jeu
      const opponent = potentialOpponents[0]
      
      // Créer la salle
      const { data: room, error: roomError } = await supabase
        .from('game_rooms')
        .insert({
          name: `Match ${gameMode}`,
          host_id: userId,
          game_mode: gameMode,
          status: 'waiting',
          max_players: 2,
          current_players: 2,
          allow_spectators: true,
          min_level: Math.min(userLevel, opponent.profile.level),
          max_level: Math.max(userLevel, opponent.profile.level)
        })
        .select()
        .single()

      if (roomError) throw roomError

      // Ajouter les deux joueurs à la salle
      const { error: participant1Error } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: userId,
          role: 'player',
          player_number: 1,
          deck_id: deckId,
          status: 'connected'
        })

      if (participant1Error) throw participant1Error

      const { error: participant2Error } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: opponent.user_id,
          role: 'player',
          player_number: 2,
          deck_id: opponent.deck_id,
          status: 'connected'
        })

      if (participant2Error) throw participant2Error

      // Supprimer les entrées de file d'attente
      await supabase
        .from('matchmaking_queue')
        .delete()
        .in('user_id', [userId, opponent.user_id])

      return new Response(
        JSON.stringify({ 
          status: 'match_found', 
          room_id: room.id,
          opponent: {
            username: opponent.profile.username,
            level: opponent.profile.level
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Aucun adversaire trouvé, ajouter à la file d'attente
      const { data: queueEntry, error: queueError } = await supabase
        .from('matchmaking_queue')
        .insert({
          user_id: userId,
          game_mode: gameMode,
          deck_id: deckId,
          preferred_level_min: levelMin,
          preferred_level_max: levelMax,
          status: 'searching'
        })
        .select()
        .single()

      if (queueError) {
        // Si erreur de contrainte unique, essayer de mettre à jour
        if (queueError.code === '23505') {
          const { data: updatedEntry, error: updateError } = await supabase
            .from('matchmaking_queue')
            .update({
              game_mode: gameMode,
              deck_id: deckId,
              preferred_level_min: levelMin,
              preferred_level_max: levelMax,
              status: 'searching',
              created_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .select()
            .single()

          if (updateError) throw updateError
          
          return new Response(
            JSON.stringify({ 
              status: 'searching', 
              queue_id: updatedEntry.id,
              estimated_wait: '30-60 secondes'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        throw queueError
      }

      return new Response(
        JSON.stringify({ 
          status: 'searching', 
          queue_id: queueEntry.id,
          estimated_wait: '30-60 secondes'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Erreur find_match:', error)
    throw error
  }
}

async function cancelSearch(supabase: any, userId: string) {
  try {
    const { error } = await supabase
      .from('matchmaking_queue')
      .delete()
      .eq('user_id', userId)

    if (error) throw error

    return new Response(
      JSON.stringify({ status: 'cancelled' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erreur cancel_search:', error)
    throw error
  }
}

async function checkStatus(supabase: any, userId: string) {
  try {
    const { data: queueEntry } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'searching')
      .single()

    if (!queueEntry) {
      // Vérifier si l'utilisateur a une salle en cours
      const { data: rooms } = await supabase
        .from('room_participants')
        .select(`
          room_id,
          room:game_rooms!room_participants_room_id_fkey(*)
        `)
        .eq('user_id', userId)
        .in('room.status', ['waiting', 'starting'])
        .limit(1)

      if (rooms && rooms.length > 0) {
        return new Response(
          JSON.stringify({ 
            status: 'match_found', 
            room_id: rooms[0].room_id 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ status: 'not_in_queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        status: queueEntry.status,
        queue_time: Math.floor((new Date().getTime() - new Date(queueEntry.created_at).getTime()) / 1000)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erreur check_status:', error)
    return new Response(
      JSON.stringify({ status: 'error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}