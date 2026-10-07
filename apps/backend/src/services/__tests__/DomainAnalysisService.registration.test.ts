import { DomainAnalysisService } from '../DomainAnalysisService';
import { WhoisService } from '../whois/WhoisService';
import { RdapService } from '../rdap/RdapService';
import { DnsService } from '../dns/DnsService';
import { CacheService } from '../cache/CacheService';
import { SecurityAnalysisService } from '../security/SecurityAnalysisService';

jest.mock('../whois/WhoisService');
jest.mock('../rdap/RdapService');
jest.mock('../dns/DnsService');
jest.mock('../cache/CacheService');
jest.mock('../security/SecurityAnalysisService');

describe('DomainAnalysisService registration orchestration', () => {
  let service: DomainAnalysisService;
  let whoisLookup: jest.Mock;
  let rdapLookup: jest.Mock;
  let rdapAvailable: jest.Mock;
  let dnsLookup: jest.Mock;

  beforeEach(() => {
    whoisLookup = jest.fn();
    rdapLookup = jest.fn();
    rdapAvailable = jest.fn().mockReturnValue(true);
    dnsLookup = jest.fn().mockResolvedValue({
      domain: 'domainpeek.xyz',
      records: {},
      nameservers: [],
    });

    (WhoisService as unknown as jest.Mock).mockImplementation(() => ({
      lookup: whoisLookup,
    }));

    (RdapService as unknown as jest.Mock).mockImplementation(() => ({
      ensureReady: jest.fn().mockResolvedValue(undefined),
      isRdapAvailable: rdapAvailable,
      extractTld: jest.fn().mockReturnValue('xyz'),
      lookup: rdapLookup,
      close: jest.fn(),
    }));

    (DnsService as unknown as jest.Mock).mockImplementation(() => ({
      lookup: dnsLookup,
    }));

    (CacheService as unknown as jest.Mock).mockImplementation(() => ({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue({ memory: true, redis: false }),
      close: jest.fn(),
    }));

    (CacheService as any).generateDomainKey = (d: string) => `domain:${d}`;
    (CacheService as any).generateWhoisKey = (d: string) => `whois:${d}`;
    (CacheService as any).generateRdapKey = (d: string) => `rdap:${d}`;
    (CacheService as any).generateDnsKey = (d: string) => `dns:${d}`;

    (SecurityAnalysisService as unknown as jest.Mock).mockImplementation(() => ({
      analyzeSecurity: jest.fn().mockResolvedValue({
        overallScore: 80,
        riskLevel: 'low',
        breakdown: [],
        recommendations: [],
        risks: [],
      }),
    }));

    service = new DomainAnalysisService();
  });

  it('prefers RDAP then merges WHOIS for new gTLDs', async () => {
    rdapLookup.mockResolvedValue({
      domain: 'domainpeek.xyz',
      status: ['active'],
      events: [{ eventAction: 'registration', eventDate: new Date('2020-01-01') }],
      entities: [],
      nameservers: [{ ldhName: 'ns1.example.net' }],
      registrar: { name: 'RDAP Registrar' },
      raw: {},
    });

    whoisLookup.mockResolvedValue({
      domain: 'domainpeek.xyz',
      nameservers: [],
      status: [],
      registrar: { name: 'WHOIS Registrar', url: 'https://whois.example' },
      raw: 'raw',
    });

    const result = await service.analyzeDomain({
      domain: 'domainpeek.xyz',
      includeSecurityAnalysis: false,
    });

    expect(rdapLookup).toHaveBeenCalledWith('domainpeek.xyz');
    expect(whoisLookup).toHaveBeenCalledWith('domainpeek.xyz');
    expect(result.rdap?.registrar?.name).toBe('RDAP Registrar');
    expect(result.whois?.registrar?.name).toBe('WHOIS Registrar');
    expect(result.whois?.nameservers).toContain('ns1.example.net');
  });

  it('falls back to WHOIS when RDAP is unavailable for a TLD', async () => {
    rdapAvailable.mockReturnValue(false);
    whoisLookup.mockResolvedValue({
      domain: 'example.unknown',
      nameservers: ['ns1.example.net'],
      status: ['ok'],
      registrar: { name: 'Fallback Registrar' },
      raw: 'raw',
    });

    const result = await service.analyzeDomain({
      domain: 'example.unknown',
      includeSecurityAnalysis: false,
      includeDns: false,
    });

    expect(rdapLookup).not.toHaveBeenCalled();
    expect(result.whois?.registrar?.name).toBe('Fallback Registrar');
    expect(result.meta.warnings.some((w) => w.includes('RDAP not available'))).toBe(true);
  });
});
