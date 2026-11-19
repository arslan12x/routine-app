export interface NormalizedTransaction {
  amount: number;
  category: string;
  description: string;
  spentAt: Date;
  paymentMethod: string;
  referenceId?: string;
}

export interface FinancialProvider {
  providerId: string;
  providerName: string;
  parseTransactions(input: string | Buffer | Record<string, unknown>): Promise<NormalizedTransaction[]>;
}
