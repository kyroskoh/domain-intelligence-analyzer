import { Router, Request, Response } from 'express';
import { entityRelationStore } from '@/services/cache/EntityRelationStore';
import { logger } from '@/utils/logger';
import { getGraphStatus } from '@/services/graph/GraphClient';

const router = Router();

const KINDS = new Set([
  'nameserver',
  'ns',
  'registrar',
  'cert',
  'san',
  'asn',
  'prefix',
  'entity',
]);

function normalizeKind(kind: string): string {
  if (kind === 'nameserver') return 'ns';
  return kind;
}

router.get('/:kind/:id', async (req: Request, res: Response) => {
  const kind = normalizeKind(String(req.params.kind || '').toLowerCase());
  const id = decodeURIComponent(String(req.params.id || ''));
  if (!KINDS.has(kind) && !KINDS.has(req.params.kind)) {
    res.status(400).json({ error: 'Invalid relation kind', code: 'INVALID_KIND' });
    return;
  }
  if (!id) {
    res.status(400).json({ error: 'Missing id', code: 'INVALID_ID' });
    return;
  }

  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
  logger.debug('Relation lookup', { kind, id, ip: req.ip });

  const result = await entityRelationStore.list(kind, id, limit);
  res.json({
    kind,
    id,
    domains: result.domains,
    source: result.source,
    graph: getGraphStatus(),
    disclaimer:
      'Related domains are from prior analyses on this instance. Co-occurrence ≠ ownership.',
  });
});

export default router;
