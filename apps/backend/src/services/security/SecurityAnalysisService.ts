import { logger } from '@/utils/logger';
import { WhoisData, DnsData, RdapData, SslCertificateData } from '@/types/domain';

export interface SecurityScore {
  overallScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  breakdown: SecurityCategory[];
  recommendations: SecurityRecommendation[];
  risks: SecurityRisk[];
  lastChecked: Date;
}

export interface SecurityCategory {
  category: string;
  score: number;
  weight: number;
  description: string;
  checks: SecurityCheck[];
}

export interface SecurityCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  score: number;
  description: string;
  details?: string;
}

export interface SecurityRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action?: string;
}

export interface SecurityRisk {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact?: string;
}

export class SecurityAnalysisService {
  private rules: SecurityRule[];

  constructor() {
    this.rules = this.loadSecurityRules();
  }

  /**
   * Performs comprehensive security analysis
   */
  async analyzeSecurity(domain: string, data: {
    whois?: WhoisData;
    dns?: DnsData;
    rdap?: RdapData;
    ssl?: SslCertificateData | null;
  }): Promise<SecurityScore> {
    logger.info(`Starting security analysis for ${domain}`);

    const breakdown: SecurityCategory[] = [];
    const recommendations: SecurityRecommendation[] = [];
    const risks: SecurityRisk[] = [];

    // Analyze DNS security
    if (data.dns) {
      const dnsCategory = await this.analyzeDnsSecurity(domain, data.dns);
      breakdown.push(dnsCategory);
    }

    // Analyze domain registration security
    if (data.whois) {
      const registrationCategory = await this.analyzeRegistrationSecurity(domain, data.whois);
      breakdown.push(registrationCategory);
    }

    // Analyze RDAP security indicators
    if (data.rdap) {
      const rdapCategory = await this.analyzeRdapSecurity(domain, data.rdap);
      breakdown.push(rdapCategory);
    }

    if (data.ssl) {
      breakdown.push(this.analyzeSslSecurity(data.ssl));
    }

    // Calculate overall score
    const overallScore = this.calculateOverallScore(breakdown);
    const riskLevel = this.determineRiskLevel(overallScore);

    // Generate recommendations and risks
    breakdown.forEach(category => {
      category.checks.forEach(check => {
        if (check.status === 'fail' || check.status === 'warn') {
          const recommendation = this.generateRecommendation(category.category, check);
          if (recommendation) recommendations.push(recommendation);

          if (check.status === 'fail') {
            const risk = this.generateRisk(category.category, check);
            if (risk) risks.push(risk);
          }
        }
      });
    });

    const result: SecurityScore = {
      overallScore,
      riskLevel,
      breakdown,
      recommendations,
      risks,
      lastChecked: new Date(),
    };

    logger.info(`Security analysis completed for ${domain}`, {
      score: overallScore,
      riskLevel,
      categoriesAnalyzed: breakdown.length,
      recommendations: recommendations.length,
      risks: risks.length,
    });

    return result;
  }

