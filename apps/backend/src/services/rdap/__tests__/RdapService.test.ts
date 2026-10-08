import axios from 'axios';
import fs from 'fs/promises';
import { RdapService } from '../RdapService';

jest.mock('axios');
jest.mock('fs/promises');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('RdapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.readFile.mockRejectedValue(new Error('no cache'));
    mockedFs.mkdir.mockResolvedValue(undefined as never);
    mockedFs.writeFile.mockResolvedValue(undefined as never);
  });

  function mockIanaBootstrap() {
    mockedAxios.get.mockResolvedValue({
      data: {
        description: 'test bootstrap',
        publication: '2026-01-01T00:00:00Z',
        services: [
          [['com'], ['https://rdap.verisign.com/com/v1/']],
          [['xyz'], ['https://rdap.centralnic.com/xyz/']],
          [['fans'], ['https://rdap.centralnic.com/fans/']],
          [['app'], ['https://rdap.nic.google/']],
          [['uk'], ['https://rdap.nominet.uk/uk/']],
        ],
      },
    });
  }

  it('loads IANA bootstrap and reports availability for new gTLDs', async () => {
    mockIanaBootstrap();
    const service = new RdapService();
    await service.ensureReady();

    expect(service.isRdapAvailable('domainpeek.xyz')).toBe(true);
    expect(service.isRdapAvailable('example.fans')).toBe(true);
    expect(service.isRdapAvailable('example.app')).toBe(true);
    expect(service.getRdapServers('xyz')).toEqual(['https://rdap.centralnic.com/xyz/']);
    expect(service.getBootstrapSize()).toBeGreaterThanOrEqual(5);

    await service.close();
  });

  it('extracts public suffixes via tldts for multi-label domains', async () => {
    mockIanaBootstrap();
    const service = new RdapService();
    await service.ensureReady();

    expect(service.extractTld('www.example.co.uk')).toBe('co.uk');
    expect(service.extractTld('domainpeek.xyz')).toBe('xyz');
    expect(service.isRdapAvailable('bbc.co.uk')).toBe(true);

    await service.close();
  });

  it('falls back to seed map when IANA fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'));
    const service = new RdapService();
    await service.ensureReady();

    // Seed includes xyz/fans/app even without IANA
    expect(service.isRdapAvailable('domainpeek.xyz')).toBe(true);
    expect(service.isRdapAvailable('example.fans')).toBe(true);

    await service.close();
  });

  it('parses RDAP domain responses', async () => {
    mockIanaBootstrap();
    const service = new RdapService();
    await service.ensureReady();

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        ldhName: 'domainpeek.xyz',
        unicodeName: 'domainpeek.xyz',
        handle: 'DOMAINPEEK.XYZ',
        port43: 'whois.nic.xyz',
        links: [{ href: 'https://rdap.example/domain/domainpeek.xyz', rel: 'self' }],
        status: ['active'],
        events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }],
        entities: [
          {
            handle: 'REG-1',
            roles: ['registrar'],
            vcardArray: ['vcard', [['fn', {}, 'text', 'CentralNic']]],
            links: [{ href: 'https://www.centralnic.com', rel: 'related' }],
          },
          {
            handle: 'REGISTRANT-1',
            roles: ['registrant'],
            vcardArray: [
              'vcard',
              [
                ['fn', {}, 'text', 'Jane Doe'],
                ['org', {}, 'text', 'Acme Corp'],
                ['email', {}, 'text', 'jane@acme.example'],
                ['tel', { type: 'voice' }, 'uri', 'tel:+1.5550100'],
                ['adr', {}, 'text', ['', '', '1 Main St', 'Springfield', 'IL', '62701', 'US']],
              ],
            ],
          },
        ],
        nameservers: [{ ldhName: 'ns1.example.net', ipAddresses: { v4: ['1.2.3.4'], v6: [] } }],
        secureDNS: {
          delegationSigned: true,
          dsData: [
            { keyTag: 12345, algorithm: 8, digest: 'ABCDEF', digestType: 2 },
          ],
        },
      },
    });

    const result = await service.lookup('domainpeek.xyz');
    expect(result.domain).toBe('domainpeek.xyz');
    expect(result.ldhName).toBe('domainpeek.xyz');
    expect(result.unicodeName).toBe('domainpeek.xyz');
    expect(result.port43).toBe('whois.nic.xyz');
    expect(result.links).toEqual([
      { href: 'https://rdap.example/domain/domainpeek.xyz', rel: 'self' },
    ]);
    expect(result.handle).toBe('DOMAINPEEK.XYZ');
    expect(result.registrar?.name).toBe('CentralNic');
    expect(result.registrar?.url).toBe('https://www.centralnic.com');
    expect(result.nameservers[0].ldhName).toBe('ns1.example.net');
    expect(result.events[0].eventAction).toBe('registration');
    expect(result.secureDNS?.delegationSigned).toBe(true);
    expect(result.secureDNS?.dsRecords?.[0]).toMatchObject({
      keyTag: 12345,
      algorithm: 8,
      digest: 'ABCDEF',
      digestType: 2,
    });

    const registrant = result.entities.find((e) => e.roles.includes('registrant'));
    expect(registrant?.fn).toBe('Jane Doe');
    expect(registrant?.org).toBe('Acme Corp');
    expect(registrant?.email).toBe('jane@acme.example');
    expect(registrant?.tel).toBe('tel:+1.5550100');
    expect(registrant?.addr).toEqual(['1 Main St', 'Springfield', 'IL', '62701', 'US']);

    await service.close();
  });

  it('does not retry the same RDAP server on timeout', async () => {
    const previousTimeout = process.env.RDAP_TIMEOUT_MS;
    process.env.RDAP_TIMEOUT_MS = '100';
    mockIanaBootstrap();
    const service = new RdapService();
    await service.ensureReady();

    const timeoutErr = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(timeoutErr);

    await expect(service.lookup('domainpeek.xyz')).rejects.toMatchObject({
      name: 'TimeoutError',
    });

    const domainCalls = mockedAxios.get.mock.calls.filter(
      ([url]) => typeof url === 'string' && url.includes('/domain/')
    );
    expect(domainCalls).toHaveLength(1);

    await service.close();
    if (previousTimeout === undefined) {
      delete process.env.RDAP_TIMEOUT_MS;
    } else {
      process.env.RDAP_TIMEOUT_MS = previousTimeout;
    }
  });
});
