import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Sword, Shield, Heart, Zap, Coins, Target, Users, Shuffle, Play, ArrowRight, Home, Save, Search, Filter, Package, Star, Trophy, User, LogOut, Wifi, ChevronLeft, ChevronRight, X } from 'lucide-react';
import OnlineCombat from './components/OnlineCombat';
import DeckBuilder from './components/DeckBuilder';

// Base de données complète des 100 combattants
const FIGHTERS_DATABASE = [
  { id: 1, name: "Biographies", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 45000, image: null },
  { id: 2, name: "Kaela", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 32000, image: "kaela" },
  { id: 3, name: "Riven", rarity: "Légendaire", force: 5, pv: 8, endurance: 3, vitesse: 4, valeur: 117000, image: null },
  { id: 4, name: "Yuna", rarity: "Épique", force: 4, pv: 6, endurance: 3, vitesse: 4, valeur: 72000, image: null },
  { id: 5, name: "Nova", rarity: "Légendaire", force: 4, pv: 7, endurance: 4, vitesse: 5, valeur: 118000, image: null },
  { id: 6, name: "Tarin", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 3, valeur: 34000, image: null },
  { id: 7, name: "Einar", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 19000, image: null },
  { id: 8, name: "Zuri", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 2, valeur: 22000, image: null },
  { id: 9, name: "Soren", rarity: "Légendaire", force: 4, pv: 8, endurance: 4, vitesse: 5, valeur: 118000, image: null },
  { id: 10, name: "Kellan", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 2, valeur: 50000, image: null },
  { id: 11, name: "Selma", rarity: "Épique", force: 3, pv: 6, endurance: 3, vitesse: 4, valeur: 72000, image: null },
  { id: 12, name: "Cor", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 16000, image: null },
  { id: 13, name: "Elin", rarity: "Légendaire", force: 4, pv: 7, endurance: 3, vitesse: 4, valeur: 100000, image: null },
  { id: 14, name: "Nera", rarity: "Légendaire", force: 4, pv: 8, endurance: 4, vitesse: 5, valeur: 101000, image: null },
  { id: 15, name: "Mir", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 14000, image: null },
  { id: 16, name: "Raya", rarity: "Épique", force: 3, pv: 6, endurance: 2, vitesse: 3, valeur: 68000, image: null },
  { id: 17, name: "Dune", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 23000, image: null },
  { id: 18, name: "Ena", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 58000, image: null },
  { id: 19, name: "Syr", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 40000, image: null },
  { id: 20, name: "Rei", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 3, valeur: 59000, image: null },
  { id: 21, name: "Jalen", rarity: "Légendaire", force: 4, pv: 7, endurance: 4, vitesse: 5, valeur: 114000, image: null },
  { id: 22, name: "Sorrel", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 29000, image: null },
  { id: 23, name: "Tahl", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 2, valeur: 28000, image: null },
  { id: 24, name: "Lior", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 2, valeur: 14000, image: null },
  { id: 25, name: "Eris", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 11000, image: null },
  { id: 26, name: "Hira", rarity: "Épique", force: 4, pv: 7, endurance: 3, vitesse: 3, valeur: 80000, image: null },
  { id: 27, name: "Nyra", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 2, valeur: 15000, image: null },
  { id: 28, name: "Sil", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 48000, image: null },
  { id: 29, name: "Rokar", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 2, valeur: 22000, image: null },
  { id: 30, name: "Rayn", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 25000, image: null },
  { id: 31, name: "Niva", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 10000, image: null },
  { id: 32, name: "Tyre", rarity: "Épique", force: 3, pv: 6, endurance: 3, vitesse: 3, valeur: 83000, image: null },
  { id: 33, name: "Tova", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 1, valeur: 14000, image: null },
  { id: 34, name: "Kal", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 10000, image: null },
  { id: 35, name: "Nim", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 1, valeur: 18000, image: null },
  { id: 36, name: "Maeve", rarity: "Épique", force: 3, pv: 7, endurance: 3, vitesse: 3, valeur: 76000, image: null },
  { id: 37, name: "Oryn", rarity: "Rare", force: 2, pv: 5, endurance: 2, vitesse: 3, valeur: 36000, image: null },
  { id: 38, name: "Aras", rarity: "Épique", force: 4, pv: 6, endurance: 3, vitesse: 3, valeur: 79000, image: null },
  { id: 39, name: "Fenn", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 3, valeur: 32000, image: null },
  { id: 40, name: "Ilya", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 2, valeur: 21000, image: null },
  { id: 41, name: "Dragan", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 26000, image: null },
  { id: 42, name: "Galen", rarity: "Épique", force: 3, pv: 7, endurance: 3, vitesse: 3, valeur: 70000, image: null },
  { id: 43, name: "Dira", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 12000, image: null },
  { id: 44, name: "Loen", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 3, valeur: 33000, image: null },
  { id: 45, name: "Kellen", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 2, valeur: 58000, image: null },
  { id: 46, name: "Dax", rarity: "Épique", force: 3, pv: 7, endurance: 2, vitesse: 4, valeur: 60000, image: null },
  { id: 47, name: "Seth", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 37000, image: null },
  { id: 48, name: "Theo", rarity: "Épique", force: 3, pv: 7, endurance: 2, vitesse: 4, valeur: 64000, image: null },
  { id: 49, name: "Mako", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 2, valeur: 21000, image: null },
  { id: 50, name: "Kel", rarity: "Légendaire", force: 4, pv: 8, endurance: 3, vitesse: 5, valeur: 117000, image: null },
  { id: 51, name: "Suri", rarity: "Rare", force: 2, pv: 5, endurance: 2, vitesse: 2, valeur: 47000, image: null },
  { id: 52, name: "Aven", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 29000, image: null },
  { id: 53, name: "Zev", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 28000, image: null },
  { id: 54, name: "Orin", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 3, valeur: 33000, image: null },
  { id: 55, name: "Varen", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 2, valeur: 10000, image: null },
  { id: 56, name: "Anya", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 17000, image: null },
  { id: 57, name: "Tey", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 2, valeur: 38000, image: null },
  { id: 58, name: "Sor", rarity: "Rare", force: 2, pv: 5, endurance: 2, vitesse: 3, valeur: 50000, image: null },
  { id: 59, name: "Risa", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 1, valeur: 24000, image: null },
  { id: 60, name: "Tess", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 11000, image: null },
  { id: 61, name: "Narek", rarity: "Légendaire", force: 5, pv: 8, endurance: 3, vitesse: 4, valeur: 94000, image: null },
  { id: 62, name: "Lysa", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 3, valeur: 44000, image: null },
  { id: 63, name: "Del", rarity: "Légendaire", force: 5, pv: 8, endurance: 4, vitesse: 4, valeur: 106000, image: null },
  { id: 64, name: "Tir", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 3, valeur: 46000, image: null },
  { id: 65, name: "Zola", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 2, valeur: 52000, image: null },
  { id: 66, name: "Vina", rarity: "Épique", force: 3, pv: 6, endurance: 3, vitesse: 4, valeur: 64000, image: null },
  { id: 67, name: "Jax", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 1, valeur: 10000, image: null },
  { id: 68, name: "Ril", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 2, valeur: 18000, image: null },
  { id: 69, name: "Syla", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 2, valeur: 46000, image: null },
  { id: 70, name: "Yel", rarity: "Épique", force: 4, pv: 6, endurance: 2, vitesse: 4, valeur: 69000, image: null },
  { id: 71, name: "Jae", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 1, valeur: 12000, image: null },
  { id: 72, name: "Bram", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 16000, image: null },
  { id: 73, name: "Thorne", rarity: "Commune", force: 1, pv: 5, endurance: 1, vitesse: 2, valeur: 14000, image: null },
  { id: 74, name: "Olya", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 1, valeur: 14000, image: null },
  { id: 75, name: "Dren", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 27000, image: null },
  { id: 76, name: "Korben", rarity: "Épique", force: 4, pv: 7, endurance: 3, vitesse: 3, valeur: 88000, image: null },
  { id: 77, name: "Iskra", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 3, valeur: 32000, image: null },
  { id: 78, name: "Zer", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 1, valeur: 25000, image: null },
  { id: 79, name: "Kina", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 2, valeur: 55000, image: null },
  { id: 80, name: "Rok", rarity: "Commune", force: 1, pv: 4, endurance: 1, vitesse: 2, valeur: 10000, image: null },
  { id: 81, name: "Sava", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 2, valeur: 27000, image: null },
  { id: 82, name: "Nox", rarity: "Épique", force: 3, pv: 6, endurance: 2, vitesse: 4, valeur: 68000, image: null },
  { id: 83, name: "Vyn", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 26000, image: null },
  { id: 84, name: "Thaya", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 16000, image: null },
  { id: 85, name: "Tarn", rarity: "Épique", force: 3, pv: 7, endurance: 2, vitesse: 4, valeur: 62000, image: null },
  { id: 86, name: "Leah", rarity: "Légendaire", force: 4, pv: 8, endurance: 3, vitesse: 4, valeur: 95000, image: null },
  { id: 87, name: "Lyra", rarity: "Rare", force: 3, pv: 5, endurance: 2, vitesse: 3, valeur: 40000, image: null },
  { id: 88, name: "Lur", rarity: "Rare", force: 2, pv: 6, endurance: 2, vitesse: 3, valeur: 40000, image: null },
  { id: 89, name: "Varek", rarity: "Rare", force: 2, pv: 5, endurance: 2, vitesse: 2, valeur: 32000, image: null },
  { id: 90, name: "Tahn", rarity: "Rare", force: 3, pv: 6, endurance: 2, vitesse: 2, valeur: 58000, image: null },
  { id: 91, name: "Kara", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 23000, image: null },
  { id: 92, name: "Ezra", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 27000, image: null },
  { id: 93, name: "Zin", rarity: "Rare", force: 2, pv: 5, endurance: 2, vitesse: 3, valeur: 42000, image: null },
  { id: 94, name: "Vey", rarity: "Légendaire", force: 4, pv: 7, endurance: 3, vitesse: 4, valeur: 118000, image: null },
  { id: 95, name: "Nael", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 19000, image: null },
  { id: 96, name: "Mira", rarity: "Légendaire", force: 4, pv: 7, endurance: 4, vitesse: 4, valeur: 111000, image: null },
  { id: 97, name: "Cira", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 1, valeur: 26000, image: null },
  { id: 98, name: "Rek", rarity: "Épique", force: 3, pv: 6, endurance: 2, vitesse: 3, valeur: 80000, image: null },
  { id: 99, name: "Yren", rarity: "Commune", force: 2, pv: 4, endurance: 1, vitesse: 2, valeur: 17000, image: null },
  { id: 100, name: "Lune", rarity: "Commune", force: 2, pv: 5, endurance: 1, vitesse: 2, valeur: 16000, image: null }
];

