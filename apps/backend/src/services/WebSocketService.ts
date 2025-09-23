import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
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
  private monitoringIntervals: Map<string, NodeJS.Timeout>;
  private dnsMonitoringService: LiveDnsMonitoringService;

  constructor(server: HttpServer) {
    this.clients = new Map();
    this.subscriptions = new Map();
    this.monitoringIntervals = new Map();

    // Initialize Socket.IO with CORS configuration
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:4000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
    this.startCleanupInterval();
    
    // Initialize DNS monitoring service after WebSocket setup
    this.dnsMonitoringService = new LiveDnsMonitoringService(this);
    
    logger.info('🔌 WebSocket service initialized');
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
    // Emit analysis start notification
    socket.emit('analysis-started', { domain, timestamp: new Date() });
    
    // Trigger comprehensive analysis (this would integrate with existing analysis service)
    this.triggerDomainAnalysis(domain, socket.id);
  }

  private async triggerDomainAnalysis(domain: string, clientId: string): Promise<void> {
    try {
      // This would integrate with the existing DomainAnalysisService
      // For now, emit a placeholder response
      this.io.to(clientId).emit('analysis-complete', {
        domain,
        timestamp: new Date(),
        status: 'completed',
        // Analysis results would go here
      });
    } catch (error) {
      logger.error(`Analysis failed for domain ${domain}:`, error);
      this.io.to(clientId).emit('analysis-error', {
        domain,
        error: 'Analysis failed',
        timestamp: new Date(),
      });
    }
  }

  private startDomainMonitoring(domain: string): void {
    if (this.monitoringIntervals.has(domain)) {
      return; // Already monitoring
    }

    // Start DNS monitoring service for this domain
    this.dnsMonitoringService.startMonitoring(domain, {
      checkInterval: 5 * 60 * 1000, // 5 minutes
      alertThresholds: {
        ttlWarning: 300, // 5 minutes
        criticalChanges: ['A', 'AAAA', 'NS']
      }
    });

    // Start periodic monitoring (every 5 minutes)
    const interval = setInterval(() => {
      this.performDomainCheck(domain);
    }, 5 * 60 * 1000);

    this.monitoringIntervals.set(domain, interval);
    logger.info(`🔍 Started monitoring domain: ${domain}`);

    // Perform initial check
    this.performDomainCheck(domain);
  }

  private stopDomainMonitoring(domain: string): void {
    // Stop DNS monitoring service
    this.dnsMonitoringService.stopMonitoring(domain);
    
    const interval = this.monitoringIntervals.get(domain);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(domain);
      logger.info(`🛑 Stopped monitoring domain: ${domain}`);
    }
  }

  private async performDomainCheck(domain: string): Promise<void> {
    try {
      // This would perform actual DNS/security checks
      // For now, emit test notifications
      const subscriptions = this.subscriptions.get(domain);
      if (!subscriptions || subscriptions.size === 0) return;

      // Simulate DNS change detection
      if (Math.random() > 0.9) { // 10% chance of change notification
        this.io.to(`domain:${domain}`).emit('dns-change-detected', {
          domain,
          changeType: 'A_RECORD',
          oldValue: '1.2.3.4',
          newValue: '5.6.7.8',
          timestamp: new Date(),
          severity: 'medium',
        });
      }

      // Simulate security alert
      if (Math.random() > 0.95) { // 5% chance of security alert
        this.io.to(`domain:${domain}`).emit('security-alert', {
          domain,
          alertType: 'certificate_change',
          message: 'SSL certificate has been renewed',
          severity: 'low',
          timestamp: new Date(),
        });
      }

      // Update security score
      const newScore = Math.floor(Math.random() * 100);
      this.io.to(`domain:${domain}`).emit('security-score-update', {
        domain,
        oldScore: newScore - 5,
        newScore,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error(`Domain check failed for ${domain}:`, error);
    }
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
