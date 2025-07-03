/*
  # Système de combat en ligne

  1. Nouvelles Tables
    - `game_rooms` - Salles de jeu multijoueur
    - `room_participants` - Participants (joueurs et spectateurs)
    - `game_actions` - Actions de jeu en temps réel
    - `game_states` - États de jeu synchronisés
    - `matchmaking_queue` - File d'attente pour le matchmaking

  2. Sécurité
    - Enable RLS sur toutes les tables
    - Policies pour l'accès sécurisé aux données
    - Contraintes d'intégrité

  3. Fonctionnalités
    - Génération automatique de codes de salle
    - Indexes pour les performances
    - Support du temps réel
*/

-- Table des salles de jeu
CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  room_code text UNIQUE,
  host_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'in_progress', 'finished', 'cancelled')),
  game_mode text NOT NULL DEFAULT 'ranked' CHECK (game_mode IN ('ranked', 'casual', 'private', 'tournament')),
  max_players integer NOT NULL DEFAULT 2,
  current_players integer NOT NULL DEFAULT 1,
  allow_spectators boolean DEFAULT true,
  min_level integer DEFAULT 1,
  max_level integer DEFAULT 100,
  entry_cost integer DEFAULT 0,
  prize_pool integer DEFAULT 0,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Table des participants (joueurs + spectateurs)
CREATE TABLE IF NOT EXISTS room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('player', 'spectator')),
  player_number integer, -- 1 ou 2 pour les joueurs, null pour spectateurs
  deck_id bigint REFERENCES user_decks(id),
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'ready', 'playing', 'disconnected', 'finished')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, player_number) -- Un seul joueur par numéro
);

-- Table des actions de jeu en temps réel
CREATE TABLE IF NOT EXISTS game_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('select_team', 'attack', 'replace_fighter', 'draw_card', 'end_turn', 'surrender')),
  action_data jsonb NOT NULL,
  turn_number integer NOT NULL DEFAULT 1,
  sequence_number integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Table des états de jeu
CREATE TABLE IF NOT EXISTS game_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  turn_number integer NOT NULL DEFAULT 1,
  current_phase text NOT NULL CHECK (current_phase IN ('team_selection', 'combat', 'replacement', 'finished')),
  current_player integer CHECK (current_player IN (1, 2)),
  player1_state jsonb NOT NULL DEFAULT '{}',
  player2_state jsonb NOT NULL DEFAULT '{}',
  combat_log jsonb DEFAULT '[]',
  turn_order jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  UNIQUE(room_id, turn_number)
);

-- File d'attente matchmaking
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_mode text NOT NULL DEFAULT 'ranked',
  preferred_level_min integer DEFAULT 1,
  preferred_level_max integer DEFAULT 100,
  deck_id bigint NOT NULL REFERENCES user_decks(id),
  status text NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'matched', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  matched_at timestamptz,
  UNIQUE(user_id) -- Un utilisateur ne peut être qu'une fois en file
);

-- Indexes pour les performances
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_game_rooms_game_mode ON game_rooms(game_mode);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_room_id ON game_actions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_turn ON game_actions(room_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id);
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_status ON matchmaking_queue(status);

-- RLS Policies

-- game_rooms
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read public rooms" ON game_rooms;
CREATE POLICY "Users can read public rooms"
  ON game_rooms FOR SELECT
  TO authenticated
  USING (status IN ('waiting', 'in_progress') OR host_id = auth.uid());

DROP POLICY IF EXISTS "Users can create rooms" ON game_rooms;
CREATE POLICY "Users can create rooms"
  ON game_rooms FOR INSERT
  TO authenticated
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "Host can update own rooms" ON game_rooms;
CREATE POLICY "Host can update own rooms"
  ON game_rooms FOR UPDATE
  TO authenticated
  USING (host_id = auth.uid());

-- room_participants
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read room participants" ON room_participants;
CREATE POLICY "Users can read room participants"
  ON room_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    room_id IN (SELECT id FROM game_rooms WHERE host_id = auth.uid()) OR
    room_id IN (SELECT room_id FROM room_participants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can join rooms" ON room_participants;
CREATE POLICY "Users can join rooms"
  ON room_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own participation" ON room_participants;
CREATE POLICY "Users can update own participation"
  ON room_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can leave rooms" ON room_participants;
CREATE POLICY "Users can leave rooms"
  ON room_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- game_actions
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room participants can read actions" ON game_actions;
CREATE POLICY "Room participants can read actions"
  ON game_actions FOR SELECT
  TO authenticated
  USING (
    room_id IN (SELECT room_id FROM room_participants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Players can create actions" ON game_actions;
CREATE POLICY "Players can create actions"
  ON game_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = auth.uid() AND
    room_id IN (SELECT room_id FROM room_participants WHERE user_id = auth.uid() AND role = 'player')
  );

-- game_states
ALTER TABLE game_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room participants can read game states" ON game_states;
CREATE POLICY "Room participants can read game states"
  ON game_states FOR SELECT
  TO authenticated
  USING (
    room_id IN (SELECT room_id FROM room_participants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Players can insert game states" ON game_states;
CREATE POLICY "Players can insert game states"
  ON game_states FOR INSERT
  TO authenticated
  WITH CHECK (
    room_id IN (SELECT room_id FROM room_participants WHERE user_id = auth.uid() AND role = 'player')
  );

DROP POLICY IF EXISTS "Players can modify game states" ON game_states;
CREATE POLICY "Players can modify game states"
  ON game_states FOR UPDATE
  TO authenticated
  USING (
    room_id IN (SELECT room_id FROM room_participants WHERE user_id = auth.uid() AND role = 'player')
  );

-- matchmaking_queue
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own queue entry" ON matchmaking_queue;
CREATE POLICY "Users can manage own queue entry"
  ON matchmaking_queue FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fonction pour générer des codes de salle
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour générer automatiquement les codes de salle
CREATE OR REPLACE FUNCTION set_room_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.room_code IS NULL AND NEW.game_mode = 'private' THEN
    NEW.room_code := generate_room_code();
    -- S'assurer que le code est unique
    WHILE EXISTS (SELECT 1 FROM game_rooms WHERE room_code = NEW.room_code) LOOP
      NEW.room_code := generate_room_code();
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_room_code ON game_rooms;
CREATE TRIGGER trigger_set_room_code
  BEFORE INSERT ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION set_room_code();