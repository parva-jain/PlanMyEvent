import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';

import { HealthLiveDto, HealthReadyDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process is up. Never touches dependencies, so a slow database can't trigger restarts. */
  @Get('live')
  @ZodResponse({ type: HealthLiveDto })
  live() {
    return { status: 'ok' as const };
  }

  /** Postgres and Redis reachable and not shutting down; 503 otherwise. */
  @Get('ready')
  @ZodResponse({ type: HealthReadyDto })
  @ApiServiceUnavailableResponse({ type: HealthReadyDto.Output })
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.ready();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).setHeader('Retry-After', '5');
    }
    return result;
  }
}
