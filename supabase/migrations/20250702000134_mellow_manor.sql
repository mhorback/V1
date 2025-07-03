/*
  # Création des tables pour Le Glas de Valrax

  1. Nouvelles Tables
    - `profiles` - Profils des joueurs avec statistiques
    - `user_cards` - Collection de cartes de chaque joueur
    - `user_decks` - Decks sauvegardés des joueurs
    - `game_matches` - Historique des combats
    - `daily_rewards` - Récompenses quotidiennes

  2. Sécurité
    - Enable RLS sur toutes les tables
    - Politiques pour que les utilisateurs ne voient que leurs propres données
*/

-- Table des profils utilisateurs
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  currency integer DEFAULT 1000,
  level integer DEFAULT 1,
  experience integer DEFAULT 0,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table des cartes possédées par les utilisateurs
CREATE TABLE IF NOT EXISTS user_cards (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  card_id integer NOT NULL,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Table des decks des utilisateurs
CREATE TABLE IF NOT EXISTS user_decks (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  cards jsonb NOT NULL DEFAULT '[]',
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table des matchs de combat
CREATE TABLE IF NOT EXISTS game_matches (
  id bigserial PRIMARY KEY,
  player1_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  player2_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  winner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  player1_deck jsonb NOT NULL,
  player2_deck jsonb NOT NULL,
  match_data jsonb,
  duration_seconds integer,
  created_at timestamptz DEFAULT now()
);

-- Table des récompenses quotidiennes
CREATE TABLE IF NOT EXISTS daily_rewards (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reward_date date DEFAULT CURRENT_DATE,
  currency_earned integer DEFAULT 0,
  cards_earned jsonb DEFAULT '[]',
  claimed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, reward_date)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_rewards ENABLE ROW LEVEL SECURITY;

-- Politiques pour profiles
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Politiques pour user_cards
CREATE POLICY "Users can read own cards"
  ON user_cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cards"
  ON user_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cards"
  ON user_cards
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Politiques pour user_decks
CREATE POLICY "Users can read own decks"
  ON user_decks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own decks"
  ON user_decks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own decks"
  ON user_decks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own decks"
  ON user_decks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Politiques pour game_matches
CREATE POLICY "Users can read own matches"
  ON game_matches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

CREATE POLICY "Users can insert matches they participate in"
  ON game_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Politiques pour daily_rewards
CREATE POLICY "Users can read own rewards"
  ON daily_rewards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rewards"
  ON daily_rewards
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_card_id ON user_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_user_decks_user_id ON user_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_player1 ON game_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_player2 ON game_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_daily_rewards_user_date ON daily_rewards(user_id, reward_date);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_decks_updated_at
  BEFORE UPDATE ON user_decks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();