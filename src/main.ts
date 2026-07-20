import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3000;
const DEFAULT_JSON_LIMIT = '50kb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';
  const logger = new Logger('Bootstrap');

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // ── Security headers ───────────────────────────────────────────────────────
  // Helmet sets HSTS, X-Frame-Options, X-Content-Type-Options, etc.
  // In non-production we keep Swagger working with a relaxed CSP.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: isProduction ? undefined : false,
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

  // ── Global validation pipe ─────────────────────────────────────────────────
  // whitelist strips unknown fields, transform enables type coercion,
  // forbidNonWhitelisted rejects unexpected keys (helps prevent mass-assignment).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ── Body size limit ────────────────────────────────────────────────────────
  // Prevents large payloads from reaching controllers / DTO validation.
  const jsonLimit = configService.get<string>('JSON_BODY_LIMIT') ?? DEFAULT_JSON_LIMIT;
  app.useBodyParser('json', { limit: jsonLimit });

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Production requires an explicit origin; '*' is rejected.
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (isProduction && (!corsOrigin || corsOrigin === '*')) {
    logger.error('CORS_ORIGIN must be set to a specific origin in production (e.g. https://your-app.expo.app).');
    process.exit(1);
  }

  app.enableCors({
    origin: corsOrigin ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  // ── Swagger ────────────────────────────────────────────────────────────────
  // Expose Swagger only in non-production environments.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Puente Radar API')
      .setDescription('API para monitoreo de tiempos de espera en puentes fronterizos')
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT') ?? DEFAULT_PORT;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