// Types de packs
const PACK_TYPES = {
  starter: {
    name: "Pack Débutant",
    price: 100,
    cards: 5,
    icon: "📦",
    description: "Pack d'entrée de gamme",
    rarityRates: {
      "Commune": 0.70,
      "Rare": 0.25,
      "Épique": 0.04,
      "Légendaire": 0.01
    }
  },
  premium: {
    name: "Pack Premium",
    price: 250,
    cards: 8,
    icon: "💎",
    description: "Meilleures chances de cartes rares",
    rarityRates: {
      "Commune": 0.50,
      "Rare": 0.35,
      "Épique": 0.12,
      "Légendaire": 0.03
    }
  },
  legendary: {
    name: "Pack Légendaire",
    price: 500,
    cards: 10,
    icon: "⭐",
    description: "Garantit au moins une carte Épique",
    rarityRates: {
      "Commune": 0.30,
      "Rare": 0.40,
      "Épique": 0.25,
      "Légendaire": 0.05
    },
    guaranteedEpic: true
  }
};

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<'auth' | 'dashboard' | 'collection' | 'shop' | 'decks' | 'combat' | 'online'>('auth');
  
  // États pour l'authentification
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // États pour les données utilisateur
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userCards, setUserCards] = useState<any[]>([]);
  const [userDecks, setUserDecks] = useState<any[]>([]);
  const [dailyReward, setDailyReward] = useState<any>(null);

  // États pour la boutique
  const [openingPack, setOpeningPack] = useState<string | null>(null);
  const [packResult, setPackResult] = useState<any[]>([]);
  const [showPackResult, setShowPackResult] = useState(false);

  // États pour la collection
  const [searchTerm, setSearchTerm] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedCard, setSelectedCard] = useState<any>(null);

  // Vérifier la session au chargement
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await loadUserData(session.user.id);
        setCurrentPage('dashboard');
      }
    } catch (error) {
      console.error('Erreur session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async (userId: string) => {
    try {
      // Charger le profil
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile) {
        setUserProfile(profile);
      }

      // Charger les cartes
      const { data: cards } = await supabase
        .from('user_cards')
        .select('*')
        .eq('user_id', userId);

      if (cards) {
        setUserCards(cards);
      }

      // Charger les decks
      const { data: decks } = await supabase
        .from('user_decks')
        .select('*')
        .eq('user_id', userId);

      if (decks) {
        setUserDecks(decks);
      }

      // Vérifier la récompense quotidienne
      await checkDailyReward(userId);

    } catch (error) {
      console.error('Erreur chargement données:', error);
    }
  };

  const checkDailyReward = async (userId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: rewards } = await supabase
        .from('daily_rewards')
        .select('*')
        .eq('user_id', userId)
        .eq('reward_date', today);

      if (!rewards || rewards.length === 0) {
        // Générer une récompense quotidienne
        const dailyReward = {
          currency_earned: 50 + Math.floor(Math.random() * 50),
          cards_earned: []
        };

        // Chance d'avoir une carte bonus
        if (Math.random() < 0.3) {
          const randomCard = FIGHTERS_DATABASE[Math.floor(Math.random() * FIGHTERS_DATABASE.length)];
          dailyReward.cards_earned.push(randomCard.id);
        }

        setDailyReward(dailyReward);
      }
    } catch (error) {
      console.error('Erreur récompense quotidienne:', error);
    }
  };

  const claimDailyReward = async () => {
    if (!dailyReward || !user) return;

    try {
      // Ajouter la monnaie
      await supabase
        .from('profiles')
        .update({ 
          currency: userProfile.currency + dailyReward.currency_earned 
        })
        .eq('id', user.id);

      // Ajouter les cartes
      if (dailyReward.cards_earned.length > 0) {
        for (const cardId of dailyReward.cards_earned) {
          await addCardToCollection(cardId);
        }
      }

      // Enregistrer la récompense
      await supabase
        .from('daily_rewards')
        .insert({
          user_id: user.id,
          currency_earned: dailyReward.currency_earned,
          cards_earned: dailyReward.cards_earned
        });

      // Recharger les données
      await loadUserData(user.id);
      setDailyReward(null);

    } catch (error) {
      console.error('Erreur réclamation récompense:', error);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);

    try {
      if (authMode === 'register') {
        // Inscription
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          // Créer le profil
          await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              username: username || email.split('@')[0],
              currency: 1000, // Monnaie de départ
              level: 1,
              experience: 0
            });

          // Donner quelques cartes de départ
          const starterCards = FIGHTERS_DATABASE
            .filter(card => card.rarity === 'Commune')
            .slice(0, 10);

          for (const card of starterCards) {
            await addCardToCollection(card.id, data.user.id);
          }

          setUser(data.user);
          await loadUserData(data.user.id);
          setCurrentPage('dashboard');
        }
      } else {
        // Connexion
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setUser(data.user);
        await loadUserData(data.user.id);
        setCurrentPage('dashboard');
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setUserCards([]);
    setUserDecks([]);
    setCurrentPage('auth');
  };

  const addCardToCollection = async (cardId: number, userId?: string) => {
    const targetUserId = userId || user.id;
    
    try {
      // Vérifier si l'utilisateur a déjà cette carte
      const { data: existingCard } = await supabase
        .from('user_cards')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('card_id', cardId)
        .single();

      if (existingCard) {
        // Augmenter la quantité
        await supabase
          .from('user_cards')
          .update({ quantity: existingCard.quantity + 1 })
          .eq('id', existingCard.id);
      } else {
        // Ajouter nouvelle carte
        await supabase
          .from('user_cards')
          .insert({
            user_id: targetUserId,
            card_id: cardId,
            quantity: 1
          });
      }
    } catch (error) {
      console.error('Erreur ajout carte:', error);
    }
  };

  const openPack = async (packType: string) => {
    const pack = PACK_TYPES[packType as keyof typeof PACK_TYPES];
    
    if (userProfile.currency < pack.price) {
      alert('Pas assez de pièces d\'or !');
      return;
    }

    setOpeningPack(packType);

    try {
      // Déduire le coût
      await supabase
        .from('profiles')
        .update({ currency: userProfile.currency - pack.price })
        .eq('id', user.id);

      // Générer les cartes
      const cards = [];
      let hasEpic = false;

      for (let i = 0; i < pack.cards; i++) {
        let rarity;
        const rand = Math.random();
        let cumulative = 0;

        for (const [rarityName, rate] of Object.entries(pack.rarityRates)) {
          cumulative += rate;
          if (rand <= cumulative) {
            rarity = rarityName;
            break;
          }
        }

        if (rarity === 'Épique' || rarity === 'Légendaire') {
          hasEpic = true;
        }

        const availableCards = FIGHTERS_DATABASE.filter(card => card.rarity === rarity);
        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        cards.push(randomCard);
      }

      // Garantir une épique si nécessaire
      if (pack.guaranteedEpic && !hasEpic) {
        const epicCards = FIGHTERS_DATABASE.filter(card => card.rarity === 'Épique');
        const randomEpic = epicCards[Math.floor(Math.random() * epicCards.length)];
        cards[cards.length - 1] = randomEpic;
      }

      // Ajouter les cartes à la collection
      for (const card of cards) {
        await addCardToCollection(card.id);
      }

      setPackResult(cards);
      setShowPackResult(true);
      
      // Recharger les données
      await loadUserData(user.id);

    } catch (error) {
      console.error('Erreur ouverture pack:', error);
    } finally {
      setOpeningPack(null);
    }
  };

  const getFilteredCollection = () => {
    let filtered = [...FIGHTERS_DATABASE];
    
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

  const getUserCardQuantity = (cardId: number) => {
    const userCard = userCards.find(uc => uc.card_id === cardId);
    return userCard ? userCard.quantity : 0;
  };

  // Pagination
  const CARDS_PER_PAGE = 10;
  const filteredCollection = getFilteredCollection();
  const totalPages = Math.ceil(filteredCollection.length / CARDS_PER_PAGE);
  const startIndex = currentPageIndex * CARDS_PER_PAGE;
  const currentCards = filteredCollection.slice(startIndex, startIndex + CARDS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPageIndex(0);
  }, [searchTerm, rarityFilter, sortBy]);

  const FighterCard = ({ fighter, quantity = 0, onClick, className = "" }: any) => {
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
      <div 
        className={`relative w-48 h-72 bg-gradient-to-br ${getRarityColor(fighter.rarity)} p-1 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer ${className}`}
        onClick={() => onClick && onClick(fighter)}
      >
        <div className="bg-gray-900 h-full rounded-md border-2 border-gray-700 overflow-hidden">
          {/* Image de la carte */}
          <div className="h-full relative">
            {fighter.image === "kaela" ? (
              <img 
                src="/Kaela.png" 
                alt={fighter.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-b from-gray-700 to-gray-900 flex flex-col">
                {/* Header avec nom et rareté */}
                <div className="bg-gradient-to-r from-black to-gray-800 px-3 py-2">
                  <h3 className="text-sm font-bold text-white truncate">{fighter.name}</h3>
                  <div className="text-xs">
                    {fighter.rarity === "Légendaire" && <span className="text-yellow-400">⭐</span>}
                    {fighter.rarity === "Épique" && <span className="text-purple-400">💎</span>}
                    {fighter.rarity === "Rare" && <span className="text-blue-400">💠</span>}
                    {fighter.rarity === "Commune" && <span className="text-gray-400">⚪</span>}
                  </div>
                </div>
                
                {/* Zone d'image placeholder */}
                <div className="flex-1 bg-gradient-to-b from-gray-700 to-gray-800 flex items-center justify-center">
                  <div className="text-6xl">⚔️</div>
                </div>
                
                {/* Stats */}
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
                      <Sword className="w-3 h-3 text-red-400" />
                      <span className="text-xs font-bold text-white">{fighter.force}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
                      <Heart className="w-3 h-3 text-red-400" />
                      <span className="text-xs font-bold text-white">{fighter.pv}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
                      <Shield className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-bold text-white">{fighter.endurance}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      <span className="text-xs font-bold text-white">{fighter.vitesse}</span>
                    </div>
                  </div>
                </div>
                
                {/* Valeur */}
                <div className="bg-black/80 py-1">
                  <div className="text-center text-xs text-yellow-300 font-bold">
                    <Coins className="w-3 h-3 inline mr-1" />
                    {(fighter.valeur / 1000).toFixed(0)}k
                  </div>
                </div>
              </div>
            )}
          </div>

          {quantity > 0 && (
            <div className="absolute top-2 right-2 bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
              {quantity}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  // Page d'authentification
  if (currentPage === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 bg-opacity-90 rounded-3xl p-8 shadow-2xl max-w-md w-full">
          <h1 className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 mb-8">
            ⚔️ Le Glas de Valrax ⚔️
          </h1>
          
          <div className="flex mb-6">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 px-4 rounded-l-lg font-bold transition-colors ${
                authMode === 'login' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2 px-4 rounded-r-lg font-bold transition-colors ${
                authMode === 'register' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'register' && (
              <input
                type="text"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg"
                required
              />
            )}
            
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg"
              required
            />
            
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg"
              required
            />

            {authError && (
              <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded-lg">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-bold text-lg transition-all"
            >
              {loading ? 'Chargement...' : authMode === 'login' ? 'Se connecter' : 'S\'inscrire'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Combat en ligne
  if (currentPage === 'online') {
    return (
      <OnlineCombat 
        user={userProfile}
        userDecks={userDecks}
        onBack={() => setCurrentPage('dashboard')}
      />
    );
  }

  // Constructeur de deck
  if (currentPage === 'decks') {
    return (
      <DeckBuilder
        user={userProfile}
        userCards={userCards}
        userDecks={userDecks}
        fightersDatabase={FIGHTERS_DATABASE}
        onBack={() => setCurrentPage('dashboard')}
        onDeckSaved={() => loadUserData(user.id)}
      />
    );
  }

  // Dashboard principal
  if (currentPage === 'dashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white">Bienvenue, {userProfile?.username} !</h1>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2 bg-yellow-900 px-3 py-1 rounded-lg">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-200 font-bold">{userProfile?.currency} PO</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-900 px-3 py-1 rounded-lg">
                  <Star className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-200 font-bold">Niveau {userProfile?.level}</span>
                </div>
                <div className="flex items-center gap-2 bg-green-900 px-3 py-1 rounded-lg">
                  <Trophy className="w-4 h-4 text-green-400" />
                  <span className="text-green-200 font-bold">{userProfile?.wins}V - {userProfile?.losses}D</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>

          {/* Récompense quotidienne */}
          {dailyReward && (
            <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-lg p-6 mb-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-4">🎁 Récompense Quotidienne !</h2>
              <div className="flex justify-center items-center gap-4 mb-4">
                <div className="bg-white/20 rounded-lg p-3">
                  <Coins className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                  <p className="text-white font-bold">{dailyReward.currency_earned} PO</p>
                </div>
                {dailyReward.cards_earned.length > 0 && (
                  <div className="bg-white/20 rounded-lg p-3">
                    <Package className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                    <p className="text-white font-bold">{dailyReward.cards_earned.length} carte(s)</p>
                  </div>
                )}
              </div>
              <button
                onClick={claimDailyReward}
                className="bg-white text-green-600 px-6 py-3 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors"
              >
                Réclamer !
              </button>
            </div>
          )}

          {/* Menu principal */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <button
              onClick={() => setCurrentPage('collection')}
              className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10 text-center">
                <div className="text-6xl mb-4">📚</div>
                <h2 className="text-2xl font-bold text-white mb-2">COLLECTION</h2>
                <p className="text-blue-200 text-sm">{userCards.reduce((sum, uc) => sum + uc.quantity, 0)} cartes possédées</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentPage('shop')}
              className="group relative overflow-hidden bg-gradient-to-br from-purple-600 to-purple-800 p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10 text-center">
                <div className="text-6xl mb-4">🛒</div>
                <h2 className="text-2xl font-bold text-white mb-2">BOUTIQUE</h2>
                <p className="text-purple-200 text-sm">Acheter des packs de cartes</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentPage('decks')}
              className="group relative overflow-hidden bg-gradient-to-br from-green-600 to-green-800 p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-green-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10 text-center">
                <div className="text-6xl mb-4">🃏</div>
                <h2 className="text-2xl font-bold text-white mb-2">DECKS</h2>
                <p className="text-green-200 text-sm">{userDecks.length} deck(s) créé(s)</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentPage('online')}
              className="group relative overflow-hidden bg-gradient-to-br from-red-600 to-red-800 p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10 text-center">
                <div className="text-6xl mb-4">⚔️</div>
                <h2 className="text-2xl font-bold text-white mb-2">COMBAT</h2>
                <div className="flex items-center justify-center gap-1 text-red-200 text-sm">
                  <Wifi className="w-4 h-4" />
                  Combat en ligne
                </div>
              </div>
            </button>
          </div>

          {/* Statistiques rapides */}
          <div className="mt-8 bg-slate-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">📊 Statistiques</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{userCards.length}</div>
                <div className="text-gray-400 text-sm">Cartes uniques</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400">{userCards.filter(uc => {
                  const card = FIGHTERS_DATABASE.find(f => f.id === uc.card_id);
                  return card?.rarity === 'Légendaire';
                }).length}</div>
                <div className="text-gray-400 text-sm">Légendaires</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{userDecks.length}</div>
                <div className="text-gray-400 text-sm">Decks créés</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-400">{userProfile?.wins || 0}</div>
                <div className="text-gray-400 text-sm">Victoires</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page Collection
  if (currentPage === 'collection') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-white">📚 Ma Collection</h1>
            <button
              onClick={() => setCurrentPage('dashboard')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
            >
              🏠 Retour
            </button>
          </div>

          {/* Filtres */}
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="🔍 Rechercher une carte..."
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
          </div>

          {/* Informations et pagination */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-white">
              <span className="text-lg font-bold">{filteredCollection.length}</span>
              <span className="text-gray-300 ml-2">cartes trouvées</span>
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                  disabled={currentPageIndex === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </button>
                
                <span className="text-white font-bold">
                  Page {currentPageIndex + 1} sur {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPageIndex(Math.min(totalPages - 1, currentPageIndex + 1))}
                  disabled={currentPageIndex === totalPages - 1}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Grille de cartes - 2 lignes de 5 cartes */}
          <div className="grid grid-cols-5 gap-6 justify-items-center">
            {currentCards.map(fighter => {
              const quantity = getUserCardQuantity(fighter.id);
              return (
                <div key={fighter.id} className={`${quantity === 0 ? 'opacity-50 grayscale' : ''}`}>
                  <FighterCard 
                    fighter={fighter} 
                    quantity={quantity}
                    onClick={() => setSelectedCard(fighter)}
                  />
                </div>
              );
            })}
            
            {/* Cartes vides pour compléter la grille si nécessaire */}
            {Array.from({ length: CARDS_PER_PAGE - currentCards.length }).map((_, index) => (
              <div key={`empty-${index}`} className="w-48 h-72"></div>
            ))}
          </div>

          {/* Modal de carte agrandie */}
          {selectedCard && (
            <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
              <div className="relative">
                <button
                  onClick={() => setSelectedCard(null)}
                  className="absolute -top-4 -right-4 bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold z-10"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="transform scale-125">
                  <FighterCard 
                    fighter={selectedCard} 
                    quantity={getUserCardQuantity(selectedCard.id)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Page Boutique
  if (currentPage === 'shop') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white">🛒 Boutique</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-yellow-900 px-4 py-2 rounded-lg">
                <Coins className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-200 font-bold text-lg">{userProfile?.currency} PO</span>
              </div>
              <button
                onClick={() => setCurrentPage('dashboard')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                🏠 Retour
              </button>
            </div>
          </div>

          {/* Packs disponibles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {Object.entries(PACK_TYPES).map(([key, pack]) => (
              <div key={key} className="bg-slate-800 rounded-xl p-6 border-2 border-slate-600 hover:border-purple-500 transition-all">
                <div className="text-center">
                  <div className="text-6xl mb-4">{pack.icon}</div>
                  <h3 className="text-2xl font-bold text-white mb-2">{pack.name}</h3>
                  <p className="text-gray-300 mb-4">{pack.description}</p>
                  
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cartes:</span>
                      <span className="text-white font-bold">{pack.cards}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Prix:</span>
                      <span className="text-yellow-400 font-bold">{pack.price} PO</span>
                    </div>
                  </div>

                  {/* Taux de rareté */}
                  <div className="text-xs space-y-1 mb-6">
                    {Object.entries(pack.rarityRates).map(([rarity, rate]) => (
                      <div key={rarity} className="flex justify-between">
                        <span className={`${
                          rarity === 'Légendaire' ? 'text-yellow-400' :
                          rarity === 'Épique' ? 'text-purple-400' :
                          rarity === 'Rare' ? 'text-blue-400' :
                          'text-gray-400'
                        }`}>
                          {rarity}:
                        </span>
                        <span className="text-white">{(rate * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                    {pack.guaranteedEpic && (
                      <div className="text-green-400 font-bold">+ Épique garantie !</div>
                    )}
                  </div>

                  <button
                    onClick={() => openPack(key)}
                    disabled={openingPack === key || userProfile?.currency < pack.price}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-bold text-lg transition-all"
                  >
                    {openingPack === key ? 'Ouverture...' : 
                     userProfile?.currency < pack.price ? 'Pas assez de PO' : 
                     'Acheter'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Résultat d'ouverture de pack */}
          {showPackResult && (
            <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-3xl font-bold text-white text-center mb-6">🎉 Cartes obtenues !</h2>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                  {packResult.map((card, index) => (
                    <div key={index} className="transform hover:scale-105 transition-transform">
                      <FighterCard fighter={card} />
                    </div>
                  ))}
                </div>

                <div className="text-center">
                  <button
                    onClick={() => {
                      setShowPackResult(false);
                      setPackResult([]);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold text-lg"
                  >
                    Continuer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;