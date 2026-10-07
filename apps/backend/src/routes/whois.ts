import { Router, Request, Response } from 'express';
import { validateDomain } from '@/middleware/validation';
import { logger } from '@/utils/logger';
import { DomainAnalysisService } from '@/services/DomainAnalysisService';

const router = Router();
const analysisService = new DomainAnalysisService();

/**
 * @swagger
 * /api/whois/{domain}:
 *   get:
 *     summary: WHOIS lookup
 *     description: Performs WHOIS lookup for the specified domain
 *     tags: [WHOIS]
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
 *         description: WHOIS information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 domain:
 *                   type: string
 *                 registrar:
 *                   type: object
 *                 registrant:
 *                   type: object
 *                 nameservers:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/:domain', validateDomain, async (req: Request, res: Response) => {
  const { domain } = req.params;

  logger.info(`WHOIS lookup for domain: ${domain}`, {
    domain,
    ip: req.ip,
  });

  try {
    const response = await analysisService.getWhoisData(domain);
    res.json(response);
  } catch (error) {
    logger.error('WHOIS lookup failed:', error);
    throw error;
  }
});

export default router;
