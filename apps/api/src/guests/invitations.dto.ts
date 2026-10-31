import {
  AttendanceQuerySchema,
  AttendanceSchema,
  BulkCreateInvitationsResultSchema,
  BulkCreateInvitationsSchema,
  BulkUpdateInvitationsSchema,
  CreateInvitationSchema,
  InvitationQuerySchema,
  InvitationSchema,
  InvitationShareSchema,
  listOf,
  UpdateAttendanceSchema,
  UpdateInvitationSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class InvitationDto extends createZodDto(InvitationSchema) {}
export class InvitationsDto extends createZodDto(listOf(InvitationSchema)) {}
export class InvitationQueryDto extends createZodDto(InvitationQuerySchema) {}
export class CreateInvitationDto extends createZodDto(CreateInvitationSchema) {}
export class BulkCreateInvitationsDto extends createZodDto(BulkCreateInvitationsSchema) {}
export class BulkCreateInvitationsResultDto extends createZodDto(
  BulkCreateInvitationsResultSchema,
) {}
export class UpdateInvitationDto extends createZodDto(UpdateInvitationSchema) {}
export class BulkUpdateInvitationsDto extends createZodDto(BulkUpdateInvitationsSchema) {}
export class BulkUpdateInvitationsResultDto extends createZodDto(
  z.object({ updated: z.array(InvitationSchema), missing: z.array(z.uuid()) }),
) {}
export class InvitationShareDto extends createZodDto(InvitationShareSchema) {}

export class AttendanceDto extends createZodDto(AttendanceSchema) {}
export class AttendanceListDto extends createZodDto(listOf(AttendanceSchema)) {}
export class AttendanceQueryDto extends createZodDto(AttendanceQuerySchema) {}
export class UpdateAttendanceDto extends createZodDto(UpdateAttendanceSchema) {}
