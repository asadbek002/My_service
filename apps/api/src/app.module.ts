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
import { OrdersModule } from './orders/orders.module';
import { StaffModule } from './staff/staff.module';
import { PartsModule } from './parts/parts.module';
import { BotModule } from './bot/bot.module';
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
        const secret = String(config.JWT_ACCESS_SECRET);
        if (secret.length < 32 || secret.startsWith('replace')) throw new Error('JWT_ACCESS_SECRET must be a random secret of at least 32 characters');
        return config;
      },
    }),
    DatabaseModule, AuthModule, StaffModule, OrdersModule, PartsModule, BotModule, LinksModule, NotificationsModule, ManagementModule, SettingsModule, PlatformModule, DocumentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
