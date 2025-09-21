import dns from 'dns/promises';
import dnsSocket from 'dns-socket';
import { logger } from '@/utils/logger';
import WebSocketService from './WebSocketService';

interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA';
  name: string;
  value: string | string[];
  ttl: number;
  timestamp: Date;
}

interface DnsChangeEvent {
  domain: string;
  recordType: string;
  changeType: 'added' | 'removed' | 'modified';
  oldValue?: string | string[];
  newValue?: string | string[];
  ttl?: number;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface MonitoredDomain {
  domain: string;
  lastChecked: Date;
  records: Map<string, DnsRecord>;
  checkInterval: number; // in milliseconds
  alertThresholds: {
    ttlWarning: number; // warn when TTL is below this value
    criticalChanges: string[]; // record types that trigger critical alerts
  };
}

class LiveDnsMonitoringService {
  private monitoredDomains: Map<string, MonitoredDomain>;
  private monitoringIntervals: Map<string, NodeJS.Timeout>;
  private wsService: WebSocketService;
  private dnsServers: string[];
  private defaultCheckInterval: number;

  constructor(wsService: WebSocketService) {
    this.monitoredDomains = new Map();
    this.monitoringIntervals = new Map();
    this.wsService = wsService;
    this.dnsServers = [
      '8.8.8.8',      // Google
      '1.1.1.1',      // Cloudflare
      '208.67.222.222' // OpenDNS
    ];
    this.defaultCheckInterval = 5 * 60 * 1000; // 5 minutes

    logger.info('🔍 Live DNS Monitoring Service initialized');
  }

  public startMonitoring(domain: string, options: {
    checkInterval?: number;
    recordTypes?: ('A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA')[];
    alertThresholds?: {
      ttlWarning?: number;
      criticalChanges?: string[];
    };
  } = {}): boolean {
    try {
      if (this.monitoredDomains.has(domain)) {
        logger.info(`🔍 Domain ${domain} is already being monitored`);
        return true;
      }

      const monitoredDomain: MonitoredDomain = {
        domain,
        lastChecked: new Date(),
        records: new Map(),
        checkInterval: options.checkInterval || this.defaultCheckInterval,
        alertThresholds: {
          ttlWarning: options.alertThresholds?.ttlWarning || 300, // 5 minutes
          criticalChanges: options.alertThresholds?.criticalChanges || ['A', 'AAAA', 'NS'],
        },
      };

      this.monitoredDomains.set(domain, monitoredDomain);

      // Perform initial check
      this.performDnsCheck(domain);

      // Start periodic monitoring
      const interval = setInterval(() => {
        this.performDnsCheck(domain);
      }, monitoredDomain.checkInterval);

      this.monitoringIntervals.set(domain, interval);

      logger.info(`🔍 Started DNS monitoring for domain: ${domain}`);
      return true;
    } catch (error) {
      logger.error(`Failed to start DNS monitoring for ${domain}:`, error);
      return false;
    }
  }

  public stopMonitoring(domain: string): boolean {
    try {
      const interval = this.monitoringIntervals.get(domain);
      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(domain);
      }

      this.monitoredDomains.delete(domain);
      logger.info(`🛑 Stopped DNS monitoring for domain: ${domain}`);
      return true;
    } catch (error) {
      logger.error(`Failed to stop DNS monitoring for ${domain}:`, error);
      return false;
    }
  }

