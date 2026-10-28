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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, permissionArea } from '@pme/contracts';
import {
  ActionError,
  createMemberInvite,
  createRole,
  deleteRole,
  leaveEvent,
  removeMember,
  replaceMemberRoles,
  revokeMemberInvite,
  runAction,
  transferOwnership,
  updateRole,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import type { TeamQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { CurrentUser, type SessionUser } from '../auth/session';
import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { ACTION_RUNTIME } from '../database/database.module';
import { EventContext, EventRoute } from '../events/event-access';
import { whole } from '../events/events.dto';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import {
  CreatedMemberInviteDto,
  CreateMemberInviteDto,
  CreateRoleDto,
  MemberDto,
  MemberInvitesDto,
  MembersDto,
  MyMembershipDto,
  PermissionsDto,
  ReplaceMemberRolesDto,
  RoleDto,
  RolesDto,
  TransferOwnershipDto,
  UpdateRoleDto,
} from './team.dto';
import { TEAM_QUERIES } from './team.tokens';

const found = <T>(row: T | null, what: string): T => {
  if (!row) throw new ActionError('not_found', `${what} not found`);
  return row;
};

/** Members, roles and member invites of one event (APIDesign "Team and roles"). */
@ApiTags('team')
@Controller()
export class TeamController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(TEAM_QUERIES) private readonly queries: TeamQueries,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** The catalog for the role editor; labels are translation keys in the web app. */
  @Get('permissions')
  @ZodResponse({ type: PermissionsDto })
  permissions() {
    return whole(PERMISSIONS.map((key) => ({ key, area: permissionArea(key) })));
  }

  // ---- Me in this event ---------------------------------------------------------------------

  /** My member record and effective permissions, so the UI hides what I can't do. */
  @Get('events/:eventId/me')
  @EventRoute(null)
  @ZodResponse({ type: MyMembershipDto })
  async me(@Param('eventId', UuidPipe) eventId: string, @CurrentUser() user: SessionUser) {
    return found(await this.queries.myMembership(eventId, user.id), 'Event');
  }

  @Post('events/:eventId/leave')
  @EventRoute(null)
  @HttpCode(204)
  async leave(@EventContext() ctx: ActionContext) {
    await runAction(this.runtime, ctx, leaveEvent, undefined);
  }

  /** Owner only; checked in the action. */
  @Post('events/:eventId/transfer-ownership')
  @EventRoute(null)
  @HttpCode(200)
  @ZodResponse({ type: MemberDto })
  transfer(@EventContext() ctx: ActionContext, @Body() body: TransferOwnershipDto) {
    return runAction(this.runtime, ctx, transferOwnership, body);
  }

  // ---- Members ----------------------------------------------------------------------------

  @Get('events/:eventId/members')
  @EventRoute('members.view', 'list')
  @ZodResponse({ type: MembersDto })
  async members(@Param('eventId', UuidPipe) eventId: string) {
    return whole(await this.queries.listMembers(eventId));
  }

  @Get('events/:eventId/members/:memberId')
  @EventRoute('members.view', 'list')
  @ZodResponse({ type: MemberDto })
  async member(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('memberId', UuidPipe) memberId: string,
  ) {
    return found(await this.queries.getMember(eventId, memberId), 'Member');
  }

  @Put('events/:eventId/members/:memberId/roles')
  @EventRoute('members.manage')
  @ZodResponse({ type: MemberDto })
  replaceRoles(
    @EventContext() ctx: ActionContext,
    @Param('memberId', UuidPipe) memberId: string,
    @IfMatch() version: number,
    @Body() body: ReplaceMemberRolesDto,
  ) {
    return runAction(this.runtime, ctx, replaceMemberRoles, {
      memberId,
      expectedVersion: version,
      body,
    });
  }

  @Delete('events/:eventId/members/:memberId')
  @EventRoute('members.manage')
  @HttpCode(204)
  async remove(
    @EventContext() ctx: ActionContext,
    @Param('memberId', UuidPipe) memberId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, removeMember, { memberId, expectedVersion: version });
  }

  // ---- Roles ------------------------------------------------------------------------------

  @Get('events/:eventId/roles')
  @EventRoute('members.view', 'list')
  @ZodResponse({ type: RolesDto })
  async roles(@Param('eventId', UuidPipe) eventId: string) {
    return whole(await this.queries.listRoles(eventId));
  }

  @Post('events/:eventId/roles')
  @EventRoute('roles.manage')
  @ZodResponse({ status: 201, type: RoleDto })
  createRole(@EventContext() ctx: ActionContext, @Body() body: CreateRoleDto) {
    return runAction(this.runtime, ctx, createRole, body);
  }

  @Get('events/:eventId/roles/:roleId')
  @EventRoute('members.view', 'list')
  @ZodResponse({ type: RoleDto })
  async role(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('roleId', UuidPipe) roleId: string,
  ) {
    return found(await this.queries.getRole(eventId, roleId), 'Role');
  }

  @Patch('events/:eventId/roles/:roleId')
  @EventRoute('roles.manage')
  @ZodResponse({ type: RoleDto })
  updateRole(
    @EventContext() ctx: ActionContext,
    @Param('roleId', UuidPipe) roleId: string,
    @IfMatch() version: number,
    @Body() body: UpdateRoleDto,
  ) {
    return runAction(this.runtime, ctx, updateRole, {
      roleId,
      expectedVersion: version,
      changes: body,
    });
  }

  @Delete('events/:eventId/roles/:roleId')
  @EventRoute('roles.manage')
  @HttpCode(204)
  async deleteRole(
    @EventContext() ctx: ActionContext,
    @Param('roleId', UuidPipe) roleId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteRole, { roleId, expectedVersion: version });
  }

  // ---- Member invites ---------------------------------------------------------------------

  @Get('events/:eventId/member-invites')
  @EventRoute('members.manage')
  @ZodResponse({ type: MemberInvitesDto })
  async invites(@Param('eventId', UuidPipe) eventId: string) {
    return whole(await this.queries.listOpenInvites(eventId));
  }

  /** The response carries the link token once; only its hash is stored. */
  @Post('events/:eventId/member-invites')
  @EventRoute('members.manage')
  @ZodResponse({ status: 201, type: CreatedMemberInviteDto })
  createInvite(
    @EventContext() ctx: ActionContext,
    @CurrentUser() user: SessionUser,
    @Body() body: CreateMemberInviteDto,
  ) {
    return runAction(this.runtime, ctx, createMemberInvite, {
      body,
      linkBase: `${this.env.WEB_ORIGIN}/join/`,
      inviterName: user.name,
    });
  }

  @Delete('events/:eventId/member-invites/:inviteId')
  @EventRoute('members.manage')
  @HttpCode(204)
  async revokeInvite(
    @EventContext() ctx: ActionContext,
    @Param('inviteId', UuidPipe) inviteId: string,
  ) {
    await runAction(this.runtime, ctx, revokeMemberInvite, { inviteId });
  }
}
