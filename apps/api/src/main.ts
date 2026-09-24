import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Express, NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { allowedOrigins } from './auth/security';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // Behind host nginx: take the client IP from X-Forwarded-For (one proxy hop) for rate limits and audit logs.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID(); const started = Date.now(); res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => console.log(JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', event: 'http_request', requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started, ip: req.ip, timestamp: new Date().toISOString() })));
    next();
  });
  app.enableCors({ origin: allowedOrigins(), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const spec = new DocumentBuilder().setTitle('MyService API').setVersion('0.2').addBearerAuth().build();
  if (process.env.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, spec));
  await app.listen(Number(process.env.PORT ?? 3001));
}
void bootstrap();
