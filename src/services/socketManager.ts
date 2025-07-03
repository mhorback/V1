import { WebSocketMessage, ConnectionState } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

class SocketManager {
  private channel: RealtimeChannel | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private pendingAcks: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 secondes
  private readonly RECONNECT_DELAY = 5000; // 5 secondes
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly ACK_TIMEOUT = 5000; // 5 secondes

  private roomId: string = '';
  private playerId: string = '';
  private sessionId: string = '';
  private isConnected: boolean = false;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  // Connexion via Supabase Realtime
  connect(roomId: string, playerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.roomId = roomId;
        this.playerId = playerId;

        // Nettoyer l'ancienne connexion
        if (this.channel) {
          this.disconnect();
        }

        console.log(`Connexion à la room ${roomId} pour le joueur ${playerId}`);

        // Créer un canal Supabase Realtime pour la room
        this.channel = supabase.channel(`game_room_${roomId}`, {
          config: {
            broadcast: { self: true },
            presence: { key: playerId }
          }
        });

        // Écouter les événements de connexion
        this.channel
          .on('presence', { event: 'sync' }, () => {
            console.log('Présence synchronisée');
            this.updateConnectionState({
              status: 'connected',
              reconnect_attempts: 0,
              session_id: this.sessionId
            });
            this.isConnected = true;
            this.startHeartbeat();
            this.processMessageQueue();
            resolve();
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('Joueur rejoint:', key, newPresences);
            this.handlePlayerJoin(key, newPresences);
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('Joueur parti:', key, leftPresences);
            this.handlePlayerLeave(key, leftPresences);
          })
          .on('broadcast', { event: 'game_message' }, ({ payload }) => {
            console.log('Message reçu:', payload);
            this.handleMessage(payload as WebSocketMessage);
          })
          .on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
            this.handleHeartbeat(payload);
          })
          .on('broadcast', { event: 'ack' }, ({ payload }) => {
            this.handleAck(payload.message_id);
          });

        // S'abonner au canal
        this.channel.subscribe(async (status) => {
          console.log('Statut de subscription:', status);
          
          if (status === 'SUBSCRIBED') {
            // Rejoindre la présence
            await this.channel?.track({
              user_id: playerId,
              session_id: this.sessionId,
              joined_at: new Date().toISOString()
            });
            
            // Envoyer un message de connexion
            this.sendMessage({
              type: 'game_event',
              data: {
                event: 'player_connected',
                player_id: playerId,
                session_id: this.sessionId
              }
            });
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Erreur de canal');
            this.updateConnectionState({ status: 'error' });
            reject(new Error('Erreur de connexion au canal'));
          } else if (status === 'TIMED_OUT') {
            console.error('Timeout de connexion');
            this.updateConnectionState({ status: 'error' });
            this.attemptReconnect();
          } else if (status === 'CLOSED') {
            console.log('Canal fermé');
            this.updateConnectionState({ status: 'disconnected' });
            this.isConnected = false;
            this.stopHeartbeat();
            this.attemptReconnect();
          }
        });

      } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        reject(error);
      }
    });
  }

  // Déconnexion
  disconnect(): void {
    console.log('Déconnexion du WebSocket');
    
    this.stopHeartbeat();
    this.clearReconnectTimeout();
    this.clearPendingAcks();
    this.isConnected = false;
    
    if (this.channel) {
      // Envoyer un message de déconnexion
      this.sendMessage({
        type: 'game_event',
        data: {
          event: 'player_disconnected',
          player_id: this.playerId,
          session_id: this.sessionId
        }
      });

      // Quitter la présence et se désabonner
      this.channel.untrack();
      this.channel.unsubscribe();
      this.channel = null;
    }

    this.updateConnectionState({ status: 'disconnected' });
  }

  // Envoyer un message
  sendMessage(message: Omit<WebSocketMessage, 'timestamp' | 'message_id'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullMessage: WebSocketMessage = {
        ...message,
        timestamp: Date.now(),
        message_id: this.generateMessageId(),
        room_id: this.roomId,
        player_id: this.playerId
      };

      if (this.isConnected && this.channel) {
        // Envoyer via broadcast
        this.channel.send({
          type: 'broadcast',
          event: 'game_message',
          payload: fullMessage
        });

        // Gérer les accusés de réception
        if (fullMessage.requires_ack) {
          const timeout = setTimeout(() => {
            this.pendingAcks.delete(fullMessage.message_id);
            reject(new Error('Timeout: Pas d\'accusé de réception'));
          }, this.ACK_TIMEOUT);

          this.pendingAcks.set(fullMessage.message_id, timeout);
        }

        resolve();
      } else {
        // Ajouter à la queue si pas connecté
        this.messageQueue.push(fullMessage);
        
        if (this.isConnected) {
          resolve(); // Sera envoyé quand la connexion sera établie
        } else {
          reject(new Error('Canal non connecté'));
        }
      }
    });
  }

  // Gestion des messages reçus
  private handleMessage(message: WebSocketMessage): void {
    const store = useGameStore.getState();

    // Ignorer nos propres messages
    if (message.player_id === this.playerId) {
      return;
    }

    switch (message.type) {
      case 'action':
        this.handleGameAction(message);
        break;

      case 'state_sync':
        this.handleStateSync(message);
        break;

      case 'game_event':
        this.handleGameEvent(message);
        break;

      case 'error':
        console.error('Erreur serveur:', message.data);
        break;

      case 'reconnect':
        this.handleReconnect(message);
        break;

      default:
        console.warn('Type de message non géré:', message.type);
    }

    // Envoyer un accusé de réception si requis
    if (message.requires_ack) {
      this.sendAck(message.message_id);
    }
  }

  // Gestion des joueurs
  private handlePlayerJoin(playerId: string, presences: any[]): void {
    console.log(`Joueur ${playerId} a rejoint la partie`);
    
    // Notifier le store
    const store = useGameStore.getState();
    // Ici on pourrait mettre à jour l'état des joueurs connectés
  }

  private handlePlayerLeave(playerId: string, presences: any[]): void {
    console.log(`Joueur ${playerId} a quitté la partie`);
    
    // Gérer la déconnexion d'un joueur
    this.sendMessage({
      type: 'game_event',
      data: {
        event: 'player_disconnected',
        player_id: playerId,
        timestamp: Date.now()
      }
    });
  }

  // Heartbeat
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { 
            player_id: this.playerId,
            timestamp: now 
          }
        });
      }

      this.updateConnectionState({ last_heartbeat: now });
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleHeartbeat(payload: any): void {
    if (payload.player_id === this.playerId) return; // Ignorer notre propre heartbeat
    
    const now = Date.now();
    const ping = now - payload.timestamp;
    
    this.updateConnectionState({ 
      ping,
      last_heartbeat: now 
    });
  }

  // Reconnexion automatique
  private attemptReconnect(): void {
    const store = useGameStore.getState();
    
    if (store.connection.reconnect_attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('Nombre maximum de tentatives de reconnexion atteint');
      this.updateConnectionState({ status: 'error' });
      return;
    }

    this.updateConnectionState({ 
      status: 'reconnecting',
      reconnect_attempts: store.connection.reconnect_attempts + 1
    });

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Tentative de reconnexion ${store.connection.reconnect_attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS}`);
      
      this.connect(this.roomId, this.playerId)
        .then(() => {
          console.log('Reconnexion réussie');
          this.requestStateSync();
        })
        .catch((error) => {
          console.error('Échec de reconnexion:', error);
          this.attemptReconnect();
        });
    }, this.RECONNECT_DELAY);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Gestion des actions de jeu
  private handleGameAction(message: WebSocketMessage): void {
    // Déléguer au gameEngine
    import('./gameEngine').then(({ GameEngine }) => {
      GameEngine.processRemoteAction(message.data);
    });
  }

  // Synchronisation d'état
  private handleStateSync(message: WebSocketMessage): void {
    import('./stateSync').then(({ StateSync }) => {
      StateSync.handleServerSync(message.data);
    });
  }

  private requestStateSync(): void {
    this.sendMessage({
      type: 'state_sync',
      data: { 
        request: 'full_state',
        session_id: this.sessionId 
      }
    });
  }

  // Événements de jeu
  private handleGameEvent(message: WebSocketMessage): void {
    const store = useGameStore.getState();
    
    switch (message.data.event) {
      case 'player_disconnected':
        console.log('Joueur déconnecté:', message.data.player_id);
        // Gérer la déconnexion d'un joueur (pause de 90s)
        break;

      case 'player_reconnected':
        console.log('Joueur reconnecté:', message.data.player_id);
        break;

      case 'game_paused':
        console.log('Jeu mis en pause:', message.data.reason);
        break;

      case 'game_resumed':
        console.log('Jeu repris');
        break;

      case 'player_connected':
        console.log('Joueur connecté:', message.data.player_id);
        break;
    }
  }

  // Gestion de la reconnexion
  private handleReconnect(message: WebSocketMessage): void {
    if (message.data.session_valid) {
      console.log('Session restaurée');
      this.requestStateSync();
    } else {
      console.log('Session expirée, redirection nécessaire');
      // Rediriger vers le menu principal
    }
  }

  // Accusé de réception
  private sendAck(messageId: string): void {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'ack',
        payload: {
          message_id: messageId,
          timestamp: Date.now()
        }
      });
    }
  }

  private handleAck(messageId: string): void {
    const timeout = this.pendingAcks.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAcks.delete(messageId);
    }
  }

  // Traitement de la queue de messages
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected && this.channel) {
      const message = this.messageQueue.shift()!;
      this.channel.send({
        type: 'broadcast',
        event: 'game_message',
        payload: message
      });
    }
  }

  // Utilitaires
  private updateConnectionState(updates: Partial<ConnectionState>): void {
    const store = useGameStore.getState();
    store.setConnection(updates);
  }

  private clearPendingAcks(): void {
    this.pendingAcks.forEach(timeout => clearTimeout(timeout));
    this.pendingAcks.clear();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Getters
  get isConnectedState(): boolean {
    return this.isConnected && this.channel !== null;
  }

  get connectionState(): ConnectionState {
    return useGameStore.getState().connection;
  }
}

// Instance singleton
export const socketManager = new SocketManager();