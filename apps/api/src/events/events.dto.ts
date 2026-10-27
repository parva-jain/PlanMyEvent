import {
  CreatedEventSchema,
  CreateEventSchema,
  CreateSubEventSchema,
  CreateVenueSchema,
  EventModuleSchema,
  EventSchema,
  EventTemplateSchema,
  listOf,
  MyEventSchema,
  ReplaceModulesSchema,
  SubEventSchema,
  UpdateEventSchema,
  UpdateSubEventSchema,
  UpdateVenueSchema,
  VenueSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class EventDto extends createZodDto(EventSchema) {}
export class CreatedEventDto extends createZodDto(CreatedEventSchema) {}
export class CreateEventDto extends createZodDto(CreateEventSchema) {}
export class UpdateEventDto extends createZodDto(UpdateEventSchema) {}
export class MyEventsDto extends createZodDto(listOf(MyEventSchema)) {}
export class ModulesDto extends createZodDto(listOf(EventModuleSchema)) {}
export class ReplaceModulesDto extends createZodDto(ReplaceModulesSchema) {}
export class TemplatesDto extends createZodDto(listOf(EventTemplateSchema)) {}

export class VenueDto extends createZodDto(VenueSchema) {}
export class VenuesDto extends createZodDto(listOf(VenueSchema)) {}
export class CreateVenueDto extends createZodDto(CreateVenueSchema) {}
export class UpdateVenueDto extends createZodDto(UpdateVenueSchema) {}

export class SubEventDto extends createZodDto(SubEventSchema) {}
export class SubEventsDto extends createZodDto(listOf(SubEventSchema)) {}
export class CreateSubEventDto extends createZodDto(CreateSubEventSchema) {}
export class UpdateSubEventDto extends createZodDto(UpdateSubEventSchema) {}

/** Small lists come whole (APIDesign "Pagination"). */
export const whole = <T>(data: T[]) => ({ data, nextCursor: null, hasMore: false });
