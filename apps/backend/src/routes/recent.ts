import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { recentAnalysisStore } from '@/services/cache/RecentAnalysisStore';

const router = Router();

/**
 * @swagger
 * /api/recent:
 *   get:
 *     summary: List last announced domain analyses (unique domains, newest first)
 *     tags: [Recent]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Recent announced analyses; empty when Redis unavailable
 */
router.get('/', async (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || '50'), 10);

  try {
    const entries = await recentAnalysisStore.list(
      Number.isFinite(limit) ? limit : 50
    );
    res.json({
      count: entries.length,
      entries,
    });
  } catch (error) {
    logger.error('Recent list failed:', error);
    res.json({ count: 0, entries: [] });
  }
});

export default router;
