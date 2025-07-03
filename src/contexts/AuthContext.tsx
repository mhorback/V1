import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (!error && data.user) {
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          username,
        });

      if (profileError) {
        return { error: profileError };
      }
    }

    return { error };
  };

  const signOut = async () => {
    try {
      // Check if there's an active session before attempting to sign out
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Check if the session is locally expired
        const now = Math.floor(Date.now() / 1000);
        const sessionExpiresAt = session.expires_at;
        
        // If session is not expired locally, attempt server-side logout
        if (sessionExpiresAt && now < sessionExpiresAt) {
          const { error } = await supabase.auth.signOut();
          
          if (error) {
            // Log session_not_found errors as warnings since they're expected when session is already invalid
            if (error.message?.includes('session_not_found') || error.message?.includes('Session from session_id claim in JWT does not exist')) {
              console.warn('Session already invalid on server, clearing local state:', error.message);
            } else {
              // Log other errors normally
              console.warn('Sign out request failed, but clearing local session state:', error);
            }
          }
        } else {
          // Session is locally expired, skip server request
          console.log('Session locally expired, skipping server logout request');
        }
      }
    } catch (error) {
      // If signOut fails (e.g., session already invalid), we still want to clear local state
      console.warn('Sign out request failed, but clearing local session state:', error);
    } finally {
      // Always clear the local state regardless of server response
      setSession(null);
      setUser(null);
    }
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};