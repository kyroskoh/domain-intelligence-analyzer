import {
  buildSnapshotFromAnalysis,
  snapshotKey,
  snapshotsIndexKey,
} from '../SnapshotStore';
import { DomainAnalysisResponse } from '@/types/domain';

describe('SnapshotStore helpers', () => {
  it('builds keys', () => {
    expect(snapshotKey('Example.COM', 'abc')).toBe('snapshot:example.com:abc');
    expect(snapshotsIndexKey('Example.COM')).toBe('snapshots:example.com');
  });

  it('builds compact snapshot from analysis response', () => {
    const response: DomainAnalysisResponse = {
      domain: 'Example.COM',
      analyzedAt: '2026-01-15T12:00:00.000Z',
      meta: {
        requestId: 'req-1',
        duration: 120,
        cached: false,
        errors: [],
        warnings: [],
      },
      whois: { domain: 'example.com', nameservers: [], status: [], raw: '' },
      dns: {
        domain: 'example.com',
        records: {
          A: [],
          AAAA: [],
          CNAME: [],
          MX: [],
          NS: [],
          TXT: [],
          SOA: [],
          PTR: [],
          CAA: [],
          SRV: [],
        },
        nameservers: [],
        dnssec: { enabled: false, valid: false },
      },
      security: {
        overallScore: 72,
        breakdown: [
          {
            category: 'DNS Security',
            score: 60,
            weight: 1,
            description: '',
            checks: [],
          },
          {
            category: 'Registration',
            score: 80,
            weight: 1,
            description: '',
            checks: [],
          },
        ],
        recommendations: [],
        risks: [
          {
            severity: 'medium',
            category: 'dns',
            title: 'Missing CAA',
            description: 'No CAA records',
          },
        ],
      },
    };

    const snapshot = buildSnapshotFromAnalysis(response);
    expect(snapshot.domain).toBe('example.com');
    expect(snapshot.overallScore).toBe(72);
    expect(snapshot.dnsScore).toBe(60);
    expect(snapshot.registrationScore).toBe(80);
    expect(snapshot.riskLevel).toBe('medium');
    expect(snapshot.hasWhois).toBe(true);
    expect(snapshot.hasDns).toBe(true);
    expect(snapshot.events).toContain('Missing CAA');
    expect(snapshot.id).toBeTruthy();
  });
});
