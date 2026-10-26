import { MeSchema } from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class MeDto extends createZodDto(MeSchema) {}
