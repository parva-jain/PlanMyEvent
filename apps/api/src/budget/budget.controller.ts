import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { can, subEventsWith } from '@pme/contracts';
import {
  ActionError,
  createBudgetCategory,
  createExpense,
  deleteBudgetCategory,
  deleteExpense,
  runAction,
  updateBudgetCategory,
  updateExpense,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MemberAccess,
} from '@pme/core';
import type { BudgetQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { ACTION_RUNTIME } from '../database/database.module';
import { EventAccess, EventContext, EventRoute } from '../events/event-access';
import { whole } from '../events/events.dto';
import { IfMatch } from '../http/if-match';
import { RequireIdempotencyKey } from '../http/idempotency.interceptor';
import { UuidPipe } from '../http/uuid.pipe';
import {
  BudgetCategoriesDto,
  BudgetCategoryDto,
  CreateBudgetCategoryDto,
  CreateExpenseDto,
  ExpenseDto,
  ExpenseQueryDto,
  ExpensesDto,
  UpdateBudgetCategoryDto,
  UpdateExpenseDto,
} from './budget.dto';
import { BUDGET_QUERIES } from './budget.tokens';

/**
 * Budget categories and expenses (APIDesign "Planning"). Categories are event-wide; expenses
 * follow sub-event scope like tasks: reads filter to what the caller covers, and each action
 * checks the expense's own sub-event.
 */
@ApiTags('budget')
@Controller('events/:eventId')
export class BudgetController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(BUDGET_QUERIES) private readonly queries: BudgetQueries,
  ) {}

  // ---- Categories ------------------------------------------------------------------------

  /** In order, with planned, committed and paid totals over the expenses I can see. */
  @Get('budget-categories')
  @EventRoute('budget.view', 'list')
  @ZodResponse({ type: BudgetCategoriesDto })
  async categories(
    @Param('eventId', UuidPipe) eventId: string,
    @EventAccess() access: MemberAccess,
  ) {
    return whole(await this.queries.listCategories(eventId, subEventsWith(access, 'budget.view')));
  }

  @Post('budget-categories')
  @EventRoute('budget.edit')
  @ZodResponse({ status: 201, type: BudgetCategoryDto })
  createCategory(@EventContext() ctx: ActionContext, @Body() body: CreateBudgetCategoryDto) {
    return runAction(this.runtime, ctx, createBudgetCategory, body);
  }

  @Patch('budget-categories/:categoryId')
  @EventRoute('budget.edit')
  @ZodResponse({ type: BudgetCategoryDto })
  updateCategory(
    @EventContext() ctx: ActionContext,
    @Param('categoryId', UuidPipe) categoryId: string,
    @IfMatch() version: number,
    @Body() body: UpdateBudgetCategoryDto,
  ) {
    return runAction(this.runtime, ctx, updateBudgetCategory, {
      categoryId,
      expectedVersion: version,
      changes: body,
    });
  }

  /** Refused (409 conflict, reason category_in_use) while expenses use it. */
  @Delete('budget-categories/:categoryId')
  @EventRoute('budget.edit')
  @HttpCode(204)
  async deleteCategory(
    @EventContext() ctx: ActionContext,
    @Param('categoryId', UuidPipe) categoryId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteBudgetCategory, {
      categoryId,
      expectedVersion: version,
    });
  }

  // ---- Expenses --------------------------------------------------------------------------

  /** Filters categoryId, subEventId, paymentStatus, dueBefore. */
  @Get('expenses')
  @EventRoute('budget.view', 'list')
  @ZodResponse({ type: ExpensesDto })
  expenses(
    @Param('eventId', UuidPipe) eventId: string,
    @Query() query: ExpenseQueryDto,
    @EventAccess() access: MemberAccess,
  ) {
    return this.queries.listExpenses(eventId, query, subEventsWith(access, 'budget.view'));
  }

  @Post('expenses')
  @EventRoute('budget.edit', 'list')
  @RequireIdempotencyKey()
  @ZodResponse({ status: 201, type: ExpenseDto })
  createExpense(@EventContext() ctx: ActionContext, @Body() body: CreateExpenseDto) {
    return runAction(this.runtime, ctx, createExpense, body);
  }

  @Get('expenses/:expenseId')
  @EventRoute('budget.view', 'list')
  @ZodResponse({ type: ExpenseDto })
  async expense(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('expenseId', UuidPipe) expenseId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const expense = await this.queries.getExpense(eventId, expenseId);
    if (!expense) throw new ActionError('not_found', 'Expense not found');
    if (!can(access, 'budget.view', expense.subEventId)) {
      throw new ActionError('forbidden', 'You need the budget.view permission', {
        permission: 'budget.view',
      });
    }
    return expense;
  }

  @Patch('expenses/:expenseId')
  @EventRoute('budget.edit', 'list')
  @ZodResponse({ type: ExpenseDto })
  updateExpense(
    @EventContext() ctx: ActionContext,
    @Param('expenseId', UuidPipe) expenseId: string,
    @IfMatch() version: number,
    @Body() body: UpdateExpenseDto,
  ) {
    return runAction(this.runtime, ctx, updateExpense, {
      expenseId,
      expectedVersion: version,
      changes: body,
    });
  }

  @Delete('expenses/:expenseId')
  @EventRoute('budget.edit', 'list')
  @HttpCode(204)
  async deleteExpense(
    @EventContext() ctx: ActionContext,
    @Param('expenseId', UuidPipe) expenseId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteExpense, { expenseId, expectedVersion: version });
  }
}
