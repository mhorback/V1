import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sword, Shield, Heart, Zap, Coins, User, Trophy, Star, Package, Users, Settings, LogOut } from 'lucide-react';
import DeckBuilder from './components/DeckBuilder';
import OnlineCombat from './components/OnlineCombat';

// Interface pour les combattants
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

// Interface pour les cartes utilisateur
interface UserCard {
  id: number;
  user_id: string;
  card_id: number;
  quantity: number;
  created_at: string;
}

// Interface pour les decks utilisateur
interface UserDeck {
  id: number;
  user_id: string;
  name: string;
  cards: any[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Interface pour le profil utilisateur
interface UserProfile {
  id: string;
  username: string;
  currency: number;
  level: number;
  experience: number;
  wins: number;
  losses: number;
  created_at: string;
  updated_at: string;
}

function AppContent() {
  const { user, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<'menu' | 'deckbuilder' | 'combat'>('menu');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [userDecks, setUserDecks] = useState<UserDeck[]>([]);
  const [fightersDatabase, setFightersDatabase] = useState<Fighter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger les données utilisateur
  useEffect(() => {
    if (user) {
      loadUserData();
      loadFightersDatabase();
    }
  }, [user]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      
      // Charger le profil
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();

      if (profileError) throw profileError;
      setUserProfile(profile);

      // Charger les cartes
      const { data: cards, error: cardsError } = await supabase
        .from('user_cards')
        .select('*')
        .eq('user_id', user!.id);

      if (cardsError) throw cardsError;
      setUserCards(cards || []);

      // Charger les decks
      const { data: decks, error: decksError } = await supabase
        .from('user_decks')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (decksError) throw decksError;
      setUserDecks(decks || []);

    } catch (err: any) {
      console.error('Erreur chargement données utilisateur:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFightersDatabase = async () => {
    try {
      // Base de données des combattants (simulée pour l'instant)
      const fighters: Fighter[] = [
        // Légendaires
        { id: 1, name: "Kaela la Destructrice", rarity: "Légendaire", force: 95, pv: 120, endurance: 85, vitesse: 75, valeur: 150000 },
        { id: 2, name: "Zephyr l'Éternel", rarity: "Légendaire", force: 90, pv: 110, endurance: 90, vitesse: 85, valeur: 145000 },
        { id: 3, name: "Titan de Fer", rarity: "Légendaire", force: 100, pv: 140, endurance: 95, vitesse: 60, valeur: 160000 },
        
        // Épiques
        { id: 4, name: "Garde Royal", rarity: "Épique", force: 75, pv: 95, endurance: 80, vitesse: 65, valeur: 85000 },
        { id: 5, name: "Mage de Bataille", rarity: "Épique", force: 85, pv: 75, endurance: 60, vitesse: 80, valeur: 90000 },
        { id: 6, name: "Assassin des Ombres", rarity: "Épique", force: 80, pv: 70, endurance: 55, vitesse: 95, valeur: 88000 },
        { id: 7, name: "Paladin Sacré", rarity: "Épique", force: 70, pv: 100, endurance: 85, vitesse: 55, valeur: 82000 },
        { id: 8, name: "Archer Élite", rarity: "Épique", force: 78, pv: 65, endurance: 50, vitesse: 90, valeur: 75000 },
        
        // Rares
        { id: 9, name: "Chevalier Vaillant", rarity: "Rare", force: 65, pv: 80, endurance: 70, vitesse: 50, valeur: 45000 },
        { id: 10, name: "Sorcier Élémentaire", rarity: "Rare", force: 70, pv: 60, endurance: 45, vitesse: 75, valeur: 48000 },
        { id: 11, name: "Berserker Sauvage", rarity: "Rare", force: 75, pv: 70, endurance: 40, vitesse: 80, valeur: 50000 },
        { id: 12, name: "Prêtre Guérisseur", rarity: "Rare", force: 45, pv: 85, endurance: 75, vitesse: 45, valeur: 42000 },
        { id: 13, name: "Voleur Agile", rarity: "Rare", force: 60, pv: 55, endurance: 35, vitesse: 85, valeur: 38000 },
        { id: 14, name: "Gardien de la Nature", rarity: "Rare", force: 55, pv: 75, endurance: 65, vitesse: 60, valeur: 44000 },
        
        // Communes
        { id: 15, name: "Soldat Recruté", rarity: "Commune", force: 45, pv: 60, endurance: 50, vitesse: 40, valeur: 15000 },
        { id: 16, name: "Apprenti Mage", rarity: "Commune", force: 50, pv: 45, endurance: 30, vitesse: 55, valeur: 18000 },
        { id: 17, name: "Éclaireur", rarity: "Commune", force: 40, pv: 50, endurance: 25, vitesse: 70, valeur: 16000 },
        { id: 18, name: "Milicien", rarity: "Commune", force: 35, pv: 55, endurance: 45, vitesse: 35, valeur: 12000 },
        { id: 19, name: "Archer Novice", rarity: "Commune", force: 42, pv: 40, endurance: 20, vitesse: 60, valeur: 14000 },
        { id: 20, name: "Guérisseur Apprenti", rarity: "Commune", force: 25, pv: 65, endurance: 55, vitesse: 30, valeur: 13000 },
        { id: 21, name: "Guerrier Tribal", rarity: "Commune", force: 48, pv: 58, endurance: 40, vitesse: 45, valeur: 17000 },
        { id: 22, name: "Sentinelle", rarity: "Commune", force: 38, pv: 70, endurance: 60, vitesse: 25, valeur: 15500 },
        { id: 23, name: "Chasseur", rarity: "Commune", force: 44, pv: 48, endurance: 30, vitesse: 65, valeur: 16500 },
        { id: 24, name: "Forgeron de Guerre", rarity: "Commune", force: 52, pv: 62, endurance: 55, vitesse: 30, valeur: 19000 }
      ];

      setFightersDatabase(fighters);

      // Donner quelques cartes de départ si l'utilisateur n'en a pas
      if (userCards.length === 0) {
        await giveStarterCards(fighters);
      }

    } catch (err: any) {
      console.error('Erreur chargement base de données combattants:', err);
      setError(err.message);
    }
  };

  const giveStarterCards = async (fighters: Fighter[]) => {
    try {
      // Donner 20 cartes de départ (mix de communes et rares)
      const starterCards = [
        // 10 cartes communes
        ...Array(3).fill(null).map(() => ({ card_id: 15, quantity: 2 })), // Soldat Recruté
        ...Array(2).fill(null).map(() => ({ card_id: 16, quantity: 2 })), // Apprenti Mage
        ...Array(2).fill(null).map(() => ({ card_id: 17, quantity: 2 })), // Éclaireur
        ...Array(2).fill(null).map(() => ({ card_id: 18, quantity: 1 })), // Milicien
        ...Array(1).fill(null).map(() => ({ card_id: 19, quantity: 2 })), // Archer Novice
        
        // 5 cartes rares
        { card_id: 9, quantity: 1 }, // Chevalier Vaillant
        { card_id: 10, quantity: 1 }, // Sorcier Élémentaire
        { card_id: 11, quantity: 1 }, // Berserker Sauvage
        { card_id: 12, quantity: 1 }, // Prêtre Guérisseur
        { card_id: 13, quantity: 1 }, // Voleur Agile
        
        // 1 carte épique
        { card_id: 4, quantity: 1 }, // Garde Royal
      ];

      const cardsToInsert = starterCards.map(card => ({
        user_id: user!.id,
        card_id: card.card_id,
        quantity: card.quantity
      }));

      const { error } = await supabase
        .from('user_cards')
        .insert(cardsToInsert);

      if (error) throw error;

      // Recharger les cartes
      await loadUserData();

    } catch (err: any) {
      console.error('Erreur attribution cartes de départ:', err);
    }
  };

  const handleDeckSaved = () => {
    loadUserData(); // Recharger les decks
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err: any) {
      console.error('Erreur déconnexion:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Erreur</h2>
          <p className="text-red-300 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl">Chargement du profil...</div>
      </div>
    );
  }

  // Vue du constructeur de deck
  if (currentView === 'deckbuilder') {
    return (
      <DeckBuilder
        user={userProfile}
        userCards={userCards}
        userDecks={userDecks}
        fightersDatabase={fightersDatabase}
        onBack={() => setCurrentView('menu')}
        onDeckSaved={handleDeckSaved}
      />
    );
  }

  // Vue du combat en ligne
  if (currentView === 'combat') {
    return (
      <OnlineCombat
        user={userProfile}
        userDecks={userDecks}
        fightersDatabase={fightersDatabase}
        onBack={() => setCurrentView('menu')}
      />
    );
  }

  // Menu principal
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
              <Sword className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Le Glas de Valrax</h1>
              <p className="text-purple-300">Jeu de cartes tactique</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="bg-slate-800 rounded-lg p-4 text-center">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-blue-400" />
                <span className="text-white font-bold">{userProfile.username}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-300">Niv. {userProfile.level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-300">{userProfile.currency.toLocaleString()} PO</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleSignOut}
              className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-lg transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Statistiques du joueur */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 text-center">
            <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{userProfile.wins}</div>
            <div className="text-gray-400">Victoires</div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-6 text-center">
            <Shield className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{userProfile.losses}</div>
            <div className="text-gray-400">Défaites</div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-6 text-center">
            <Package className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{userCards.length}</div>
            <div className="text-gray-400">Cartes</div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-6 text-center">
            <Settings className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{userDecks.length}</div>
            <div className="text-gray-400">Decks</div>
          </div>
        </div>

        {/* Menu principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Constructeur de deck */}
          <div 
            onClick={() => setCurrentView('deckbuilder')}
            className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer hover:scale-105"
          >
            <div className="text-center">
              <Package className="w-16 h-16 text-blue-200 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-white mb-4">Constructeur de Deck</h3>
              <p className="text-blue-100 text-sm mb-6">Créez et gérez vos decks de combat avec vos cartes collectées</p>
              
              <div className="bg-blue-700/50 rounded-lg p-4 mb-6">
                <div className="text-white font-bold mb-2">Votre collection:</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-blue-200">{userCards.reduce((sum, card) => sum + card.quantity, 0)}</div>
                    <div className="text-blue-300">Cartes totales</div>
                  </div>
                  <div>
                    <div className="text-blue-200">{userDecks.length}</div>
                    <div className="text-blue-300">Decks créés</div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-colors">
                🃏 Gérer mes decks
              </div>
            </div>
          </div>

          {/* Combat en ligne */}
          <div 
            onClick={() => setCurrentView('combat')}
            className="bg-gradient-to-br from-red-600 to-red-800 p-8 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer hover:scale-105"
          >
            <div className="text-center">
              <Users className="w-16 h-16 text-red-200 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-white mb-4">Combat en Ligne</h3>
              <p className="text-red-100 text-sm mb-6">Affrontez d'autres joueurs dans des duels tactiques en temps réel</p>
              
              <div className="bg-red-700/50 rounded-lg p-4 mb-6">
                <div className="text-white font-bold mb-2">Vos statistiques:</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-red-200">{userProfile.wins}</div>
                    <div className="text-red-300">Victoires</div>
                  </div>
                  <div>
                    <div className="text-red-200">{userProfile.level}</div>
                    <div className="text-red-300">Niveau</div>
                  </div>
                </div>
              </div>

              <div className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-colors">
                ⚔️ Combattre
              </div>
            </div>
          </div>
        </div>

        {/* Collection récente */}
        {userCards.length > 0 && (
          <div className="mt-8 bg-slate-800 rounded-lg p-6">
            <h3 className="text-xl font-bold text-white mb-4">🎴 Aperçu de votre collection</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {userCards.slice(0, 6).map(userCard => {
                const fighter = fightersDatabase.find(f => f.id === userCard.card_id);
                if (!fighter) return null;

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
                  <div key={userCard.id} className="relative">
                    <div className={`w-full h-32 bg-gradient-to-br ${getRarityColor(fighter.rarity)} p-1 rounded-lg shadow-lg`}>
                      <div className="bg-gray-900 h-full rounded-md border-2 border-gray-700 overflow-hidden">
                        <div className="bg-gradient-to-r from-black to-gray-800 px-2 py-1">
                          <h4 className="text-xs font-bold text-white truncate">{fighter.name}</h4>
                        </div>
                        
                        <div className="p-2 space-y-1">
                          <div className="grid grid-cols-2 gap-1">
                            <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                              <Sword className="w-2 h-2 text-red-400" />
                              <span className="text-xs font-bold text-white">{fighter.force}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-0.5">
                              <Heart className="w-2 h-2 text-red-400" />
                              <span className="text-xs font-bold text-white">{fighter.pv}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="absolute top-1 right-1 bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                      {userCard.quantity}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {userCards.length > 6 && (
              <div className="text-center mt-4">
                <button
                  onClick={() => setCurrentView('deckbuilder')}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  Voir toute la collection ({userCards.length} types de cartes)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;