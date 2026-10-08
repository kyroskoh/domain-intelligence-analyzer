import { ipInCidr, longestMatchingPrefix } from '../prefixMatch';

describe('prefixMatch', () => {
  it('matches IPv4 inside CIDR', () => {
    expect(ipInCidr('1.2.3.4', '1.2.3.0/24')).toBe(true);
    expect(ipInCidr('1.2.4.4', '1.2.3.0/24')).toBe(false);
  });

  it('picks longest matching prefix', () => {
    const best = longestMatchingPrefix('1.2.3.10', [
      '1.0.0.0/8',
      '1.2.0.0/16',
      '1.2.3.0/24',
    ]);
    expect(best).toBe('1.2.3.0/24');
  });

  it('matches IPv6 inside CIDR', () => {
    expect(ipInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(ipInCidr('2001:db9::1', '2001:db8::/32')).toBe(false);
  });
});
