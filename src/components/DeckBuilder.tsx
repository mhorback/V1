import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Sword, Shield, Heart, Zap, Coins, Save, Plus, Minus, Trash2, Edit3, Copy, Check, AlertCircle, Info } from 'lucide-react';

interface Fighter {
  id: number;
  name: string;
  rarity: string;
  force: number;
  pv: number;
  endurance: number;
  vitesse: number;
  valeur: number;
  image?: string | null;
}

interface DeckCard {
  card_id: number;
  quantity: number;
  fighter: Fighter;
}

interface Deck {
  id?: number;
  name: string;
  cards: any[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface DeckBuilderProps {
  user: any;
  userCards: any[];
  userDecks: Deck[];
  fightersDatabase: Fighter[];
  onBack: () => void;
  onDeckSaved: () => void;
}

const DeckBuilder: React.FC<DeckBuilderProps> = ({ 
  user, 
  userCards, 
  userDecks, 
  fightersDatabase, 
  onBack, 
  onDeckSaved 
}) => {
  const [currentDeck, setCurrentDeck] = useState<Deck>({
    name: '',
    cards: [],
    is_active: false
  });
  
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingDeckId, setEditingDeckId] = useState<number | null>(null);

  // Règles de construction de deck
  const DECK_RULES = {
    maxValue: 1500000, // 1.5M PO maximum
    minCards: 15,
    maxCards: 30,
    maxCopiesPerCard: 3
  };

  // Calculer les statistiques du deck
  const deckStats = {
    totalCards: deckCards.reduce((sum, card) => sum + card.quantity, 0),
    totalValue: deckCards.reduce((sum, card) => sum + (card.fighter.valeur * card.quantity), 0),
    averageForce: deckCards.length > 0 
      ? deckCards.reduce((sum, card) => sum + (card.fighter.force * card.quantity), 0) / deckCards.reduce((sum, card) => sum + card.quantity, 0)
      : 0,
    averagePV: deckCards.length > 0
      ? deckCards.reduce((sum, card) => sum + (card.fighter.pv * card.quantity), 0) / deckCards.reduce((sum, card) => sum + card.quantity, 0)
      : 0,
    rarityDistribution: deckCards.reduce((acc, card) => {
      acc[card.fighter.rarity] = (acc[card.fighter.rarity] || 0) + card.quantity;
      return acc;
    }, {} as Record<string, number>)
  };

  // Vérifier si le deck est valide
  const isDeckValid = () => {
    return (
      currentDeck.name.trim().length > 0 &&
      deckStats.totalCards >= DECK_RULES.minCards &&
      deckStats.totalCards <= DECK_RULES.maxCards &&
      deckStats.totalValue <= DECK_RULES.maxValue
    );
  };

  // Obtenir les cartes filtrées de la collection
  const getFilteredCollection = () => {
    let filtered = fightersDatabase.filter(fighter => {
      const userCard = userCards.find(uc => uc.card_id === fighter.id);
      return userCard && userCard.quantity > 0;
    });

    if (rarityFilter !== 'all') {
      filtered = filtered.filter(f => f.rarity === rarityFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    filtered.sort((a, b) => {
      switch(sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'rarity': {
          const rarityOrder = { "Légendaire": 4, "Épique": 3, "Rare": 2, "Commune": 1 };
          return rarityOrder[b.rarity as keyof typeof rarityOrder] - rarityOrder[a.rarity as keyof typeof rarityOrder];
        }
        case 'value': return b.valeur - a.valeur;
        case 'force': return b.force - a.force;
        default: return 0;
      }
    });

    return filtered;
  };

  // Ajouter une carte au deck
  const addCardToDeck = (fighter: Fighter) => {
    const userCard = userCards.find(uc => uc.card_id === fighter.id);
    if (!userCard) return;

    const existingCard = deckCards.find(dc => dc.card_id === fighter.id);
    const currentQuantity = existingCard ? existingCard.quantity : 0;
    
    // Vérifications
    if (currentQuantity >= DECK_RULES.maxCopiesPerCard) {
      setError(`Maximum ${DECK_RULES.maxCopiesPerCard} copies par carte`);
      return;
    }
    
    if (currentQuantity >= userCard.quantity) {
      setError(`Vous ne possédez que ${userCard.quantity} exemplaire(s) de cette carte`);
      return;
    }

    if (deckStats.totalCards >= DECK_RULES.maxCards) {
      setError(`Maximum ${DECK_RULES.maxCards} cartes par deck`);
      return;
    }

    const newValue = deckStats.totalValue + fighter.valeur;
    if (newValue > DECK_RULES.maxValue) {
      setError(`Valeur maximale dépassée (${(newValue / 1000).toFixed(0)}k / ${(DECK_RULES.maxValue / 1000).toFixed(0)}k PO)`);
      return;
    }

    setError(null);

    if (existingCard) {
      setDeckCards(prev => prev.map(card => 
        card.card_id === fighter.id 
          ? { ...card, quantity: card.quantity + 1 }
          : card
      ));
    } else {
      setDeckCards(prev => [...prev, {
        card_id: fighter.id,
        quantity: 1,
        fighter
      }]);
    }
  };

  // Retirer une carte du deck
  const removeCardFromDeck = (fighterId: number, removeAll = false) => {
    const existingCard = deckCards.find(dc => dc.card_id === fighterId);
    if (!existingCard) return;

    if (removeAll || existingCard.quantity === 1) {
      setDeckCards(prev => prev.filter(card => card.card_id !== fighterId));
    } else {
      setDeckCards(prev => prev.map(card => 
        card.card_id === fighterId 
          ? { ...card, quantity: card.quantity - 1 }
          : card
      ));
    }
  };

  // Sauvegarder le deck
  const saveDeck = async () => {
    if (!isDeckValid()) {
      setError('Le deck ne respecte pas toutes les règles de construction');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deckData = {
        user_id: user.id,
        name: currentDeck.name.trim(),
        cards: deckCards.map(card => ({
          card_id: card.card_id,
          quantity: card.quantity
        })),
        is_active: currentDeck.is_active
      };

      if (editingDeckId) {
        // Mise à jour
        const { error: updateError } = await supabase
          .from('user_decks')
          .update(deckData)
          .eq('id', editingDeckId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
        setSuccess('Deck mis à jour avec succès !');
      } else {
        // Création
        const { error: insertError } = await supabase
          .from('user_decks')
          .insert(deckData);

        if (insertError) throw insertError;
        setSuccess('Deck créé avec succès !');
      }

      onDeckSaved();
      setTimeout(() => {
        setSuccess(null);
      }, 3000);

    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  // Charger un deck existant
  const loadDeck = (deck: Deck) => {
    setCurrentDeck(deck);
    setEditingDeckId(deck.id || null);
    
    const loadedCards: DeckCard[] = deck.cards.map(cardData => {
      const fighter = fightersDatabase.find(f => f.id === cardData.card_id);
      return {
        card_id: cardData.card_id,
        quantity: cardData.quantity,
        fighter: fighter!
      };
    }).filter(card => card.fighter); // Filtrer les cartes non trouvées

    setDeckCards(loadedCards);
  };

  // Nouveau deck
  const newDeck = () => {
    setCurrentDeck({
      name: '',
      cards: [],
      is_active: false
    });
    setDeckCards([]);
    setEditingDeckId(null);
    setError(null);
    setSuccess(null);
  };

  // Dupliquer un deck
  const duplicateDeck = (deck: Deck) => {
    setCurrentDeck({
      name: `${deck.name} (Copie)`,
      cards: [...deck.cards],
      is_active: false
    });
    setEditingDeckId(null);
    
    const duplicatedCards: DeckCard[] = deck.cards.map(cardData => {
      const fighter = fightersDatabase.find(f => f.id === cardData.card_id);
      return {
        card_id: cardData.card_id,
        quantity: cardData.quantity,
        fighter: fighter!
      };
    }).filter(card => card.fighter);

    setDeckCards(duplicatedCards);
  };

  // Supprimer un deck
  const deleteDeck = async (deckId: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce deck ?')) return;

    try {
      const { error } = await supabase
        .from('user_decks')
        .delete()
        .eq('id', deckId)
        .eq('user_id', user.id);

      if (error) throw error;

      onDeckSaved();
      if (editingDeckId === deckId) {
        newDeck();
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression');
    }
  };

  // Composant carte de combattant
  const FighterCard = ({ fighter, inDeck = false, quantity = 0, onClick }: any) => {
    const userCard = userCards.find(uc => uc.card_id === fighter.id);
    const ownedQuantity = userCard ? userCard.quantity : 0;
    const canAdd = !inDeck && ownedQuantity > quantity && deckStats.totalCards < DECK_RULES.maxCards;
    const canRemove = inDeck && quantity > 0;

    const getRarityColor = (rarity: string) => {
      switch(rarity) {
        case "Légendaire": return "from-yellow-400 to-orange-500";
        case "Épique": return "from-purple-400 to-blue-500";
        case "Rare": return "from-blue-400 to-cyan-500";
        case "Commune": return "from-gray-400 to-gray-600";
        default: return "from-gray-400 to-gray-600";
      }
    };

    return (
      <div className="relative">
        <div 
          className={`relative w-32 h-44 bg-gradient-to-br ${getRarityColor(fighter.rarity)} p-1 rounded-lg shadow-lg transition-all duration-200 ${
            canAdd ? 'hover:scale-105 cursor-pointer' : ''
          } ${!canAdd && !inDeck ? 'opacity-50' : ''}`}
          onClick={() => canAdd && onClick && onClick(fighter)}
        >
          <div className="bg-gray-900 h-full rounded-md border-2 border-gray-700 overflow-hidden">
            <div className="bg-gradient-to-r from-black to-gray-800 px-2 py-1">
              <h3 className="text-xs font-bold text-white truncate">{fighter.name}</h3>
              <div className="text-xs">
                {fighter.rarity === "Légendaire" && <span className="text-yellow-400">⭐</span>}
                {fighter.rarity === "Épique" && <span className="text-purple-400">💎</span>}
                {fighter.rarity === "Rare" && <span className="text-blue-400">💠</span>}
                {fighter.rarity === "Commune" && <span className="text-gray-400">⚪</span>}
              </div>
            </div>
            
            <div className="h-12 bg-gradient-to-b from-gray-700 to-gray-800 flex items-center justify-center">
              <div className="text-2xl">⚔️</div>
            </div>
            
            <div className="p-2 space-y-1">
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Sword className="w-3 h-3 text-red-400" />
                  <span className="text-xs font-bold text-white">{fighter.force}</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Heart className="w-3 h-3 text-red-400" />
                  <span className="text-xs font-bold text-white">{fighter.pv}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Shield className="w-3 h-3 text-blue-400" />
                  <span className="text-xs font-bold text-white">{fighter.endurance}</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs font-bold text-white">{fighter.vitesse}</span>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 py-0.5">
              <div className="text-center text-xs text-yellow-300 font-bold">
                <Coins className="w-3 h-3 inline mr-0.5" />
                {(fighter.valeur / 1000).toFixed(0)}k
              </div>
            </div>

            {/* Quantité possédée */}
            {!inDeck && (
              <div className="absolute top-1 right-1 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {ownedQuantity}
              </div>
            )}

            {/* Quantité dans le deck */}
            {inDeck && quantity > 0 && (
              <div className="absolute top-1 right-1 bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {quantity}
              </div>
            )}
          </div>
        </div>

        {/* Contrôles pour les cartes dans le deck */}
        {inDeck && (
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1">
            <button
              onClick={() => removeCardFromDeck(fighter.id)}
              className="bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={() => addCardToDeck(fighter)}
              disabled={!canAdd}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => removeCardFromDeck(fighter.id, true)}
              className="bg-red-800 hover:bg-red-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-4xl font-bold text-white">🃏 Constructeur de Deck</h1>
            <button
              onClick={onBack}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
            >
              ← Retour
            </button>
          </div>

          {/* Informations et alertes */}
          {error && (
            <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
            </div>
          )}

          {success && (
            <div className="bg-green-900 border border-green-600 text-green-200 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <Check className="w-5 h-5" />
              {success}
            </div>
          )}

          {/* Règles de construction */}
          <div className="bg-blue-900/50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-5 h-5 text-blue-400" />
              <h3 className="text-white font-bold">Règles de Construction</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-blue-400 font-bold">{DECK_RULES.minCards}-{DECK_RULES.maxCards}</div>
                <div className="text-gray-300">Cartes</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-400 font-bold">{(DECK_RULES.maxValue / 1000).toFixed(0)}k PO</div>
                <div className="text-gray-300">Valeur max</div>
              </div>
              <div className="text-center">
                <div className="text-green-400 font-bold">{DECK_RULES.maxCopiesPerCard}</div>
                <div className="text-gray-300">Copies max</div>
              </div>
              <div className="text-center">
                <div className="text-purple-400 font-bold">Combattants</div>
                <div className="text-gray-300">Type actuel</div>
              </div>
            </div>
          </div>

          {/* Contrôles du deck */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-white text-sm mb-1 block">Nom du deck :</label>
              <input
                type="text"
                placeholder="Entrez le nom du deck..."
                value={currentDeck.name}
                onChange={(e) => setCurrentDeck(prev => ({ ...prev, name: e.target.value }))}
                className="bg-slate-700 text-white px-4 py-2 rounded-lg w-full text-lg font-bold"
              />
            </div>
            
            <div className="flex items-end">
              <div className={`text-white text-center py-2 px-4 rounded-lg w-full ${
                deckStats.totalCards < DECK_RULES.minCards ? 'bg-red-900' : 
                deckStats.totalCards > DECK_RULES.maxCards ? 'bg-red-900' :
                'bg-green-900'
              }`}>
                <div className="text-sm">Cartes</div>
                <div className="text-xl font-bold">{deckStats.totalCards}/{DECK_RULES.maxCards}</div>
                <div className="text-xs">(min. {DECK_RULES.minCards})</div>
              </div>
            </div>
            
            <div className="flex items-end gap-2">
              <button
                onClick={saveDeck}
                disabled={!isDeckValid() || loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex-1 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Sauvegarde...' : editingDeckId ? 'Mettre à jour' : 'Sauvegarder'}
              </button>
              
              <button
                onClick={newDeck}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg font-bold transition-colors"
                title="Nouveau deck"
              >
                🆕
              </button>
            </div>
          </div>

          {/* Statistiques du deck */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div className={`text-center p-3 rounded-lg ${
              deckStats.totalValue > DECK_RULES.maxValue ? 'bg-red-900' : 'bg-slate-700'
            }`}>
              <div className="text-2xl font-bold text-yellow-400">
                {(deckStats.totalValue / 1000).toFixed(0)}k
              </div>
              <div className="text-xs text-gray-300">
                Valeur ({((deckStats.totalValue / DECK_RULES.maxValue) * 100).toFixed(1)}%)
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-700">
              <div className="text-2xl font-bold text-red-400">{deckStats.averageForce.toFixed(1)}</div>
              <div className="text-xs text-gray-300">Force moy.</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-700">
              <div className="text-2xl font-bold text-green-400">{deckStats.averagePV.toFixed(1)}</div>
              <div className="text-xs text-gray-300">PV moy.</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-700">
              <div className="text-2xl font-bold text-purple-400">
                {deckStats.rarityDistribution['Légendaire'] || 0}
              </div>
              <div className="text-xs text-gray-300">Légendaires</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-700">
              <div className="text-2xl font-bold text-blue-400">
                {deckStats.rarityDistribution['Épique'] || 0}
              </div>
              <div className="text-xs text-gray-300">Épiques</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Deck actuel */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingDeckId ? "📝 Édition" : "🆕 Nouveau"} Deck 
              <span className={`text-sm ml-2 ${
                deckStats.totalCards < DECK_RULES.minCards ? 'text-red-400' : 
                deckStats.totalCards > DECK_RULES.maxCards ? 'text-red-400' :
                'text-green-400'
              }`}>
                ({deckStats.totalCards}/{DECK_RULES.maxCards})
              </span>
            </h2>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {deckCards.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Ajoutez des cartes depuis votre collection</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {deckCards
                    .sort((a, b) => {
                      const rarityOrder = { "Légendaire": 4, "Épique": 3, "Rare": 2, "Commune": 1 };
                      return rarityOrder[b.fighter.rarity as keyof typeof rarityOrder] - rarityOrder[a.fighter.rarity as keyof typeof rarityOrder];
                    })
                    .map(card => (
                      <FighterCard 
                        key={card.card_id}
                        fighter={card.fighter}
                        inDeck={true}
                        quantity={card.quantity}
                        onClick={addCardToDeck}
                      />
                    ))
                  }
                </div>
              )}
            </div>
          </div>

          {/* Collection */}
          <div className="lg:col-span-2 bg-slate-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">📚 Ma Collection</h2>
            
            {/* Filtres */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <input
                type="text"
                placeholder="🔍 Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-700 text-white px-4 py-2 rounded-lg"
              />
              
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                className="bg-slate-700 text-white px-4 py-2 rounded-lg"
              >
                <option value="all">Toutes les raretés</option>
                <option value="Commune">Commune</option>
                <option value="Rare">Rare</option>
                <option value="Épique">Épique</option>
                <option value="Légendaire">Légendaire</option>
              </select>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-700 text-white px-4 py-2 rounded-lg"
              >
                <option value="name">Trier par nom</option>
                <option value="rarity">Trier par rareté</option>
                <option value="value">Trier par valeur</option>
                <option value="force">Trier par force</option>
              </select>
            </div>
            
            {/* Grille de cartes */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
              {getFilteredCollection().map(fighter => (
                <FighterCard 
                  key={fighter.id}
                  fighter={fighter}
                  onClick={addCardToDeck}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Decks sauvegardés */}
        {userDecks.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 mt-6">
            <h2 className="text-2xl font-bold text-white mb-4">📚 Mes Decks</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {userDecks.map(deck => {
                const deckValue = deck.cards.reduce((sum: number, card: any) => {
                  const fighter = fightersDatabase.find(f => f.id === card.card_id);
                  return sum + (fighter ? fighter.valeur * card.quantity : 0);
                }, 0);
                
                const totalCards = deck.cards.reduce((sum: number, card: any) => sum + card.quantity, 0);
                
                return (
                  <div key={deck.id} className={`bg-slate-700 rounded-lg p-4 ${editingDeckId === deck.id ? 'ring-2 ring-green-500' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-bold text-lg flex-1 truncate">{deck.name}</h3>
                      {deck.is_active && (
                        <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">Actif</span>
                      )}
                    </div>
                    
                    <div className="text-sm space-y-1 mb-3">
                      <div className="text-gray-300">{totalCards} cartes</div>
                      <div className="text-yellow-400">{(deckValue / 1000).toFixed(0)}k PO</div>
                      <div className={`text-xs ${
                        totalCards >= DECK_RULES.minCards && totalCards <= DECK_RULES.maxCards && deckValue <= DECK_RULES.maxValue
                          ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {totalCards >= DECK_RULES.minCards && totalCards <= DECK_RULES.maxCards && deckValue <= DECK_RULES.maxValue
                          ? '✅ Valide' : '❌ Invalide'}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadDeck(deck)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex-1 flex items-center justify-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        Éditer
                      </button>
                      <button
                        onClick={() => duplicateDeck(deck)}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm flex items-center justify-center"
                        title="Dupliquer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteDeck(deck.id!)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm flex items-center justify-center"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeckBuilder;