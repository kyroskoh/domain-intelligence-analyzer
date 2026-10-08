'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface WebSocketNotification {
  id: string;
  type: 'dns-change' | 'security-alert' | 'score-update' | 'analysis-complete' | 'error';
  domain: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  data?: any;
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  onNotification?: (notification: WebSocketNotification) => void;
}

interface DomainSubscription {
  domain: string;
  options?: {
    dns?: boolean;
    security?: boolean;
    whois?: boolean;
    realTimeScoring?: boolean;
  };
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
    onNotification,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0,
  });

  const [notifications, setNotifications] = useState<WebSocketNotification[]>([]);
  const [subscribedDomains, setSubscribedDomains] = useState<Set<string>>(new Set());

  const socket = useRef<Socket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (socket.current?.connected) return;

    setConnectionStatus(prev => ({ ...prev, connecting: true, error: null }));

    const serverUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:4001';
    
    socket.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: false,
    });

    // Connection established
    socket.current.on('connect', () => {
      console.log('✅ WebSocket connected');
      setConnectionStatus({
        connected: true,
        connecting: false,
        error: null,
        reconnectAttempts: 0,
      });

      // Start heartbeat
      heartbeatInterval.current = setInterval(() => {
        socket.current?.emit('heartbeat');
      }, 30000);
    });

    // Connection failed
    socket.current.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      setConnectionStatus(prev => ({
        connected: false,
        connecting: false,
        error: error.message,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
    });

    // Disconnected
    socket.current.on('disconnect', (reason) => {
      console.warn('🔌 WebSocket disconnected:', reason);
      setConnectionStatus(prev => ({
        ...prev,
        connected: false,
        connecting: false,
      }));

      // Clear heartbeat
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }

      // Auto-reconnect if not manually disconnected
      if (reason !== 'io client disconnect' && reconnectTimeout.current === null) {
        scheduleReconnect();
      }
    });

    // Welcome message
    socket.current.on('connected', (data) => {
      console.log('🎉 WebSocket welcome message:', data);
    });

    // Domain subscription confirmed
    socket.current.on('subscription-confirmed', (data: { domain: string; options: any }) => {
      console.log('📡 Domain subscription confirmed:', data);
      setSubscribedDomains(prev => new Set([...prev, data.domain]));
    });

    // Domain unsubscription confirmed
    socket.current.on('unsubscription-confirmed', (data: { domain: string }) => {
      console.log('📡 Domain unsubscription confirmed:', data);
      setSubscribedDomains(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.domain);
        return newSet;
      });
    });

    // DNS change detection
    socket.current.on('dns-change-detected', (data) => {
      const notification: WebSocketNotification = {
        id: `dns-${Date.now()}`,
        type: 'dns-change',
        domain: data.domain,
        title: 'DNS Change Detected',
        message: `${data.changeType} record changed from ${data.oldValue} to ${data.newValue}`,
        severity: data.severity || 'medium',
        timestamp: new Date(data.timestamp),
        data,
      };
      addNotification(notification);
    });

    // Security alerts
    socket.current.on('security-alert', (data) => {
      const notification: WebSocketNotification = {
        id: `security-${Date.now()}`,
        type: 'security-alert',
        domain: data.domain,
        title: 'Security Alert',
        message: data.message,
        severity: data.severity || 'medium',
        timestamp: new Date(data.timestamp),
        data,
      };
      addNotification(notification);
    });

    // Security score updates
    socket.current.on('security-score-update', (data) => {
      const notification: WebSocketNotification = {
        id: `score-${Date.now()}`,
        type: 'score-update',
        domain: data.domain,
        title: 'Security Score Updated',
        message: `Score changed from ${data.oldScore} to ${data.newScore}`,
        severity: data.newScore > data.oldScore ? 'low' : 'medium',
        timestamp: new Date(data.timestamp),
        data,
      };
      addNotification(notification);
    });

    // Analysis complete
    socket.current.on('analysis-complete', (data) => {
      const notification: WebSocketNotification = {
        id: `analysis-${Date.now()}`,
        type: 'analysis-complete',
        domain: data.domain,
        title: 'Analysis Complete',
        message: 'Domain analysis has finished successfully',
        severity: 'low',
        timestamp: new Date(data.timestamp),
        data,
      };
      addNotification(notification);
    });

    // Analysis errors
    socket.current.on('analysis-error', (data) => {
      const notification: WebSocketNotification = {
        id: `error-${Date.now()}`,
        type: 'error',
        domain: data.domain,
        title: 'Analysis Error',
        message: data.error || 'An error occurred during analysis',
        severity: 'high',
        timestamp: new Date(data.timestamp),
        data,
      };
      addNotification(notification);
    });

  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeout.current) return;

    setConnectionStatus(prev => {
      if (prev.reconnectAttempts >= maxReconnectAttempts) {
        return {
          ...prev,
          error: `Failed to reconnect after ${maxReconnectAttempts} attempts`,
        };
      }
      return prev;
    });

    reconnectTimeout.current = setTimeout(() => {
      reconnectTimeout.current = null;
      if (connectionStatus.reconnectAttempts < maxReconnectAttempts) {
        console.log('🔄 Attempting to reconnect...');
        connect();
      }
    }, reconnectDelay);
  }, [connect, reconnectDelay, maxReconnectAttempts, connectionStatus.reconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }

    socket.current?.disconnect();
    setConnectionStatus({
      connected: false,
      connecting: false,
      error: null,
      reconnectAttempts: 0,
    });
  }, []);

  const addNotification = useCallback((notification: WebSocketNotification) => {
    setNotifications(prev => [notification, ...prev.slice(0, 49)]); // Keep last 50
    onNotification?.(notification);
  }, [onNotification]);

  const subscribeToDomain = useCallback((subscription: DomainSubscription) => {
    if (!socket.current?.connected) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return false;
    }

    socket.current.emit('subscribe-domain', subscription);
    return true;
  }, []);

  const unsubscribeFromDomain = useCallback((domain: string) => {
    if (!socket.current?.connected) {
      console.warn('Cannot unsubscribe: WebSocket not connected');
      return false;
    }

    socket.current.emit('unsubscribe-domain', domain);
    return true;
  }, []);

  const requestAnalysis = useCallback((domain: string) => {
    if (!socket.current?.connected) {
      console.warn('Cannot request analysis: WebSocket not connected');
      return false;
    }

    socket.current.emit('request-analysis', domain);
    return true;
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    // Connection state
    connectionStatus,
    connect,
    disconnect,
    
    // Domain subscriptions
    subscribedDomains: Array.from(subscribedDomains),
    subscribeToDomain,
    unsubscribeFromDomain,
    
    // Analysis
    requestAnalysis,
    
    // Notifications
    notifications,
    clearNotifications,
    removeNotification,
  };
}