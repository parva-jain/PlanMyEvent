import {
  CreateTaskSchema,
  listOf,
  MyTaskSchema,
  ReplaceAssigneesSchema,
  TaskQuerySchema,
  TaskSchema,
  UpdateTaskSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class TaskDto extends createZodDto(TaskSchema) {}
export class TasksDto extends createZodDto(listOf(TaskSchema)) {}
export class TaskQueryDto extends createZodDto(TaskQuerySchema) {}
export class CreateTaskDto extends createZodDto(CreateTaskSchema) {}
export class UpdateTaskDto extends createZodDto(UpdateTaskSchema) {}
export class ReplaceAssigneesDto extends createZodDto(ReplaceAssigneesSchema) {}
export class MyTasksDto extends createZodDto(listOf(MyTaskSchema)) {}
