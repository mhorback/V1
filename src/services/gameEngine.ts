import { GameState, GameAction, PlayerState, GameCard, Fighter, CombatLogEntry } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import { StateSync } from './stateSync';
import { socketManager } from './socketManager';

export class GameEngine {
  private static readonly INITIAL_HAND_SIZE = 8;
  private static readonly CARDS_PER_TURN = 1;
  private static readonly MAX_FIELD_SIZE = 5;
  private static readonly TURN_TIME_LIMIT = 120000; // 2 minutes

  // Initialiser une nouvelle partie
  static initializeGame(roomId: string, player1: PlayerState, player2: PlayerState): GameState {
    const gameState: GameState = {
      room_id: roomId,
      turn_number: 1,
      current_phase: 'setup',
      current_player: 1,
      player1: {
        ...player1,
        hp: 100,
        max_hp: 100,
        hand: [],
        field: [],
        bench: [],
        graveyard: [],
        active_fighter: null,
        energy: 3,
        max_energy: 3,
        cards_drawn_this_turn: 0,
        actions_remaining: 1,
        is_ready: false,
        ping: 0,
        last_heartbeat: Date.now()
      },
      player2: {
        ...player2,
        hp: 100,
        max_hp: 100,
        hand: [],
        field: [],
        bench: [],
        graveyard: [],
        active_fighter: null,
        energy: 3,
        max_energy: 3,
        cards_drawn_this_turn: 0,
        actions_remaining: 1,
        is_ready: false,
        ping: 0,
        last_heartbeat: Date.now()
      },
      combat_log: [],
      turn_timer: this.TURN_TIME_LIMIT,
      max_turn_time: this.TURN_TIME_LIMIT,
      game_started_at: Date.now(),
      last_action_timestamp: Date.now(),
      state_hash: ''
    };

    // Générer le hash initial
    gameState.state_hash = StateSync.generateStateHash(gameState);

    return gameState;
  }

  // Distribuer les cartes initiales
  static dealInitialCards(gameState: GameState, player1Deck: Fighter[], player2Deck: Fighter[]): GameState {
    const newState = { ...gameState };

    // Mélanger les decks
    const shuffledDeck1 = this.shuffleDeck(player1Deck);
    const shuffledDeck2 = this.shuffleDeck(player2Deck);

    // Distribuer les cartes initiales
    newState.player1.hand = shuffledDeck1.slice(0, this.INITIAL_HAND_SIZE).map(fighter => this.createGameCard(fighter));
    newState.player2.hand = shuffledDeck2.slice(0, this.INITIAL_HAND_SIZE).map(fighter => this.createGameCard(fighter));

    // Mettre les cartes restantes dans le deck (bench pour simulation)
    newState.player1.bench = shuffledDeck1.slice(this.INITIAL_HAND_SIZE).map(fighter => this.createGameCard(fighter));
    newState.player2.bench = shuffledDeck2.slice(this.INITIAL_HAND_SIZE).map(fighter => this.createGameCard(fighter));

    this.addCombatLog(newState, {
      type: 'draw',
      player_id: 'system',
      description: `Les joueurs ont pioché ${this.INITIAL_HAND_SIZE} cartes`
    });

    newState.current_phase = 'main';
    newState.state_hash = StateSync.generateStateHash(newState);

    return newState;
  }

  // Traiter une action locale
  static processLocalAction(action: GameAction): boolean {
    const store = useGameStore.getState();
    if (!store.gameState) return false;

    // Vérifier si l'action est valide
    if (!this.validateAction(action, store.gameState)) {
      console.error('Action invalide:', action);
      return false;
    }

    // Appliquer l'action localement
    const newState = this.applyAction(action, store.gameState);
    if (!newState) return false;

    // Mettre à jour le store local
    store.setGameState(newState);
    store.addAction(action);
    store.addPendingAction(action);

    // Envoyer l'action au serveur
    socketManager.sendMessage({
      type: 'action',
      data: action,
      requires_ack: true
    }).catch(error => {
      console.error('Erreur envoi action:', error);
      // Rollback local si échec d'envoi
      this.rollbackAction(action.id);
    });

    return true;
  }

  // Traiter une action reçue du serveur
  static processRemoteAction(action: GameAction): void {
    const store = useGameStore.getState();
    if (!store.gameState) return;

    // Vérifier si c'est une action qu'on a déjà appliquée localement
    const pendingAction = store.pendingActions.find(a => a.id === action.id);
    if (pendingAction) {
      // Confirmer l'action locale
      store.removePendingAction(action.id);
      return;
    }

    // Appliquer l'action distante
    const newState = this.applyAction(action, store.gameState);
    if (newState) {
      store.setGameState(newState);
      store.addAction(action);
    }
  }

