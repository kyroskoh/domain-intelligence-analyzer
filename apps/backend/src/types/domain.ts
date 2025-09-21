// Core domain analysis interfaces

export interface DomainAnalysisRequest {
  domain: string;
  includeWhois?: boolean;
  includeRdap?: boolean;
  includeDns?: boolean;
  includeSecurityAnalysis?: boolean;
}

export interface DomainAnalysisResponse {
  domain: string;
  analyzedAt: string;
  meta: AnalysisMeta;
  whois?: WhoisData;
  rdap?: RdapData;
  dns?: DnsData;
  security?: SecurityAnalysis;
}

export interface AnalysisMeta {
  requestId: string;
  duration: number; // milliseconds
  cached: boolean;
  errors: string[];
  warnings: string[];
}

// WHOIS Data Structure
export interface WhoisData {
  domain: string;
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
  createdDate?: Date;
  updatedDate?: Date;
  expirationDate?: Date;
  registrarLockStatus?: boolean;
  raw: string;
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

// RDAP Data Structure
export interface RdapData {
  domain: string;
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
  raw: any;
}

export interface RdapEvent {
  eventAction: string;
  eventDate: Date;
}

export interface RdapEntity {
  handle: string;
  roles: string[];
  vcardArray?: any[];
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

// DNS Data Structure
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
  nameservers: NameserverInfo[];
  dnssec: DnssecInfo;
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

// Security Analysis Structure
export interface SecurityAnalysis {
  overallScore: number; // 0-100
  breakdown: SecurityCategory[];
  recommendations: SecurityRecommendation[];
  risks: SecurityRisk[];
}

export interface SecurityCategory {
  category: string;
  score: number; // 0-100
  weight: number; // Weight in overall calculation
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

// Email Security Records
export interface EmailSecurityRecords {
  spf?: SpfRecord;
  dkim?: DkimRecord[];
  dmarc?: DmarcRecord;
}

export interface SpfRecord {
  record: string;
  valid: boolean;
  mechanisms: string[];
  qualifier: string;
  errors?: string[];
}

export interface DkimRecord {
  selector: string;
  record?: string;
  valid: boolean;
  keyType?: string;
  errors?: string[];
}

export interface DmarcRecord {
  record: string;
  valid: boolean;
  policy: 'none' | 'quarantine' | 'reject';
  subdomainPolicy?: 'none' | 'quarantine' | 'reject';
  percentage?: number;
  reportUri?: string[];
  errors?: string[];
}

// Export format types
export type ExportFormat = 'json' | 'csv' | 'pdf' | 'xml';

export interface ExportOptions {
  format: ExportFormat;
  includeRawData?: boolean;
  sections?: ('whois' | 'rdap' | 'dns' | 'security')[];
}