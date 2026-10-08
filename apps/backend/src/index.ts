import 'module-alias/register';
import 'dotenv/config';
import 'express-async-errors';
import express, { Application } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import WebSocketService from '@/services/WebSocketService';
import { RdapService } from '@/services/rdap/RdapService';
import { WhoisService } from '@/services/whois/WhoisService';

import { errorHandler } from '@/middleware/errorHandler';
import { notFoundHandler } from '@/middleware/notFoundHandler';
import { apiKeyAuth } from '@/middleware/apiKeyAuth';
import { validateDomain } from '@/middleware/validation';
import { logger } from '@/utils/logger';

// Import routes
import analysisRoutes from '@/routes/analysis';
import dnsRoutes from '@/routes/dns';
import whoisRoutes from '@/routes/whois';
import rdapRoutes from '@/routes/rdap';
import healthRoutes from '@/routes/health';
import monitoringRoutes, { setWebSocketService } from '@/routes/monitoring';

const app: Application = express();
const server = createServer(app);
const PORT = process.env.PORT || 4001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize WebSocket service
const wsService = new WebSocketService(server);

// Inject WebSocket service into monitoring routes
setWebSocketService(wsService);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DomainPeek API',
      version: '1.0.0',
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

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: NODE_ENV === 'production',
}));

// CORS configuration
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

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
// When API_KEY is set, require API key (X-API-Key or Bearer) + X-Request-Nonce
app.use('/api/', apiKeyAuth);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
}

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DomainPeek API',
}));

// Health check
app.use('/health', healthRoutes);

// API routes
app.use('/api/analyze', analysisRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/whois', whoisRoutes);
app.use('/api/rdap', rdapRoutes);
app.use('/api/monitoring', monitoringRoutes);

// Serve API spec as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// WebSocket stats endpoint
app.get('/api/websocket/stats', (req, res) => {
  res.json(wsService.getStats());
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'DomainPeek API',
    version: '1.0.0',
    docs: '/docs',
    health: '/health',
    websocket: '/api/websocket/stats',
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Warm IANA RDAP bootstrap + WHOIS TLD list (all gTLDs / ccTLDs) before accepting traffic
const rdapBootstrapService = new RdapService();
const whoisBootstrapService = new WhoisService();

async function startServer(): Promise<void> {
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

void startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;