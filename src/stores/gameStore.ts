import { create } from 'zustand';
import { GameState, PlayerState, GameAction, CombatLogEntry, ConnectionState } from '../types/game';

interface GameStore {
  // État de connexion
  connection: ConnectionState;
  setConnection: (connection: Partial<ConnectionState>) => void;

  // État de jeu
  gameState: GameState | null;
  setGameState: (state: GameState) => void;
  updatePlayerState: (playerId: string, updates: Partial<PlayerState>) => void;

  // Historique des actions
  actionHistory: GameAction[];
  addAction: (action: GameAction) => void;
  rollbackToAction: (actionId: string) => void;

  // Log de combat
  combatLog: CombatLogEntry[];
  addCombatLogEntry: (entry: CombatLogEntry) => void;

  // Gestion des conflits
  pendingActions: GameAction[];
  addPendingAction: (action: GameAction) => void;
  removePendingAction: (actionId: string) => void;
  clearPendingActions: () => void;

  // État local vs serveur
  localStateHash: string;
  serverStateHash: string;
  isDesynchronized: boolean;
  setStateHashes: (local: string, server: string) => void;

  // Méthodes utilitaires
  reset: () => void;
  getCurrentPlayer: () => PlayerState | null;
  getOpponent: () => PlayerState | null;
  canPerformAction: (actionType: string) => boolean;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // État initial
  connection: {
    status: 'disconnected',
    ping: 0,
    last_heartbeat: 0,
    reconnect_attempts: 0,
    session_id: ''
  },

  gameState: null,
  actionHistory: [],
  combatLog: [],
  pendingActions: [],
  localStateHash: '',
  serverStateHash: '',
  isDesynchronized: false,

  // Actions
  setConnection: (connection) => set((state) => ({
    connection: { ...state.connection, ...connection }
  })),

  setGameState: (gameState) => set({ gameState }),

  updatePlayerState: (playerId, updates) => set((state) => {
    if (!state.gameState) return state;

    const newGameState = { ...state.gameState };
    if (newGameState.player1.user_id === playerId) {
      newGameState.player1 = { ...newGameState.player1, ...updates };
    } else if (newGameState.player2.user_id === playerId) {
      newGameState.player2 = { ...newGameState.player2, ...updates };
    }

    return { gameState: newGameState };
  }),

  addAction: (action) => set((state) => ({
    actionHistory: [...state.actionHistory, action].slice(-100) // Garder les 100 dernières actions
  })),

  rollbackToAction: (actionId) => set((state) => {
    const actionIndex = state.actionHistory.findIndex(a => a.id === actionId);
    if (actionIndex === -1) return state;

    // Reconstruire l'état en rejouant les actions jusqu'à ce point
    // Cette logique serait implémentée dans gameEngine.ts
    return {
      actionHistory: state.actionHistory.slice(0, actionIndex + 1)
    };
  }),

  addCombatLogEntry: (entry) => set((state) => ({
    combatLog: [...state.combatLog, entry].slice(-50) // Garder les 50 dernières entrées
  })),

  addPendingAction: (action) => set((state) => ({
    pendingActions: [...state.pendingActions, action]
  })),

  removePendingAction: (actionId) => set((state) => ({
    pendingActions: state.pendingActions.filter(a => a.id !== actionId)
  })),

  clearPendingActions: () => set({ pendingActions: [] }),

  setStateHashes: (local, server) => set({
    localStateHash: local,
    serverStateHash: server,
    isDesynchronized: local !== server
  }),

  reset: () => set({
    gameState: null,
    actionHistory: [],
    combatLog: [],
    pendingActions: [],
    localStateHash: '',
    serverStateHash: '',
    isDesynchronized: false
  }),

  getCurrentPlayer: () => {
    const state = get();
    if (!state.gameState) return null;
    
    return state.gameState.current_player === 1 
      ? state.gameState.player1 
      : state.gameState.player2;
  },

  getOpponent: () => {
    const state = get();
    if (!state.gameState) return null;
    
    return state.gameState.current_player === 1 
      ? state.gameState.player2 
      : state.gameState.player1;
  },

  canPerformAction: (actionType) => {
    const state = get();
    if (!state.gameState || state.connection.status !== 'connected') return false;

    const currentPlayer = state.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.is_ready) return false;

    // Vérifier les règles spécifiques selon le type d'action
    switch (actionType) {
      case 'draw_card':
        return state.gameState.current_phase === 'draw' && 
               currentPlayer.cards_drawn_this_turn < 1;
      
      case 'summon_fighter':
        return state.gameState.current_phase === 'main' && 
               currentPlayer.actions_remaining > 0 &&
               currentPlayer.hand.length > 0;
      
      case 'attack':
        return state.gameState.current_phase === 'combat' && 
               currentPlayer.field.some(card => card.can_attack);
      
      case 'end_turn':
        return currentPlayer.actions_remaining >= 0;
      
      default:
        return true;
    }
  }
}));