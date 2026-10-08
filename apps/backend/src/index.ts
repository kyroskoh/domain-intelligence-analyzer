import 'module-alias/register';
import 'dotenv/config';
import 'express-async-errors';
import express, { Application } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import WebSocketService from '@/services/WebSocketService';
import { RdapService } from '@/services/rdap/RdapService';
import { WhoisService } from '@/services/whois/WhoisService';
import {
  connectRedis,
  disconnectRedis,
} from '@/services/cache/redisClient';
import { connectGraph, disconnectGraph } from '@/services/graph/GraphClient';

import { errorHandler } from '@/middleware/errorHandler';
import { notFoundHandler } from '@/middleware/notFoundHandler';
import { apiKeyAuth } from '@/middleware/apiKeyAuth';
import { siteVsScriptRateLimit } from '@/middleware/siteRateLimit';
import { logger } from '@/utils/logger';

import analysisRoutes from '@/routes/analysis';
import dnsRoutes from '@/routes/dns';
import whoisRoutes from '@/routes/whois';
import rdapRoutes from '@/routes/rdap';
import healthRoutes from '@/routes/health';
import historyRoutes from '@/routes/history';
import shareRoutes from '@/routes/share';
import recentRoutes from '@/routes/recent';
import internalRoutes from '@/routes/internal';
import sslRoutes from '@/routes/ssl';
import relationsRoutes from '@/routes/relations';
import clientEnvRoutes from '@/routes/clientEnv';
import entityRoutes from '@/routes/entity';
import monitoringWatchRoutes from '@/routes/monitoringWatch';
import monitoringRoutes, { setWebSocketService } from '@/routes/monitoring';

const app: Application = express();
const server = createServer(app);
const PORT = process.env.PORT || 4001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const wsService = new WebSocketService(server);
setWebSocketService(wsService);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DomainPeek API',
      version: '1.3.0',
      description: 'Comprehensive domain analysis API providing WHOIS, RDAP, DNS, and security insights',
    },
    servers: [
      {
        url: process.env.API_BASE_URL || `http://localhost:${PORT}`,
        description: NODE_ENV === 'development' ? 'Development server' : 'Production server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            code: {
              type: 'string',
              description: 'Error code',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp',
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

function setupMiddleware(): void {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: NODE_ENV === 'production',
  }));

  app.use(cors({
    origin: (process.env.CORS_ORIGINS?.split(',') || ['http://localhost:4000']).map((o) => o.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-API-Key',
      'X-Request-Nonce',
    ],
  }));

  app.use('/api/', siteVsScriptRateLimit);
  app.use('/api/', apiKeyAuth);
  logger.info('Express rate limiting using site vs script budgets');

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (NODE_ENV !== 'test') {
    app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
  }

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'DomainPeek API',
  }));

  app.use('/health', healthRoutes);

  app.use('/api/analyze', analysisRoutes);
  app.use('/api/dns', dnsRoutes);
  app.use('/api/whois', whoisRoutes);
  app.use('/api/rdap', rdapRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/share', shareRoutes);
  app.use('/api/recent', recentRoutes);
  app.use('/api/internal', internalRoutes);
  app.use('/api/ssl', sslRoutes);
  app.use('/api/relations', relationsRoutes);
  app.use('/api/client-env', clientEnvRoutes);
  app.use('/api/entity', entityRoutes);
  app.use('/api/monitoring', monitoringRoutes);
  app.use('/api/monitoring', monitoringWatchRoutes);

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  app.get('/api/websocket/stats', (req, res) => {
    res.json(wsService.getStats());
  });

  app.get('/', (req, res) => {
    res.json({
      message: 'DomainPeek API',
      version: '1.3.0',
      docs: '/docs',
      health: '/health',
      history: '/api/history/:domain',
      share: '/api/share',
      recent: '/api/recent',
      ssl: '/api/ssl/:domain',
      relations: '/api/relations/:kind/:id',
      entity: '/api/entity/:type/:id',
      clientEnv: '/api/client-env',
      websocket: '/api/websocket/stats',
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
}

const rdapBootstrapService = new RdapService();
const whoisBootstrapService = new WhoisService();

async function startServer(): Promise<void> {
  try {
    const redis = await connectRedis();
    if (redis?.isOpen) {
      logger.info('Redis client ready');
    }
  } catch (error) {
    logger.warn('Redis connect failed; continuing with memory fallback:', error);
  }

  try {
    await connectGraph();
  } catch (error) {
    logger.warn('Graph connect failed; Redis relation fallback active:', error);
  }

  setupMiddleware();

  try {
    await rdapBootstrapService.ensureReady();
    logger.info(`RDAP bootstrap ready (${rdapBootstrapService.getBootstrapSize()} TLDs)`);
  } catch (error) {
    logger.warn('RDAP bootstrap warm-up failed; using fallback seed:', error);
  }

  try {
    const tlds = await whoisBootstrapService.getAllTlds();
    logger.info(`WHOIS IANA TLD list ready (${tlds.length} TLDs)`);
  } catch (error) {
    logger.warn('WHOIS TLD list warm-up failed:', error);
  }

  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
    logger.info(`API Documentation available at http://localhost:${PORT}/docs`);
    logger.info(`WebSocket service available at ws://localhost:${PORT}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} signal received: closing HTTP server`);
  server.close(async () => {
    logger.info('HTTP server closed');
    await disconnectGraph();
    await disconnectRedis();
    process.exit(0);
  });
}

void startServer();

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

export default app;