  /**
   * Analyze DNS security configuration
   */
  private async analyzeDnsSecurity(domain: string, dns: DnsData): Promise<SecurityCategory> {
    const checks: SecurityCheck[] = [];

    // DNSSEC validation
    checks.push({
      name: 'DNSSEC',
      status: dns.dnssec?.enabled ? 'pass' : 'fail',
      score: dns.dnssec?.enabled ? (dns.dnssec?.valid === false ? 70 : 100) : 40,
      description: 'DNS Security Extensions (DS/DNSKEY present)',
      details: dns.dnssec?.enabled
        ? `DNSSEC records present${dns.dnssec?.valid === false ? ' (validation inconclusive)' : ''}`
        : 'No DS/DNSKEY records detected',
    });

    // SPF record validation
    const txtRecords = dns.records.TXT || [];
    const hasSpf = txtRecords.some(record => 
      record.data.some(data => data.toLowerCase().startsWith('v=spf1'))
    );
    checks.push({
      name: 'SPF Record',
      status: hasSpf ? 'pass' : 'warn',
      score: hasSpf ? 100 : 30,
      description: 'Sender Policy Framework email authentication',
      details: hasSpf ? 'SPF record is configured' : 'SPF record not found'
    });

    // DMARC record validation
    const hasDmarc = txtRecords.some(record => 
      record.data.some(data => data.toLowerCase().startsWith('v=dmarc1'))
    );
    checks.push({
      name: 'DMARC Record',
      status: hasDmarc ? 'pass' : 'warn',
      score: hasDmarc ? 100 : 20,
      description: 'Domain-based Message Authentication reporting',
      details: hasDmarc ? 'DMARC policy is configured' : 'DMARC policy not found'
    });

    // CAA record validation
    const hasCAA = dns.records.CAA && dns.records.CAA.length > 0;
    checks.push({
      name: 'CAA Records',
      status: hasCAA ? 'pass' : 'info',
      score: hasCAA ? 100 : 70,
      description: 'Certificate Authority Authorization records',
      details: hasCAA ? 'CAA records restrict certificate issuance' : 'No CAA records found'
    });

    // Nameserver diversity
    const uniqueNS = new Set(dns.nameservers.map(ns => ns.name.split('.').slice(-2).join('.')));
    const hasDiverseNS = uniqueNS.size > 1;
    checks.push({
      name: 'Nameserver Diversity',
      status: hasDiverseNS ? 'pass' : 'warn',
      score: hasDiverseNS ? 100 : 50,
      description: 'Multiple nameserver providers for redundancy',
      details: `Using ${uniqueNS.size} different nameserver provider(s)`
    });

    // A/AAAA record parity
    const hasIPv4 = dns.records.A && dns.records.A.length > 0;
    const hasIPv6 = dns.records.AAAA && dns.records.AAAA.length > 0;
    checks.push({
      name: 'IPv6 Support',
      status: hasIPv6 ? 'pass' : 'info',
      score: hasIPv6 ? 100 : 80,
      description: 'IPv6 connectivity support',
      details: hasIPv6 ? 'Both IPv4 and IPv6 records present' : 'Only IPv4 records found'
    });

    const categoryScore = this.calculateCategoryScore(checks);

    return {
      category: 'DNS Security',
      score: categoryScore,
      weight: 0.4, // 40% of total score
      description: 'DNS configuration and security records',
      checks,
    };
  }

  /**
   * Analyze domain registration security
   */
  private async analyzeRegistrationSecurity(domain: string, whois: WhoisData): Promise<SecurityCategory> {
    const checks: SecurityCheck[] = [];

    // Registrar lock status
    checks.push({
      name: 'Domain Lock',
      status: whois.registrarLockStatus ? 'pass' : 'warn',
      score: whois.registrarLockStatus ? 100 : 40,
      description: 'Domain registrar lock protection',
      details: whois.registrarLockStatus ? 'Domain is locked at registrar' : 'Domain is not locked'
    });

    // Expiration window check
    if (whois.expirationDate) {
      const expiry = new Date(whois.expirationDate);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let expiryStatus: 'pass' | 'warn' | 'fail' = 'pass';
      let expiryScore = 100;
      
      if (daysUntilExpiry < 0) {
        expiryStatus = 'fail';
        expiryScore = 0;
      } else if (daysUntilExpiry < 30) {
        expiryStatus = 'fail';
        expiryScore = 20;
      } else if (daysUntilExpiry < 90) {
        expiryStatus = 'warn';
        expiryScore = 60;
      }

      checks.push({
        name: 'Domain Expiration',
        status: expiryStatus,
        score: expiryScore,
        description: 'Domain registration expiration timeline',
        details: `Domain expires in ${daysUntilExpiry} days`
      });
    }

    // Contact information privacy
    const hasPrivateRegistrant = !whois.registrant?.email || 
      whois.registrant.email.includes('privacy') || 
      whois.registrant.email.includes('protected');
    
    checks.push({
      name: 'Contact Privacy',
      status: hasPrivateRegistrant ? 'pass' : 'info',
      score: hasPrivateRegistrant ? 100 : 80,
      description: 'Registrant contact information privacy',
      details: hasPrivateRegistrant ? 'Contact information is private' : 'Public contact information'
    });

    // Registration age
    if (whois.createdDate) {
      const created = new Date(whois.createdDate);
      const now = new Date();
      const ageInDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      
      let ageStatus: 'pass' | 'warn' | 'info' = 'pass';
      let ageScore = 100;
      
      if (ageInDays < 30) {
        ageStatus = 'warn';
        ageScore = 40;
      } else if (ageInDays < 365) {
        ageStatus = 'info';
        ageScore = 70;
      }

      checks.push({
        name: 'Domain Age',
        status: ageStatus,
        score: ageScore,
        description: 'Domain registration age and maturity',
        details: `Domain registered ${Math.floor(ageInDays / 365)} years and ${ageInDays % 365} days ago`
      });
    }

    const categoryScore = this.calculateCategoryScore(checks);

    return {
      category: 'Registration Security',
      score: categoryScore,
      weight: 0.3, // 30% of total score
      description: 'Domain registration and ownership security',
      checks,
    };
  }

  private analyzeSslSecurity(ssl: SslCertificateData): SecurityCategory {
    const checks: SecurityCheck[] = [];

    checks.push({
      name: 'Certificate Validity',
      status: ssl.daysRemaining > 14 ? 'pass' : ssl.daysRemaining > 0 ? 'warn' : 'fail',
      score: ssl.daysRemaining > 30 ? 100 : ssl.daysRemaining > 14 ? 80 : ssl.daysRemaining > 0 ? 40 : 0,
      description: 'Leaf certificate expiry window',
      details: `Expires in ${ssl.daysRemaining} day(s) (${ssl.validTo})`,
    });

    checks.push({
      name: 'Hostname Match',
      status: ssl.hostnameMatch ? 'pass' : 'fail',
      score: ssl.hostnameMatch ? 100 : 0,
      description: 'Certificate CN/SAN covers analyzed hostname',
      details: ssl.hostnameMatch ? 'Hostname matches certificate' : 'Hostname not in CN/SAN',
    });

    checks.push({
      name: 'Handshake',
      status: (ssl.handshakeMs ?? 9999) < 2000 ? 'pass' : 'warn',
      score: (ssl.handshakeMs ?? 9999) < 2000 ? 100 : 60,
      description: 'TLS handshake completed',
      details: ssl.handshakeMs != null ? `${ssl.handshakeMs}ms · ${ssl.protocol || 'TLS'}` : 'n/a',
    });

    const categoryScore = this.calculateCategoryScore(checks);
    return {
      category: 'TLS Certificate',
      score: categoryScore,
      weight: 0.25,
      description: 'Live TLS certificate probe',
      checks,
    };
  }

  /**
   * Analyze RDAP security indicators
   */
  private async analyzeRdapSecurity(domain: string, rdap: RdapData): Promise<SecurityCategory> {
    const checks: SecurityCheck[] = [];

    // Domain status analysis
    const suspiciousStatuses = ['hold', 'prohibited', 'pending'];
    const hasSuspiciousStatus = rdap.status.some(status => 
      suspiciousStatuses.some(suspicious => status.toLowerCase().includes(suspicious))
    );

    checks.push({
      name: 'Domain Status',
      status: hasSuspiciousStatus ? 'warn' : 'pass',
      score: hasSuspiciousStatus ? 30 : 100,
      description: 'Domain operational status flags',
      details: `Status: ${rdap.status.join(', ')}`
    });

    // RDAP conformance level
    const hasModernRdap = rdap.rdapConformance && 
      rdap.rdapConformance.some(level => level.includes('rdap_level_'));
    
    checks.push({
      name: 'RDAP Conformance',
      status: hasModernRdap ? 'pass' : 'info',
      score: hasModernRdap ? 100 : 85,
      description: 'RDAP protocol conformance level',
      details: hasModernRdap ? 'Modern RDAP implementation' : 'Basic RDAP support'
    });

    // Secure DNS indicators
    if (rdap.secureDNS) {
      checks.push({
        name: 'RDAP DNSSEC Info',
        status: rdap.secureDNS.delegationSigned ? 'pass' : 'warn',
        score: rdap.secureDNS.delegationSigned ? 100 : 30,
        description: 'DNSSEC delegation signature status',
        details: rdap.secureDNS.delegationSigned ? 'DNSSEC delegation is signed' : 'DNSSEC not properly delegated'
      });
    }

    const categoryScore = this.calculateCategoryScore(checks);

    return {
      category: 'RDAP Security',
      score: categoryScore,
      weight: 0.2, // 20% of total score
      description: 'Registration Data Access Protocol security indicators',
      checks,
    };
  }

  /**
   * Calculate category score from individual checks
   */
  private calculateCategoryScore(checks: SecurityCheck[]): number {
    if (checks.length === 0) return 0;
    
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    return Math.round(totalScore / checks.length);
  }

  /**
   * Calculate overall security score
   */
  private calculateOverallScore(categories: SecurityCategory[]): number {
    if (categories.length === 0) return 0;

    const totalWeightedScore = categories.reduce((sum, category) => {
      return sum + (category.score * category.weight);
    }, 0);

    const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);
    
    return Math.round(totalWeightedScore / totalWeight);
  }

  /**
   * Determine risk level based on score
   */
  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'low';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'high';
    return 'critical';
  }

  /**
   * Generate recommendation from failed/warning check
   */
  private generateRecommendation(category: string, check: SecurityCheck): SecurityRecommendation | null {
    const recommendationMap: Record<string, SecurityRecommendation> = {
      'DNSSEC': {
        priority: 'high',
        category: 'DNS Security',
        title: 'Enable DNSSEC',
        description: 'Enable DNS Security Extensions to protect against DNS spoofing and cache poisoning attacks.',
        action: 'Contact your DNS provider to enable DNSSEC for your domain.'
      },
      'SPF Record': {
        priority: 'medium',
        category: 'Email Security',
        title: 'Configure SPF Record',
        description: 'Add an SPF record to prevent email spoofing and improve deliverability.',
        action: 'Add a TXT record with your SPF policy (e.g., "v=spf1 include:_spf.google.com ~all").'
      },
      'DMARC Record': {
        priority: 'medium',
        category: 'Email Security',
        title: 'Configure DMARC Policy',
        description: 'Implement DMARC to protect against email phishing and spoofing.',
        action: 'Add a DMARC TXT record to your DNS (e.g., "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com").'
      },
      'Domain Lock': {
        priority: 'high',
        category: 'Registration Security',
        title: 'Enable Domain Lock',
        description: 'Lock your domain at the registrar to prevent unauthorized transfers.',
        action: 'Contact your domain registrar to enable registrar lock protection.'
      },
      'Domain Expiration': {
        priority: 'critical',
        category: 'Registration Security',
        title: 'Renew Domain Registration',
        description: 'Your domain is expiring soon. Renew to prevent loss of control.',
        action: 'Contact your registrar immediately to renew your domain registration.'
      },
    };

    return recommendationMap[check.name] || null;
  }

  /**
   * Generate risk assessment from failed check
   */
  private generateRisk(category: string, check: SecurityCheck): SecurityRisk | null {
    const riskMap: Record<string, SecurityRisk> = {
      'DNSSEC': {
        severity: 'medium',
        category: 'DNS Security',
        title: 'DNS Spoofing Vulnerability',
        description: 'Without DNSSEC, the domain is vulnerable to DNS cache poisoning attacks.',
        impact: 'Attackers could redirect traffic to malicious servers.'
      },
      'Domain Lock': {
        severity: 'high',
        category: 'Registration Security',
        title: 'Domain Hijacking Risk',
        description: 'Unlocked domain can be transferred without authorization.',
        impact: 'Complete loss of domain control and potential service disruption.'
      },
      'Domain Expiration': {
        severity: 'critical',
        category: 'Registration Security',
        title: 'Domain Expiration Risk',
        description: 'Domain will expire soon and may become unavailable.',
        impact: 'Complete loss of domain, website, and email services.'
      },
    };

    return riskMap[check.name] || null;
  }

  /**
   * Load security rules configuration
   */
  private loadSecurityRules(): SecurityRule[] {
    // This would typically load from a JSON configuration file
    // For now, we'll return basic rules structure
    return [];
  }
}

interface SecurityRule {
  name: string;
  category: string;
  weight: number;
  condition: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}