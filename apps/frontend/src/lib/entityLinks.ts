const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export type FocusKind =
  | 'nameserver'
  | 'registrar'
  | 'entity'
  | 'ssl'
  | 'san'
  | 'asn'
  | 'prefix'
  | 'ip';

export function isFqdn(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase().replace(/\.$/, '');
  return DOMAIN_REGEX.test(v);
}

export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function buildAnalyzeHref(domain: string): string {
  return `/?domain=${encodeURIComponent(normalizeHost(domain))}`;
}

export function buildFocusHref(
  domain: string,
  focus: FocusKind,
  id: string
): string {
  const params = new URLSearchParams({
    domain: normalizeHost(domain),
    focus,
    id,
  });
  return `/?${params.toString()}`;
}

export function buildEntityPageHref(
  type: 'ns' | 'registrar' | 'cert' | 'asn' | 'prefix' | 'rdap' | 'san',
  id: string
): string {
  return `/entity/${type}/${encodeURIComponent(id)}`;
}

export function hrefForNameserver(hostname: string): string {
  const host = normalizeHost(hostname);
  if (!isFqdn(host)) return buildEntityPageHref('ns', host);
  return buildEntityPageHref('ns', host);
}

export function hrefForRegistrar(
  name: string,
  opts?: { url?: string; ianaId?: string; currentDomain?: string }
): { href: string; external?: boolean } {
  if (opts?.url && /^https?:\/\//i.test(opts.url)) {
    return { href: opts.url, external: true };
  }
  const id = opts?.ianaId || name;
  return { href: buildEntityPageHref('registrar', id) };
}

export function hrefForEntity(entity: {
  handle?: string;
  url?: string;
  fn?: string;
  org?: string;
  email?: string;
}): { href: string; external?: boolean } | null {
  if (entity.url && /^https?:\/\//i.test(entity.url)) {
    return { href: entity.url, external: true };
  }
  if (entity.email) {
    return { href: `mailto:${entity.email}`, external: true };
  }
  const maybe = entity.org || entity.fn;
  if (maybe && isFqdn(maybe)) {
    return { href: buildAnalyzeHref(maybe) };
  }
  if (entity.handle) {
    return { href: buildEntityPageHref('rdap', entity.handle) };
  }
  return null;
}

export function hrefForSan(san: string): string {
  const host = normalizeHost(san.replace(/^\*\./, ''));
  if (isFqdn(host)) return buildAnalyzeHref(host);
  return buildEntityPageHref('san', host);
}

export function hrefForAsn(asn: number | string): string {
  return buildEntityPageHref('asn', String(asn).replace(/^AS/i, ''));
}

export function hrefForPrefix(cidr: string): string {
  return buildEntityPageHref('prefix', cidr);
}

export function hrefForCert(fingerprint: string): string {
  return buildEntityPageHref('cert', fingerprint);
}
