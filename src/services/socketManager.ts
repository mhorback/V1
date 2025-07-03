import { WebSocketMessage, ConnectionState } from '../types/game';
import { useGameStore } from '../stores/gameStore';

class SocketManager {
  private ws: WebSocket | null = null;
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

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  // Connexion WebSocket
  connect(roomId: string, playerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.roomId = roomId;
        this.playerId = playerId;

        // URL WebSocket (utilise Supabase Realtime ou un serveur WebSocket dédié)
        const wsUrl = `${import.meta.env.VITE_SUPABASE_URL?.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${import.meta.env.VITE_SUPABASE_ANON_KEY}&vsn=1.0.0`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connecté');
          this.updateConnectionState({
            status: 'connected',
            reconnect_attempts: 0,
            session_id: this.sessionId
          });

          this.startHeartbeat();
          this.processMessageQueue();
          
          // Rejoindre la room
          this.joinRoom();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Erreur parsing message WebSocket:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket fermé:', event.code, event.reason);
          this.updateConnectionState({ status: 'disconnected' });
          this.stopHeartbeat();
          
          if (event.code !== 1000) { // Pas une fermeture normale
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('Erreur WebSocket:', error);
          this.updateConnectionState({ status: 'error' });
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  // Déconnexion
  disconnect() {
    this.stopHeartbeat();
    this.clearReconnectTimeout();
    this.clearPendingAcks();
    
    if (this.ws) {
      this.ws.close(1000, 'Déconnexion volontaire');
      this.ws = null;
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

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(fullMessage));

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
        
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          resolve(); // Sera envoyé quand la connexion sera établie
        } else {
          reject(new Error('WebSocket non connecté'));
        }
      }
    });
  }

  // Gestion des messages reçus
  private handleMessage(message: WebSocketMessage) {
    const store = useGameStore.getState();

    switch (message.type) {
      case 'heartbeat':
        this.handleHeartbeat(message);
        break;

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

  // Heartbeat
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      this.sendMessage({
        type: 'heartbeat',
        data: { timestamp: now }
      }).catch(() => {
        console.warn('Échec envoi heartbeat');
      });

      this.updateConnectionState({ last_heartbeat: now });
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleHeartbeat(message: WebSocketMessage) {
    const now = Date.now();
    const ping = now - message.data.timestamp;
    
    this.updateConnectionState({ 
      ping,
      last_heartbeat: now 
    });
  }

  // Reconnexion automatique
  private attemptReconnect() {
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

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Gestion des actions de jeu
  private handleGameAction(message: WebSocketMessage) {
    // Déléguer au gameEngine
    import('./gameEngine').then(({ GameEngine }) => {
      GameEngine.processRemoteAction(message.data);
    });
  }

  // Synchronisation d'état
  private handleStateSync(message: WebSocketMessage) {
    import('./stateSync').then(({ StateSync }) => {
      StateSync.handleServerSync(message.data);
    });
  }

  private requestStateSync() {
    this.sendMessage({
      type: 'state_sync',
      data: { 
        request: 'full_state',
        session_id: this.sessionId 
      }
    });
  }

  // Événements de jeu
  private handleGameEvent(message: WebSocketMessage) {
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
    }
  }

  // Gestion de la reconnexion
  private handleReconnect(message: WebSocketMessage) {
    if (message.data.session_valid) {
      console.log('Session restaurée');
      this.requestStateSync();
    } else {
      console.log('Session expirée, redirection nécessaire');
      // Rediriger vers le menu principal
    }
  }

  // Rejoindre une room
  private joinRoom() {
    this.sendMessage({
      type: 'game_event',
      data: {
        event: 'join_room',
        room_id: this.roomId,
        player_id: this.playerId,
        session_id: this.sessionId
      }
    });
  }

  // Accusé de réception
  private sendAck(messageId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'ack',
        message_id: messageId,
        timestamp: Date.now()
      }));
    }
  }

  // Traitement de la queue de messages
  private processMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift()!;
      this.ws.send(JSON.stringify(message));
    }
  }

  // Utilitaires
  private updateConnectionState(updates: Partial<ConnectionState>) {
    const store = useGameStore.getState();
    store.setConnection(updates);
  }

  private clearPendingAcks() {
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
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState(): ConnectionState {
    return useGameStore.getState().connection;
  }
}

// Instance singleton
export const socketManager = new SocketManager();