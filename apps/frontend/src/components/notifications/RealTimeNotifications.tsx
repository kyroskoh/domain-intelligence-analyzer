'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bell, Wifi, WifiOff, X, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWebSocket, WebSocketNotification, ConnectionStatus } from '@/hooks/useWebSocket';

interface RealTimeNotificationsProps {
  className?: string;
  /** Domain to auto-subscribe for live DNS monitoring after analyze */
  monitoredDomain?: string;
}

const getSeverityBadgeVariant = (severity: string) => {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'outline';
  }
};

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'dns-change': return '🔧';
    case 'security-alert': return '🚨';
    case 'score-update': return '📊';
    case 'ttl-warning': return '⏱️';
    case 'analysis-complete': return '✅';
    case 'error': return '❌';
    default: return '📧';
  }
};

const ConnectionIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  if (status.connecting) {
    return (
      <div className="flex items-center space-x-2 text-yellow-600">
        <div className="animate-pulse">
          <Wifi className="h-4 w-4" />
        </div>
        <span className="text-sm hidden sm:inline">Connecting...</span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="flex items-center space-x-2 text-green-600">
        <Wifi className="h-4 w-4" />
        <span className="text-sm hidden sm:inline">Live</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-red-600">
      <WifiOff className="h-4 w-4" />
      <span className="text-sm hidden sm:inline">
        {status.error ? 'Offline' : 'Offline'}
      </span>
    </div>
  );
};

const NotificationItem: React.FC<{
  notification: WebSocketNotification;
  onRemove: (id: string) => void;
}> = ({ notification, onRemove }) => {
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  return (
    <Card className="mb-3 last:mb-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between space-x-3">
          <div className="flex items-start space-x-3 flex-1">
            <div className="text-2xl">{getNotificationIcon(notification.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <h4 className="font-medium text-sm truncate">{notification.title}</h4>
                <Badge
                  variant={getSeverityBadgeVariant(notification.severity)}
                  className="text-xs"
                >
                  {notification.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-2 break-words">
                {notification.message}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-blue-600">
                  {notification.domain}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(notification.timestamp)}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(notification.id)}
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export function RealTimeNotifications({
  className = '',
  monitoredDomain,
}: RealTimeNotificationsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const previousDomainRef = useRef<string | undefined>(undefined);

  const {
    connectionStatus,
    notifications,
    clearNotifications,
    removeNotification,
    connect,
    subscribeToDomain,
    unsubscribeFromDomain,
    subscribedDomains,
  } = useWebSocket({
    onNotification: (notification) => {
      if (notification.severity === 'critical') {
        setIsOpen(true);
      }
    },
  });

  useEffect(() => {
    if (!connectionStatus.connected) return;

    const previous = previousDomainRef.current;
    if (previous && previous !== monitoredDomain) {
      unsubscribeFromDomain(previous);
    }

    if (monitoredDomain && !subscribedDomains.includes(monitoredDomain)) {
      subscribeToDomain({
        domain: monitoredDomain,
        options: { dns: true, security: true, realTimeScoring: false },
      });
    }

    previousDomainRef.current = monitoredDomain;
  }, [
    monitoredDomain,
    connectionStatus.connected,
    subscribeToDomain,
    unsubscribeFromDomain,
    subscribedDomains,
  ]);

  const unreadCount = notifications.filter(n =>
    Date.now() - n.timestamp.getTime() < 300000
  ).length;

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <ConnectionIndicator status={connectionStatus} />

      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="relative" aria-label="Live notifications">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-red-500"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-96">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Live DNS Alerts</h3>
              <div className="flex items-center space-x-2">
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearNotifications}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
                {!connectionStatus.connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={connect}
                  >
                    Reconnect
                  </Button>
                )}
              </div>
            </div>

            {monitoredDomain && (
              <p className="text-xs text-muted-foreground mb-3">
                Monitoring: <span className="font-mono">{monitoredDomain}</span>
              </p>
            )}

            {notifications.length > 0 ? (
              <div className="h-96 overflow-y-auto pr-1">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRemove={removeNotification}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No alerts yet</p>
                <p className="text-xs">
                  {monitoredDomain
                    ? 'DNS changes for this domain will appear here'
                    : 'Analyze a domain to start live monitoring'}
                </p>
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default RealTimeNotifications;
