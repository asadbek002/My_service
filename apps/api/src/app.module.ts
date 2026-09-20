import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { PlatformModule } from './platform/platform.module';
import { SettingsModule } from './management/settings.module';
import { ManagementModule } from './management/management.module';
import { LinksModule } from './notifications/links.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RepairsModule } from './repairs/repairs.module';
import { OrdersModule } from './orders/orders.module';
import { StaffModule } from './staff/staff.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate(config: Record<string, unknown>) {
        for (const key of ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'WEB_URL']) {
          if (typeof config[key] !== 'string' || !config[key]) throw new Error(key + ' is required');
        }
        if (config.NODE_ENV === 'production') {
          for (const key of ['S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY','S3_SECRET_KEY']) {
            if (typeof config[key] !== 'string' || !config[key]) throw new Error(key + ' is required in production');
          }
        }
        const secret = String(config.JWT_ACCESS_SECRET);
        if (secret.length < 32 || secret.startsWith('replace')) throw new Error('JWT_ACCESS_SECRET must be a random secret of at least 32 characters');
        return config;
      },
    }),
    DatabaseModule, AuthModule, StaffModule, OrdersModule, RepairsModule, LinksModule, NotificationsModule, ManagementModule, SettingsModule, PlatformModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
