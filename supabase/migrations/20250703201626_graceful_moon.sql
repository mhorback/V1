-- Améliorer la fonction de matchmaking pour éviter les boucles infinies

-- Drop the existing function
DROP FUNCTION IF EXISTS try_create_match(uuid, text, bigint, integer, text);

-- Create an improved version with better error handling and race condition prevention
CREATE OR REPLACE FUNCTION try_create_match(
  p_user_id uuid,
  p_game_mode text,
  p_deck_id bigint,
  p_user_level integer,
  p_username text
)
RETURNS TABLE(
  status text,
  room_id uuid,
  queue_id uuid,
  opponent_username text,
  opponent_level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opponent_record RECORD;
  v_room_id uuid;
  v_queue_id uuid;
  v_level_min integer;
  v_level_max integer;
  v_existing_room_id uuid;
BEGIN
  -- Calculate level range
  v_level_min := GREATEST(1, p_user_level - 5);
  v_level_max := p_user_level + 5;

  -- First, check if user already has an active room
  SELECT rp.room_id INTO v_existing_room_id
  FROM room_participants rp
  JOIN game_rooms gr ON gr.id = rp.room_id
  WHERE rp.user_id = p_user_id
    AND gr.status IN ('waiting', 'starting', 'in_progress')
  LIMIT 1;

  IF v_existing_room_id IS NOT NULL THEN
    -- User already has an active room, return it
    RETURN QUERY SELECT 
      'match_found'::text,
      v_existing_room_id,
      NULL::uuid,
      'Salle existante'::text,
      0::integer;
    RETURN;
  END IF;

  -- Clean up any existing queue entries for this user
  DELETE FROM matchmaking_queue WHERE user_id = p_user_id;

  -- Try to find a compatible opponent with proper locking
  SELECT mq.*, p.username, p.level
  INTO v_opponent_record
  FROM matchmaking_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE mq.status = 'searching'
    AND mq.game_mode = p_game_mode
    AND mq.user_id != p_user_id
    AND mq.preferred_level_min <= v_level_max
    AND mq.preferred_level_max >= v_level_min
    AND p.level BETWEEN v_level_min AND v_level_max
    AND mq.created_at < NOW() - INTERVAL '2 seconds' -- Avoid immediate race conditions
  ORDER BY mq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    -- Double-check that opponent is still available
    IF EXISTS (
      SELECT 1 FROM matchmaking_queue 
      WHERE id = v_opponent_record.id 
      AND status = 'searching'
    ) THEN
      -- Match found! Create a game room
      INSERT INTO game_rooms (
        name,
        host_id,
        game_mode,
        status,
        max_players,
        current_players,
        allow_spectators,
        min_level,
        max_level
      ) VALUES (
        'Match ' || p_game_mode,
        p_user_id,
        p_game_mode,
        'waiting',
        2,
        2,
        true,
        LEAST(p_user_level, v_opponent_record.level),
        GREATEST(p_user_level, v_opponent_record.level)
      )
      RETURNING id INTO v_room_id;

      -- Add both players to the room
      INSERT INTO room_participants (room_id, user_id, role, player_number, deck_id, status)
      VALUES 
        (v_room_id, p_user_id, 'player', 1, p_deck_id, 'connected'),
        (v_room_id, v_opponent_record.user_id, 'player', 2, v_opponent_record.deck_id, 'connected');

      -- Remove both players from the queue
      DELETE FROM matchmaking_queue 
      WHERE user_id IN (p_user_id, v_opponent_record.user_id);

      -- Return match found result
      RETURN QUERY SELECT 
        'match_found'::text,
        v_room_id,
        NULL::uuid,
        v_opponent_record.username,
        v_opponent_record.level;
    ELSE
      -- Opponent no longer available, add to queue
      INSERT INTO matchmaking_queue (
        user_id,
        game_mode,
        deck_id,
        preferred_level_min,
        preferred_level_max,
        status
      ) VALUES (
        p_user_id,
        p_game_mode,
        p_deck_id,
        v_level_min,
        v_level_max,
        'searching'
      )
      RETURNING id INTO v_queue_id;

      RETURN QUERY SELECT 
        'searching'::text,
        NULL::uuid,
        v_queue_id,
        NULL::text,
        NULL::integer;
    END IF;
  ELSE
    -- No match found, add to queue
    INSERT INTO matchmaking_queue (
      user_id,
      game_mode,
      deck_id,
      preferred_level_min,
      preferred_level_max,
      status
    ) VALUES (
      p_user_id,
      p_game_mode,
      p_deck_id,
      v_level_min,
      v_level_max,
      'searching'
    )
    RETURNING id INTO v_queue_id;

    -- Return searching result
    RETURN QUERY SELECT 
      'searching'::text,
      NULL::uuid,
      v_queue_id,
      NULL::text,
      NULL::integer;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- In case of any error, clean up and re-raise
    DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
    RAISE;
END;
$$;

-- Add an index to improve performance
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_search_optimization 
ON matchmaking_queue (game_mode, status, created_at) 
WHERE status = 'searching';

-- Add a function to clean up old queue entries
CREATE OR REPLACE FUNCTION cleanup_old_queue_entries()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remove entries older than 10 minutes that are still searching
  DELETE FROM matchmaking_queue 
  WHERE status = 'searching' 
  AND created_at < NOW() - INTERVAL '10 minutes';
  
  -- Remove matched entries older than 1 hour
  DELETE FROM matchmaking_queue 
  WHERE status = 'matched' 
  AND matched_at < NOW() - INTERVAL '1 hour';
END;
$$;