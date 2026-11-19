import FinanceScreen from "@/features/finance/FinanceScreen";

export const metadata = {
  title: "Financial Budget & Expenses | Routine",
  description: "Strictly isolated budgeting & expenditure tracker visible only to you.",
};

export default function FinancePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <FinanceScreen />
    </div>
  );
}
