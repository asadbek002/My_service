import { CanActivate, ExecutionContext, HttpException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import type { Request } from 'express';

@Injectable()
export class LoginRateGuard implements CanActivate, OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
  async onModuleDestroy() { await this.redis.quit(); }
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const login = typeof req.body?.login === 'string' ? req.body.login.toLowerCase() : '';
    const keys = ['ip:' + req.ip, ...(login ? ['login:' + login] : [])];
    for (const key of keys) {
      let count: number;
      try {
        count = Number(await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
          1, 'auth-rate:' + createHash('sha256').update(key).digest('hex'),
        ));
      } catch { throw new ServiceUnavailableException('Authentication limiter unavailable'); }
      if (count > (key.startsWith('ip:') ? 60 : 15)) throw new HttpException('Too many attempts; try again later', 429);
    }
    return true;
  }
}
