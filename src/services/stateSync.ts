import { GameState, GameAction } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import { socketManager } from './socketManager';

export class StateSync {
  private static readonly SYNC_INTERVAL = 10000; // 10 secondes
  private static readonly CONFLICT_RESOLUTION_TIMEOUT = 5000; // 5 secondes
  private static syncInterval: NodeJS.Timeout | null = null;
  private static pendingConflicts: Map<string, any> = new Map();

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
    
    if (!store.gameState || !socketManager.isConnectedState) {
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

  // Générer un hash d'état robuste
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
          can_attack: card.can_attack,
          position: card.position
        })).sort((a, b) => a.id.localeCompare(b.id)), // Tri pour consistance
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
          can_attack: card.can_attack,
          position: card.position
        })).sort((a, b) => a.id.localeCompare(b.id)), // Tri pour consistance
        graveyard_count: gameState.player2.graveyard.length
      },
      last_action_timestamp: gameState.last_action_timestamp
    };

    // Utiliser une fonction de hash cryptographique
    return this.sha256Hash(JSON.stringify(normalizedState));
  }

  // Fonction de hash SHA-256 compatible navigateur
  private static async sha256Hash(message: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Utiliser l'API Web Crypto si disponible
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback pour les environnements sans Web Crypto
      return this.fallbackHash(message);
    }
  }

  // Hash de fallback robuste
  private static fallbackHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(16);
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir en 32bit integer
    }
    
    // Ajouter une seconde passe pour plus de robustesse
    let hash2 = 0;
    for (let i = str.length - 1; i >= 0; i--) {
      const char = str.charCodeAt(i);
      hash2 = ((hash2 << 3) - hash2) + char;
      hash2 = hash2 & hash2;
    }
    
    return (Math.abs(hash) + Math.abs(hash2)).toString(16);
  }

  // Envoyer un ping de synchronisation
  static sendSyncPing(localHash: string) {
    const store = useGameStore.getState();
    
    socketManager.sendMessage({
      type: 'state_sync',
      data: {
        type: 'ping',
        local_hash: localHash,
        timestamp: Date.now(),
        turn_number: store.gameState?.turn_number || 0,
        last_action_id: store.actionHistory[store.actionHistory.length - 1]?.id
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
        last_action_timestamp: store.gameState?.last_action_timestamp || 0,
        local_action_count: store.actionHistory.length,
        local_hash: store.localStateHash
      }
    }).catch(error => {
      console.error('Erreur demande sync complète:', error);
    });
  }

  // Envoyer l'état local au serveur
  static sendLocalState() {
    const store = useGameStore.getState();
    
    if (!store.gameState) return;

    const localHash = this.generateStateHash(store.gameState);
    
    socketManager.sendMessage({
      type: 'state_sync',
      data: {
        type: 'local_state',
        game_state: store.gameState,
        action_history: store.actionHistory.slice(-20), // Dernières 20 actions
        local_hash: localHash,
        timestamp: Date.now()
      }
    }).catch(error => {
      console.error('Erreur envoi état local:', error);
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

      case 'conflict_detected':
        this.handleConflictDetected(syncData);
        break;

      case 'conflict_resolution':
        this.handleConflictResolution(syncData);
        break;

      case 'request_local_state':
        this.sendLocalState();
        break;

      case 'hash_mismatch':
        this.handleHashMismatch(syncData);
        break;

      default:
        console.warn('Type de synchronisation non géré:', syncData.type);
    }
  }

  // Gérer la réponse au ping
  private static async handleSyncPong(syncData: any) {
    const store = useGameStore.getState();
    const { server_hash, timestamp, turn_number } = syncData;

    if (!store.gameState) return;

    const localHash = await this.generateStateHash(store.gameState);
    const isDesynchronized = localHash !== server_hash;

    store.setStateHashes(localHash, server_hash);

    if (isDesynchronized) {
      console.warn('Désynchronisation détectée via ping/pong');
      console.log('Hash local:', localHash);
      console.log('Hash serveur:', server_hash);
      
      // Vérifier si c'est juste un décalage de tour
      if (Math.abs((store.gameState.turn_number || 0) - turn_number) <= 1) {
        console.log('Décalage mineur détecté, demande de diff');
        this.requestStateDiff();
      } else {
        console.log('Décalage majeur détecté, demande de sync complète');
        this.requestFullSync();
      }
    }

    // Calculer la latence
    const latency = Date.now() - timestamp;
    store.setConnection({ ping: latency });
  }

  // Gérer la synchronisation d'état complet
  private static handleFullStateSync(syncData: any) {
    const store = useGameStore.getState();
    const { game_state, action_history, server_hash } = syncData;

    console.log('Synchronisation d\'état complet reçue');

    // Sauvegarder l'ancien état pour rollback si nécessaire
    const oldState = store.gameState;
    const oldHistory = [...store.actionHistory];

    try {
      // Mettre à jour l'état de jeu
      store.setGameState(game_state);

      // Mettre à jour l'historique des actions
      if (action_history) {
        store.actionHistory.length = 0;
        action_history.forEach((action: GameAction) => store.addAction(action));
      }

      // Vider les actions en attente
      store.clearPendingActions();

      // Mettre à jour les hash
      const newHash = this.generateStateHash(game_state);
      store.setStateHashes(newHash, server_hash);

      console.log('Synchronisation terminée avec succès');
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      
      // Rollback en cas d'erreur
      if (oldState) {
        store.setGameState(oldState);
        store.actionHistory.length = 0;
        oldHistory.forEach(action => store.addAction(action));
      }
    }
  }

  // Demander une différence d'état
  private static requestStateDiff() {
    const store = useGameStore.getState();
    
    socketManager.sendMessage({
      type: 'state_sync',
      data: {
        type: 'request_state_diff',
        from_turn: store.gameState?.turn_number || 0,
        local_hash: store.localStateHash
      }
    });
  }

  // Gérer les différences d'état
  private static handleStateDiff(syncData: any) {
    const store = useGameStore.getState();
    const { diffs, target_hash } = syncData;

    if (!store.gameState) return;

    console.log('Application des différences d\'état:', diffs);

    try {
      // Appliquer les différences
      let newState = { ...store.gameState };
      
      for (const diff of diffs) {
        newState = this.applyDiff(newState, diff);
      }

      store.setGameState(newState);

      // Vérifier le hash final
      const finalHash = this.generateStateHash(newState);
      if (finalHash === target_hash) {
        store.setStateHashes(finalHash, target_hash);
        console.log('Différences appliquées avec succès');
      } else {
        console.warn('Hash final ne correspond pas, demande de sync complète');
        this.requestFullSync();
      }
    } catch (error) {
      console.error('Erreur application des différences:', error);
      this.requestFullSync();
    }
  }

  // Gérer la détection de conflit
  private static handleConflictDetected(syncData: any) {
    const { conflict_id, local_actions, server_actions } = syncData;
    
    console.warn('Conflit détecté:', conflict_id);
    
    // Analyser le conflit
    const conflicts = this.analyzeConflicts(local_actions, server_actions);
    
    // Proposer une résolution
    const resolution = this.proposeConflictResolution(conflicts);
    
    // Envoyer la proposition de résolution
    socketManager.sendMessage({
      type: 'state_sync',
      data: {
        type: 'conflict_resolution_proposal',
        conflict_id,
        resolution,
        timestamp: Date.now()
      }
    });

    // Stocker le conflit en attente
    this.pendingConflicts.set(conflict_id, {
      conflicts,
      resolution,
      timestamp: Date.now()
    });

    // Timeout pour la résolution
    setTimeout(() => {
      if (this.pendingConflicts.has(conflict_id)) {
        console.warn('Timeout résolution conflit, demande sync complète');
        this.pendingConflicts.delete(conflict_id);
        this.requestFullSync();
      }
    }, this.CONFLICT_RESOLUTION_TIMEOUT);
  }

  // Gérer la résolution de conflits
  private static handleConflictResolution(syncData: any) {
    const store = useGameStore.getState();
    const { conflict_id, resolution_type, new_state, rollback_to_action } = syncData;

    console.log('Résolution de conflit reçue:', resolution_type);

    // Supprimer le conflit en attente
    this.pendingConflicts.delete(conflict_id);

    switch (resolution_type) {
      case 'server_wins':
        if (new_state) {
          store.setGameState(new_state);
          store.clearPendingActions();
          const newHash = this.generateStateHash(new_state);
          store.setStateHashes(newHash, newHash);
        }
        break;

      case 'client_wins':
        // Le client garde son état, mais doit le renvoyer au serveur
        this.sendLocalState();
        break;

      case 'merge':
        if (new_state) {
          store.setGameState(new_state);
          const newHash = this.generateStateHash(new_state);
          store.setStateHashes(newHash, newHash);
        }
        break;

      case 'rollback':
        if (rollback_to_action) {
          this.performRollback(rollback_to_action);
        }
        break;

      default:
        console.warn('Type de résolution non géré:', resolution_type);
        this.requestFullSync();
    }
  }

  // Gérer les erreurs de hash
  private static handleHashMismatch(syncData: any) {
    const { expected_hash, received_hash, severity } = syncData;
    
    console.warn('Erreur de hash détectée:', {
      expected: expected_hash,
      received: received_hash,
      severity
    });

    if (severity === 'critical') {
      this.requestFullSync();
    } else {
      this.requestStateDiff();
    }
  }

  // Appliquer une différence d'état
  private static applyDiff(gameState: GameState, diff: any): GameState {
    const newState = { ...gameState };

    switch (diff.type) {
      case 'player_hp':
        if (diff.player === 1) {
          newState.player1 = { ...newState.player1, hp: diff.value };
        } else {
          newState.player2 = { ...newState.player2, hp: diff.value };
        }
        break;

      case 'player_energy':
        if (diff.player === 1) {
          newState.player1 = { ...newState.player1, energy: diff.value };
        } else {
          newState.player2 = { ...newState.player2, energy: diff.value };
        }
        break;

      case 'card_moved':
        this.moveCard(newState, diff.card_id, diff.from, diff.to, diff.player);
        break;

      case 'card_updated':
        this.updateCard(newState, diff.card_id, diff.updates, diff.player);
        break;

      case 'phase_change':
        newState.current_phase = diff.new_phase;
        break;

      case 'turn_change':
        newState.current_player = diff.new_player;
        newState.turn_number = diff.turn_number;
        break;

      case 'timestamp_update':
        newState.last_action_timestamp = diff.timestamp;
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

  // Mettre à jour une carte
  private static updateCard(gameState: GameState, cardId: string, updates: any, playerId: string) {
    const player = gameState.player1.user_id === playerId ? gameState.player1 : gameState.player2;
    
    // Chercher la carte dans toutes les zones
    const allCards = [...player.hand, ...player.field, ...player.bench, ...player.graveyard];
    const card = allCards.find(c => c.id === cardId);
    
    if (card) {
      Object.assign(card, updates);
      if (updates.fighter) {
        Object.assign(card.fighter, updates.fighter);
      }
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

  // Analyser les conflits
  private static analyzeConflicts(localActions: GameAction[], serverActions: GameAction[]): any[] {
    const conflicts = [];

    for (const localAction of localActions) {
      for (const serverAction of serverActions) {
        if (this.actionsConflict(localAction, serverAction)) {
          conflicts.push({
            local: localAction,
            server: serverAction,
            type: this.getConflictType(localAction, serverAction),
            severity: this.getConflictSeverity(localAction, serverAction)
          });
        }
      }
    }

    return conflicts;
  }

  // Vérifier si deux actions sont en conflit
  private static actionsConflict(action1: GameAction, action2: GameAction): boolean {
    // Même timestamp ou très proche (< 500ms)
    const timeDiff = Math.abs(action1.timestamp - action2.timestamp);
    if (timeDiff > 500) return false;

    // Actions affectant les mêmes ressources
    if (action1.action_type === 'attack' && action2.action_type === 'attack') {
      return action1.action_data.attacker_id === action2.action_data.attacker_id;
    }

    if (action1.action_type === 'summon_fighter' && action2.action_type === 'summon_fighter') {
      return action1.action_data.card_id === action2.action_data.card_id;
    }

    if (action1.action_type === 'end_turn' || action2.action_type === 'end_turn') {
      return true; // Les fins de tour sont toujours en conflit
    }

    return false;
  }

  // Obtenir le type de conflit
  private static getConflictType(action1: GameAction, action2: GameAction): string {
    if (action1.action_type === action2.action_type) {
      return 'duplicate_action';
    }
    if (action1.action_type === 'end_turn' || action2.action_type === 'end_turn') {
      return 'turn_conflict';
    }
    return 'resource_conflict';
  }

  // Obtenir la sévérité du conflit
  private static getConflictSeverity(action1: GameAction, action2: GameAction): 'low' | 'medium' | 'high' {
    if (action1.action_type === 'end_turn' || action2.action_type === 'end_turn') {
      return 'high';
    }
    if (action1.action_type === action2.action_type) {
      return 'medium';
    }
    return 'low';
  }

  // Proposer une résolution de conflit
  private static proposeConflictResolution(conflicts: any[]): any {
    if (conflicts.length === 0) {
      return { type: 'no_conflict' };
    }

    // Trier par sévérité
    const highSeverity = conflicts.filter(c => c.severity === 'high');
    const mediumSeverity = conflicts.filter(c => c.severity === 'medium');

    if (highSeverity.length > 0) {
      // Conflits de haute sévérité : le serveur gagne
      return {
        type: 'server_wins',
        reason: 'high_severity_conflict',
        conflicts: highSeverity
      };
    }

    if (mediumSeverity.length > 0) {
      // Conflits de sévérité moyenne : essayer de fusionner
      return {
        type: 'merge',
        reason: 'medium_severity_conflict',
        conflicts: mediumSeverity
      };
    }

    // Conflits de faible sévérité : le client peut gagner
    return {
      type: 'client_wins',
      reason: 'low_severity_conflict',
      conflicts
    };
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

  // Nettoyer les conflits expirés
  static cleanupExpiredConflicts() {
    const now = Date.now();
    for (const [conflictId, conflict] of this.pendingConflicts.entries()) {
      if (now - conflict.timestamp > this.CONFLICT_RESOLUTION_TIMEOUT) {
        console.warn('Conflit expiré supprimé:', conflictId);
        this.pendingConflicts.delete(conflictId);
      }
    }
  }

  // Obtenir les statistiques de synchronisation
  static getSyncStats() {
    const store = useGameStore.getState();
    return {
      isDesynchronized: store.isDesynchronized,
      localHash: store.localStateHash,
      serverHash: store.serverStateHash,
      pendingActions: store.pendingActions.length,
      pendingConflicts: this.pendingConflicts.size,
      lastSync: store.connection.last_heartbeat
    };
  }
}