import { Router, Request, Response } from 'express';
import { entityRelationStore } from '@/services/cache/EntityRelationStore';
import { getGraphStatus } from '@/services/graph/GraphClient';

const router = Router();

const TYPE_TO_KIND: Record<string, string> = {
  ns: 'ns',
  nameserver: 'ns',
  registrar: 'registrar',
  cert: 'cert',
  asn: 'asn',
  prefix: 'prefix',
  rdap: 'entity',
  entity: 'entity',
  san: 'san',
};

router.get('/:type/:id', async (req: Request, res: Response) => {
  const type = String(req.params.type || '').toLowerCase();
  const id = decodeURIComponent(String(req.params.id || ''));
  const kind = TYPE_TO_KIND[type];
  if (!kind || !id) {
    res.status(400).json({ error: 'Invalid entity type or id' });
    return;
  }

  const { domains, source } = await entityRelationStore.list(kind, id, 50);
  res.json({
    type,
    id,
    kind,
    relatedDomains: domains,
    source,
    graph: getGraphStatus(),
    disclaimer:
      'Aggregated from analyses stored on this instance. Not a complete internet census.',
  });
});

export default router;
