import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { internalOnly } from '@/middleware/internalOnly';
import { analyzedAllStore } from '@/services/cache/AnalyzedAllStore';

const router = Router();

router.use(internalOnly);

/**
 * GET /api/internal/analyzed — ops list of all analyses (incl. private).
 * Enabled only when INTERNAL_ANALYZED_LIST=1 and caller is loopback/Docker.
 */
router.get('/analyzed', async (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || '200'), 10);
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    process.env.FRONTEND_URL?.replace(/\/$/, '') ||
    'http://localhost:4000';

  try {
    const items = await analyzedAllStore.list(Number.isFinite(limit) ? limit : 200);
    const entries = items.map((item) => ({
      ...item,
      analyzeUrl: `${base}/?domain=${encodeURIComponent(item.domain)}`,
      shareUrl: item.shareToken ? `${base}/share/${item.shareToken}` : null,
    }));
    res.json({ count: entries.length, entries });
  } catch (error) {
    logger.error('Internal analyzed list failed:', error);
    res.status(500).json({
      error: 'Failed to list analyzed domains',
      code: 'INTERNAL_LIST_FAILED',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