  private async performDnsCheck(domain: string): Promise<void> {
    const monitoredDomain = this.monitoredDomains.get(domain);
    if (!monitoredDomain) return;

    try {
      logger.debug(`🔍 Performing DNS check for: ${domain}`);
      
      const recordTypes: ('A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA')[] = 
        ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA'];
      
      const currentRecords = new Map<string, DnsRecord>();
      const changes: DnsChangeEvent[] = [];

      // Check each record type
      for (const recordType of recordTypes) {
        try {
          const records = await this.queryDnsRecords(domain, recordType);
          
          for (const record of records) {
            const recordKey = `${record.type}:${record.name}`;
            currentRecords.set(recordKey, record);

            // Compare with previous records
            const previousRecord = monitoredDomain.records.get(recordKey);
            
            if (!previousRecord) {
              // New record detected
              changes.push({
                domain,
                recordType: record.type,
                changeType: 'added',
                newValue: record.value,
                ttl: record.ttl,
                timestamp: new Date(),
                severity: this.calculateSeverity(record.type, 'added'),
              });
            } else if (!this.recordsEqual(previousRecord, record)) {
              // Record modified
              changes.push({
                domain,
                recordType: record.type,
                changeType: 'modified',
                oldValue: previousRecord.value,
                newValue: record.value,
                ttl: record.ttl,
                timestamp: new Date(),
                severity: this.calculateSeverity(record.type, 'modified'),
              });
            }

            // Check TTL warnings
            if (record.ttl < monitoredDomain.alertThresholds.ttlWarning) {
              this.wsService.broadcastToDomain(domain, 'ttl-warning', {
                domain,
                recordType: record.type,
                ttl: record.ttl,
                threshold: monitoredDomain.alertThresholds.ttlWarning,
                message: `Low TTL detected for ${record.type} record: ${record.ttl}s`,
                timestamp: new Date(),
              });
            }
          }
        } catch (error) {
          logger.debug(`No ${recordType} records found for ${domain} or query failed`);
        }
      }

      // Check for removed records
      for (const [recordKey, previousRecord] of monitoredDomain.records) {
        if (!currentRecords.has(recordKey)) {
          changes.push({
            domain,
            recordType: previousRecord.type,
            changeType: 'removed',
            oldValue: previousRecord.value,
            timestamp: new Date(),
            severity: this.calculateSeverity(previousRecord.type, 'removed'),
          });
        }
      }

      // Update stored records
      monitoredDomain.records = currentRecords;
      monitoredDomain.lastChecked = new Date();

      // Broadcast changes
      for (const change of changes) {
        this.broadcastDnsChange(change);
      }

      // Perform additional security checks
      await this.performSecurityChecks(domain, currentRecords);

    } catch (error) {
      logger.error(`DNS check failed for domain ${domain}:`, error);
      
      this.wsService.broadcastToDomain(domain, 'dns-check-error', {
        domain,
        error: 'DNS monitoring check failed',
        timestamp: new Date(),
      });
    }
  }

  private async queryDnsRecords(domain: string, recordType: string): Promise<DnsRecord[]> {
    const records: DnsRecord[] = [];
    
    try {
      switch (recordType) {
        case 'A':
          const aRecords = await dns.resolve4(domain);
          records.push(...aRecords.map(ip => ({
            type: 'A' as const,
            name: domain,
            value: ip,
            ttl: 300, // Default TTL, actual TTL would need raw DNS query
            timestamp: new Date(),
          })));
          break;

        case 'AAAA':
          const aaaaRecords = await dns.resolve6(domain);
          records.push(...aaaaRecords.map(ip => ({
            type: 'AAAA' as const,
            name: domain,
            value: ip,
            ttl: 300,
            timestamp: new Date(),
          })));
          break;

        case 'CNAME':
          try {
            const cnameRecords = await dns.resolveCname(domain);
            records.push(...cnameRecords.map(cname => ({
              type: 'CNAME' as const,
              name: domain,
              value: cname,
              ttl: 300,
              timestamp: new Date(),
            })));
          } catch (e) {
            // CNAME might not exist, which is normal
          }
          break;

        case 'MX':
          const mxRecords = await dns.resolveMx(domain);
          records.push(...mxRecords.map(mx => ({
            type: 'MX' as const,
            name: domain,
            value: `${mx.priority} ${mx.exchange}`,
            ttl: 300,
            timestamp: new Date(),
          })));
          break;

        case 'NS':
          const nsRecords = await dns.resolveNs(domain);
          records.push(...nsRecords.map(ns => ({
            type: 'NS' as const,
            name: domain,
            value: ns,
            ttl: 300,
            timestamp: new Date(),
          })));
          break;

        case 'TXT':
          const txtRecords = await dns.resolveTxt(domain);
          records.push(...txtRecords.map(txt => ({
            type: 'TXT' as const,
            name: domain,
            value: txt.join(''),
            ttl: 300,
            timestamp: new Date(),
          })));
          break;

        case 'SOA':
          const soaRecord = await dns.resolveSoa(domain);
          records.push({
            type: 'SOA',
            name: domain,
            value: `${soaRecord.nsname} ${soaRecord.hostmaster} ${soaRecord.serial}`,
            ttl: 300,
            timestamp: new Date(),
          });
          break;
      }
    } catch (error) {
      // Some record types might not exist, which is normal
      logger.debug(`No ${recordType} records found for ${domain}`);
    }

    return records;
  }

  private recordsEqual(record1: DnsRecord, record2: DnsRecord): boolean {
    if (record1.type !== record2.type || record1.name !== record2.name) {
      return false;
    }

    // Handle array values (like TXT records)
    if (Array.isArray(record1.value) && Array.isArray(record2.value)) {
      return record1.value.length === record2.value.length &&
             record1.value.every((val, index) => val === record2.value[index]);
    }

    return record1.value === record2.value && Math.abs(record1.ttl - record2.ttl) < 10;
  }

