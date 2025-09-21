import { Router, Request, Response } from 'express';
import { validateDomain } from '@/middleware/validation';
import { logger } from '@/utils/logger';
import { DomainAnalysisService } from '@/services/DomainAnalysisService';

const router = Router();
const analysisService = new DomainAnalysisService();

/**
 * @swagger
 * /api/dns/{domain}:
 *   get:
 *     summary: DNS record lookup
 *     description: Performs DNS record lookup for the specified domain
 *     tags: [DNS]
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name to lookup
 *         example: example.com
 *     responses:
 *       200:
 *         description: DNS records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 domain:
 *                   type: string
 *                 records:
 *                   type: object
 *                 nameservers:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/:domain', validateDomain, async (req: Request, res: Response) => {
  const { domain } = req.params;
  
  logger.info(`DNS lookup for domain: ${domain}`, {
    domain,
    ip: req.ip,
  });

  try {
    const response = await analysisService.getDnsData(domain);
    res.json(response);
  } catch (error) {
    logger.error('DNS lookup failed:', error);
    throw error;
  }
});

export default router;