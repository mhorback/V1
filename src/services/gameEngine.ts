import { GameState, GameAction, PlayerState, GameCard, Fighter, CombatLogEntry } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import { StateSync } from './stateSync';
import { socketManager } from './socketManager';
import { v4 as uuidv4 } from 'uuid';

export class GameEngine {
  private static readonly INITIAL_HAND_SIZE = 5;
  private static readonly CARDS_PER_TURN = 1;
  private static readonly MAX_FIELD_SIZE = 5;
  private static readonly TURN_TIME_LIMIT = 120000; // 2 minutes
  private static readonly INITIAL_HP = 100;
  private static readonly INITIAL_ENERGY = 3;

  // Initialiser une nouvelle partie
  static initializeGame(roomId: string, player1: PlayerState, player2: PlayerState): GameState {
    const gameState: GameState = {
      room_id: roomId,
      turn_number: 1,
      current_phase: 'setup',
      current_player: 1,
      player1: {
        ...player1,
        hp: this.INITIAL_HP,
        max_hp: this.INITIAL_HP,
        hand: [],
        field: [],
        bench: [],
        graveyard: [],
        active_fighter: null,
        energy: this.INITIAL_ENERGY,
        max_energy: this.INITIAL_ENERGY,
        cards_drawn_this_turn: 0,
        actions_remaining: 1,
        is_ready: false,
        ping: 0,
        last_heartbeat: Date.now()
      },
      player2: {
        ...player2,
        hp: this.INITIAL_HP,
        max_hp: this.INITIAL_HP,
        hand: [],
        field: [],
        bench: [],
        graveyard: [],
        active_fighter: null,
        energy: this.INITIAL_ENERGY,
        max_energy: this.INITIAL_ENERGY,
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

    newState.current_phase = 'draw';
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
      console.log('Pas le tour du joueur');
      return false;
    }

    if (action.turn_number !== gameState.turn_number) {
      console.log('Numéro de tour incorrect');
      return false;
    }

    // Vérifications spécifiques par type d'action
    switch (action.action_type) {
      case 'draw_card':
        return gameState.current_phase === 'draw' && 
               currentPlayer.cards_drawn_this_turn < this.CARDS_PER_TURN &&
               currentPlayer.bench.length > 0;

      case 'summon_fighter':
        const cardInHand = currentPlayer.hand.find(c => c.id === action.action_data.card_id);
        return gameState.current_phase === 'main' && 
               currentPlayer.actions_remaining > 0 &&
               cardInHand !== undefined &&
               currentPlayer.field.length < this.MAX_FIELD_SIZE &&
               currentPlayer.energy >= this.getCardCost(cardInHand);

      case 'attack':
        const attacker = currentPlayer.field.find(c => c.id === action.action_data.attacker_id);
        return gameState.current_phase === 'combat' && 
               attacker !== undefined &&
               attacker.can_attack &&
               !attacker.summoned_this_turn;

      case 'end_turn':
        return true; // Toujours possible de finir son tour

      case 'surrender':
        return true; // Toujours possible d'abandonner

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
      
      // Passer directement à la phase principale
      gameState.current_phase = 'main';
      return gameState;
    }

    // Piocher une carte du deck (bench)
    const drawnCard = currentPlayer.bench.shift()!;
    currentPlayer.hand.push(drawnCard);
    currentPlayer.cards_drawn_this_turn++;

    this.addCombatLog(gameState, {
      type: 'draw',
      player_id: currentPlayer.user_id,
      description: `${currentPlayer.username} a pioché ${drawnCard.fighter.name}`
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
    const cost = this.getCardCost(card);

    // Vérifier l'énergie
    if (currentPlayer.energy < cost) {
      console.error('Pas assez d\'énergie pour invoquer cette carte');
      return gameState;
    }

    // Retirer de la main et ajouter au terrain
    currentPlayer.hand.splice(cardIndex, 1);
    card.position = 'field';
    card.summoned_this_turn = true;
    card.can_attack = false;
    currentPlayer.field.push(card);

    // Consommer l'énergie
    currentPlayer.energy -= cost;
    currentPlayer.actions_remaining--;

    this.addCombatLog(gameState, {
      type: 'summon',
      player_id: currentPlayer.user_id,
      source: card.fighter.name,
      description: `${currentPlayer.username} a invoqué ${card.fighter.name} (coût: ${cost} énergie)`
    });

    // Passer à la phase de combat si plus d'actions
    if (currentPlayer.actions_remaining <= 0) {
      gameState.current_phase = 'combat';
      
      // Permettre aux combattants d'attaquer (sauf ceux invoqués ce tour)
      currentPlayer.field.forEach(fieldCard => {
        if (!fieldCard.summoned_this_turn) {
          fieldCard.can_attack = true;
        }
      });
    }

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

      // Calculer les dégâts avec l'endurance
      const actualDamage = Math.max(1, damage - target.fighter.endurance);
      target.fighter.current_hp = (target.fighter.current_hp || target.fighter.pv) - actualDamage;
      targetName = target.fighter.name;

      this.addCombatLog(gameState, {
        type: 'damage',
        player_id: currentPlayer.user_id,
        source: attacker.fighter.name,
        target: target.fighter.name,
        value: actualDamage,
        description: `${attacker.fighter.name} inflige ${actualDamage} dégâts à ${target.fighter.name} (${damage} - ${target.fighter.endurance} endurance)`
      });

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
          description: `${target.fighter.name} a été détruit !`
        });
      }

      // Contre-attaque si le défenseur survit
      if (target.fighter.current_hp > 0 && target.can_attack) {
        const counterDamage = Math.max(1, target.fighter.force - attacker.fighter.endurance);
        attacker.fighter.current_hp = (attacker.fighter.current_hp || attacker.fighter.pv) - counterDamage;

        this.addCombatLog(gameState, {
          type: 'damage',
          player_id: opponent.user_id,
          source: target.fighter.name,
          target: attacker.fighter.name,
          value: counterDamage,
          description: `${target.fighter.name} contre-attaque et inflige ${counterDamage} dégâts à ${attacker.fighter.name}`
        });

        // Vérifier si l'attaquant est détruit
        if (attacker.fighter.current_hp <= 0) {
          const attackerIndex = currentPlayer.field.findIndex(card => card.id === attacker_id);
          currentPlayer.field.splice(attackerIndex, 1);
          attacker.position = 'graveyard';
          currentPlayer.graveyard.push(attacker);

          this.addCombatLog(gameState, {
            type: 'damage',
            player_id: opponent.user_id,
            source: target.fighter.name,
            target: attacker.fighter.name,
            description: `${attacker.fighter.name} a été détruit par la contre-attaque !`
          });
        }
      }
    } else {
      // Attaque directe (seulement si l'adversaire n'a pas de combattants)
      if (opponent.field.length > 0) {
        console.error('Impossible d\'attaquer directement avec des combattants sur le terrain adverse');
        return gameState;
      }

      opponent.hp -= damage;
      targetName = opponent.username;

      this.addCombatLog(gameState, {
        type: 'damage',
        player_id: currentPlayer.user_id,
        source: attacker.fighter.name,
        target: opponent.username,
        value: damage,
        description: `${attacker.fighter.name} inflige ${damage} dégâts directement à ${opponent.username}`
      });

      // Vérifier la victoire
      if (opponent.hp <= 0) {
        gameState.current_phase = 'finished';
        this.addCombatLog(gameState, {
          type: 'phase_change',
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
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    
    // Changer de joueur
    gameState.current_player = gameState.current_player === 1 ? 2 : 1;
    gameState.turn_number++;
    gameState.current_phase = 'draw';
    gameState.turn_timer = this.TURN_TIME_LIMIT;

    // Réinitialiser les états du nouveau joueur actuel
    const newCurrentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    newCurrentPlayer.cards_drawn_this_turn = 0;
    newCurrentPlayer.actions_remaining = 1;
    
    // Augmenter l'énergie maximale et restaurer l'énergie
    if (newCurrentPlayer.max_energy < 10) {
      newCurrentPlayer.max_energy++;
    }
    newCurrentPlayer.energy = newCurrentPlayer.max_energy;

    // Permettre aux combattants d'attaquer (sauf ceux invoqués ce tour)
    newCurrentPlayer.field.forEach(card => {
      if (!card.summoned_this_turn) {
        card.can_attack = true;
      }
      card.summoned_this_turn = false;
    });

    // Réinitialiser les états de l'ancien joueur
    currentPlayer.field.forEach(card => {
      card.can_attack = false;
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
    
    return attacker ? attacker.can_attack && !attacker.summoned_this_turn : false;
  }

  private static getCardCost(card: GameCard): number {
    // Calculer le coût basé sur la rareté et les stats
    const baseStats = card.fighter.force + card.fighter.pv + card.fighter.endurance + card.fighter.vitesse;
    let cost = Math.floor(baseStats / 50);

    // Ajustement par rareté
    switch (card.fighter.rarity) {
      case 'Commune':
        cost = Math.max(1, cost - 1);
        break;
      case 'Rare':
        cost = Math.max(2, cost);
        break;
      case 'Épique':
        cost = Math.max(3, cost + 1);
        break;
      case 'Légendaire':
        cost = Math.max(4, cost + 2);
        break;
    }

    return Math.min(10, cost); // Maximum 10 d'énergie
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
      id: uuidv4(),
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
      id: uuidv4(),
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
      id: uuidv4(),
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

  // Vérifier les conditions de victoire
  static checkWinConditions(gameState: GameState): string | null {
    if (gameState.player1.hp <= 0) {
      return gameState.player2.username;
    }
    if (gameState.player2.hp <= 0) {
      return gameState.player1.username;
    }
    
    // Victoire par deck vide (optionnel)
    if (gameState.player1.hand.length === 0 && gameState.player1.bench.length === 0) {
      return gameState.player2.username;
    }
    if (gameState.player2.hand.length === 0 && gameState.player2.bench.length === 0) {
      return gameState.player1.username;
    }
    
    return null;
  }

  // Obtenir les actions possibles pour un joueur
  static getPossibleActions(gameState: GameState, playerId: string): string[] {
    const currentPlayer = gameState.current_player === 1 ? gameState.player1 : gameState.player2;
    
    if (currentPlayer.user_id !== playerId) {
      return []; // Pas le tour du joueur
    }

    const actions: string[] = [];

    switch (gameState.current_phase) {
      case 'draw':
        if (currentPlayer.cards_drawn_this_turn < this.CARDS_PER_TURN && currentPlayer.bench.length > 0) {
          actions.push('draw_card');
        }
        break;

      case 'main':
        if (currentPlayer.actions_remaining > 0) {
          // Vérifier quelles cartes peuvent être invoquées
          currentPlayer.hand.forEach(card => {
            if (currentPlayer.energy >= this.getCardCost(card) && currentPlayer.field.length < this.MAX_FIELD_SIZE) {
              actions.push(`summon_fighter:${card.id}`);
            }
          });
        }
        break;

      case 'combat':
        // Vérifier quels combattants peuvent attaquer
        currentPlayer.field.forEach(card => {
          if (card.can_attack && !card.summoned_this_turn) {
            actions.push(`attack:${card.id}`);
          }
        });
        break;
    }

    // Toujours possible de finir son tour ou abandonner
    actions.push('end_turn', 'surrender');

    return actions;
  }
}