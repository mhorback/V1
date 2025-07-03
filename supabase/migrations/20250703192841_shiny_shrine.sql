/*
  # Fix try_create_match RPC function parameter types

  1. Changes
    - Drop existing try_create_match function
    - Recreate with correct UUID parameter types instead of bigint
    - Ensure all user_id parameters use uuid type
    - Maintain existing function logic but with proper types

  2. Security
    - Function maintains existing security context
    - No changes to RLS policies needed
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS try_create_match(bigint, text, integer, integer, bigint);
DROP FUNCTION IF EXISTS try_create_match(uuid, text, integer, integer, bigint);

-- Create the corrected function with proper UUID types
CREATE OR REPLACE FUNCTION try_create_match(
  p_user_id uuid,
  p_game_mode text DEFAULT 'ranked',
  p_level_min integer DEFAULT 1,
  p_level_max integer DEFAULT 100,
  p_deck_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opponent_id uuid;
  v_opponent_deck_id bigint;
  v_room_id uuid;
  v_result jsonb;
BEGIN
  -- First, try to find an existing match
  SELECT 
    mq.user_id,
    mq.deck_id
  INTO 
    v_opponent_id,
    v_opponent_deck_id
  FROM matchmaking_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE 
    mq.user_id != p_user_id
    AND mq.status = 'searching'
    AND mq.game_mode = p_game_mode
    AND p.level BETWEEN p_level_min AND p_level_max
    AND mq.created_at < NOW() - INTERVAL '1 second'
  ORDER BY mq.created_at ASC
  LIMIT 1;

  -- If we found an opponent, create a match
  IF v_opponent_id IS NOT NULL THEN
    -- Create game room
    INSERT INTO game_rooms (
      name,
      host_id,
      status,
      game_mode,
      max_players,
      current_players
    ) VALUES (
      'Match Room',
      p_user_id,
      'starting',
      p_game_mode,
      2,
      2
    ) RETURNING id INTO v_room_id;

    -- Add both players to the room
    INSERT INTO room_participants (room_id, user_id, role, player_number, deck_id, status)
    VALUES 
      (v_room_id, p_user_id, 'player', 1, p_deck_id, 'ready'),
      (v_room_id, v_opponent_id, 'player', 2, v_opponent_deck_id, 'ready');

    -- Update matchmaking queue entries
    UPDATE matchmaking_queue 
    SET status = 'matched', matched_at = NOW()
    WHERE user_id IN (p_user_id, v_opponent_id);

    -- Return match found result
    v_result := jsonb_build_object(
      'matched', true,
      'room_id', v_room_id,
      'opponent_id', v_opponent_id
    );
  ELSE
    -- No match found, add/update user in queue
    INSERT INTO matchmaking_queue (
      user_id,
      game_mode,
      preferred_level_min,
      preferred_level_max,
      deck_id,
      status
    ) VALUES (
      p_user_id,
      p_game_mode,
      p_level_min,
      p_level_max,
      p_deck_id,
      'searching'
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET
      game_mode = EXCLUDED.game_mode,
      preferred_level_min = EXCLUDED.preferred_level_min,
      preferred_level_max = EXCLUDED.preferred_level_max,
      deck_id = EXCLUDED.deck_id,
      status = 'searching',
      created_at = NOW(),
      matched_at = NULL;

    -- Return waiting result
    v_result := jsonb_build_object(
      'matched', false,
      'queue_position', (
        SELECT COUNT(*) 
        FROM matchmaking_queue 
        WHERE status = 'searching' 
        AND game_mode = p_game_mode 
        AND created_at <= NOW()
      )
    );
  END IF;

  RETURN v_result;
END;
$$;