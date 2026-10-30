import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { can, subEventsWith } from '@pme/contracts';
import {
  ActionError,
  createTask,
  deleteTask,
  replaceTaskAssignees,
  runAction,
  updateTask,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MemberAccess,
} from '@pme/core';
import type { TaskQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { CurrentUser, type SessionUser } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import { EventAccess, EventContext, EventRoute } from '../events/event-access';
import { PermissionCache } from '../events/permission-cache';
import { whole } from '../events/events.dto';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import {
  CreateTaskDto,
  MyTasksDto,
  ReplaceAssigneesDto,
  TaskDto,
  TaskQueryDto,
  TasksDto,
  UpdateTaskDto,
} from './tasks.dto';
import { TASK_QUERIES } from './tasks.tokens';

/**
 * Tasks of one event (APIDesign "Planning"). The guard checks the permission somewhere in
 * the event ('list'); each core action checks it again for the task's own sub-event, and
 * reads filter to what the caller's scope covers.
 */
@ApiTags('tasks')
@Controller('events/:eventId/tasks')
export class TasksController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(TASK_QUERIES) private readonly queries: TaskQueries,
  ) {}

  /** Filters status, subEventId, assignee (member id), dueBefore, parentTaskId. */
  @Get()
  @EventRoute('tasks.view', 'list')
  @ZodResponse({ type: TasksDto })
  list(
    @Param('eventId', UuidPipe) eventId: string,
    @Query() query: TaskQueryDto,
    @EventAccess() access: MemberAccess,
  ) {
    return this.queries.list(eventId, query, subEventsWith(access, 'tasks.view'));
  }

  @Post()
  @EventRoute('tasks.edit', 'list')
  @ZodResponse({ status: 201, type: TaskDto })
  create(@EventContext() ctx: ActionContext, @Body() body: CreateTaskDto) {
    return runAction(this.runtime, ctx, createTask, body);
  }

  @Get(':taskId')
  @EventRoute('tasks.view', 'list')
  @ZodResponse({ type: TaskDto })
  async get(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('taskId', UuidPipe) taskId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const task = await this.queries.get(eventId, taskId);
    if (!task) throw new ActionError('not_found', 'Task not found');
    if (!can(access, 'tasks.view', task.subEventId)) {
      throw new ActionError('forbidden', 'You need the tasks.view permission', {
        permission: 'tasks.view',
      });
    }
    return task;
  }

  /**
   * Any member may ask: tasks.edit, or tasks.update_own for an assignee changing status or
   * position, is decided inside the action from the task and the body.
   */
  @Patch(':taskId')
  @EventRoute(null)
  @ZodResponse({ type: TaskDto })
  update(
    @EventContext() ctx: ActionContext,
    @Param('taskId', UuidPipe) taskId: string,
    @IfMatch() version: number,
    @Body() body: UpdateTaskDto,
  ) {
    return runAction(this.runtime, ctx, updateTask, {
      taskId,
      expectedVersion: version,
      changes: body,
    });
  }

  @Put(':taskId/assignees')
  @EventRoute('tasks.assign', 'list')
  @ZodResponse({ type: TaskDto })
  assign(
    @EventContext() ctx: ActionContext,
    @Param('taskId', UuidPipe) taskId: string,
    @IfMatch() version: number,
    @Body() body: ReplaceAssigneesDto,
  ) {
    return runAction(this.runtime, ctx, replaceTaskAssignees, {
      taskId,
      expectedVersion: version,
      memberIds: body.memberIds,
    });
  }

  @Delete(':taskId')
  @EventRoute('tasks.edit', 'list')
  @HttpCode(204)
  async delete(
    @EventContext() ctx: ActionContext,
    @Param('taskId', UuidPipe) taskId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteTask, { taskId, expectedVersion: version });
  }
}

/** GET /v1/me/tasks: my open tasks across events (APIDesign "Account"). */
@ApiTags('tasks')
@Controller('me/tasks')
export class MyTasksController {
  constructor(
    @Inject(TASK_QUERIES) private readonly queries: TaskQueries,
    private readonly permissions: PermissionCache,
  ) {}

  @Get()
  @ZodResponse({ type: MyTasksDto })
  async list(@CurrentUser() user: SessionUser) {
    const tasks = await this.queries.listMine(user.id);
    // Still assigned, but my roles may have changed since: keep what I can see now.
    const access = new Map<string, MemberAccess | null>();
    for (const eventId of new Set(tasks.map((task) => task.event.id))) {
      access.set(eventId, await this.permissions.forUser(eventId, user.id));
    }
    return whole(
      tasks.filter((task) => {
        const permissions = access.get(task.event.id);
        return permissions && can(permissions, 'tasks.view', task.subEventId);
      }),
    );
  }
}
