import express, { Request, Response } from 'express';
import { validateDomain } from '@/middleware/validation';
import { logger } from '@/utils/logger';

const router = express.Router();

// This will be injected by the main app
let wsService: any = null;

export const setWebSocketService = (service: any) => {
  wsService = service;
};

/**
 * @swagger
 * /api/monitoring/dns/start:
 *   post:
 *     summary: Start DNS monitoring for a domain
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Domain name to monitor
 *               options:
 *                 type: object
 *                 properties:
 *                   checkInterval:
 *                     type: number
 *                     description: Check interval in milliseconds
 *                   alertThresholds:
 *                     type: object
 *                     properties:
 *                       ttlWarning:
 *                         type: number
 *                         description: TTL warning threshold in seconds
 *                       criticalChanges:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: DNS record types that trigger critical alerts
 *     responses:
 *       200:
 *         description: DNS monitoring started successfully
 *       400:
 *         description: Invalid domain name
 *       500:
 *         description: Server error
 */
router.post('/dns/start', validateDomain, async (req: Request, res: Response) => {
  try {
    const { domain, options = {} } = req.body;

    if (!wsService) {
      return res.status(500).json({ 
        error: 'WebSocket service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const dnsService = wsService.getDnsMonitoringService();
    const success = dnsService.startMonitoring(domain, options);

    if (success) {
      logger.info(`Started DNS monitoring for domain: ${domain}`);
      res.json({
        success: true,
        domain,
        message: 'DNS monitoring started',
        timestamp: new Date(),
      });
    } else {
      res.status(400).json({
        error: 'Failed to start DNS monitoring',
        code: 'MONITORING_START_FAILED',
        domain,
      });
    }
  } catch (error) {
    logger.error('DNS monitoring start error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/monitoring/dns/stop:
 *   post:
 *     summary: Stop DNS monitoring for a domain
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Domain name to stop monitoring
 *     responses:
 *       200:
 *         description: DNS monitoring stopped successfully
 *       400:
 *         description: Invalid domain name
 *       500:
 *         description: Server error
 */
router.post('/dns/stop', validateDomain, async (req: Request, res: Response) => {
  try {
    const { domain } = req.body;

    if (!wsService) {
      return res.status(500).json({ 
        error: 'WebSocket service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const dnsService = wsService.getDnsMonitoringService();
    const success = dnsService.stopMonitoring(domain);

    if (success) {
      logger.info(`Stopped DNS monitoring for domain: ${domain}`);
      res.json({
        success: true,
        domain,
        message: 'DNS monitoring stopped',
        timestamp: new Date(),
      });
    } else {
      res.status(400).json({
        error: 'Failed to stop DNS monitoring',
        code: 'MONITORING_STOP_FAILED',
        domain,
      });
    }
  } catch (error) {
    logger.error('DNS monitoring stop error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/monitoring/dns/status/{domain}:
 *   get:
 *     summary: Get DNS monitoring status for a domain
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name
 *     responses:
 *       200:
 *         description: DNS monitoring status
 *       404:
 *         description: Domain not being monitored
 *       500:
 *         description: Server error
 */
router.get('/dns/status/:domain', async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;

    if (!wsService) {
      return res.status(500).json({ 
        error: 'WebSocket service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const status = wsService.getDomainDnsStatus(domain);

    if (status) {
      res.json({
        success: true,
        status,
        timestamp: new Date(),
      });
    } else {
      res.status(404).json({
        error: 'Domain not being monitored',
        code: 'DOMAIN_NOT_MONITORED',
        domain,
      });
    }
  } catch (error) {
    logger.error('DNS monitoring status error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/monitoring/dns/list:
 *   get:
 *     summary: List all monitored domains
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: List of monitored domains
 *       500:
 *         description: Server error
 */
router.get('/dns/list', async (req: Request, res: Response) => {
  try {
    if (!wsService) {
      return res.status(500).json({ 
        error: 'WebSocket service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const dnsService = wsService.getDnsMonitoringService();
    const monitoredDomains = dnsService.getMonitoredDomains();

    res.json({
      success: true,
      domains: monitoredDomains,
      count: monitoredDomains.length,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('DNS monitoring list error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/monitoring/stats:
 *   get:
 *     summary: Get real-time monitoring statistics
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Monitoring statistics
 *       500:
 *         description: Server error
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!wsService) {
      return res.status(500).json({ 
        error: 'WebSocket service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const stats = wsService.getStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Monitoring stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/monitoring/websocket/stats:
 *   get:
 *     summary: Get WebSocket connection statistics
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: WebSocket statistics
 *       500:
 *         description: Server error
 */
router.get('/websocket/stats', async (req: Request, res: Response) => {
  try {
    if (!wsService) {
      return res.status(500).json({ 
        error: 'WebSocket service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const stats = wsService.getStats();

    res.json({
      success: true,
      websocketStats: {
        connectedClients: stats.connectedClients,
        monitoredDomains: stats.monitoredDomains,
        activeSubscriptions: stats.activeSubscriptions,
      },
      dnsMonitoring: stats.dnsMonitoring,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('WebSocket stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

export default router;