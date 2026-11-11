import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('health')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (default 120 requests per minute per IP and endpoint)',
})
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness and readiness check' })
  @ApiResponse({
    status: 200,
    description: 'API and database are healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        info: { type: 'object' },
        error: { type: 'object' },
        details: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'One or more health checks failed' })
  check() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 3000 })]);
  }
}
