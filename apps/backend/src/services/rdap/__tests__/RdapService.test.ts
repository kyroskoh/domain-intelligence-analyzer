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
        handle: 'DOMAINPEEK.XYZ',
        status: ['active'],
        events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }],
        entities: [
          {
            handle: 'REG-1',
            roles: ['registrar'],
            vcardArray: ['vcard', [['fn', {}, 'text', 'CentralNic']]],
          },
        ],
        nameservers: [{ ldhName: 'ns1.example.net', ipAddresses: { v4: ['1.2.3.4'], v6: [] } }],
        secureDNS: { delegationSigned: false, dsData: [] },
      },
    });

    const result = await service.lookup('domainpeek.xyz');
    expect(result.domain).toBe('domainpeek.xyz');
    expect(result.handle).toBe('DOMAINPEEK.XYZ');
    expect(result.registrar?.name).toBe('CentralNic');
    expect(result.nameservers[0].ldhName).toBe('ns1.example.net');
    expect(result.events[0].eventAction).toBe('registration');

    await service.close();
  });
});
