import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, isDevelopment } from './config/env';
import { connectDatabase } from './config/database';
import { metricsCollector } from './services/metrics-collector';
import { emailService } from './services/email.service';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import routes from './routes';
import { logger } from './utils/logger';

async function bootstrap() {
  // Connect to database
  await connectDatabase();

  // Start metrics collector
  metricsCollector.start();

  // Start email cadence cron (every 5 minutes)
  const EMAIL_CRON_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const processed = await emailService.processCadenceQueue();
      if (processed > 0) {
        logger.info(`📧 [EmailCron] Processed ${processed} emails`);
      }
    } catch (error: any) {
      logger.error(`📧 [EmailCron] Error: ${error.message}`);
    }
  }, EMAIL_CRON_INTERVAL_MS);
  logger.info(`📧 Email cadence cron started (interval: ${EMAIL_CRON_INTERVAL_MS / 1000}s)`);

  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Security middlewares
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // CORS
  const corsOrigins = isDevelopment
    ? ['http://localhost:8080', 'http://localhost:5173', 'http://127.0.0.1:8080']
    : env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
      : [env.FRONTEND_URL];

  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Confirm-Password'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas requisições. Tente novamente mais tarde.',
      },
    },
  });
  app.use('/api', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  if (isDevelopment) {
    app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined,
      });
      next();
    });
  } else {
    // Production: log auth requests for diagnostics
    app.use('/api/auth', (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  // Health endpoint with build version
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env.BUILD_VERSION || 'dev',
      syncStrategy: 'create-or-update-v2',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes
  app.use('/api', routes);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Start server
  app.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT}`);
    logger.info(`📍 Environment: ${env.NODE_ENV}`);
    logger.info(`🔗 API URL: ${env.API_URL}`);
    logger.info(`🔄 Sync strategy: create-or-update-v2 (no upsert)`);
    logger.info(`📦 Build version: ${process.env.BUILD_VERSION || 'dev'}`);
    const gId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const gSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const gRedirect = (process.env.GOOGLE_REDIRECT_URI || '').trim();
    logger.info(`📅 Google Calendar env: clientId=${gId ? gId.substring(0, 8) + '...' : 'EMPTY'}, secret=${gSecret ? 'SET' : 'EMPTY'}, redirect=${gRedirect ? 'SET' : 'EMPTY'}`);
    const rapidKey = (process.env.RAPIDAPI_KEY || '').trim();
    logger.info(`🔑 RapidAPI key: ${rapidKey ? rapidKey.substring(0, 8) + '...' : 'EMPTY'} (env.RAPIDAPI_KEY=${env.RAPIDAPI_KEY ? 'SET' : 'EMPTY'})`);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