  private calculateSeverity(recordType: string, changeType: 'added' | 'removed' | 'modified'): 'low' | 'medium' | 'high' | 'critical' {
    // Critical changes for security-sensitive record types
    if (['A', 'AAAA', 'NS'].includes(recordType)) {
      return changeType === 'modified' || changeType === 'removed' ? 'critical' : 'high';
    }

    // High severity for MX changes (email routing)
    if (recordType === 'MX') {
      return changeType === 'modified' ? 'high' : 'medium';
    }

    // Medium severity for CNAME and TXT changes
    if (['CNAME', 'TXT'].includes(recordType)) {
      return 'medium';
    }

    return 'low';
  }

  private broadcastDnsChange(change: DnsChangeEvent): void {
    logger.info(`🔧 DNS change detected for ${change.domain}: ${change.recordType} ${change.changeType}`);
    
    this.wsService.broadcastToDomain(change.domain, 'dns-change-detected', {
      domain: change.domain,
      changeType: change.recordType,
      changeAction: change.changeType,
      oldValue: change.oldValue,
      newValue: change.newValue,
      timestamp: change.timestamp,
      severity: change.severity,
    });
  }

  private async performSecurityChecks(domain: string, records: Map<string, DnsRecord>): Promise<void> {
    // Check for suspicious DNS changes
    const aRecords = Array.from(records.values()).filter(r => r.type === 'A');
    const nsRecords = Array.from(records.values()).filter(r => r.type === 'NS');

    // Check for suspicious IP ranges
    for (const aRecord of aRecords) {
      if (typeof aRecord.value === 'string') {
        const ip = aRecord.value;
        
        // Check for suspicious IP ranges (basic example)
        if (this.isSuspiciousIP(ip)) {
          this.wsService.broadcastToDomain(domain, 'security-alert', {
            domain,
            alertType: 'suspicious_ip',
            message: `Suspicious IP address detected: ${ip}`,
            severity: 'high',
            timestamp: new Date(),
          });
        }
      }
    }

    // Check for nameserver hijacking indicators
    for (const nsRecord of nsRecords) {
      if (typeof nsRecord.value === 'string') {
        const ns = nsRecord.value;
        
        if (this.isSuspiciousNameserver(ns)) {
          this.wsService.broadcastToDomain(domain, 'security-alert', {
            domain,
            alertType: 'suspicious_nameserver',
            message: `Suspicious nameserver detected: ${ns}`,
            severity: 'critical',
            timestamp: new Date(),
          });
        }
      }
    }
  }

  private isSuspiciousIP(ip: string): boolean {
    // Basic suspicious IP detection (can be enhanced)
    const suspiciousPrefixes = [
      '10.0.',      // Private ranges being used publicly (potential error)
      '192.168.',   // Private ranges
      '127.',       // Localhost
    ];
    
    return suspiciousPrefixes.some(prefix => ip.startsWith(prefix));
  }

  private isSuspiciousNameserver(ns: string): boolean {
    // Basic suspicious nameserver detection
    const suspiciousKeywords = [
      'parking',
      'expired',
      'suspended',
      'hijacked',
    ];
    
    const nsLower = ns.toLowerCase();
    return suspiciousKeywords.some(keyword => nsLower.includes(keyword));
  }

  // Public methods for integration
  public getMonitoredDomains(): string[] {
    return Array.from(this.monitoredDomains.keys());
  }

  public getDomainStatus(domain: string): any {
    const monitoredDomain = this.monitoredDomains.get(domain);
    if (!monitoredDomain) return null;

    return {
      domain,
      lastChecked: monitoredDomain.lastChecked,
      recordCount: monitoredDomain.records.size,
      checkInterval: monitoredDomain.checkInterval,
      alertThresholds: monitoredDomain.alertThresholds,
      records: Array.from(monitoredDomain.records.values()),
    };
  }

  public getStats(): any {
    return {
      monitoredDomains: this.monitoredDomains.size,
      totalRecords: Array.from(this.monitoredDomains.values()).reduce(
        (total, domain) => total + domain.records.size, 0
      ),
      activeMonitors: this.monitoringIntervals.size,
    };
  }

  public cleanup(): void {
    // Stop all monitoring intervals
    for (const [domain, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      logger.info(`🛑 Stopped DNS monitoring for domain: ${domain}`);
    }
    
    this.monitoringIntervals.clear();
    this.monitoredDomains.clear();
    
    logger.info('🧹 Live DNS Monitoring Service cleanup completed');
  }
}

export default LiveDnsMonitoringService;