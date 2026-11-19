"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Loader2,
  PieChart,
  Plus,
  Sliders,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button, Card, inputCls, selectCls } from "@/components/ui";

interface CategoryProgress {
  category: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  currency: string;
}

interface ExpenseItem {
  id: string;
  amount: number;
  category: string;
  description: string;
  spentAt: string;
  paymentMethod: string;
}

interface FinanceSummary {
  monthYear: string;
  currency: string;
  totalBudget: number;
  totalSpent: number;
  netRemaining: number;
  percentageUsed: number;
  categories: CategoryProgress[];
  recentExpenses: ExpenseItem[];
}

const COMMON_CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Health",
  "Other",
];

export default function FinanceScreen() {
  const [currentMonth, setCurrentMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSetBudget, setShowSetBudget] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);

  // Form states
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Groceries");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("CARD");
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Budget form
  const [budgetCategory, setBudgetCategory] = useState("Groceries");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [submittingBudget, setSubmittingBudget] = useState(false);

  // CSV form
  const [csvContent, setCsvContent] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    loadSummary(currentMonth);
  }, [currentMonth]);

  async function loadSummary(month: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/summary?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to load finance summary", err);
    } finally {
      setLoading(false);
    }
  }

  function handleMonthChange(delta: number) {
    const [year, month] = currentMonth.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setCurrentMonth(d.toISOString().slice(0, 7));
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expenseAmount || !expenseDescription.trim()) return;

    setSubmittingExpense(true);
    try {
      const res = await fetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(expenseAmount),
          category: expenseCategory,
          description: expenseDescription.trim(),
          spentAt: new Date(expenseDate).toISOString(),
          paymentMethod: expensePaymentMethod,
        }),
      });

      if (res.ok) {
        setShowAddExpense(false);
        setExpenseAmount("");
        setExpenseDescription("");
        await loadSummary(currentMonth);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to record expense");
      }
    } catch (err) {
      console.error("Failed to add expense", err);
    } finally {
      setSubmittingExpense(false);
    }
  }

  async function handleSetBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!budgetLimit) return;

    setSubmittingBudget(true);
    try {
      const res = await fetch("/api/finance/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: budgetCategory,
          monthlyLimit: parseFloat(budgetLimit),
          monthYear: currentMonth,
        }),
      });

      if (res.ok) {
        setShowSetBudget(false);
        setBudgetLimit("");
        await loadSummary(currentMonth);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to set budget");
      }
    } catch (err) {
      console.error("Failed to set budget", err);
    } finally {
      setSubmittingBudget(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadSummary(currentMonth);
      }
    } catch (err) {
      console.error("Failed to delete expense", err);
    }
  }

  async function handleImportCsv(e: React.FormEvent) {
    e.preventDefault();
    if (!csvContent.trim()) return;

    setImportingCsv(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/finance/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData: csvContent }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult(`Successfully imported ${data.importedCount} transactions.`);
        setCsvContent("");
        await loadSummary(currentMonth);
        setTimeout(() => {
          setShowImportCsv(false);
          setImportResult(null);
        }, 1500);
      } else {
        const err = await res.json();
        setImportResult(`Error: ${err.error?.message || "Failed to parse CSV"}`);
      }
    } catch (err) {
      setImportResult("Network error importing transactions.");
    } finally {
      setImportingCsv(false);
    }
  }

  const formatCurrency = (amount: number, curr = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const monthLabel = () => {
    const [year, month] = currentMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  };

  const blurCls = privacyBlur ? "filter blur-md select-none transition-all duration-300" : "transition-all duration-300";

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Financial Budget & Expenses</h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Isolated & Private
            </span>
          </div>
          <p className="text-sm text-muted">
            Strict row-level encrypted budget & expenditure tracker with zero third-party leakage.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Privacy Blur Toggle */}
          <Button
            variant="outline"
            onClick={() => setPrivacyBlur(!privacyBlur)}
            className="flex items-center gap-1.5 py-1.5 px-3 text-xs"
            title={privacyBlur ? "Unmask numbers" : "Blur numbers for privacy"}
          >
            {privacyBlur ? <EyeOff size={15} className="text-brand" /> : <Eye size={15} />}
            <span>{privacyBlur ? "Privacy ON" : "Privacy Blur"}</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowImportCsv(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 text-xs"
          >
            <FileSpreadsheet size={15} />
            <span>Import CSV</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowSetBudget(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 text-xs"
          >
            <Sliders size={15} />
            <span>Set Budget</span>
          </Button>

          <Button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 text-xs"
          >
            <Plus size={15} />
            <span>Add Expense</span>
          </Button>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
        <Button
          variant="outline"
          onClick={() => handleMonthChange(-1)}
          className="flex items-center gap-1 py-1 px-3 text-xs"
        >
          <ArrowLeft size={14} /> Previous
        </Button>
        <div className="text-base font-semibold">{monthLabel()}</div>
        <Button
          variant="outline"
          onClick={() => handleMonthChange(1)}
          className="flex items-center gap-1 py-1 px-3 text-xs"
        >
          Next <ArrowRight size={14} />
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-brand" />
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border border-border/80 p-5 overflow-hidden">
              <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
                <span>Monthly Budget</span>
                <Wallet size={16} className="text-brand shrink-0" />
              </div>
              <div className={`mt-2 text-xl sm:text-2xl font-bold tracking-tight truncate ${blurCls}`}>
                {formatCurrency(summary.totalBudget, summary.currency)}
              </div>
              <div className="mt-1 text-xs text-muted truncate">
                {summary.categories.filter((c) => c.monthlyLimit > 0).length} category limit(s) set
              </div>
            </Card>

            <Card className="border border-border/80 p-5 overflow-hidden">
              <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
                <span>Total Spent</span>
                <TrendingDown size={16} className="text-rose-500 shrink-0" />
              </div>
              <div className={`mt-2 text-xl sm:text-2xl font-bold tracking-tight text-rose-500 truncate ${blurCls}`}>
                {formatCurrency(summary.totalSpent, summary.currency)}
              </div>
              <div className="mt-1 text-xs text-muted truncate">
                {summary.recentExpenses.length} transaction(s) logged
              </div>
            </Card>

            <Card className="border border-border/80 p-5 overflow-hidden">
              <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
                <span>Net Remaining</span>
                <TrendingUp size={16} className={`shrink-0 ${summary.netRemaining >= 0 ? "text-emerald-500" : "text-rose-500"}`} />
              </div>
              <div
                className={`mt-2 text-xl sm:text-2xl font-bold tracking-tight truncate ${
                  summary.netRemaining >= 0 ? "text-emerald-500" : "text-rose-500"
                } ${blurCls}`}
              >
                {formatCurrency(summary.netRemaining, summary.currency)}
              </div>
              <div className="mt-1 text-xs text-muted truncate">
                {summary.netRemaining >= 0 ? "Under budget" : "Over budget limit"}
              </div>
            </Card>

            <Card className="border border-border/80 p-5 overflow-hidden">
              <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
                <span>Budget Utilized</span>
                <PieChart size={16} className="text-brand shrink-0" />
              </div>
              <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight truncate">
                {summary.percentageUsed.toFixed(1)}%
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-soft">
                <div
                  className={`h-full rounded-full transition-all ${
                    summary.percentageUsed > 100
                      ? "bg-rose-500"
                      : summary.percentageUsed > 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(summary.percentageUsed, 100)}%` }}
                />
              </div>
            </Card>
          </div>

          {/* Budget vs. Actual Category Progress Bars */}
          <Card className="border border-border/80 p-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div>
                <h2 className="text-lg font-bold">Category Budgets vs. Actual Spend</h2>
                <p className="text-xs text-muted">
                  Track your monthly allowances across spending buckets in real time.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowSetBudget(true)}
                className="py-1 px-3 text-xs"
              >
                + Set Category Budget
              </Button>
            </div>

            {summary.categories.length === 0 ? (
              <div className="py-12 text-center text-muted">
                <Wallet className="mx-auto size-10 opacity-30" />
                <p className="mt-2 text-sm font-medium">No budgets or expenses for this month</p>
                <p className="text-xs">Click &ldquo;Set Budget&rdquo; or &ldquo;Add Expense&rdquo; above to begin.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {summary.categories.map((cat) => {
                  const isOver = cat.percentageUsed > 100;
                  const isNear = cat.percentageUsed >= 80 && !isOver;
                  return (
                    <div key={cat.category} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{cat.category}</span>
                          {isOver && (
                            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500 border border-rose-500/20">
                              Over Budget
                            </span>
                          )}
                          {isNear && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 border border-amber-500/20">
                              Near Limit
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-semibold ${blurCls}`}>
                            {formatCurrency(cat.spent, cat.currency)}
                          </span>
                          <span className="text-muted">/</span>
                          <span className={`text-muted ${blurCls}`}>
                            {cat.monthlyLimit > 0 ? formatCurrency(cat.monthlyLimit, cat.currency) : "No limit"}
                          </span>
                          <span className="font-medium text-muted">({cat.percentageUsed.toFixed(0)}%)</span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-soft">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOver
                              ? "bg-rose-500"
                              : isNear
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(cat.percentageUsed, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recent Expenses List */}
          <Card className="border border-border/80 p-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div>
                <h2 className="text-lg font-bold">Expenditure Logs</h2>
                <p className="text-xs text-muted">
                  Private transaction records for {monthLabel()}.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowAddExpense(true)}
                className="py-1 px-3 text-xs"
              >
                + Log Expense
              </Button>
            </div>

            {summary.recentExpenses.length === 0 ? (
              <div className="py-10 text-center text-muted">
                <CreditCard className="mx-auto size-9 opacity-30" />
                <p className="mt-2 text-sm font-medium">No expenses logged for this month</p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-border/60">
                {summary.recentExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-soft text-muted font-bold text-xs uppercase">
                        {exp.category.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm leading-snug line-clamp-1 break-words">{exp.description}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>{new Date(exp.spentAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{exp.category}</span>
                          <span>•</span>
                          <span className="rounded bg-soft px-1.5 py-0.5 text-[10px] font-medium">
                            {exp.paymentMethod}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 pl-2">
                      <div className={`font-bold text-sm text-fg ${blurCls}`}>
                        -{formatCurrency(exp.amount, summary.currency)}
                      </div>
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Log New Expense</h2>
            <p className="mt-1 text-xs text-muted">
              Add a manual transaction strictly isolated to your private account.
            </p>

            <form onSubmit={handleAddExpense} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Trader Joe's groceries"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5">Category</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className={selectCls}
                  >
                    {COMMON_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5">Payment Method</label>
                  <select
                    value={expensePaymentMethod}
                    onChange={(e) => setExpensePaymentMethod(e.target.value)}
                    className={selectCls}
                  >
                    <option value="CARD">Card</option>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Date</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddExpense(false)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingExpense}
                  className="flex items-center gap-2 py-1.5 px-3 text-xs"
                >
                  {submittingExpense && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Expense</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Set Budget Modal */}
      {showSetBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Set Category Budget</h2>
            <p className="mt-1 text-xs text-muted">
              Configure your spending limit for {monthLabel()}.
            </p>

            <form onSubmit={handleSetBudget} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">Category</label>
                <select
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value)}
                  className={selectCls}
                >
                  {COMMON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  Monthly Limit ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 500"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSetBudget(false)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingBudget}
                  className="flex items-center gap-2 py-1.5 px-3 text-xs"
                >
                  {submittingBudget && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Budget</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CSV Statement Import Modal */}
      {showImportCsv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Import CSV Statement</h2>
            <p className="mt-1 text-xs text-muted">
              Paste standard bank or card statement CSV data. Transactions will be parsed and auto-categorized automatically.
            </p>

            <form onSubmit={handleImportCsv} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">
                  CSV Data (Header row required: Date, Description, Amount)
                </label>
                <textarea
                  required
                  rows={8}
                  placeholder={`Date,Description,Amount,Category\n2026-11-10,Whole Foods Market,64.20,Groceries\n2026-11-12,Uber Trip,18.50,Transport`}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              {importResult && (
                <div
                  className={`rounded-lg p-2.5 text-xs font-medium ${
                    importResult.startsWith("Error")
                      ? "bg-rose-500/10 text-rose-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {importResult}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowImportCsv(false)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={importingCsv}
                  className="flex items-center gap-2 py-1.5 px-3 text-xs"
                >
                  {importingCsv && <Loader2 size={14} className="animate-spin" />}
                  <span>Import Transactions</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
