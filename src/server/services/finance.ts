import { withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { FinancialProvider, NormalizedTransaction } from "@/server/finance/types";

export interface CreateExpenseInput {
  amount: number;
  category: string;
  description: string;
  spentAt: string | Date;
  paymentMethod?: string;
}

export interface SetBudgetInput {
  category: string;
  monthlyLimit: number;
  currency?: string;
  monthYear: string; // YYYY-MM
}

export interface CategoryBudgetProgress {
  category: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  currency: string;
}

export interface FinanceSummary {
  monthYear: string;
  currency: string;
  totalBudget: number;
  totalSpent: number;
  netRemaining: number;
  percentageUsed: number;
  categories: CategoryBudgetProgress[];
  recentExpenses: Array<{
    id: string;
    amount: number;
    category: string;
    description: string;
    spentAt: Date;
    paymentMethod: string;
  }>;
}

export async function getFinanceSummary(userId: string, monthYear: string): Promise<FinanceSummary> {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    throw new ApiError(400, "VALIDATION", "Invalid month format. Expected YYYY-MM");
  }

  const [yearStr, monthStr] = monthYear.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return withUserDb(userId, async (tx) => {
    const [budgets, expenses] = await Promise.all([
      tx.financeBudget.findMany({
        where: { userId, monthYear },
        orderBy: { category: "asc" },
      }),
      tx.financeExpense.findMany({
        where: {
          userId,
          spentAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { spentAt: "desc" },
      }),
    ]);

    const spentByCategory = new Map<string, number>();
    let totalSpent = 0;

    for (const exp of expenses) {
      const current = spentByCategory.get(exp.category) ?? 0;
      spentByCategory.set(exp.category, current + exp.amount);
      totalSpent += exp.amount;
    }

    // Default currency from first budget or USD
    const currency = budgets[0]?.currency || "USD";

    // Combine all unique categories from budgets and expenses
    const categorySet = new Set<string>([
      ...budgets.map((b) => b.category),
      ...spentByCategory.keys(),
    ]);

    let totalBudget = 0;
    const categories: CategoryBudgetProgress[] = [];

    for (const cat of Array.from(categorySet).sort()) {
      const budgetObj = budgets.find((b) => b.category.toLowerCase() === cat.toLowerCase());
      const limit = budgetObj?.monthlyLimit ?? 0;
      const spent = spentByCategory.get(cat) ?? 0;
      const remaining = limit - spent;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;

      totalBudget += limit;
      categories.push({
        category: cat,
        monthlyLimit: Math.round(limit * 100) / 100,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        percentageUsed: Math.round(pct * 10) / 10,
        currency: budgetObj?.currency || currency,
      });
    }

    const netRemaining = totalBudget - totalSpent;
    const overallPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    return {
      monthYear,
      currency,
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalSpent: Math.round(totalSpent * 100) / 100,
      netRemaining: Math.round(netRemaining * 100) / 100,
      percentageUsed: Math.round(overallPct * 10) / 10,
      categories,
      recentExpenses: expenses.map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        spentAt: e.spentAt,
        paymentMethod: e.paymentMethod,
      })),
    };
  });
}

export async function createExpense(userId: string, input: CreateExpenseInput) {
  const amount = Number(input.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(400, "VALIDATION", "Expense amount must be greater than zero");
  }
  const category = input.category.trim();
  if (!category) {
    throw new ApiError(400, "VALIDATION", "Expense category is required");
  }
  const description = input.description.trim();
  if (!description) {
    throw new ApiError(400, "VALIDATION", "Expense description is required");
  }
  const spentAt = new Date(input.spentAt);
  if (isNaN(spentAt.getTime())) {
    throw new ApiError(400, "VALIDATION", "Invalid expense date");
  }

  const paymentMethod = (input.paymentMethod || "CARD").toUpperCase();

  return withUserDb(userId, (tx) =>
    tx.financeExpense.create({
      data: {
        userId,
        amount: Math.round(amount * 100) / 100,
        category,
        description,
        spentAt,
        paymentMethod,
      },
    })
  );
}

export async function deleteExpense(userId: string, expenseId: string) {
  return withUserDb(userId, async (tx) => {
    const expense = await tx.financeExpense.findUnique({
      where: { id: expenseId },
    });
    if (!expense || expense.userId !== userId) {
      throw new ApiError(404, "NOT_FOUND", "Expense record not found");
    }
    return tx.financeExpense.delete({
      where: { id: expenseId },
    });
  });
}

export async function setBudget(userId: string, input: SetBudgetInput) {
  const category = input.category.trim();
  if (!category) {
    throw new ApiError(400, "VALIDATION", "Category is required");
  }
  const monthlyLimit = Number(input.monthlyLimit);
  if (isNaN(monthlyLimit) || monthlyLimit < 0) {
    throw new ApiError(400, "VALIDATION", "Monthly limit must be a positive number or zero");
  }
  if (!/^\d{4}-\d{2}$/.test(input.monthYear)) {
    throw new ApiError(400, "VALIDATION", "Invalid monthYear format. Expected YYYY-MM");
  }

  const currency = (input.currency || "USD").toUpperCase();

  return withUserDb(userId, (tx) =>
    tx.financeBudget.upsert({
      where: {
        userId_category_monthYear: {
          userId,
          category,
          monthYear: input.monthYear,
        },
      },
      create: {
        userId,
        category,
        monthlyLimit: Math.round(monthlyLimit * 100) / 100,
        currency,
        monthYear: input.monthYear,
      },
      update: {
        monthlyLimit: Math.round(monthlyLimit * 100) / 100,
        currency,
      },
    })
  );
}

export async function importExpensesFromProvider(
  userId: string,
  provider: FinancialProvider,
  rawInput: string
): Promise<{ importedCount: number; transactions: NormalizedTransaction[] }> {
  const parsed = await provider.parseTransactions(rawInput);
  if (parsed.length === 0) {
    return { importedCount: 0, transactions: [] };
  }

  await withUserDb(userId, (tx) =>
    tx.financeExpense.createMany({
      data: parsed.map((t) => ({
        userId,
        amount: t.amount,
        category: t.category,
        description: t.description,
        spentAt: t.spentAt,
        paymentMethod: t.paymentMethod,
      })),
    })
  );

  return { importedCount: parsed.length, transactions: parsed };
}
