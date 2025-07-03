/*
  # Fix infinite recursion in room_participants RLS policies

  1. Problem
    - The SELECT policy for room_participants creates infinite recursion
    - Policy tries to query room_participants table from within its own policy
    - This causes circular dependency during policy evaluation

  2. Solution
    - Simplify the SELECT policy to avoid self-referencing queries
    - Use direct user_id comparison and host_id check from game_rooms
    - Remove the circular reference to room_participants table

  3. Changes
    - Drop existing problematic SELECT policy
    - Create new simplified SELECT policy
    - Maintain security while avoiding recursion
*/

-- Drop the problematic SELECT policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can read room participants" ON room_participants;

-- Create a new simplified SELECT policy that avoids circular references
CREATE POLICY "Users can read room participants"
  ON room_participants
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own participation records
    user_id = auth.uid()
    OR
    -- Users can see participants in rooms they host
    room_id IN (
      SELECT id FROM game_rooms WHERE host_id = auth.uid()
    )
  );