/**
 * Smoke-test WHOIS/RDAP across representative TLDs including new gTLDs.
 * Usage: node scripts/smoke-tld-lookups.mjs [baseUrl]
 */
import { domain as whoisDomain, allTlds } from 'whoiser';
import axios from 'axios';
import { parse as parseDomain } from 'tldts';

const baseUrl = process.argv[2] || process.env.API_BASE_URL || 'http://localhost:4001';

const samples = [
  'example.com',
  'domainpeek.xyz',
  'google.app',
  'nic.ai',
  'github.io',
  'nominet.uk',
];

async function checkBootstrap() {
  const tlds = await allTlds();
  const required = ['xyz', 'fans', 'app', 'dev', 'io', 'ai', 'com', 'uk'];
  const missing = required.filter((t) => !tlds.map((x) => x.toLowerCase()).includes(t));
  console.log(`IANA WHOIS TLDs via whoiser: ${tlds.length}`);
  if (missing.length) {
    throw new Error(`Missing expected TLDs from IANA list: ${missing.join(', ')}`);
  }
  console.log('Required gTLDs present in IANA list:', required.join(', '));
}

async function checkDirectWhois(domain) {
  const hostHint = {
    xyz: 'whois.nic.xyz',
    app: 'whois.nic.google',
    ai: 'whois.nic.ai',
    io: 'whois.nic.io',
  }[parseDomain(domain).publicSuffix?.split('.').pop() || ''];

  const result = await whoisDomain(domain, {
    host: hostHint,
    timeout: 12000,
    follow: 2,
    raw: true,
  });
  const servers = Object.keys(result || {});
  if (!servers.length) {
    throw new Error(`No WHOIS layers for ${domain}`);
  }
  console.log(`WHOIS ok ${domain} via ${servers.join(' → ')}`);
}

async function checkApi(domain) {
  const [whoisRes, rdapRes] = await Promise.allSettled([
    axios.get(`${baseUrl}/api/whois/${domain}`, { timeout: 20000 }),
    axios.get(`${baseUrl}/api/rdap/${domain}`, { timeout: 20000 }),
  ]);

  if (whoisRes.status === 'fulfilled') {
    const body = whoisRes.value.data;
    if (body?.message?.includes('not yet implemented')) {
      throw new Error(`/api/whois still stub for ${domain}`);
    }
    console.log(`API WHOIS ok ${domain} registrar=${body.registrar?.name || 'n/a'}`);
  } else {
    console.warn(`API WHOIS failed ${domain}: ${whoisRes.reason?.message || whoisRes.reason}`);
  }

  if (rdapRes.status === 'fulfilled') {
    const body = rdapRes.value.data;
    if (body?.message?.includes('not yet implemented')) {
      throw new Error(`/api/rdap still stub for ${domain}`);
    }
    console.log(`API RDAP ok ${domain} handle=${body.handle || 'n/a'}`);
  } else {
    console.warn(`API RDAP failed/unavailable ${domain}: ${rdapRes.reason?.message || rdapRes.reason}`);
  }
}

async function main() {
  await checkBootstrap();

  for (const domain of samples) {
    try {
      await checkDirectWhois(domain);
    } catch (error) {
      console.warn(`Direct WHOIS skipped/failed ${domain}: ${error.message}`);
    }
  }

  let apiUp = false;
  try {
    await axios.get(`${baseUrl}/health`, { timeout: 3000 });
    apiUp = true;
  } catch {
    console.warn(`API not reachable at ${baseUrl}; skipping HTTP smoke checks`);
  }

  if (apiUp) {
    for (const domain of ['example.com', 'domainpeek.xyz', 'google.app']) {
      await checkApi(domain);
    }
  }

  console.log('Smoke checks finished');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
