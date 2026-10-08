#!/usr/bin/env node
/**
 * Internal ops: list all analyzed domains (announced + private) with cache status and links.
 *
 * Talks to Redis directly — not a public API. Run on the host or inside Docker:
 *   npm run list:analyzed
 *   docker compose exec backend npm run list:analyzed
 *
 * Flags:
 *   --json          Machine-readable JSON
 *   --limit=N       Max rows (default 200)
 *   --base=URL      Frontend base for links (default PUBLIC_BASE_URL / localhost:4000)
 */
import { createClient } from 'redis';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '..');
const repoRoot = resolve(backendRoot, '../..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(join(repoRoot, '.env'));
loadEnvFile(join(backendRoot, '.env'));

function parseArgs(argv) {
  const opts = { json: false, limit: 200, base: null };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.slice(8), 10) || 200;
    else if (arg.startsWith('--base=')) opts.base = arg.slice(7);
  }
  return opts;
}

function resolveRedisUrl() {
  const password = process.env.REDIS_PASSWORD?.trim() || '';
  const rawUrl = process.env.REDIS_URL?.trim();
  if (rawUrl) {
    if (password && !/\/\/[^/@]+@/.test(rawUrl)) {
      try {
        const parsed = new URL(rawUrl);
        parsed.password = password;
        return parsed.toString();
      } catch {
        return rawUrl;
      }
    }
    return rawUrl;
  }
  const host = process.env.REDIS_HOST?.trim();
  if (!host) return null;
  const port = process.env.REDIS_PORT?.trim() || '6379';
  if (password) return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  return `redis://${host}:${port}`;
}

const ALL_KEY = 'analyzed:all';
const DETAIL_PREFIX = 'analyzed:detail:';

async function listFromIndex(client, limit) {
  const members = await client.zRange(ALL_KEY, 0, limit - 1, { REV: true });
  const rows = [];
  for (const member of members) {
    const raw = await client.get(`${DETAIL_PREFIX}${member}`);
    if (!raw) continue;
    try {
      rows.push(JSON.parse(raw));
    } catch {
      /* skip */
    }
  }
  return rows;
}

async function fallbackScan(client, limit) {
  const rows = [];
  for await (const key of client.scanIterator({ MATCH: 'snapshot:*:*', COUNT: 100 })) {
    if (rows.length >= limit) break;
    const parts = String(key).split(':');
    if (parts.length < 3) continue;
    const domain = parts[1];
    const snapshotId = parts.slice(2).join(':');
    const raw = await client.get(key);
    if (!raw) continue;
    try {
      const snap = JSON.parse(raw);
      rows.push({
        domain,
        snapshotId,
        analyzedAt: snap.analyzedAt,
        announced: snap.privacy?.announced !== false,
        overallScore: snap.overallScore ?? 0,
        riskLevel: snap.riskLevel ?? 'low',
      });
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
  return rows.slice(0, limit);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = resolveRedisUrl();
  if (!url) {
    console.error('Redis is not configured (set REDIS_URL or REDIS_HOST).');
    process.exit(1);
  }

  const base =
    (opts.base ||
      process.env.PUBLIC_BASE_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:4000'
    ).replace(/\/$/, '');

  const client = createClient({ url, socket: { connectTimeout: 5000 } });
  client.on('error', (err) => console.error('Redis error:', err.message));
  await client.connect();

  try {
    let rows = await listFromIndex(client, opts.limit);
    if (rows.length === 0) {
      rows = await fallbackScan(client, opts.limit);
    }

    const enriched = [];
    for (const row of rows) {
      const cacheKey = `domain:${row.domain}:full`;
      const inCache = (await client.exists(cacheKey)) === 1;
      enriched.push({
        domain: row.domain,
        snapshotId: row.snapshotId,
        analyzedAt: row.analyzedAt,
        announced: row.announced !== false,
        inCache,
        overallScore: row.overallScore,
        riskLevel: row.riskLevel,
        analyzeUrl: `${base}/?domain=${encodeURIComponent(row.domain)}`,
        shareUrl: row.shareToken ? `${base}/share/${row.shareToken}` : null,
      });
    }

    if (opts.json) {
      console.log(JSON.stringify({ count: enriched.length, entries: enriched }, null, 2));
      return;
    }

    if (enriched.length === 0) {
      console.log('No analyzed domains found in Redis.');
      return;
    }

    console.log(
      `${'domain'.padEnd(28)} ${'analyzedAt'.padEnd(22)} ${'ann'.padEnd(4)} ${'cache'.padEnd(6)} ${'score'.padEnd(6)} links`
    );
    console.log('-'.repeat(100));
    for (const row of enriched) {
      const links = row.shareUrl
        ? `${row.analyzeUrl} | ${row.shareUrl}`
        : row.analyzeUrl;
      console.log(
        `${row.domain.padEnd(28).slice(0, 28)} ${String(row.analyzedAt).padEnd(22).slice(0, 22)} ${
          row.announced ? 'yes' : 'no '
        }  ${row.inCache ? 'yes' : 'no '}   ${String(row.overallScore ?? '').padEnd(6)} ${links}`
      );
    }
    console.log(`\n${enriched.length} row(s). Internal use only (localhost / docker exec).`);
  } finally {
    await client.quit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
