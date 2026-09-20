import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API process health check' })
  getHealth() {
    return {
      status: 'ok',
      service: 'myservice-api',
      timestamp: new Date().toISOString(),
    };
  }
}
