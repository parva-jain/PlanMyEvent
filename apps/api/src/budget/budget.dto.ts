import {
  BudgetCategorySchema,
  BudgetCategoryTotalsSchema,
  CreateBudgetCategorySchema,
  CreateExpenseSchema,
  ExpenseQuerySchema,
  ExpenseSchema,
  listOf,
  UpdateBudgetCategorySchema,
  UpdateExpenseSchema,
} from '@pme/contracts';
import { createZodDto } from 'nestjs-zod';

export class BudgetCategoryDto extends createZodDto(BudgetCategorySchema) {}
export class BudgetCategoriesDto extends createZodDto(listOf(BudgetCategoryTotalsSchema)) {}
export class CreateBudgetCategoryDto extends createZodDto(CreateBudgetCategorySchema) {}
export class UpdateBudgetCategoryDto extends createZodDto(UpdateBudgetCategorySchema) {}

export class ExpenseDto extends createZodDto(ExpenseSchema) {}
export class ExpensesDto extends createZodDto(listOf(ExpenseSchema)) {}
export class ExpenseQueryDto extends createZodDto(ExpenseQuerySchema) {}
export class CreateExpenseDto extends createZodDto(CreateExpenseSchema) {}
export class UpdateExpenseDto extends createZodDto(UpdateExpenseSchema) {}
