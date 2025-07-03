import React, { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { GameEngine } from '../services/gameEngine';
import { socketManager } from '../services/socketManager';
import { StateSync } from '../services/stateSync';
import { 
  Heart, 
  Zap, 
  Shield, 
  Sword, 
  Clock, 
  Wifi, 
  WifiOff, 
  AlertTriangle,
  RotateCcw,
  Flag,
  Play,
  Pause,
  Target,
  Coins,
  Eye,
  EyeOff
} from 'lucide-react';
import { GameCard, PlayerState } from '../types/game';

interface GameBoardProps {
  roomId: string;
  playerId: string;
  onGameEnd: (winner: string) => void;
  onBack: () => void;
}

const GameBoard: React.FC<GameBoardProps> = ({ roomId, playerId, onGameEnd, onBack }) => {
  const {
    gameState,
    connection,
    combatLog,
    isDesynchronized,
    canPerformAction,
    getCurrentPlayer,
    getOpponent
  } = useGameStore();

  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<GameCard | null>(null);
  const [showCombatLog, setShowCombatLog] = useState(false);
  const [showOpponentHand, setShowOpponentHand] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState(0);
  const [actionMessage, setActionMessage] = useState<string>('');

  const currentPlayer = getCurrentPlayer();
  const opponent = getOpponent();
  const isMyTurn = currentPlayer?.user_id === playerId;

  // Timer du tour
  useEffect(() => {
    if (!gameState) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - gameState.last_action_timestamp;
      const remaining = Math.max(0, gameState.max_turn_time - elapsed);
      setTurnTimeLeft(remaining);

      if (remaining === 0 && isMyTurn && gameState.current_phase !== 'finished') {
        // Fin de tour automatique
        handleEndTurn();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.last_action_timestamp, isMyTurn]);

  // Connexion WebSocket
  useEffect(() => {
    socketManager.connect(roomId, playerId)
      .then(() => {
        console.log('Connecté à la salle de jeu');
        StateSync.startPeriodicSync();
      })
      .catch(error => {
        console.error('Erreur connexion WebSocket:', error);
      });

    return () => {
      StateSync.stopPeriodicSync();
      socketManager.disconnect();
    };
  }, [roomId, playerId]);

  // Vérifier la fin de partie
  useEffect(() => {
    if (gameState?.current_phase === 'finished') {
      const winner = GameEngine.checkWinConditions(gameState);
      if (winner) {
        setTimeout(() => onGameEnd(winner), 2000); // Délai pour voir le message final
      }
    }
  }, [gameState?.current_phase]);

  // Messages d'action temporaires
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Actions de jeu
  const handleDrawCard = () => {
    if (!canPerformAction('draw_card') || !currentPlayer) return;

    const action = GameEngine.createAction(
      'draw_card',
      {},
      playerId,
      roomId
    );

    if (GameEngine.processLocalAction(action)) {
      setActionMessage('Carte piochée !');
    }
  };

  const handleSummonFighter = (card: GameCard) => {
    if (!canPerformAction('summon_fighter') || !currentPlayer) return;

    const action = GameEngine.createAction(
      'summon_fighter',
      { card_id: card.id },
      playerId,
      roomId
    );

    if (GameEngine.processLocalAction(action)) {
      setSelectedCard(null);
      setActionMessage(`${card.fighter.name} invoqué !`);
    }
  };

  const handleAttack = (attacker: GameCard, target?: GameCard) => {
    if (!canPerformAction('attack')) return;

    const action = GameEngine.createAction(
      'attack',
      { 
        attacker_id: attacker.id,
        target_id: target?.id || null
      },
      playerId,
      roomId
    );

    if (GameEngine.processLocalAction(action)) {
      setSelectedCard(null);
      setSelectedTarget(null);
      setActionMessage(target ? `${attacker.fighter.name} attaque ${target.fighter.name} !` : `${attacker.fighter.name} attaque directement !`);
    }
  };

  const handleEndTurn = () => {
    if (!canPerformAction('end_turn')) return;

    const action = GameEngine.createAction(
      'end_turn',
      {},
      playerId,
      roomId
    );

    if (GameEngine.processLocalAction(action)) {
      setSelectedCard(null);
      setSelectedTarget(null);
      setActionMessage('Tour terminé !');
    }
  };

  const handleSurrender = () => {
    if (!confirm('Êtes-vous sûr de vouloir abandonner ?')) return;

    const action = GameEngine.createAction(
      'surrender',
      {},
      playerId,
      roomId
    );

    GameEngine.processLocalAction(action);
  };

  const handleRequestSync = () => {
    StateSync.requestFullSync();
    setActionMessage('Synchronisation demandée...');
  };

  // Formatage du temps
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  // Obtenir le coût d'une carte
  const getCardCost = (card: GameCard): number => {
    const baseStats = card.fighter.force + card.fighter.pv + card.fighter.endurance + card.fighter.vitesse;
    let cost = Math.floor(baseStats / 50);

    switch (card.fighter.rarity) {
      case 'Commune': cost = Math.max(1, cost - 1); break;
      case 'Rare': cost = Math.max(2, cost); break;
      case 'Épique': cost = Math.max(3, cost + 1); break;
      case 'Légendaire': cost = Math.max(4, cost + 2); break;
    }

    return Math.min(10, cost);
  };

  // Composant carte de combattant
  const FighterCardComponent = ({ 
    card, 
    isSelectable = false, 
    isSelected = false, 
    isTarget = false,
    showCost = false,
    onClick 
  }: {
    card: GameCard;
    isSelectable?: boolean;
    isSelected?: boolean;
    isTarget?: boolean;
    showCost?: boolean;
    onClick?: () => void;
  }) => {
    const getRarityColor = (rarity: string) => {
      switch(rarity) {
        case "Légendaire": return "from-yellow-400 to-orange-500";
        case "Épique": return "from-purple-400 to-blue-500";
        case "Rare": return "from-blue-400 to-cyan-500";
        case "Commune": return "from-gray-400 to-gray-600";
        default: return "from-gray-400 to-gray-600";
      }
    };

    const cost = showCost ? getCardCost(card) : 0;
    const canAfford = !showCost || (currentPlayer && currentPlayer.energy >= cost);

    return (
      <div className="relative">
        <div 
          className={`relative w-28 h-36 bg-gradient-to-br ${getRarityColor(card.fighter.rarity)} p-1 rounded-lg shadow-lg transition-all duration-200 ${
            isSelectable && canAfford ? 'hover:scale-105 cursor-pointer hover:shadow-xl' : ''
          } ${isSelected ? 'ring-2 ring-yellow-400 scale-105' : ''} ${
            isTarget ? 'ring-2 ring-red-400 scale-105' : ''
          } ${!canAfford && showCost ? 'opacity-50 grayscale' : ''} ${
            !card.can_attack && card.position === 'field' && !showCost ? 'opacity-70' : ''
          }`}
          onClick={() => isSelectable && canAfford && onClick && onClick()}
        >
          <div className="bg-gray-900 h-full rounded-md border-2 border-gray-700 overflow-hidden">
            {/* Header avec nom et rareté */}
            <div className="bg-gradient-to-r from-black to-gray-800 px-2 py-1">
              <h3 className="text-xs font-bold text-white truncate">{card.fighter.name}</h3>
              <div className="text-xs">
                {card.fighter.rarity === "Légendaire" && <span className="text-yellow-400">⭐</span>}
                {card.fighter.rarity === "Épique" && <span className="text-purple-400">💎</span>}
                {card.fighter.rarity === "Rare" && <span className="text-blue-400">💠</span>}
                {card.fighter.rarity === "Commune" && <span className="text-gray-400">⚪</span>}
              </div>
            </div>
            
            {/* Image placeholder */}
            <div className="h-12 bg-gradient-to-b from-gray-700 to-gray-800 flex items-center justify-center">
              <div className="text-2xl">⚔️</div>
            </div>
            
            {/* Stats */}
            <div className="p-1 space-y-1">
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Sword className="w-2 h-2 text-red-400" />
                  <span className="text-xs font-bold text-white">{card.fighter.force}</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Heart className="w-2 h-2 text-red-400" />
                  <span className="text-xs font-bold text-white">
                    {card.fighter.current_hp || card.fighter.pv}
                    {card.fighter.current_hp !== card.fighter.pv && (
                      <span className="text-gray-400">/{card.fighter.pv}</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Shield className="w-2 h-2 text-blue-400" />
                  <span className="text-xs font-bold text-white">{card.fighter.endurance}</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Zap className="w-2 h-2 text-yellow-400" />
                  <span className="text-xs font-bold text-white">{card.fighter.vitesse}</span>
                </div>
              </div>
            </div>

            {/* Coût d'invocation */}
            {showCost && (
              <div className="absolute top-1 left-1 bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                {cost}
              </div>
            )}

            {/* Indicateurs d'état */}
            {card.summoned_this_turn && (
              <div className="absolute top-1 right-1 bg-green-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                ✨
              </div>
            )}
            
            {card.can_attack && card.position === 'field' && !card.summoned_this_turn && (
              <div className="absolute bottom-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                ⚔️
              </div>
            )}

            {/* Dégâts subis */}
            {card.fighter.current_hp && card.fighter.current_hp < card.fighter.pv && (
              <div className="absolute bottom-1 left-1 bg-red-800 text-white px-1 rounded text-xs font-bold">
                -{card.fighter.pv - card.fighter.current_hp}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Composant carte cachée (main adverse)
  const HiddenCardComponent = () => (
    <div className="w-28 h-36 bg-gradient-to-br from-gray-600 to-gray-800 p-1 rounded-lg shadow-lg">
      <div className="bg-gray-900 h-full rounded-md border-2 border-gray-700 flex items-center justify-center">
        <div className="text-4xl text-gray-500">🂠</div>
      </div>
    </div>
  );

  if (!gameState || !currentPlayer || !opponent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl">Chargement de la partie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header avec informations de connexion */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">
              Tour {gameState.turn_number} - {gameState.current_phase === 'draw' ? 'Pioche' : 
                                                gameState.current_phase === 'main' ? 'Principale' :
                                                gameState.current_phase === 'combat' ? 'Combat' :
                                                gameState.current_phase === 'finished' ? 'Terminé' : gameState.current_phase}
            </h1>
            
            {/* Indicateur de tour */}
            {isMyTurn && gameState.current_phase !== 'finished' && (
              <div className="bg-green-600 text-white px-3 py-1 rounded-lg font-bold animate-pulse">
                Votre tour
              </div>
            )}
            
            {/* Indicateur de connexion */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
              connection.status === 'connected' ? 'bg-green-900' : 
              connection.status === 'reconnecting' ? 'bg-yellow-900' : 'bg-red-900'
            }`}>
              {connection.status === 'connected' ? 
                <Wifi className="w-4 h-4 text-green-400" /> : 
                <WifiOff className="w-4 h-4 text-red-400" />
              }
              <span className="text-white text-sm">
                {connection.status === 'connected' ? `${connection.ping}ms` : connection.status}
              </span>
            </div>

            {/* Indicateur de désynchronisation */}
            {isDesynchronized && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-red-900">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-red-200 text-sm">Désynchronisé</span>
                <button
                  onClick={handleRequestSync}
                  className="text-red-400 hover:text-red-200"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Timer du tour */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
              turnTimeLeft < 30000 ? 'bg-red-900' : 'bg-blue-900'
            }`}>
              <Clock className="w-4 h-4 text-white" />
              <span className="text-white font-bold">{formatTime(turnTimeLeft)}</span>
            </div>

            <button
              onClick={() => setShowCombatLog(!showCombatLog)}
              className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-lg text-sm"
            >
              Log
            </button>

            <button
              onClick={onBack}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold"
            >
              Quitter
            </button>
          </div>
        </div>

        {/* Message d'action temporaire */}
        {actionMessage && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg font-bold text-lg z-50 animate-bounce">
            {actionMessage}
          </div>
        )}

        {/* Zone de l'adversaire */}
        <div className="bg-slate-800 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-white">{opponent.username}</h2>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-400" />
                <div className="w-32 bg-gray-700 rounded-full h-3">
                  <div 
                    className="bg-red-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(0, (opponent.hp / opponent.max_hp) * 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold">{opponent.hp}/{opponent.max_hp}</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-400" />
                <span className="text-white font-bold">{opponent.energy}/{opponent.max_energy}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-gray-400">
                Main: {opponent.hand.length} cartes
              </div>
              <button
                onClick={() => setShowOpponentHand(!showOpponentHand)}
                className="text-gray-400 hover:text-white"
              >
                {showOpponentHand ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Main de l'adversaire */}
          {showOpponentHand && (
            <div className="mb-4">
              <h3 className="text-white font-bold mb-2">Main adverse</h3>
              <div className="flex gap-2 min-h-[150px] bg-slate-700 rounded-lg p-2">
                {opponent.hand.map((_, index) => (
                  <HiddenCardComponent key={index} />
                ))}
                {opponent.hand.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    Aucune carte en main
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Terrain de l'adversaire */}
          <div>
            <h3 className="text-white font-bold mb-2">Terrain adverse</h3>
            <div className="flex gap-2 min-h-[150px] bg-slate-700 rounded-lg p-2">
              {opponent.field.map(card => (
                <FighterCardComponent
                  key={card.id}
                  card={card}
                  isSelectable={selectedCard?.can_attack && gameState.current_phase === 'combat' && isMyTurn}
                  isTarget={selectedTarget?.id === card.id}
                  onClick={() => {
                    if (selectedCard?.can_attack && gameState.current_phase === 'combat' && isMyTurn) {
                      setSelectedTarget(selectedTarget?.id === card.id ? null : card);
                    }
                  }}
                />
              ))}
              {opponent.field.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Aucun combattant
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Zone du joueur */}
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-white">
                {currentPlayer.username}
              </h2>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-400" />
                <div className="w-32 bg-gray-700 rounded-full h-3">
                  <div 
                    className="bg-green-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(0, (currentPlayer.hp / currentPlayer.max_hp) * 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold">{currentPlayer.hp}/{currentPlayer.max_hp}</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-400" />
                <span className="text-white font-bold">{currentPlayer.energy}/{currentPlayer.max_energy}</span>
              </div>
            </div>
            
            {/* Actions de tour */}
            <div className="flex gap-2">
              {gameState.current_phase === 'draw' && isMyTurn && (
                <button
                  onClick={handleDrawCard}
                  disabled={!canPerformAction('draw_card')}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Piocher
                </button>
              )}
              
              {isMyTurn && gameState.current_phase !== 'finished' && (
                <button
                  onClick={handleEndTurn}
                  disabled={!canPerformAction('end_turn')}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Fin de tour
                </button>
              )}
              
              <button
                onClick={handleSurrender}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
              >
                <Flag className="w-4 h-4" />
                Abandonner
              </button>
            </div>
          </div>

          {/* Terrain du joueur */}
          <div className="mb-4">
            <h3 className="text-white font-bold mb-2">Votre terrain</h3>
            <div className="flex gap-2 min-h-[150px] bg-slate-700 rounded-lg p-2">
              {currentPlayer.field.map(card => (
                <FighterCardComponent
                  key={card.id}
                  card={card}
                  isSelectable={card.can_attack && gameState.current_phase === 'combat' && isMyTurn && !card.summoned_this_turn}
                  isSelected={selectedCard?.id === card.id}
                  onClick={() => {
                    if (card.can_attack && gameState.current_phase === 'combat' && isMyTurn && !card.summoned_this_turn) {
                      setSelectedCard(selectedCard?.id === card.id ? null : card);
                      setSelectedTarget(null);
                    }
                  }}
                />
              ))}
              {currentPlayer.field.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Aucun combattant
                </div>
              )}
            </div>
          </div>

          {/* Main du joueur */}
          <div>
            <h3 className="text-white font-bold mb-2">Votre main</h3>
            <div className="flex gap-2 min-h-[150px] bg-slate-700 rounded-lg p-2 overflow-x-auto">
              {currentPlayer.hand.map(card => (
                <FighterCardComponent
                  key={card.id}
                  card={card}
                  showCost={true}
                  isSelectable={canPerformAction('summon_fighter') && gameState.current_phase === 'main' && isMyTurn && currentPlayer.field.length < 5}
                  onClick={() => {
                    if (canPerformAction('summon_fighter') && gameState.current_phase === 'main' && isMyTurn && currentPlayer.field.length < 5) {
                      handleSummonFighter(card);
                    }
                  }}
                />
              ))}
              {currentPlayer.hand.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Aucune carte en main
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions de combat */}
        {selectedCard && gameState.current_phase === 'combat' && isMyTurn && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 rounded-lg p-4 border-2 border-yellow-400 shadow-2xl">
            <div className="text-white text-center mb-2">
              <strong>{selectedCard.fighter.name}</strong> peut attaquer
            </div>
            <div className="flex gap-2">
              {selectedTarget ? (
                <button
                  onClick={() => handleAttack(selectedCard, selectedTarget)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Target className="w-4 h-4" />
                  Attaquer {selectedTarget.fighter.name}
                </button>
              ) : (
                <button
                  onClick={() => handleAttack(selectedCard)}
                  disabled={opponent.field.length > 0}
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Target className="w-4 h-4" />
                  Attaque directe
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedCard(null);
                  setSelectedTarget(null);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Annuler
              </button>
            </div>
            {opponent.field.length > 0 && !selectedTarget && (
              <div className="text-yellow-300 text-sm mt-2 text-center">
                Sélectionnez une cible ou attaquez directement
              </div>
            )}
          </div>
        )}

        {/* Log de combat */}
        {showCombatLog && (
          <div className="fixed top-4 right-4 w-80 bg-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto border border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-bold">Log de Combat</h3>
              <button
                onClick={() => setShowCombatLog(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              {combatLog.slice(-20).map(entry => (
                <div key={entry.id} className="text-sm">
                  <span className="text-gray-500">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  {' '}
                  <span className={`${
                    entry.type === 'damage' ? 'text-red-300' :
                    entry.type === 'summon' ? 'text-green-300' :
                    entry.type === 'draw' ? 'text-blue-300' :
                    'text-gray-300'
                  }`}>
                    {entry.description}
                  </span>
                </div>
              ))}
              {combatLog.length === 0 && (
                <div className="text-gray-400 text-center py-4">
                  Aucune action pour le moment
                </div>
              )}
            </div>
          </div>
        )}

        {/* Indicateur de phase */}
        <div className="fixed bottom-4 right-4 bg-slate-800 rounded-lg p-3 border border-gray-600">
          <div className="text-white text-sm">
            <div className="font-bold">Phase: {
              gameState.current_phase === 'draw' ? 'Pioche' :
              gameState.current_phase === 'main' ? 'Principale' :
              gameState.current_phase === 'combat' ? 'Combat' :
              gameState.current_phase === 'finished' ? 'Terminé' :
              gameState.current_phase
            }</div>
            {isMyTurn && gameState.current_phase === 'main' && (
              <div className="text-gray-300">Actions: {currentPlayer.actions_remaining}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameBoard;