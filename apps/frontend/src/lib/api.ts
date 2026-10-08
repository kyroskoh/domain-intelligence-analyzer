import axios, { AxiosResponse } from 'axios';
import { transformDomainAnalysisResponse, transformWhoisData, transformDnsData, transformRdapData } from './data-transform';

// Types (matching our backend types)
export interface DomainAnalysisRequest {
  domain: string;
  includeWhois?: boolean;
  includeRdap?: boolean;
  includeDns?: boolean;
  includeSecurityAnalysis?: boolean;
}

export interface DomainAnalysisOptions {
  includeWhois?: boolean;
  includeRdap?: boolean;
  includeDns?: boolean;
  includeSecurityAnalysis?: boolean;
  noCache?: boolean;
  private?: boolean;
}

export interface SslCertificateData {
  subject: string;
  issuer: string;
  subjectCn?: string;
  sans: string[];
  sanCount: number;
  fingerprintSha256: string;
  serial?: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  handshakeMs?: number;
  protocol?: string;
  cipher?: string;
  isCloudflareOriginCa?: boolean;
  hostnameMatch?: boolean;
}

export interface DomainAnalysisResponse {
  domain: string;
  analyzedAt: string;
  meta: AnalysisMeta;
  whois?: WhoisData;
  rdap?: RdapData;
  dns?: DnsData;
  ssl?: SslCertificateData;
  dkim?: Array<{ selector: string; valid: boolean; keyType?: string }>;
  ct?: { ctSans: string[]; historical?: boolean };
  security?: SecurityAnalysis;
}

export interface AnalysisMeta {
  requestId: string;
  duration: number;
  cached: boolean;
  cachedAt?: string;
  announced?: boolean;
  snapshotId?: string;
  sharePath?: string;
  errors: string[];
  warnings: string[];
}

export interface WhoisData {
  domain: string;
  domainName?: string; // Alias for compatibility
  registrar?: {
    name: string;
    url?: string;
    abuseContactEmail?: string;
    abuseContactPhone?: string;
  };
  registrant?: ContactInfo;
  administrative?: ContactInfo;
  technical?: ContactInfo;
  billing?: ContactInfo;
  nameservers: string[];
  status: string[];
  createdDate?: string;
  updatedDate?: string;
  expirationDate?: string;
  creationDate?: string; // Alias for compatibility
  expiryDate?: string; // Alias for compatibility
  registrarLockStatus?: boolean;
  raw: string;
  rawData?: string; // Alias for compatibility
}

export interface ContactInfo {
  name?: string;
  organization?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

export interface RdapData {
  domain: string;
  ldhName?: string; // Alias for compatibility
  unicodeName?: string; // For internationalized domains
  handle?: string;
  registrar?: {
    name: string;
    url?: string;
  };
  status: string[];
  events: RdapEvent[];
  entities: RdapEntity[];
  nameservers: RdapNameserver[];
  secureDNS?: {
    delegationSigned: boolean;
    dsRecords?: DsRecord[];
  };
  rdapConformance?: string[]; // RDAP conformance levels
  port43?: string; // WHOIS server
  links?: { href: string; rel?: string }[]; // Related links
  raw: any;
}

export interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

export interface RdapEntity {
  handle: string;
  roles: string[];
  vcardArray?: any[];
  fn?: string;
  org?: string;
  email?: string;
  tel?: string;
  addr?: string | string[];
  url?: string;
}

export interface RdapNameserver {
  ldhName: string;
  unicodeName?: string;
  ipAddresses?: {
    v4?: string[];
    v6?: string[];
  };
}

export interface DsRecord {
  keyTag: number;
  algorithm: number;
  digest: string;
  digestType: number;
}

export interface IpIntelligence {
  ip: string;
  asn?: number;
  asOrg?: string;
  country?: string;
  city?: string;
  isp?: string;
  prefixes?: string[];
  coveringPrefix?: string;
  prefixMatch?: boolean;
  asnMismatch?: boolean;
  heUrl?: string;
}

export interface DnsData {
  domain: string;
  records: {
    A: ARecord[];
    AAAA: AAAARecord[];
    CNAME: CNameRecord[];
    MX: MXRecord[];
    NS: NSRecord[];
    TXT: TXTRecord[];
    SOA: SOARecord[];
    PTR: PTRRecord[];
    CAA: CAARecord[];
    SRV: SRVRecord[];
  };
  // Aliases for component compatibility
  a?: string[];
  aaaa?: string[];
  cname?: string[];
  mx?: string[];
  ns?: string[];
  txt?: string[];
  soa?: string[];
  srv?: string[];
  ptr?: string[];
  nameservers: NameserverInfo[];
  nameserverHealth?: NameserverInfo[]; // Alias
  dnssec: DnssecInfo;
  ipIntelligence?: IpIntelligence[];
  propagationStatus?: any; // For future use
}

export interface BaseRecord {
  name: string;
  type: string;
  ttl: number;
  class: string;
}

export interface ARecord extends BaseRecord {
  type: 'A';
  address: string;
}

export interface AAAARecord extends BaseRecord {
  type: 'AAAA';
  address: string;
}

export interface CNameRecord extends BaseRecord {
  type: 'CNAME';
  cname: string;
}

export interface MXRecord extends BaseRecord {
  type: 'MX';
  priority: number;
  exchange: string;
}

export interface NSRecord extends BaseRecord {
  type: 'NS';
  nsdname: string;
}

export interface TXTRecord extends BaseRecord {
  type: 'TXT';
  data: string[];
}

export interface SOARecord extends BaseRecord {
  type: 'SOA';
  mname: string;
  rname: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimum: number;
}

export interface PTRRecord extends BaseRecord {
  type: 'PTR';
  ptrdname: string;
}

export interface CAARecord extends BaseRecord {
  type: 'CAA';
  flag: number;
  tag: string;
  value: string;
}

export interface SRVRecord extends BaseRecord {
  type: 'SRV';
  priority: number;
  weight: number;
  port: number;
  target: string;
}

export interface NameserverInfo {
  name: string;
  ip?: string;
  responseTime?: number;
  reachable: boolean;
  dnssecEnabled?: boolean;
}

export interface DnssecInfo {
  enabled: boolean;
  valid?: boolean;
  algorithms?: number[];
  dsRecords?: DsRecord[];
}

export interface SecurityAnalysis {
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  breakdown: SecurityCategory[];
  recommendations: SecurityRecommendation[];
  risks: SecurityRisk[];
  lastChecked: string;
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

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    redis?: 'connected' | 'disconnected' | 'unavailable';
    dns?: 'operational' | 'degraded' | 'down';
    whois?: 'operational' | 'degraded' | 'down';
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: string;
    };
  };
}

export interface AnalysisSnapshot {
  id: string;
  domain: string;
  analyzedAt: string;
  overallScore: number;
  dnsScore: number;
  registrationScore: number;
  rdapScore?: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  events: string[];
  hasWhois: boolean;
  hasRdap: boolean;
  hasDns: boolean;
  hasSsl?: boolean;
  durationMs?: number;
  security?: Pick<SecurityAnalysis, 'overallScore' | 'breakdown' | 'risks'>;
  registrar?: { name: string; url?: string; ianaId?: string };
  nameservers?: string[];
  entities?: { handle?: string; roles?: string[]; org?: string }[];
  ssl?: {
    fingerprintSha256: string;
    issuer: string;
    sans: string[];
    isCloudflareOriginCa?: boolean;
    validTo?: string;
  };
  asnSummary?: { asn: number; asOrg?: string }[];
}

export interface HistoryResponse {
  domain: string;
  count: number;
  snapshots: AnalysisSnapshot[];
}

export interface ShareCreateResponse {
  token: string;
  path: string;
  expiresAt: string;
  domain: string;
  snapshotId: string;
}

export interface ShareResolveResponse {
  token: string;
  domain: string;
  expiresAt: string;
  snapshot: AnalysisSnapshot;
}

// API Client Class
class ApiClient {
  private baseURL: string;
  private client: ReturnType<typeof axios.create>;

  constructor() {
    this.baseURL =
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4001';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      // Allow slow RDAP/WHOIS from distant registries without aborting first
      timeout: 45000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Local/dev without nginx: send key + nonce when NEXT_PUBLIC_API_KEY is set.
        // Production behind nginx injects these server-side — leave unset in the browser.
        const apiKey = process.env.NEXT_PUBLIC_API_KEY?.trim();
        if (apiKey) {
          config.headers = config.headers ?? {};
          config.headers['X-API-Key'] = apiKey;
          config.headers['Authorization'] = `Bearer ${apiKey}`;
          config.headers['X-Request-Nonce'] =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        }
        return config;
      },
      (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        
        // Transform error to user-friendly format
        const errorMessage = error.response?.data?.message || error.message || 'An unexpected error occurred';
        const statusCode = error.response?.status;
        
        const transformedError = {
          ...error,
          userMessage: this.getUserFriendlyErrorMessage(errorMessage, statusCode),
          originalError: error
        };
        
        return Promise.reject(transformedError);
      }
    );
  }

  private getUserFriendlyErrorMessage(message: string, statusCode?: number): string {
    if (statusCode === 400) {
      if (message.includes('domain')) {
        return 'Please enter a valid domain name.';
      }
      return 'Invalid request. Please check your input.';
    }
    
    if (statusCode === 404) {
      return 'The requested resource was not found.';
    }
    
    if (statusCode === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    
    if (statusCode === 500) {
      return 'Server error occurred. Please try again later.';
    }
    
    if (statusCode === 503) {
      return 'Service temporarily unavailable. Please try again later.';
    }
    
    if (message.includes('timeout')) {
      return 'The request timed out. Please try again.';
    }
    
    if (message.includes('network') || message.includes('ENOTFOUND')) {
      return 'Network error. Please check your connection and try again.';
    }
    
    return message || 'An unexpected error occurred. Please try again.';
  }

  // Health check
  async getHealth(): Promise<HealthStatus> {
    const response = await this.client.get<HealthStatus>('/health');
    return response.data;
  }

  // Domain analysis
  async analyzeDomain(
    domain: string,
    options?: DomainAnalysisOptions
  ): Promise<DomainAnalysisResponse> {
    const params = new URLSearchParams();
    
    if (options) {
      const include: string[] = [];
      if (options.includeWhois !== false) include.push('whois');
      if (options.includeRdap !== false) include.push('rdap');
      if (options.includeDns !== false) include.push('dns');
      if (options.includeSecurityAnalysis !== false) include.push('security');
      
      if (include.length > 0) {
        params.append('include', include.join(','));
      }
      if (options.noCache) params.append('noCache', '1');
      if (options.private) params.append('private', '1');
    }

    const queryString = params.toString();
    const url = `/api/analyze/${encodeURIComponent(domain)}${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.client.get<DomainAnalysisResponse>(url);
    return transformDomainAnalysisResponse(response.data);
  }

  async getRecentAnalyses(limit = 50): Promise<{
    count: number;
    entries: Array<{
      domain: string;
      snapshotId: string;
      analyzedAt: string;
      overallScore: number;
      riskLevel: string;
      shareToken: string;
      sharePath: string;
    }>;
  }> {
    const response = await this.client.get('/api/recent', { params: { limit } });
    return response.data;
  }

  // Individual service methods
  async getWhoisData(domain: string): Promise<WhoisData> {
    const response = await this.client.get<WhoisData>(`/api/whois/${encodeURIComponent(domain)}`);
    return transformWhoisData(response.data);
  }

  async getRdapData(domain: string): Promise<RdapData> {
    const response = await this.client.get<RdapData>(`/api/rdap/${encodeURIComponent(domain)}`);
    return transformRdapData(response.data);
  }

  async getDnsData(domain: string): Promise<DnsData> {
    const response = await this.client.get<DnsData>(`/api/dns/${encodeURIComponent(domain)}`);
    return transformDnsData(response.data);
  }

  async getHistory(domain: string, limit = 50): Promise<HistoryResponse> {
    const response = await this.client.get<HistoryResponse>(
      `/api/history/${encodeURIComponent(domain)}`,
      { params: { limit } }
    );
    return response.data;
  }

  async createShareLink(domain: string, snapshotId?: string): Promise<ShareCreateResponse> {
    const response = await this.client.post<ShareCreateResponse>('/api/share', {
      domain,
      ...(snapshotId ? { snapshotId } : {}),
    });
    return response.data;
  }

  async resolveShareToken(token: string): Promise<ShareResolveResponse> {
    const response = await this.client.get<ShareResolveResponse>(
      `/api/share/${encodeURIComponent(token)}`
    );
    return response.data;
  }

  async getSsl(domain: string, includeCt = false): Promise<{
    domain: string;
    ssl: SslCertificateData | null;
    ct?: { ctSans: string[] };
  }> {
    const response = await this.client.get(
      `/api/ssl/${encodeURIComponent(domain)}`,
      { params: includeCt ? { includeCt: '1' } : undefined }
    );
    return response.data;
  }

  async getRelations(
    kind: string,
    id: string,
    limit = 50
  ): Promise<{ domains: string[]; source: string; disclaimer?: string }> {
    const response = await this.client.get(
      `/api/relations/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
      { params: { limit } }
    );
    return response.data;
  }

  async getEntity(
    type: string,
    id: string
  ): Promise<{
    type: string;
    id: string;
    relatedDomains: string[];
    source: string;
    disclaimer?: string;
  }> {
    const response = await this.client.get(
      `/api/entity/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  async getClientEnv(): Promise<{
    ip: string;
    asn?: number;
    asOrg?: string;
    country?: string;
    city?: string;
    isp?: string;
  }> {
    const response = await this.client.get('/api/client-env');
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();