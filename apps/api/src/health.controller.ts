import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/security';
import { Database } from './database';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}
  @Get() @Public()
  async health() {
    try { await this.db.$queryRaw`SELECT 1`; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
    return { status: 'ok', checks: { api: 'ok', database: 'ok' } };
  }
}
