import {
  AcceptedMemberInviteSchema,
  CreatedMemberInviteSchema,
  CreateMemberInviteSchema,
  CreateRoleSchema,
  listOf,
  MemberInvitePreviewSchema,
  MemberInviteSchema,
  MemberSchema,
  MyMembershipSchema,
  PermissionInfoSchema,
  ReplaceMemberRolesSchema,
  RoleSchema,
  TransferOwnershipSchema,
  UpdateRoleSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class MemberDto extends createZodDto(MemberSchema) {}
export class MembersDto extends createZodDto(listOf(MemberSchema)) {}
export class MyMembershipDto extends createZodDto(MyMembershipSchema) {}
export class ReplaceMemberRolesDto extends createZodDto(ReplaceMemberRolesSchema) {}
export class TransferOwnershipDto extends createZodDto(TransferOwnershipSchema) {}

export class RoleDto extends createZodDto(RoleSchema) {}
export class RolesDto extends createZodDto(listOf(RoleSchema)) {}
export class CreateRoleDto extends createZodDto(CreateRoleSchema) {}
export class UpdateRoleDto extends createZodDto(UpdateRoleSchema) {}
export class PermissionsDto extends createZodDto(listOf(PermissionInfoSchema)) {}

export class MemberInviteDto extends createZodDto(MemberInviteSchema) {}
export class MemberInvitesDto extends createZodDto(listOf(MemberInviteSchema)) {}
export class CreatedMemberInviteDto extends createZodDto(CreatedMemberInviteSchema) {}
export class CreateMemberInviteDto extends createZodDto(CreateMemberInviteSchema) {}
export class MemberInvitePreviewDto extends createZodDto(MemberInvitePreviewSchema) {}
export class AcceptedMemberInviteDto extends createZodDto(AcceptedMemberInviteSchema) {}
