import { HealthLiveSchema, HealthReadySchema } from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class HealthLiveDto extends createZodDto(HealthLiveSchema) {}
export class HealthReadyDto extends createZodDto(HealthReadySchema) {}
