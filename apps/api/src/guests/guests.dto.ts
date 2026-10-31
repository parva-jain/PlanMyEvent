import {
  ContactQuerySchema,
  ContactSchema,
  CreateContactSchema,
  CreateHouseholdSchema,
  HouseholdQuerySchema,
  HouseholdSchema,
  JobAcceptedSchema,
  listOf,
  StartContactImportSchema,
  UpdateContactSchema,
  UpdateHouseholdSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class HouseholdDto extends createZodDto(HouseholdSchema) {}
export class HouseholdsDto extends createZodDto(listOf(HouseholdSchema)) {}
export class HouseholdQueryDto extends createZodDto(HouseholdQuerySchema) {}
export class CreateHouseholdDto extends createZodDto(CreateHouseholdSchema) {}
export class UpdateHouseholdDto extends createZodDto(UpdateHouseholdSchema) {}

export class ContactDto extends createZodDto(ContactSchema) {}
export class ContactsDto extends createZodDto(listOf(ContactSchema)) {}
export class ContactQueryDto extends createZodDto(ContactQuerySchema) {}
export class CreateContactDto extends createZodDto(CreateContactSchema) {}
export class UpdateContactDto extends createZodDto(UpdateContactSchema) {}
export class StartContactImportDto extends createZodDto(StartContactImportSchema) {}
export class JobAcceptedDto extends createZodDto(JobAcceptedSchema) {}
