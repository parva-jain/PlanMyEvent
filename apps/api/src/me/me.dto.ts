import { MeSchema, UpdateMeSchema } from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class MeDto extends createZodDto(MeSchema) {}
export class UpdateMeDto extends createZodDto(UpdateMeSchema) {}
