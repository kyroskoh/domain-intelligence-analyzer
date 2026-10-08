import { AnalysisSnapshot } from '@/services/cache/SnapshotStore';
import { RdapEntity, WhoisData } from '@/types/domain';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

export function redactText(value?: string | null): string | undefined {
  if (!value) return value || undefined;
  return value.replace(EMAIL_RE, '[redacted]').replace(PHONE_RE, '[redacted]');
}

export function redactEntity(entity: RdapEntity, reveal = false): RdapEntity {
  if (reveal) return entity;
  return {
    ...entity,
    email: entity.email ? '[redacted]' : undefined,
    tel: entity.tel ? '[redacted]' : undefined,
    addr: entity.addr ? '[redacted]' : undefined,
    fn: entity.fn,
    org: entity.org,
    handle: entity.handle,
    roles: entity.roles,
    url: entity.url,
  };
}

export function redactWhoisContacts(whois: WhoisData, reveal = false): WhoisData {
  if (reveal) return whois;
  const scrub = (c?: WhoisData['registrant']) =>
    c
      ? {
          ...c,
          email: c.email ? '[redacted]' : undefined,
          phone: c.phone ? '[redacted]' : undefined,
          fax: c.fax ? '[redacted]' : undefined,
          address: c.address ? '[redacted]' : undefined,
        }
      : c;
  return {
    ...whois,
    registrant: scrub(whois.registrant),
    administrative: scrub(whois.administrative),
    technical: scrub(whois.technical),
    billing: scrub(whois.billing),
  };
}

export function capRelatedDomains(domains: string[], max = 25): string[] {
  return domains.slice(0, max);
}

export function snapshotRedactionMeta(reveal = false): { redacted: boolean; reveal: boolean } {
  return { redacted: !reveal, reveal };
}

export type SnapshotWithPrivacy = AnalysisSnapshot & {
  privacy?: { redacted: boolean; reveal: boolean };
};