  // Valider une action
  static validateAction(action: GameAction, gameState: GameState): boolean {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    
    // Vérifications de base
    if (action.player_id !== currentPlayer.user_id) {
      return false; // Pas le tour du joueur
    }

    if (action.turn_number !== gameState.turn_number) {
      return false; // Numéro de tour incorrect
    }

    // Vérifications spécifiques par type d'action
    switch (action.action_type) {
      case 'draw_card':
        return gameState.current_phase === 'draw' && 
               currentPlayer.cards_drawn_this_turn < this.CARDS_PER_TURN;

      case 'summon_fighter':
        return gameState.current_phase === 'main' && 
               currentPlayer.actions_remaining > 0 &&
               currentPlayer.hand.length > 0 &&
               currentPlayer.field.length < this.MAX_FIELD_SIZE;

      case 'attack':
        return gameState.current_phase === 'combat' && 
               this.canAttack(action.action_data.attacker_id, gameState);

      case 'end_turn':
        return currentPlayer.actions_remaining >= 0;

      case 'surrender':
        return true; // Toujours possible

      default:
        return false;
    }
  }

  // Appliquer une action
  static applyAction(action: GameAction, gameState: GameState): GameState | null {
    const newState = { ...gameState };
    newState.last_action_timestamp = action.timestamp;

    switch (action.action_type) {
      case 'draw_card':
        return this.applyDrawCard(action, newState);

      case 'summon_fighter':
        return this.applySummonFighter(action, newState);

      case 'attack':
        return this.applyAttack(action, newState);

      case 'end_turn':
        return this.applyEndTurn(action, newState);

      case 'surrender':
        return this.applySurrender(action, newState);

      default:
        console.error('Type d\'action non géré:', action.action_type);
        return null;
    }
  }

  // Actions spécifiques
  private static applyDrawCard(action: GameAction, gameState: GameState): GameState {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    
    if (currentPlayer.bench.length === 0) {
      this.addCombatLog(gameState, {
        type: 'draw',
        player_id: currentPlayer.user_id,
        description: `${currentPlayer.username} ne peut plus piocher de cartes`
      });
      return gameState;
    }

    // Piocher une carte du deck (bench)
    const drawnCard = currentPlayer.bench.shift()!;
    currentPlayer.hand.push(drawnCard);
    currentPlayer.cards_drawn_this_turn++;

    this.addCombatLog(gameState, {
      type: 'draw',
      player_id: currentPlayer.user_id,
      description: `${currentPlayer.username} a pioché une carte`
    });

    // Passer à la phase principale
    gameState.current_phase = 'main';
    gameState.state_hash = StateSync.generateStateHash(gameState);

    return gameState;
  }

  private static applySummonFighter(action: GameAction, gameState: GameState): GameState {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    const { card_id } = action.action_data;

    // Trouver la carte dans la main
    const cardIndex = currentPlayer.hand.findIndex(card => card.id === card_id);
    if (cardIndex === -1) return gameState;

    const card = currentPlayer.hand[cardIndex];
    
    // Retirer de la main et ajouter au terrain
    currentPlayer.hand.splice(cardIndex, 1);
    card.position = 'field';
    card.summoned_this_turn = true;
    card.can_attack = false;
    currentPlayer.field.push(card);

    currentPlayer.actions_remaining--;

    this.addCombatLog(gameState, {
      type: 'summon',
      player_id: currentPlayer.user_id,
      source: card.fighter.name,
      description: `${currentPlayer.username} a invoqué ${card.fighter.name}`
    });

    gameState.state_hash = StateSync.generateStateHash(gameState);
    return gameState;
  }

  private static applyAttack(action: GameAction, gameState: GameState): GameState {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    const opponent = gameState.current_player === 1 ? gameState.player2 : gameState.player1;
    const { attacker_id, target_id } = action.action_data;

    // Trouver l'attaquant
    const attacker = currentPlayer.field.find(card => card.id === attacker_id);
    if (!attacker || !attacker.can_attack) return gameState;

    let damage = attacker.fighter.force;
    let targetName = '';

    if (target_id) {
      // Attaque contre un combattant spécifique
      const target = opponent.field.find(card => card.id === target_id);
      if (!target) return gameState;

      target.fighter.current_hp = (target.fighter.current_hp || target.fighter.pv) - damage;
      targetName = target.fighter.name;

      // Vérifier si le combattant est détruit
      if (target.fighter.current_hp <= 0) {
        const targetIndex = opponent.field.findIndex(card => card.id === target_id);
        opponent.field.splice(targetIndex, 1);
        target.position = 'graveyard';
        opponent.graveyard.push(target);

        this.addCombatLog(gameState, {
          type: 'damage',
          player_id: currentPlayer.user_id,
          source: attacker.fighter.name,
          target: target.fighter.name,
          value: damage,
          description: `${attacker.fighter.name} a détruit ${target.fighter.name}`
        });
      } else {
        this.addCombatLog(gameState, {
          type: 'damage',
          player_id: currentPlayer.user_id,
          source: attacker.fighter.name,
          target: target.fighter.name,
          value: damage,
          description: `${attacker.fighter.name} inflige ${damage} dégâts à ${target.fighter.name}`
        });
      }
    } else {
      // Attaque directe
      opponent.hp -= damage;
      targetName = opponent.username;

      this.addCombatLog(gameState, {
        type: 'damage',
        player_id: currentPlayer.user_id,
        source: attacker.fighter.name,
        target: opponent.username,
        value: damage,
        description: `${attacker.fighter.name} inflige ${damage} dégâts à ${opponent.username}`
      });

      // Vérifier la victoire
      if (opponent.hp <= 0) {
        gameState.current_phase = 'finished';
        this.addCombatLog(gameState, {
          type: 'damage',
          player_id: 'system',
          description: `${currentPlayer.username} remporte la partie !`
        });
      }
    }

    attacker.can_attack = false;
    gameState.state_hash = StateSync.generateStateHash(gameState);
    return gameState;
  }

