import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { validateSocketApiKey } from '@/middleware/apiKeyAuth';
import { logger } from '@/utils/logger';
import LiveDnsMonitoringService from './LiveDnsMonitoringService';

interface ClientData {
  id: string;
  domains: Set<string>;
  lastActivity: Date;
}

interface MonitoringSubscription {
  domain: string;
  userId: string;
  options: {
    dns?: boolean;
    security?: boolean;
    whois?: boolean;
    realTimeScoring?: boolean;
  };
}

class WebSocketService {
  private io: SocketIOServer;
  private clients: Map<string, ClientData>;
  private subscriptions: Map<string, Set<MonitoringSubscription>>;
  private dnsMonitoringService: LiveDnsMonitoringService;

  constructor(server: HttpServer) {
    this.clients = new Map();
    this.subscriptions = new Map();

    // Initialize Socket.IO with CORS configuration
    this.io = new SocketIOServer(server, {
      cors: {
        origin: (process.env.CORS_ORIGINS?.split(',') || ['http://localhost:4000'])
          .map((o) => o.trim())
          .filter(Boolean),
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['X-API-Key', 'X-Request-Nonce', 'Authorization', 'Content-Type'],
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupAuthMiddleware();
    this.setupEventHandlers();
    this.startCleanupInterval();
    
    // Initialize DNS monitoring service after WebSocket setup
    this.dnsMonitoringService = new LiveDnsMonitoringService(this);
    
    logger.info('🔌 WebSocket service initialized');
  }

  private setupAuthMiddleware(): void {
    this.io.use((socket, next) => {
      const auth = socket.handshake.auth as { apiKey?: string; nonce?: string } | undefined;
      const result = validateSocketApiKey(
        socket.handshake.headers as Record<string, unknown>,
        auth
      );
      if (!result.ok) {
        logger.warn(`WebSocket auth failed for ${socket.id}: ${result.message}`);
        next(new Error(result.message));
        return;
      }
      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`🔗 Client connected: ${socket.id}`);
      
      // Initialize client data
      this.clients.set(socket.id, {
        id: socket.id,
        domains: new Set(),
        lastActivity: new Date(),
      });

      // Handle domain subscription
      socket.on('subscribe-domain', (data: { domain: string; options?: any }) => {
        this.handleDomainSubscription(socket, data.domain, data.options);
      });

      // Handle domain unsubscription
      socket.on('unsubscribe-domain', (domain: string) => {
        this.handleDomainUnsubscription(socket, domain);
      });

      // Handle real-time analysis request
      socket.on('request-analysis', (domain: string) => {
        this.handleAnalysisRequest(socket, domain);
      });

      // Handle heartbeat
      socket.on('heartbeat', () => {
        this.updateClientActivity(socket.id);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
        this.handleClientDisconnect(socket.id);
      });

      // Send welcome message
      socket.emit('connected', {
        clientId: socket.id,
        timestamp: new Date(),
        message: 'Connected to Domain Intelligence WebSocket service',
      });
    });
  }

  private handleDomainSubscription(socket: Socket, domain: string, options: any = {}): void {
    const clientId = socket.id;
    const client = this.clients.get(clientId);
    
    if (!client) return;

    // Add domain to client's subscription list
    client.domains.add(domain);
    client.lastActivity = new Date();

    // Create subscription
    const subscription: MonitoringSubscription = {
      domain,
      userId: clientId,
      options: {
        dns: options.dns ?? true,
        security: options.security ?? true,
        whois: options.whois ?? false,
        realTimeScoring: options.realTimeScoring ?? true,
      },
    };

    // Add to domain subscriptions
    if (!this.subscriptions.has(domain)) {
      this.subscriptions.set(domain, new Set());
    }
    this.subscriptions.get(domain)!.add(subscription);

    // Join domain-specific room
    socket.join(`domain:${domain}`);

    // Start monitoring for this domain if not already started
    this.startDomainMonitoring(domain);

    logger.info(`📡 Client ${clientId} subscribed to domain: ${domain}`);
    socket.emit('subscription-confirmed', { domain, options: subscription.options });
  }

  private handleDomainUnsubscription(socket: Socket, domain: string): void {
    const clientId = socket.id;
    const client = this.clients.get(clientId);
    
    if (!client) return;

    // Remove domain from client's subscription list
    client.domains.delete(domain);

    // Remove subscription
    const domainSubscriptions = this.subscriptions.get(domain);
    if (domainSubscriptions) {
      const toRemove = Array.from(domainSubscriptions).find(sub => sub.userId === clientId);
      if (toRemove) {
        domainSubscriptions.delete(toRemove);
      }
      
      // Clean up empty subscriptions
      if (domainSubscriptions.size === 0) {
        this.subscriptions.delete(domain);
        this.stopDomainMonitoring(domain);
      }
    }

    // Leave domain room
    socket.leave(`domain:${domain}`);

    logger.info(`📡 Client ${clientId} unsubscribed from domain: ${domain}`);
    socket.emit('unsubscription-confirmed', { domain });
  }

  private handleAnalysisRequest(socket: Socket, domain: string): void {
    socket.emit('analysis-error', {
      domain,
      error: 'Use POST /api/analyze for domain analysis; WebSocket is for live DNS monitoring only',
      timestamp: new Date(),
    });
  }

  private startDomainMonitoring(domain: string): void {
    // LiveDnsMonitoringService is the sole poller (real DNS change detection)
    this.dnsMonitoringService.startMonitoring(domain, {
      checkInterval: 5 * 60 * 1000, // 5 minutes
      alertThresholds: {
        ttlWarning: 300, // 5 minutes
        criticalChanges: ['A', 'AAAA', 'NS']
      }
    });
    logger.info(`🔍 Started LiveDns monitoring for domain: ${domain}`);
  }

  private stopDomainMonitoring(domain: string): void {
    this.dnsMonitoringService.stopMonitoring(domain);
    logger.info(`🛑 Stopped LiveDns monitoring for domain: ${domain}`);
  }

  private updateClientActivity(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clean up subscriptions
    client.domains.forEach(domain => {
      const domainSubscriptions = this.subscriptions.get(domain);
      if (domainSubscriptions) {
        const toRemove = Array.from(domainSubscriptions).find(sub => sub.userId === clientId);
        if (toRemove) {
          domainSubscriptions.delete(toRemove);
        }
        
        // Clean up empty subscriptions
        if (domainSubscriptions.size === 0) {
          this.subscriptions.delete(domain);
          this.stopDomainMonitoring(domain);
        }
      }
    });

    // Remove client
    this.clients.delete(clientId);
  }

  private startCleanupInterval(): void {
    // Clean up inactive clients every 10 minutes
    setInterval(() => {
      const now = new Date();
      const timeout = 30 * 60 * 1000; // 30 minutes

      this.clients.forEach((client, clientId) => {
        if (now.getTime() - client.lastActivity.getTime() > timeout) {
          logger.info(`🧹 Cleaning up inactive client: ${clientId}`);
          this.handleClientDisconnect(clientId);
        }
      });
    }, 10 * 60 * 1000);
  }

  // Public methods for integration with other services
  public broadcastToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public broadcastToDomain(domain: string, event: string, data: any): void {
    this.io.to(`domain:${domain}`).emit(event, data);
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public getMonitoredDomainsCount(): number {
    return this.subscriptions.size;
  }

  public getStats(): any {
    const dnsStats = this.dnsMonitoringService.getStats();
    return {
      connectedClients: this.getConnectedClientsCount(),
      monitoredDomains: this.getMonitoredDomainsCount(),
      activeSubscriptions: Array.from(this.subscriptions.values()).reduce(
        (total, subs) => total + subs.size,
        0
      ),
      dnsMonitoring: dnsStats,
    };
  }
  
  // DNS Monitoring integration methods
  public getDnsMonitoringService(): LiveDnsMonitoringService {
    return this.dnsMonitoringService;
  }

  public getDomainDnsStatus(domain: string): any {
    return this.dnsMonitoringService.getDomainStatus(domain);
  }
}

export default WebSocketService;
