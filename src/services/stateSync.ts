import { GameState } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import { socketManager } from './socketManager';

export class StateSync {
  private static readonly SYNC_INTERVAL = 10000; // 10 secondes
  private static syncInterval: NodeJS.Timeout | null = null;

  // Démarrer la synchronisation périodique
  static startPeriodicSync() {
    this.stopPeriodicSync();
    
    this.syncInterval = setInterval(() => {
      this.checkSyncStatus();
    }, this.SYNC_INTERVAL);
  }

  // Arrêter la synchronisation périodique
  static stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Vérifier le statut de synchronisation
  static checkSyncStatus() {
    const store = useGameStore.getState();
    
    if (!store.gameState || !socketManager.isConnected) {
      return;
    }

    // Calculer le hash local
    const localHash = this.generateStateHash(store.gameState);
    
    // Comparer avec le hash serveur
    if (store.isDesynchronized) {
      console.warn('Désynchronisation détectée, demande de synchronisation');
      this.requestFullSync();
    } else {
      // Envoyer un ping de synchronisation
      this.sendSyncPing(localHash);
    }
  }

  // Générer un hash d'état
  static generateStateHash(gameState: GameState): string {
    // Créer une version normalisée de l'état pour le hashing
    const normalizedState = {
      turn_number: gameState.turn_number,
      current_phase: gameState.current_phase,
      current_player: gameState.current_player,
      player1: {
        hp: gameState.player1.hp,
        energy: gameState.player1.energy,
        hand_count: gameState.player1.hand.length,
        field: gameState.player1.field.map(card => ({
          id: card.id,
          fighter_id: card.fighter.id,
          current_hp: card.fighter.current_hp,
          can_attack: card.can_attack
        })),
        graveyard_count: gameState.player1.graveyard.length
      },
      player2: {
        hp: gameState.player2.hp,
        energy: gameState.player2.energy,
        hand_count: gameState.player2.hand.length,
        field: gameState.player2.field.map(card => ({
          id: card.id,
          fighter_id: card.fighter.id,
          current_hp: card.fighter.current_hp,
          can_attack: card.can_attack
        })),
        graveyard_count: gameState.player2.graveyard.length
      },
      last_action_timestamp: gameState.last_action_timestamp
    };

    // Utiliser une fonction de hash compatible navigateur
    return this.browserCompatibleHash(JSON.stringify(normalizedState));
  }

  // Fonction de hash compatible navigateur
  private static browserCompatibleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(36);
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir en 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  // Envoyer un ping de synchronisation
  static sendSyncPing(localHash: string) {
    socketManager.sendMessage({
      type: 'state_sync',
      data: {
        type: 'ping',
        local_hash: localHash,
        timestamp: Date.now()
      }
    }).catch(error => {
      console.error('Erreur envoi sync ping:', error);
    });
  }

  // Demander une synchronisation complète
  static requestFullSync() {
    const store = useGameStore.getState();
    
    socketManager.sendMessage({
      type: 'state_sync',
      data: {
        type: 'request_full_sync',
        session_id: store.connection.session_id,
        last_action_timestamp: store.gameState?.last_action_timestamp || 0
      }
    }).catch(error => {
      console.error('Erreur demande sync complète:', error);
    });
  }

  // Gérer la synchronisation reçue du serveur
  static handleServerSync(syncData: any) {
    const store = useGameStore.getState();

    switch (syncData.type) {
      case 'pong':
        this.handleSyncPong(syncData);
        break;

      case 'full_state':
        this.handleFullStateSync(syncData);
        break;

      case 'state_diff':
        this.handleStateDiff(syncData);
        break;

      case 'conflict_resolution':
        this.handleConflictResolution(syncData);
        break;

      default:
        console.warn('Type de synchronisation non géré:', syncData.type);
    }
  }

  // Gérer la réponse au ping
  private static handleSyncPong(syncData: any) {
    const store = useGameStore.getState();
    const { server_hash, timestamp } = syncData;

    if (!store.gameState) return;

    const localHash = this.generateStateHash(store.gameState);
    const isDesynchronized = localHash !== server_hash;

    store.setStateHashes(localHash, server_hash);

    if (isDesynchronized) {
      console.warn('Désynchronisation détectée via ping/pong');
      this.requestFullSync();
    }

    // Calculer la latence
    const latency = Date.now() - timestamp;
    store.setConnection({ ping: latency });
  }

  // Gérer la synchronisation d'état complet
  private static handleFullStateSync(syncData: any) {
    const store = useGameStore.getState();
    const { game_state, action_history } = syncData;

    console.log('Synchronisation d\'état complet reçue');

    // Mettre à jour l'état de jeu
    store.setGameState(game_state);

    // Mettre à jour l'historique des actions
    if (action_history) {
      // Remplacer l'historique local par celui du serveur
      store.actionHistory.length = 0;
      action_history.forEach((action: any) => store.addAction(action));
    }

    // Vider les actions en attente
    store.clearPendingActions();

    // Mettre à jour les hash
    const newHash = this.generateStateHash(game_state);
    store.setStateHashes(newHash, newHash);

    console.log('Synchronisation terminée');
  }

