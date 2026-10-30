import { ActivityPageSchema, ActivityQuerySchema, UndoResultSchema } from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class ActivityPageDto extends createZodDto(ActivityPageSchema) {}
export class ActivityQueryDto extends createZodDto(ActivityQuerySchema) {}
export class UndoResultDto extends createZodDto(UndoResultSchema) {}
