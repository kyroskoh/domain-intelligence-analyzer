import neo4j, { Driver, Session } from 'neo4j-driver';
import { logger } from '@/utils/logger';

let driver: Driver | null = null;
let disabledLogged = false;

export function isGraphEnabled(): boolean {
  const flag = (process.env.GRAPH_ENABLED || '').toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  return Boolean(process.env.GRAPH_BOLT_URL || process.env.NEO4J_URI);
}

export function getGraphStatus(): 'up' | 'down' | 'disabled' {
  if (!isGraphEnabled()) return 'disabled';
  if (!driver) return 'down';
  return 'up';
}

export async function connectGraph(): Promise<Driver | null> {
  if (!isGraphEnabled()) {
    if (!disabledLogged) {
      logger.info('Graph DB disabled (set GRAPH_BOLT_URL / GRAPH_ENABLED to enable Memgraph)');
      disabledLogged = true;
    }
    return null;
  }

  if (driver) return driver;

  const uri = process.env.GRAPH_BOLT_URL || process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.GRAPH_USER || process.env.NEO4J_USER || '';
  const password = process.env.GRAPH_PASSWORD || process.env.NEO4J_PASSWORD || '';

  try {
    driver = neo4j.driver(
      uri,
      user || password ? neo4j.auth.basic(user, password) : undefined,
      { disableLosslessIntegers: true }
    );
    await driver.verifyConnectivity();
    logger.info(`Memgraph/Bolt connected at ${uri}`);
    return driver;
  } catch (error) {
    logger.warn('Graph DB connect failed; Redis relation fallback will be used:', error);
    try {
      await driver?.close();
    } catch {
      /* ignore */
    }
    driver = null;
    return null;
  }
}

export async function disconnectGraph(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function withGraphSession<T>(
  fn: (session: Session) => Promise<T>
): Promise<T | null> {
  const d = driver ?? (await connectGraph());
  if (!d) return null;
  const session = d.session();
  try {
    return await fn(session);
  } catch (error) {
    logger.warn('Graph session error:', error);
    return null;
  } finally {
    await session.close();
  }
}

export async function runCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const rows = await withGraphSession(async (session) => {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  });
  return rows || [];
}
