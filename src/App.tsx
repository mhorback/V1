import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Auth from './components/Auth';
import CharacterCreation from './components/CharacterCreation';
import GameBoard from './components/GameBoard';
import OnlineCombat from './components/OnlineCombat';
import { useAuth } from './contexts/AuthContext';

// Composant principal du jeu qui utilise useAuth
const GameApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'menu' | 'character' | 'game' | 'online'>('menu');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (currentView === 'online') {
    return <OnlineCombat onBack={() => setCurrentView('menu')} />;
  }

  if (currentView === 'character') {
    return <CharacterCreation onBack={() => setCurrentView('menu')} />;
  }

  if (currentView === 'game') {
    return <GameBoard onBack={() => setCurrentView('menu')} />;
  }

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
              onClick={() => {
                // Logique pour les paramètres
                console.log('Paramètres');
              }}
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

// Composant App principal qui fournit l'AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <GameApp />
    </AuthProvider>
  );
};

export default App;