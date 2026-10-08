import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { snapshotStore } from '@/services/cache/SnapshotStore';

const router = Router();

function isAnnounced(snapshot: { privacy?: { announced?: boolean } }): boolean {
  return snapshot.privacy?.announced !== false;
}

/**
 * @swagger
 * /api/history/{domain}:
 *   get:
 *     summary: List announced analysis snapshots for a domain
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Snapshot list (newest first, announced only); empty when Redis unavailable
 */
router.get('/:domain', async (req: Request, res: Response) => {
  const domain = String(req.params.domain || '').toLowerCase().trim();
  const limit = parseInt(String(req.query.limit || '50'), 10);

  if (!domain || domain.length > 253) {
    res.status(400).json({
      error: 'Invalid domain',
      code: 'INVALID_DOMAIN',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const fetchLimit = Math.min(
      Math.max(Number.isFinite(limit) ? limit : 50, 1) * 3,
      100
    );
    const all = await snapshotStore.list(domain, fetchLimit);
    const snapshots = all
      .filter(isAnnounced)
      .slice(0, Number.isFinite(limit) ? limit : 50);
    res.json({
      domain,
      count: snapshots.length,
      snapshots,
    });
  } catch (error) {
    logger.error('History list failed:', error);
    throw error;
  }
});

/**
 * @swagger
 * /api/history/{domain}/{id}:
 *   get:
 *     summary: Get a single announced analysis snapshot
 *     tags: [History]
 */
router.get('/:domain/:id', async (req: Request, res: Response) => {
  const domain = String(req.params.domain || '').toLowerCase().trim();
  const id = String(req.params.id || '').trim();

  if (!domain || !id) {
    res.status(400).json({
      error: 'Invalid domain or snapshot id',
      code: 'INVALID_REQUEST',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const snapshot = await snapshotStore.get(domain, id);
  if (!snapshot || !isAnnounced(snapshot)) {
    res.status(404).json({
      error: 'Snapshot not found',
      code: 'SNAPSHOT_NOT_FOUND',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json(snapshot);
});

export default router;
