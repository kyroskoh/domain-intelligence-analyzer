import { isIPv4, isIPv6 } from 'net';

/** Return true if ip is inside cidr (IPv4 or IPv6). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (!network || !Number.isFinite(prefix)) return false;

  if (isIPv4(ip) && isIPv4(network)) {
    return ipv4InCidr(ip, network, prefix);
  }
  if (isIPv6(ip) && isIPv6(network)) {
    return ipv6InCidr(ip, network, prefix);
  }
  return false;
}

export function longestMatchingPrefix(ip: string, prefixes: string[]): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const cidr of prefixes) {
    if (!ipInCidr(ip, cidr)) continue;
    const len = parseInt(cidr.split('/')[1] || '0', 10);
    if (len > bestLen) {
      bestLen = len;
      best = cidr;
    }
  }
  return best;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function ipv4InCidr(ip: string, network: string, prefix: number): boolean {
  if (prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

function ipv6ToBits(ip: string): bigint {
  // Expand :: notation via WHATWG URL hack is awkward; use simple expand
  const parts = expandIpv6(ip);
  let result = 0n;
  for (const p of parts) {
    result = (result << 16n) + BigInt(parseInt(p || '0', 16));
  }
  return result;
}

function expandIpv6(ip: string): string[] {
  const halves = ip.split('::');
  if (halves.length === 1) {
    const parts = ip.split(':');
    return parts.map((p) => p.padStart(4, '0'));
  }
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const mid = Array(Math.max(0, missing)).fill('0000');
  return [...left, ...mid, ...right].map((p) => p.padStart(4, '0'));
}

function ipv6InCidr(ip: string, network: string, prefix: number): boolean {
  if (prefix < 0 || prefix > 128) return false;
  const ipBits = ipv6ToBits(ip);
  const netBits = ipv6ToBits(network);
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  return ipBits >> shift === netBits >> shift;
}
