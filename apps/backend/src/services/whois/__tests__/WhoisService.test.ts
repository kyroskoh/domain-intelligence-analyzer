import { WhoisService } from '../WhoisService';

jest.mock('whoiser', () => ({
  domain: jest.fn(),
  allTlds: jest.fn().mockResolvedValue([
    'com',
    'net',
    'org',
    'xyz',
    'fans',
    'app',
    'dev',
    'io',
    'ai',
    'uk',
  ]),
}));

import { domain as whoisDomain } from 'whoiser';

describe('WhoisService', () => {
  const service = new WhoisService();
  const domainLookup = whoisDomain as jest.Mock;

  beforeEach(() => {
    domainLookup.mockReset();
  });

  describe('resolveWhoisServer', () => {
    it('resolves new gTLD servers including .xyz and .fans', () => {
      expect(service.resolveWhoisServer('domainpeek.xyz')).toBe('whois.nic.xyz');
      expect(service.resolveWhoisServer('example.fans')).toBe('whois.nic.fans');
      expect(service.resolveWhoisServer('example.app')).toBe('whois.nic.google');
      expect(service.resolveWhoisServer('example.dev')).toBe('whois.nic.google');
      expect(service.resolveWhoisServer('example.io')).toBe('whois.nic.io');
    });

    it('returns undefined for TLDs without an override (IANA discovery used)', () => {
      expect(service.resolveWhoisServer('example.com')).toBeUndefined();
    });
  });

  describe('getAllTlds / isTldSupported', () => {
    it('loads all IANA TLDs via whoiser and recognizes new gTLDs', async () => {
      const tlds = await service.getAllTlds();
      expect(tlds).toEqual(expect.arrayContaining(['xyz', 'fans', 'app', 'dev', 'io', 'ai']));
      expect(await service.isTldSupported('domainpeek.xyz')).toBe(true);
      expect(await service.isTldSupported('foo.fans')).toBe(true);
      expect(await service.isTldSupported('bar.app')).toBe(true);
    });
  });

  describe('parseWhoisData', () => {
    it('parses registrar, dates, status, and nameservers', () => {
      const raw = `
Domain Name: EXAMPLE.COM
Registrar: Example Registrar, Inc.
Registrar URL: https://example-registrar.test
Registrar IANA ID: 123
Creation Date: 1995-08-14T04:00:00Z
Updated Date: 2024-08-13T07:01:38Z
Registry Expiry Date: 2025-08-13T04:00:00Z
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited
Name Server: A.IANA-SERVERS.NET
Name Server: B.IANA-SERVERS.NET
      `.trim();

      const parsed = service.parseWhoisData(raw, 'example.com');

      expect(parsed.domain).toBe('example.com');
      expect(parsed.registrar?.name).toBe('Example Registrar, Inc.');
      expect(parsed.registrar?.url).toBe('https://example-registrar.test');
      expect(parsed.registrar?.ianaId).toBe('123');
      expect(parsed.status).toContain('clientTransferProhibited');
      expect(parsed.nameservers).toEqual(
        expect.arrayContaining(['a.iana-servers.net', 'b.iana-servers.net'])
      );
      expect(parsed.createdDate).toBeInstanceOf(Date);
      expect(parsed.expirationDate).toBeInstanceOf(Date);
    });

    it('skips privacy-redacted contact values', () => {
      const raw = `
Domain Name: PRIVATE.XYZ
Registrar: Privacy Corp
Registrant Name: REDACTED FOR PRIVACY
Registrant Email: REDACTED FOR PRIVACY
Registrant Organization: Example Org
      `.trim();

      const parsed = service.parseWhoisData(raw, 'private.xyz');
      expect(parsed.registrar?.name).toBe('Privacy Corp');
      expect(parsed.registrant?.name).toBeUndefined();
      expect(parsed.registrant?.email).toBeUndefined();
      expect(parsed.registrant?.organization).toBe('Example Org');
    });
  });

  describe('lookup', () => {
    it('uses whoiser.domain and maps structured fields for any gTLD', async () => {
      domainLookup.mockResolvedValue({
        'whois.nic.xyz': {
          'Domain Name': 'DOMAINPEEK.XYZ',
          Registrar: 'Example Registrar',
          'Name Server': ['ns1.example.net', 'ns2.example.net'],
          'Domain Status': ['clientTransferProhibited'],
          'Creation Date': '2020-01-01T00:00:00Z',
          __raw: 'Domain Name: DOMAINPEEK.XYZ\nRegistrar: Example Registrar\n',
        },
      });

      const result = await service.lookup('domainpeek.xyz');
      expect(domainLookup).toHaveBeenCalledWith(
        'domainpeek.xyz',
        expect.objectContaining({ host: 'whois.nic.xyz', raw: true })
      );
      expect(result.registrar?.name).toBe('Example Registrar');
      expect(result.nameservers).toEqual(
        expect.arrayContaining(['ns1.example.net', 'ns2.example.net'])
      );
    });
  });

  describe('isDomainValid', () => {
    it('accepts common and new gTLD domains', () => {
      expect(service.isDomainValid('example.com')).toBe(true);
      expect(service.isDomainValid('domainpeek.xyz')).toBe(true);
      expect(service.isDomainValid('foo.bar.co.uk')).toBe(true);
    });
  });
});
