// Types pour le système de jeu
export interface Fighter {
  id: number;
  name: string;
  rarity: string;
  force: number;
  pv: number;
  endurance: number;
  vitesse: number;
  valeur: number;
  image?: string | null;
  // États de combat
  current_hp?: number;
  can_attack?: boolean;
  status_effects?: StatusEffect[];
}

export interface StatusEffect {
  type: 'poison' | 'burn' | 'freeze' | 'stun' | 'boost';
  duration: number;
  value?: number;
}

export interface GameCard {
  id: string;
  fighter: Fighter;
  position: 'hand' | 'field' | 'bench' | 'graveyard';
  can_attack: boolean;
  summoned_this_turn: boolean;
}

export interface PlayerState {
  user_id: string;
  username: string;
  level: number;
  deck_id: number;
  hp: number;
  max_hp: number;
  hand: GameCard[];
  field: GameCard[];
  bench: GameCard[];
  graveyard: GameCard[];
  active_fighter: GameCard | null;
  energy: number;
  max_energy: number;
  cards_drawn_this_turn: number;
  actions_remaining: number;
  is_ready: boolean;
  ping: number;
  last_heartbeat: number;
}

export interface GameState {
  room_id: string;
  turn_number: number;
  current_phase: 'setup' | 'draw' | 'main' | 'combat' | 'end' | 'finished';
  current_player: 1 | 2;
  player1: PlayerState;
  player2: PlayerState;
  combat_log: CombatLogEntry[];
  turn_timer: number;
  max_turn_time: number;
  game_started_at: number;
  last_action_timestamp: number;
  state_hash: string;
}

export interface CombatLogEntry {
  id: string;
  timestamp: number;
  type: 'summon' | 'attack' | 'ability' | 'draw' | 'phase_change' | 'damage' | 'heal';
  player_id: string;
  source?: string;
  target?: string;
  value?: number;
  description: string;
}

export interface GameAction {
  id: string;
  room_id: string;
  player_id: string;
  action_type: 'draw_card' | 'summon_fighter' | 'attack' | 'use_ability' | 'end_turn' | 'surrender' | 'ready_up';
  action_data: any;
  timestamp: number;
  turn_number: number;
  sequence_number: number;
  state_hash_before: string;
  state_hash_after?: string;
}

export interface WebSocketMessage {
  type: 'action' | 'state_sync' | 'heartbeat' | 'error' | 'reconnect' | 'game_event';
  room_id: string;
  player_id?: string;
  timestamp: number;
  data: any;
  message_id: string;
  requires_ack?: boolean;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  ping: number;
  last_heartbeat: number;
  reconnect_attempts: number;
  session_id: string;
}