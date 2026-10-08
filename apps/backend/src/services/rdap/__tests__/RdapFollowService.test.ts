import { RdapFollowService } from '../RdapFollowService';
import { RdapData } from '@/types/domain';

jest.mock('@/services/cache/redisClient', () => ({
  getRedisClient: () => null,
  connectRedis: async () => null,
}));

jest.mock('@/utils/outboundThrottle', () => ({
  withOutboundThrottle: async (_provider: string, fn: () => Promise<unknown>) => fn(),
}));

describe('RdapFollowService', () => {
  const service = new RdapFollowService();

  it('follows related registrar RDAP and merges thick entities + IANA id', async () => {
    const axios = require('axios');
    const getSpy = jest.spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      data: {
        ldhName: 'domainpeek.xyz',
        objectClassName: 'domain',
        publicIds: [{ type: 'IANA Registrar ID', identifier: '625' }],
        entities: [
          {
            handle: '625',
            roles: ['registrar'],
            vcardArray: [
              'vcard',
              [
                ['version', {}, 'text', '4.0'],
                ['fn', {}, 'text', 'Name.com, Inc'],
                ['email', {}, 'text', 'abuse@name.com'],
              ],
            ],
            publicIds: [{ type: 'IANA Registrar ID', identifier: '625' }],
          },
          {
            handle: '1-NAME',
            roles: ['registrant'],
            vcardArray: [
              'vcard',
              [
                ['fn', {}, 'text', 'Redacted For Privacy'],
                ['org', {}, 'text', 'Domain Protection Services, Inc.'],
              ],
            ],
          },
        ],
        nameservers: [{ ldhName: 'noah.ns.cloudflare.com' }],
      },
    });

    const rdap: RdapData = {
      domain: 'domainpeek.xyz',
      status: [],
      events: [],
      entities: [
        {
          handle: '625',
          roles: ['registrar'],
          fn: 'Name.com, Inc.',
        },
      ],
      nameservers: [],
      links: [
        {
          href: 'https://namerdap.systems/domain/domainpeek.xyz',
          rel: 'related',
          title: "URL of Sponsoring Registrar's RDAP Record",
          type: 'application/rdap+json',
        },
      ],
      registrar: { name: 'Name.com, Inc.' },
      raw: {},
    };

    const result = await service.enrich(rdap);

    expect(getSpy).toHaveBeenCalledWith(
      'https://namerdap.systems/domain/domainpeek.xyz',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/rdap+json, application/json',
        }),
      })
    );
    expect(result.warnings).toEqual([]);
    expect(rdap.registrar?.ianaId).toBe('625');
    expect(result.entities.find((e) => e.handle === '1-NAME')?.org).toBe(
      'Domain Protection Services, Inc.'
    );
    expect(result.entities.find((e) => e.handle === '625')?.fn).toBe('Name.com, Inc');
    expect(rdap.nameservers?.[0]?.ldhName).toBe('noah.ns.cloudflare.com');

    getSpy.mockRestore();
  });

  it('does not fail enrichment when cache write would throw (fetch still succeeds)', async () => {
    const axios = require('axios');
    jest.spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      data: {
        handle: 'E1',
        roles: ['registrar'],
        fn: 'Registrar',
      },
    });

    // Simulate redis client present but setEx/get throwing via module mock override
    const redis = require('@/services/cache/redisClient');
    const fakeClient = {
      isOpen: true,
      get: jest.fn().mockRejectedValue(new Error('redis read boom')),
      setEx: jest.fn().mockRejectedValue(new Error('redis write boom')),
    };
    jest.spyOn(redis, 'getRedisClient').mockReturnValue(fakeClient);
    jest.spyOn(redis, 'connectRedis').mockResolvedValue(fakeClient);

    const rdap: RdapData = {
      domain: 'example.com',
      status: [],
      events: [],
      entities: [],
      nameservers: [],
      links: [
        {
          href: 'https://example-rdap.test/entity/E1',
          rel: 'related',
          type: 'application/rdap+json',
        },
      ],
      raw: {},
    };

    const result = await service.enrich(rdap);
    expect(result.warnings).toEqual([]);
    expect(result.entities.some((e) => e.handle === 'E1')).toBe(true);
  });
});
