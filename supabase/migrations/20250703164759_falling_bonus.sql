/*
  # Fix matchmaking queue constraints

  1. Modifications
    - Améliore la gestion des contraintes de la file d'attente
    - Ajoute un index pour améliorer les performances
    - Nettoie automatiquement les anciennes entrées

  2. Sécurité
    - Maintient les politiques RLS existantes
*/

-- Ajouter un index pour améliorer les performances des requêtes de matchmaking
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_game_mode_level ON matchmaking_queue(game_mode, preferred_level_min, preferred_level_max, status, created_at);

-- Fonction pour nettoyer automatiquement les anciennes entrées de file d'attente
CREATE OR REPLACE FUNCTION cleanup_old_queue_entries()
RETURNS void AS $$
BEGIN
  -- Supprimer les entrées de plus de 10 minutes
  DELETE FROM matchmaking_queue 
  WHERE created_at < NOW() - INTERVAL '10 minutes'
  AND status IN ('searching', 'cancelled');
  
  -- Supprimer les entrées "matched" de plus de 1 heure
  DELETE FROM matchmaking_queue 
  WHERE created_at < NOW() - INTERVAL '1 hour'
  AND status = 'matched';
END;
$$ LANGUAGE plpgsql;

-- Créer une fonction pour gérer les conflits de contrainte unique
CREATE OR REPLACE FUNCTION handle_queue_conflict()
RETURNS trigger AS $$
BEGIN
  -- Si une entrée existe déjà pour cet utilisateur, la supprimer d'abord
  DELETE FROM matchmaking_queue WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer un trigger pour gérer automatiquement les conflits
DROP TRIGGER IF EXISTS trigger_handle_queue_conflict ON matchmaking_queue;
CREATE TRIGGER trigger_handle_queue_conflict
  BEFORE INSERT ON matchmaking_queue
  FOR EACH ROW
  EXECUTE FUNCTION handle_queue_conflict();

-- Nettoyer les anciennes entrées existantes
SELECT cleanup_old_queue_entries();