  // Gérer les différences d'état
  private static handleStateDiff(syncData: any) {
    const store = useGameStore.getState();
    const { diffs } = syncData;

    if (!store.gameState) return;

    console.log('Application des différences d\'état:', diffs);

    // Appliquer les différences
    let newState = { ...store.gameState };
    
    diffs.forEach((diff: any) => {
      newState = this.applyDiff(newState, diff);
    });

    store.setGameState(newState);

    // Mettre à jour le hash
    const newHash = this.generateStateHash(newState);
    store.setStateHashes(newHash, syncData.server_hash);
  }

  // Gérer la résolution de conflits
  private static handleConflictResolution(syncData: any) {
    const store = useGameStore.getState();
    const { resolution_type, rollback_to_action, new_state } = syncData;

    console.log('Résolution de conflit:', resolution_type);

    switch (resolution_type) {
      case 'rollback':
        if (rollback_to_action) {
          this.performRollback(rollback_to_action);
        }
        break;

      case 'server_wins':
        if (new_state) {
          store.setGameState(new_state);
          store.clearPendingActions();
        }
        break;

      case 'merge':
        // Logique de fusion complexe
        this.performStateMerge(syncData);
        break;

      default:
        console.warn('Type de résolution non géré:', resolution_type);
    }
  }

  // Appliquer une différence d'état
  private static applyDiff(gameState: GameState, diff: any): GameState {
    const newState = { ...gameState };

    switch (diff.type) {
      case 'player_hp':
        if (diff.player === 1) {
          newState.player1.hp = diff.value;
        } else {
          newState.player2.hp = diff.value;
        }
        break;

      case 'card_moved':
        // Logique pour déplacer une carte
        this.moveCard(newState, diff.card_id, diff.from, diff.to, diff.player);
        break;

      case 'phase_change':
        newState.current_phase = diff.new_phase;
        break;

      case 'turn_change':
        newState.current_player = diff.new_player;
        newState.turn_number = diff.turn_number;
        break;

      default:
        console.warn('Type de diff non géré:', diff.type);
    }

    return newState;
  }

  // Déplacer une carte
  private static moveCard(gameState: GameState, cardId: string, from: string, to: string, playerId: string) {
    const player = gameState.player1.user_id === playerId ? gameState.player1 : gameState.player2;
    
    // Trouver et retirer la carte de sa position actuelle
    let card = null;
    const fromArray = this.getCardArray(player, from);
    const cardIndex = fromArray.findIndex(c => c.id === cardId);
    
    if (cardIndex !== -1) {
      card = fromArray.splice(cardIndex, 1)[0];
    }

    // Ajouter la carte à sa nouvelle position
    if (card) {
      card.position = to as any;
      const toArray = this.getCardArray(player, to);
      toArray.push(card);
    }
  }

  // Obtenir le tableau de cartes correspondant
  private static getCardArray(player: any, position: string) {
    switch (position) {
      case 'hand': return player.hand;
      case 'field': return player.field;
      case 'bench': return player.bench;
      case 'graveyard': return player.graveyard;
      default: return [];
    }
  }

  // Effectuer un rollback
  private static performRollback(actionId: string) {
    const store = useGameStore.getState();
    
    console.log('Rollback vers action:', actionId);
    
    // Trouver l'action dans l'historique
    const actionIndex = store.actionHistory.findIndex(a => a.id === actionId);
    if (actionIndex === -1) {
      console.error('Action de rollback non trouvée');
      this.requestFullSync();
      return;
    }

    // Supprimer les actions après ce point
    store.actionHistory.splice(actionIndex + 1);
    
    // Demander l'état correspondant au serveur
    this.requestFullSync();
  }

  // Effectuer une fusion d'états
  private static performStateMerge(syncData: any) {
    console.log('Fusion d\'états non implémentée, demande de sync complète');
    this.requestFullSync();
  }

  // Détecter les conflits
  static detectConflicts(localActions: any[], serverActions: any[]): any[] {
    const conflicts = [];

    // Comparer les actions par timestamp et type
    for (const localAction of localActions) {
      for (const serverAction of serverActions) {
        if (this.actionsConflict(localAction, serverAction)) {
          conflicts.push({
            local: localAction,
            server: serverAction,
            type: this.getConflictType(localAction, serverAction)
          });
        }
      }
    }

    return conflicts;
  }

  // Vérifier si deux actions sont en conflit
  private static actionsConflict(action1: any, action2: any): boolean {
    // Même timestamp ou très proche (< 100ms)
    const timeDiff = Math.abs(action1.timestamp - action2.timestamp);
    if (timeDiff > 100) return false;

    // Actions affectant les mêmes ressources
    if (action1.action_type === 'attack' && action2.action_type === 'attack') {
      return action1.action_data.attacker_id === action2.action_data.attacker_id;
    }

    if (action1.action_type === 'summon_fighter' && action2.action_type === 'summon_fighter') {
      return action1.action_data.card_id === action2.action_data.card_id;
    }

    return false;
  }

  // Obtenir le type de conflit
  private static getConflictType(action1: any, action2: any): string {
    if (action1.action_type === action2.action_type) {
      return 'duplicate_action';
    }
    return 'resource_conflict';
  }
}