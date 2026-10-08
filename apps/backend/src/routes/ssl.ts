import { Router, Request, Response } from 'express';
import { validateDomain } from '@/middleware/validation';
import { expensiveSiteVsScriptRateLimit } from '@/middleware/siteRateLimit';
import { sslService } from '@/services/ssl/SslService';
import { ctLookupService } from '@/services/ct/CtLookupService';

const router = Router();

router.use(expensiveSiteVsScriptRateLimit);

router.get('/:domain', validateDomain, async (req: Request, res: Response) => {
  const { domain } = req.params;
  const includeCt = req.query.includeCt === '1' || req.query.includeCt === 'true';
  const ssl = await sslService.probe(domain);
  let ct = null;
  if (includeCt) {
    ct = await ctLookupService.lookup(domain, true);
  }
  res.json({
    domain,
    ssl,
    ct,
    disclaimer:
      'Shared SANs / CT co-occurrence does not prove common ownership.',
  });
});

export default router;
