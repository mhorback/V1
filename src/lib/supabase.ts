import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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