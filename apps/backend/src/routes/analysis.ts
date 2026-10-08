import { Router, Request, Response } from 'express';
import { validateDomain } from '@/middleware/validation';
import { expensiveSiteVsScriptRateLimit } from '@/middleware/siteRateLimit';
import { logger } from '@/utils/logger';
import { DomainAnalysisService } from '@/services/DomainAnalysisService';
import { DomainAnalysisRequest } from '@/types/domain';

const router = Router();
const analysisService = new DomainAnalysisService();

const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

router.use(expensiveSiteVsScriptRateLimit);

/**
 * POST /api/analyze/bulk — capped multi-domain analyze (scripts need API key / tight limit).
 */
router.post('/bulk', async (req: Request, res: Response) => {
  const domains = Array.isArray(req.body?.domains) ? req.body.domains : [];
  const max = parseInt(process.env.BULK_ANALYZE_MAX || '15', 10);
  const list = domains
    .map((d: unknown) => String(d || '').trim().toLowerCase())
    .filter((d: string) => DOMAIN_REGEX.test(d))
    .slice(0, max);

  if (list.length === 0) {
    res.status(400).json({ error: 'No valid domains provided', code: 'INVALID_BULK' });
    return;
  }

  const includeCt = Boolean(req.body?.includeCt);
  const results = [];
  for (const domain of list) {
    try {
      const response = await analysisService.analyzeDomain({
        domain,
        includeCt,
      });
      results.push({ domain, ok: true, overallScore: response.security?.overallScore });
    } catch (error) {
      results.push({
        domain,
        ok: false,
        error: (error as Error).message,
      });
    }
  }

  res.json({ count: results.length, results });
});

router.get('/:domain', validateDomain, async (req: Request, res: Response) => {
  const { domain } = req.params;
  const include = req.query.include as string;
  const includeCt =
    req.query.includeCt === '1' || req.query.includeCt === 'true';

  logger.info(`Analyzing domain: ${domain}`, {
    domain,
    include: include || 'all',
    includeCt,
    ip: req.ip,
  });

  try {
    const includeSet = new Set(
      include ? include.split(',').map((s) => s.trim()) : ['all']
    );
    const includeAll = includeSet.has('all');

    const request: DomainAnalysisRequest = {
      domain,
      includeWhois: includeAll || includeSet.has('whois'),
      includeRdap: includeAll || includeSet.has('rdap'),
      includeDns: includeAll || includeSet.has('dns'),
      includeSecurityAnalysis: includeAll || includeSet.has('security'),
      includeSsl: includeAll || includeSet.has('ssl'),
      includeGeo: includeAll || includeSet.has('geo'),
      includeDkim: includeAll || includeSet.has('dkim'),
      includeCt,
    };

    const response = await analysisService.analyzeDomain(request);
    res.json(response);
  } catch (error) {
    logger.error('Domain analysis failed:', error);
    throw error;
  }
});

export default router;