  private static applyEndTurn(action: GameAction, gameState: GameState): GameState {
    // Changer de joueur
    gameState.current_player = gameState.current_player === 1 ? 2 : 1;
    gameState.turn_number++;
    gameState.current_phase = 'draw';
    gameState.turn_timer = this.TURN_TIME_LIMIT;

    // Réinitialiser les états du nouveau joueur actuel
    const newCurrentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    newCurrentPlayer.cards_drawn_this_turn = 0;
    newCurrentPlayer.actions_remaining = 1;
    newCurrentPlayer.energy = Math.min(newCurrentPlayer.max_energy, newCurrentPlayer.energy + 1);

    // Permettre aux combattants d'attaquer (sauf ceux invoqués ce tour)
    newCurrentPlayer.field.forEach(card => {
      if (!card.summoned_this_turn) {
        card.can_attack = true;
      }
      card.summoned_this_turn = false;
    });

    this.addCombatLog(gameState, {
      type: 'phase_change',
      player_id: 'system',
      description: `Tour ${gameState.turn_number} - C'est au tour de ${newCurrentPlayer.username}`
    });

    gameState.state_hash = StateSync.generateStateHash(gameState);
    return gameState;
  }

  private static applySurrender(action: GameAction, gameState: GameState): GameState {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    const opponent = gameState.current_player === 1 ? gameState.player2 : gameState.player1;

    gameState.current_phase = 'finished';
    
    this.addCombatLog(gameState, {
      type: 'phase_change',
      player_id: currentPlayer.user_id,
      description: `${currentPlayer.username} abandonne. ${opponent.username} remporte la partie !`
    });

    gameState.state_hash = StateSync.generateStateHash(gameState);
    return gameState;
  }

  // Utilitaires
  private static canAttack(attackerId: string, gameState: GameState): boolean {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    const attacker = currentPlayer.field.find(card => card.id === attackerId);
    
    return attacker ? attacker.can_attack : false;
  }

  private static shuffleDeck(deck: Fighter[]): Fighter[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private static createGameCard(fighter: Fighter): GameCard {
    return {
      id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fighter: {
        ...fighter,
        current_hp: fighter.pv
      },
      position: 'hand',
      can_attack: false,
      summoned_this_turn: false
    };
  }

  private static addCombatLog(gameState: GameState, entry: Omit<CombatLogEntry, 'id' | 'timestamp'>) {
    const logEntry: CombatLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...entry
    };

    gameState.combat_log.push(logEntry);
    
    // Garder seulement les 50 dernières entrées
    if (gameState.combat_log.length > 50) {
      gameState.combat_log = gameState.combat_log.slice(-50);
    }
  }

  // Rollback d'action
  static rollbackAction(actionId: string): void {
    const store = useGameStore.getState();
    
    // Trouver l'action dans l'historique
    const actionIndex = store.actionHistory.findIndex(a => a.id === actionId);
    if (actionIndex === -1) return;

    // Reconstruire l'état en rejouant toutes les actions jusqu'à ce point
    // Cette implémentation nécessiterait un état initial sauvegardé
    console.log('Rollback vers action:', actionId);
    
    // Pour l'instant, on demande une synchronisation complète
    StateSync.requestFullSync();
  }

  // Créer une action
  static createAction(
    actionType: string, 
    actionData: any, 
    playerId: string, 
    roomId: string
  ): GameAction {
    const store = useGameStore.getState();
    const gameState = store.gameState;
    
    if (!gameState) {
      throw new Error('Aucun état de jeu disponible');
    }

    return {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      room_id: roomId,
      player_id: playerId,
      action_type: actionType,
      action_data: actionData,
      timestamp: Date.now(),
      turn_number: gameState.turn_number,
      sequence_number: store.actionHistory.length + 1,
      state_hash_before: gameState.state_hash
    };
  }
}