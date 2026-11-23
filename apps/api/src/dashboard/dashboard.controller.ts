import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActionError, dashboardFor, type MemberAccess } from '@pme/core';
import { ZodResponse } from 'nestjs-zod';

import { EventAccess, EventRoute } from '../events/event-access';
import { UuidPipe } from '../http/uuid.pipe';
import { DashboardCache } from './dashboard-cache';
import { DashboardDto } from './dashboard.dto';

/** GET E/dashboard (APIDesign "Dashboard"): the event home's numbers, filtered per member. */
@ApiTags('dashboard')
@Controller('events/:eventId')
export class DashboardController {
  constructor(private readonly cache: DashboardCache) {}

  /** Each section is null without its permission; sub-event scoped members see their scopes. */
  @Get('dashboard')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: DashboardDto })
  async dashboard(
    @Param('eventId', UuidPipe) eventId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const aggregate = await this.cache.aggregate(eventId);
    if (!aggregate) throw new ActionError('not_found', 'Event not found');
    return dashboardFor(aggregate, access, new Date());
  }
}
