import {
  CreateUploadSchema,
  MediaPageSchema,
  MediaQuerySchema,
  MediaSchema,
  MediaUrlSchema,
  UpdateMediaSchema,
  UploadTicketSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateUploadDto extends createZodDto(CreateUploadSchema) {}
export class UploadTicketDto extends createZodDto(UploadTicketSchema) {}
export class MediaDto extends createZodDto(MediaSchema) {}
export class MediaPageDto extends createZodDto(MediaPageSchema) {}
export class MediaQueryDto extends createZodDto(MediaQuerySchema) {}
export class MediaUrlDto extends createZodDto(MediaUrlSchema) {}
export class UpdateMediaDto extends createZodDto(UpdateMediaSchema) {}
