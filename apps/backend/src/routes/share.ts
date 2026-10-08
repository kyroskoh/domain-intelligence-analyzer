import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { shareStore } from '@/services/cache/ShareStore';
import { isRedisConfigured, getRedisClient } from '@/services/cache/redisClient';

const router = Router();

function redisUnavailable(res: Response): void {
  res.status(503).json({
    error: 'Share links require Redis',
    code: 'REDIS_UNAVAILABLE',
    timestamp: new Date().toISOString(),
  });
}

/**
 * @swagger
 * /api/share:
 *   post:
 *     summary: Create a temporary shareable link for a domain analysis snapshot
 *     tags: [Share]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [domain]
 *             properties:
 *               domain:
 *                 type: string
 *               snapshotId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Share token created
 *       404:
 *         description: No snapshot available for domain
 *       503:
 *         description: Redis unavailable
 */
router.post('/', async (req: Request, res: Response) => {
  if (!isRedisConfigured() || !getRedisClient()?.isOpen) {
    redisUnavailable(res);
    return;
  }

  const domain = String(req.body?.domain || '').toLowerCase().trim();
  const snapshotId =
    typeof req.body?.snapshotId === 'string' ? req.body.snapshotId.trim() : undefined;

  if (!domain || domain.length > 253) {
    res.status(400).json({
      error: 'Invalid domain',
      code: 'INVALID_DOMAIN',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const created = await shareStore.create(domain, snapshotId);
    if (!created) {
      res.status(404).json({
        error: 'No analysis snapshot found for domain. Run /api/analyze first.',
        code: 'SNAPSHOT_NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(201).json({
      token: created.token,
      path: created.urlPath,
      expiresAt: created.expiresAt,
      domain: created.snapshot.domain,
      snapshotId: created.snapshot.id,
    });
  } catch (error) {
    logger.error('Share create failed:', error);
    throw error;
  }
});

/**
 * @swagger
 * /api/share/{token}:
 *   get:
 *     summary: Resolve a temporary share token to a snapshot
 *     tags: [Share]
 */
router.get('/:token', async (req: Request, res: Response) => {
  if (!isRedisConfigured() || !getRedisClient()?.isOpen) {
    redisUnavailable(res);
    return;
  }

  const token = String(req.params.token || '').trim();
  if (!token || token.length > 128) {
    res.status(400).json({
      error: 'Invalid share token',
      code: 'INVALID_TOKEN',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const resolved = await shareStore.resolve(token);
    if (!resolved) {
      res.status(404).json({
        error: 'Share link not found or expired',
        code: 'SHARE_NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      token: resolved.record.token,
      domain: resolved.record.domain,
      expiresAt: resolved.record.expiresAt,
      snapshot: resolved.snapshot,
    });
  } catch (error) {
    logger.error('Share resolve failed:', error);
    throw error;
  }
});

export default router;
