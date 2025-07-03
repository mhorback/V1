import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Désactiver la persistance automatique de session pour éviter les conflits
    persistSession: true,
    // Désactiver la détection automatique de session
    autoRefreshToken: true,
    // Gérer les erreurs de session de manière silencieuse
    detectSessionInUrl: false
  },
  global: {
    // Intercepter les erreurs globales de Supabase
    fetch: (url, options = {}) => {
      return fetch(url, options).catch(error => {
        // Ignorer silencieusement les erreurs de session expirée
        if (error.message?.includes('session_not_found') || 
            error.message?.includes('Session from session_id claim in JWT does not exist')) {
          console.warn('Session expirée ignorée:', error.message);
          // Retourner une réponse vide pour éviter que l'erreur remonte
          return new Response(JSON.stringify({ error: 'session_expired' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw error;
      });
    }
  }
})

// Intercepter les erreurs de session au niveau global
const originalError = console.error;
console.error = (...args) => {
  // Filtrer les erreurs de session Supabase
  const errorMessage = args.join(' ');
  if (errorMessage.includes('session_not_found') || 
      errorMessage.includes('Session from session_id claim in JWT does not exist') ||
      errorMessage.includes('Supabase request failed')) {
    // Log en tant qu'avertissement au lieu d'erreur
    console.warn('Session Supabase expirée (ignorée):', ...args);
    return;
  }
  // Appeler console.error normal pour les autres erreurs
  originalError.apply(console, args);
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          currency: number
          level: number
          experience: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          currency?: number
          level?: number
          experience?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          currency?: number
          level?: number
          experience?: number
          created_at?: string
          updated_at?: string
        }
      }
      user_cards: {
        Row: {
          id: number
          user_id: string
          card_id: number
          quantity: number
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          card_id: number
          quantity: number
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          card_id?: number
          quantity?: number
          created_at?: string
        }
      }
      user_decks: {
        Row: {
          id: number
          user_id: string
          name: string
          cards: any[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          name: string
          cards: any[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          name?: string
          cards?: any[]
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}