'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface WebSocketNotification {
  id: string;
  type: 'dns-change' | 'security-alert' | 'score-update' | 'analysis-complete' | 'error' | 'ttl-warning';
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

function resolveSocketUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    '';

  if (typeof window !== 'undefined') {
    if (!envUrl) {
      return window.location.origin;
    }
    try {
      const parsed = new URL(envUrl, window.location.origin);
      // Same-origin nginx deploy: hit /socket.io/ on the public site
      if (parsed.origin === window.location.origin) {
        return window.location.origin;
      }
      return parsed.origin;
    } catch {
      return envUrl;
    }
  }

  return envUrl || 'http://localhost:4001';
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
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  const addNotification = useCallback((notification: WebSocketNotification) => {
    setNotifications(prev => [notification, ...prev.slice(0, 49)]);
    onNotificationRef.current?.(notification);
  }, []);

  const scheduleReconnectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (socket.current?.connected) return;

    setConnectionStatus(prev => ({ ...prev, connecting: true, error: null }));

    const serverUrl = resolveSocketUrl();

    // Local/dev without nginx: pass key + nonce via handshake auth when NEXT_PUBLIC_API_KEY is set.
    // Production nginx injects X-API-Key / X-Request-Nonce on the Socket.IO upgrade.
    const apiKey = process.env.NEXT_PUBLIC_API_KEY?.trim();
    const auth = apiKey
      ? {
          apiKey,
          nonce:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
        }
      : undefined;

    socket.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: false,
      path: '/socket.io/',
      ...(auth ? { auth } : {}),
    });

    socket.current.on('connect', () => {
      setConnectionStatus({
        connected: true,
        connecting: false,
        error: null,
        reconnectAttempts: 0,
      });

      heartbeatInterval.current = setInterval(() => {
        socket.current?.emit('heartbeat');
      }, 30000);
    });

    socket.current.on('connect_error', (error) => {
      setConnectionStatus(prev => ({
        connected: false,
        connecting: false,
        error: error.message,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
    });

    socket.current.on('disconnect', (reason) => {
      setConnectionStatus(prev => ({
        ...prev,
        connected: false,
        connecting: false,
      }));

      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }

      if (reason !== 'io client disconnect' && reconnectTimeout.current === null) {
        scheduleReconnectRef.current();
      }
    });

    socket.current.on('subscription-confirmed', (data: { domain: string; options: any }) => {
      setSubscribedDomains(prev => new Set([...prev, data.domain]));
    });

    socket.current.on('unsubscription-confirmed', (data: { domain: string }) => {
      setSubscribedDomains(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.domain);
        return newSet;
      });
    });

    socket.current.on('dns-change-detected', (data) => {
      addNotification({
        id: `dns-${Date.now()}`,
        type: 'dns-change',
        domain: data.domain,
        title: 'DNS Change Detected',
        message: `${data.changeType} record changed from ${data.oldValue} to ${data.newValue}`,
        severity: data.severity || 'medium',
        timestamp: new Date(data.timestamp),
        data,
      });
    });

    socket.current.on('ttl-warning', (data) => {
      addNotification({
        id: `ttl-${Date.now()}`,
        type: 'ttl-warning',
        domain: data.domain,
        title: 'Low TTL Warning',
        message: data.message || `TTL for ${data.recordType || 'record'} is below threshold (${data.ttl ?? '?'}s)`,
        severity: data.severity || 'low',
        timestamp: new Date(data.timestamp || Date.now()),
        data,
      });
    });

    socket.current.on('dns-check-error', (data) => {
      addNotification({
        id: `dns-err-${Date.now()}`,
        type: 'error',
        domain: data.domain,
        title: 'DNS Check Failed',
        message: data.error || data.message || 'DNS monitoring check failed',
        severity: 'medium',
        timestamp: new Date(data.timestamp || Date.now()),
        data,
      });
    });

    socket.current.on('security-alert', (data) => {
      addNotification({
        id: `security-${Date.now()}`,
        type: 'security-alert',
        domain: data.domain,
        title: 'Security Alert',
        message: data.message,
        severity: data.severity || 'medium',
        timestamp: new Date(data.timestamp),
        data,
      });
    });

    socket.current.on('security-score-update', (data) => {
      addNotification({
        id: `score-${Date.now()}`,
        type: 'score-update',
        domain: data.domain,
        title: 'Security Score Updated',
        message: `Score changed from ${data.oldScore} to ${data.newScore}`,
        severity: data.newScore > data.oldScore ? 'low' : 'medium',
        timestamp: new Date(data.timestamp),
        data,
      });
    });

    socket.current.on('analysis-complete', (data) => {
      addNotification({
        id: `analysis-${Date.now()}`,
        type: 'analysis-complete',
        domain: data.domain,
        title: 'Analysis Complete',
        message: 'Domain analysis has finished successfully',
        severity: 'low',
        timestamp: new Date(data.timestamp),
        data,
      });
    });

    socket.current.on('analysis-error', (data) => {
      addNotification({
        id: `error-${Date.now()}`,
        type: 'error',
        domain: data.domain,
        title: 'Analysis Error',
        message: data.error || 'An error occurred during analysis',
        severity: 'high',
        timestamp: new Date(data.timestamp),
        data,
      });
    });
  }, [addNotification]);

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
      setConnectionStatus(prev => {
        if (prev.reconnectAttempts < maxReconnectAttempts) {
          connect();
        }
        return prev;
      });
    }, reconnectDelay);
  }, [connect, reconnectDelay, maxReconnectAttempts]);

  scheduleReconnectRef.current = scheduleReconnect;

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

  const subscribeToDomain = useCallback((subscription: DomainSubscription) => {
    if (!socket.current?.connected) {
      return false;
    }

    socket.current.emit('subscribe-domain', subscription);
    return true;
  }, []);

  const unsubscribeFromDomain = useCallback((domain: string) => {
    if (!socket.current?.connected) {
      return false;
    }

    socket.current.emit('unsubscribe-domain', domain);
    return true;
  }, []);

  const requestAnalysis = useCallback((domain: string) => {
    if (!socket.current?.connected) {
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

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connectionStatus,
    connect,
    disconnect,
    subscribedDomains: Array.from(subscribedDomains),
    subscribeToDomain,
    unsubscribeFromDomain,
    requestAnalysis,
    notifications,
    clearNotifications,
    removeNotification,
  };
}
