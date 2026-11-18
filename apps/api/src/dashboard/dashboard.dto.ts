import { DashboardSchema } from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class DashboardDto extends createZodDto(DashboardSchema) {}
