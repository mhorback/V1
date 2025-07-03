import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import OnlineCombat from './components/OnlineCombat';

// Composant d'authentification simple temporaire
const SimpleAuth: React.FC = () => {
  const { signIn, signUp, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      const { error } = await signUp(email, password, username);
      if (error) setError(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-white text-center mb-8">
          Le Glas de Valrax
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>

          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>
          )}

          {error && (
            <div className="bg-red-600 text-white p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Connexion...' : (isLogin ? 'Se connecter' : 'S\'inscrire')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            {isLogin ? 'Créer un compte' : 'Se connecter'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant principal du jeu COMPLET
const GameApp: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<'menu' | 'character' | 'game' | 'online' | 'settings'>('menu');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return <SimpleAuth />;
  }

  if (currentView === 'online') {
    return <OnlineCombat onBack={() => setCurrentView('menu')} />;
  }

  if (currentView === 'character') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setCurrentView('menu')}
              className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
            >
              <span>← Retour au Menu</span>
            </button>
            <h1 className="text-4xl font-bold">Création de Personnage</h1>
            <div className="w-32"></div>
          </div>
          
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold mb-4">Création de Personnage</h2>
            <p className="text-xl text-gray-300 mb-8">Cette fonctionnalité sera bientôt disponible</p>
            <button
              onClick={() => setCurrentView('menu')}
              className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Retour au Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'game') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setCurrentView('menu')}
              className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
            >
              <span>← Retour au Menu</span>
            </button>
            <h1 className="text-4xl font-bold">Combat Solo</h1>
            <div className="w-32"></div>
          </div>
          
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold mb-4">Combat Solo</h2>
            <p className="text-xl text-gray-300 mb-8">Cette fonctionnalité sera bientôt disponible</p>
            <button
              onClick={() => setCurrentView('menu')}
              className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Retour au Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'settings') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setCurrentView('menu')}
              className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
            >
              <span>← Retour au Menu</span>
            </button>
            <h1 className="text-4xl font-bold">Paramètres</h1>
            <div className="w-32"></div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Paramètres</h2>
            
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-gray-300 mb-4">Connecté en tant que: <span className="font-semibold">{user.email}</span></p>
              </div>
              
              <button
                onClick={signOut}
                className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-lg font-semibold transition-colors"
              >
                Se Déconnecter
              </button>
              
              <button
                onClick={() => setCurrentView('menu')}
                className="w-full bg-gray-600 hover:bg-gray-700 py-3 rounded-lg font-semibold transition-colors"
              >
                Retour au Menu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Menu principal - TON CODE ORIGINAL RESTAURÉ
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
            Le Glas de Valrax
          </h1>
          <p className="text-xl text-gray-300">
            Un jeu de stratégie épique dans un monde de fantasy sombre
          </p>
          <div className="mt-4">
            <p className="text-sm text-gray-400">Connecté: {user.email}</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => setCurrentView('character')}
              className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 p-8 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">👤</div>
              <h2 className="text-2xl font-bold mb-2">Création de Personnage</h2>
              <p className="text-gray-300">
                Créez votre héros et définissez ses capacités
              </p>
            </button>

            <button
              onClick={() => setCurrentView('game')}
              className="bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 p-8 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">⚔️</div>
              <h2 className="text-2xl font-bold mb-2">Combat Solo</h2>
              <p className="text-gray-300">
                Affrontez des ennemis en mode solo
              </p>
            </button>

            <button
              onClick={() => setCurrentView('online')}
              className="bg-gradient-to-r from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 p-8 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">🌐</div>
              <h2 className="text-2xl font-bold mb-2">Combat en Ligne</h2>
              <p className="text-gray-300">
                Défiez d'autres joueurs en multijoueur
              </p>
            </button>

            <button
              onClick={() => setCurrentView('settings')}
              className="bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 p-8 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">⚙️</div>
              <h2 className="text-2xl font-bold mb-2">Paramètres</h2>
              <p className="text-gray-300">
                Configurez votre expérience de jeu
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Composant App principal avec AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <GameApp />
    </AuthProvider>
  );
};

export default App;