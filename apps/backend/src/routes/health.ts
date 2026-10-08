import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { isRedisConfigured, pingRedis } from '@/services/cache/redisClient';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    redis?: 'connected' | 'disconnected' | 'unavailable';
    dns?: 'operational' | 'degraded' | 'down';
    whois?: 'operational' | 'degraded' | 'down';
    graph?: 'up' | 'down' | 'disabled';
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: string;
    };
  };
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Get application health status
 *     description: Returns the current health status of the application and its dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Application uptime in seconds
 *                 version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 services:
 *                   type: object
 *                   properties:
 *                     redis:
 *                       type: string
 *                       enum: [connected, disconnected, unavailable]
 *                     dns:
 *                       type: string
 *                       enum: [operational, degraded, down]
 *                     whois:
 *                       type: string
 *                       enum: [operational, degraded, down]
 *                 system:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                       properties:
 *                         used:
 *                           type: number
 *                         total:
 *                           type: number
 *                         percentage:
 *                           type: number
 *                     cpu:
 *                       type: object
 *                       properties:
 *                         usage:
 *                           type: string
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Get system memory information
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const memoryPercentage = Math.round((usedMemory / totalMemory) * 100);

    // Basic CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuPercentage = Math.round(((cpuUsage.user + cpuUsage.system) / 1000000) * 100) / 100;

    // Check service statuses
    const { getGraphStatus } = await import('@/services/graph/GraphClient');
    const services = {
      redis: await checkRedisHealth(),
      dns: await checkDnsHealth(),
      whois: await checkWhoisHealth(),
      graph: getGraphStatus(),
    };

    // Determine overall health status (graph disabled is OK; graph down is degraded)
    let overallStatus: HealthStatus['status'] = 'healthy';
    if (
      services.dns === 'down' ||
      services.redis === 'disconnected'
    ) {
      overallStatus = 'unhealthy';
    } else if (
      services.dns === 'degraded' ||
      services.whois === 'degraded' ||
      services.whois === 'down' ||
      services.graph === 'down'
    ) {
      overallStatus = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.2.0',
      environment: process.env.NODE_ENV || 'development',
      services,
      system: {
        memory: {
          used: Math.round(usedMemory / 1024 / 1024), // MB
          total: Math.round(totalMemory / 1024 / 1024), // MB
          percentage: memoryPercentage,
        },
        cpu: {
          usage: `${cpuPercentage}%`,
        },
      },
    };

    const responseTime = Date.now() - startTime;
    res.set('X-Response-Time', `${responseTime}ms`);
    
    // Return appropriate HTTP status based on health
    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * @swagger
 * /health/liveness:
 *   get:
 *     summary: Liveness probe
 *     description: Simple liveness check for Kubernetes/container orchestration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "alive"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/liveness', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /health/readiness:
 *   get:
 *     summary: Readiness probe
 *     description: Readiness check for Kubernetes/container orchestration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ready"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Application is not ready
 */
router.get('/readiness', async (req: Request, res: Response) => {
  try {
    // Perform basic readiness checks
    const isReady = await performReadinessChecks();
    
    if (isReady) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

// Helper functions
async function checkRedisHealth(): Promise<'connected' | 'disconnected' | 'unavailable'> {
  try {
    if (!isRedisConfigured()) {
      return 'unavailable';
    }

    const ok = await pingRedis();
    return ok ? 'connected' : 'disconnected';
  } catch (error) {
    logger.warn('Redis health check failed:', error);
    return 'disconnected';
  }
}

async function checkDnsHealth(): Promise<'operational' | 'degraded' | 'down'> {
  try {
    // Simple DNS resolution test
    const dns = require('dns').promises;
    await dns.resolve4('google.com');
    return 'operational';
  } catch (error) {
    logger.warn('DNS health check failed:', error);
    return 'down';
  }
}

async function checkWhoisHealth(): Promise<'operational' | 'degraded' | 'down'> {
  try {
    const net = await import('net');
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: 'whois.iana.org', port: 43 }, () => {
        socket.end();
        resolve();
      });
      socket.setTimeout(4000, () => {
        socket.destroy();
        reject(new Error('WHOIS port43 timeout'));
      });
      socket.on('error', reject);
    });
    return 'operational';
  } catch (error) {
    logger.warn('WHOIS health check failed:', error);
    return 'degraded';
  }
}

async function performReadinessChecks(): Promise<boolean> {
  try {
    // Check if essential services are available
    const dnsStatus = await checkDnsHealth();
    
    // Application is ready if DNS is at least functional
    return dnsStatus !== 'down';
  } catch (error) {
    logger.error('Readiness check failed:', error);
    return false;
  }
}

export default router;