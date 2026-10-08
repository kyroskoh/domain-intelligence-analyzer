import {
  isFqdn,
  buildAnalyzeHref,
  hrefForSan,
  hrefForAsn,
  hrefForNameserver,
} from '../entityLinks';

describe('entityLinks', () => {
  it('validates FQDNs', () => {
    expect(isFqdn('example.com')).toBe(true);
    expect(isFqdn('not a domain')).toBe(false);
  });

  it('builds analyze and entity hrefs', () => {
    expect(buildAnalyzeHref('Example.COM')).toBe('/?domain=example.com');
    expect(hrefForSan('www.example.com')).toContain('domain=www.example.com');
    expect(hrefForAsn(13335)).toBe('/entity/asn/13335');
    expect(hrefForNameserver('ns1.example.com')).toBe(
      '/entity/ns/ns1.example.com'
    );
  });
});
