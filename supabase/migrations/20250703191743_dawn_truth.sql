/*
  # Fonction pour créer des matchs de manière atomique

  1. Nouvelle fonction
    - `try_create_match` - Fonction pour gérer le matchmaking de manière atomique
    - Évite les conditions de course lors de la création de matchs
    - Utilise des verrous pour s'assurer qu'un seul match est créé

  2. Sécurité
    - Fonction sécurisée avec gestion des erreurs
    - Vérifications de cohérence des données
*/

CREATE OR REPLACE FUNCTION try_create_match(
  p_user_id uuid,
  p_game_mode text,
  p_deck_id bigint,
  p_user_level integer,
  p_username text
) RETURNS TABLE (
  status text,
  room_id uuid,
  queue_id bigint,
  opponent_username text,
  opponent_level integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opponent_record RECORD;
  v_room_id uuid;
  v_queue_id bigint;
  v_level_min integer;
  v_level_max integer;
BEGIN
  -- Calculer les niveaux compatibles
  v_level_min := GREATEST(1, p_user_level - 5);
  v_level_max := p_user_level + 5;

  -- Nettoyer d'abord les anciennes entrées de cet utilisateur
  DELETE FROM matchmaking_queue WHERE user_id = p_user_id;

  -- Chercher un adversaire compatible avec un verrou
  SELECT mq.*, p.username, p.level
  INTO v_opponent_record
  FROM matchmaking_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE mq.status = 'searching'
    AND mq.game_mode = p_game_mode
    AND mq.user_id != p_user_id
    AND mq.preferred_level_min <= v_level_max
    AND mq.preferred_level_max >= v_level_min
  ORDER BY mq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    -- Match trouvé ! Créer une salle
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
    ) RETURNING id INTO v_room_id;

    -- Ajouter les participants
    INSERT INTO room_participants (room_id, user_id, role, player_number, deck_id, status)
    VALUES 
      (v_room_id, p_user_id, 'player', 1, p_deck_id, 'connected'),
      (v_room_id, v_opponent_record.user_id, 'player', 2, v_opponent_record.deck_id, 'connected');

    -- Supprimer les entrées de file d'attente
    DELETE FROM matchmaking_queue 
    WHERE user_id IN (p_user_id, v_opponent_record.user_id);

    -- Retourner le résultat du match
    RETURN QUERY SELECT 
      'match_found'::text,
      v_room_id,
      NULL::bigint,
      v_opponent_record.username,
      v_opponent_record.level;
  ELSE
    -- Aucun adversaire trouvé, ajouter à la file d'attente
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
    ) RETURNING id INTO v_queue_id;

    -- Retourner le statut de recherche
    RETURN QUERY SELECT 
      'searching'::text,
      NULL::uuid,
      v_queue_id,
      NULL::text,
      NULL::integer;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- En cas d'erreur, nettoyer et retourner une erreur
    DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
    RAISE;
END;
$$;