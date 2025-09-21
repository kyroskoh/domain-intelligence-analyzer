import { Router, Request, Response } from 'express';
import { validateDomain } from '@/middleware/validation';
import { logger } from '@/utils/logger';
import { DomainAnalysisService } from '@/services/DomainAnalysisService';
import { DomainAnalysisRequest } from '@/types/domain';

const router = Router();
const analysisService = new DomainAnalysisService();

/**
 * @swagger
 * /api/analyze/{domain}:
 *   get:
 *     summary: Comprehensive domain analysis
 *     description: Performs complete domain analysis including WHOIS, RDAP, DNS, and security evaluation
 *     tags: [Analysis]
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name to analyze
 *         example: example.com
 *       - in: query
 *         name: include
 *         schema:
 *           type: string
 *           enum: [whois, rdap, dns, security, all]
 *         description: Specific analysis types to include (comma-separated)
 *         example: whois,dns,security
 *     responses:
 *       200:
 *         description: Domain analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 domain:
 *                   type: string
 *                 analyzedAt:
 *                   type: string
 *                   format: date-time
 *                 meta:
 *                   type: object
 *                 whois:
 *                   type: object
 *                 rdap:
 *                   type: object
 *                 dns:
 *                   type: object
 *                 security:
 *                   type: object
 *       400:
 *         description: Invalid domain name
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/:domain', validateDomain, async (req: Request, res: Response) => {
  const { domain } = req.params;
  const include = req.query.include as string;
  
  logger.info(`Analyzing domain: ${domain}`, {
    domain,
    include: include || 'all',
    ip: req.ip,
  });

  try {
    // Parse include parameter to determine what analysis to perform
    const includeSet = new Set(include ? include.split(',').map(s => s.trim()) : ['all']);
    const includeAll = includeSet.has('all');
    
    const request: DomainAnalysisRequest = {
      domain,
      includeWhois: includeAll || includeSet.has('whois'),
      includeRdap: includeAll || includeSet.has('rdap'),
      includeDns: includeAll || includeSet.has('dns'),
      includeSecurityAnalysis: includeAll || includeSet.has('security'),
    };

    const response = await analysisService.analyzeDomain(request);
    res.json(response);
    
  } catch (error) {
    logger.error('Domain analysis failed:', error);
    throw error;
  }
});

export default router;