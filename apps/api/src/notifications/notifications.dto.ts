import {
  MarkNotificationsReadResultSchema,
  MarkNotificationsReadSchema,
  NotificationPageSchema,
  NotificationQuerySchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class NotificationPageDto extends createZodDto(NotificationPageSchema) {}
export class NotificationQueryDto extends createZodDto(NotificationQuerySchema) {}
export class MarkNotificationsReadDto extends createZodDto(MarkNotificationsReadSchema) {}
export class MarkNotificationsReadResultDto extends createZodDto(
  MarkNotificationsReadResultSchema,
) {}
