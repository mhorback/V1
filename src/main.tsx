import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercepter les erreurs globales non gérées
window.addEventListener('error', (event) => {
  // Filtrer les erreurs de session Supabase
  if (event.error?.message?.includes('session_not_found') || 
      event.error?.message?.includes('Session from session_id claim in JWT does not exist')) {
    console.warn('Erreur de session Supabase interceptée et ignorée:', event.error);
    event.preventDefault(); // Empêcher l'affichage de l'erreur
    return;
  }
});

// Intercepter les promesses rejetées non gérées
window.addEventListener('unhandledrejection', (event) => {
  // Filtrer les erreurs de session Supabase
  if (event.reason?.message?.includes('session_not_found') || 
      event.reason?.message?.includes('Session from session_id claim in JWT does not exist') ||
      event.reason?.toString?.()?.includes('Supabase request failed')) {
    console.warn('Promesse rejetée Supabase interceptée et ignorée:', event.reason);
    event.preventDefault(); // Empêcher l'affichage de l'erreur
    return;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);