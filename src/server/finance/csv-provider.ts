import type { FinancialProvider, NormalizedTransaction } from "./types";

export class CsvFinancialProvider implements FinancialProvider {
  public providerId = "CSV_PROVIDER";
  public providerName = "Standard CSV Statement Provider";

  public async parseTransactions(
    input: string | Buffer | Record<string, unknown>
  ): Promise<NormalizedTransaction[]> {
    const rawCsv = typeof input === "string" ? input : input instanceof Buffer ? input.toString("utf-8") : "";
    if (!rawCsv.trim()) {
      return [];
    }

    const lines = this.splitCsvLines(rawCsv);
    if (lines.length < 2) {
      return [];
    }

    const headers = this.parseCsvRow(lines[0]).map((h) => h.toLowerCase().trim().replace(/['"]/g, ""));
    const dateIdx = headers.findIndex((h) => h.includes("date") || h.includes("time") || h === "timestamp");
    const descIdx = headers.findIndex((h) => h.includes("desc") || h.includes("narrative") || h.includes("detail") || h.includes("title") || h.includes("merchant"));
    const amountIdx = headers.findIndex((h) => h.includes("amount") || h.includes("spent") || h.includes("debit") || h.includes("cost") || h.includes("total"));
    const catIdx = headers.findIndex((h) => h.includes("cat") || h.includes("type") || h.includes("tag"));
    const methodIdx = headers.findIndex((h) => h.includes("method") || h.includes("payment") || h.includes("mode"));

    const transactions: NormalizedTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = this.parseCsvRow(line);
      const rawDate = dateIdx >= 0 ? cells[dateIdx] : cells[0];
      const rawDesc = descIdx >= 0 ? cells[descIdx] : cells[1] || "Expense";
      const rawAmount = amountIdx >= 0 ? cells[amountIdx] : cells[2];
      const rawCat = catIdx >= 0 ? cells[catIdx] : "";
      const rawMethod = methodIdx >= 0 ? cells[methodIdx] : "CARD";

      const parsedDate = this.parseDate(rawDate);
      const parsedAmount = this.parseAmount(rawAmount);

      if (!parsedDate || parsedAmount <= 0) {
        continue;
      }

      const description = rawDesc.trim().replace(/^["']|["']$/g, "") || "Statement Transaction";
      const category = rawCat.trim() ? this.normalizeCategory(rawCat) : this.inferCategory(description);
      const paymentMethod = this.normalizePaymentMethod(rawMethod);

      transactions.push({
        amount: Math.round(parsedAmount * 100) / 100,
        category,
        description,
        spentAt: parsedDate,
        paymentMethod,
      });
    }

    return transactions;
  }

  private splitCsvLines(csv: string): string[] {
    const lines: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
        current += char;
      } else if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && csv[i + 1] === "\n") {
          i++;
        }
        if (current.trim().length > 0) {
          lines.push(current);
        }
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim().length > 0) {
      lines.push(current);
    }
    return lines;
  }

  private parseCsvRow(row: string): string[] {
    const fields: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (insideQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  private parseDate(dateStr?: string): Date | null {
    if (!dateStr) return null;
    const clean = dateStr.trim().replace(/['"]/g, "");

    // Check ISO: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      const d = new Date(clean);
      return isNaN(d.getTime()) ? null : d;
    }

    // Check DD/MM/YYYY or MM/DD/YYYY
    const parts = clean.split(/[-/.]/);
    if (parts.length >= 3) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      const p3 = parseInt(parts[2], 10);
      if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
        // If p3 is 4 digits, YYYY
        if (p3 > 1900) {
          // Assume DD/MM/YYYY if p1 > 12
          const month = p1 > 12 ? p2 - 1 : p1 - 1;
          const day = p1 > 12 ? p1 : p2;
          const d = new Date(Date.UTC(p3, month, day));
          return isNaN(d.getTime()) ? null : d;
        }
      }
    }

    const fallback = new Date(clean);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  private parseAmount(amountStr?: string): number {
    if (!amountStr) return 0;
    // Remove currency symbols, commas, quotes
    const clean = amountStr.replace(/[$€£₹,\s'"]/g, "");
    const val = parseFloat(clean);
    if (isNaN(val)) return 0;
    // Take absolute value for expense
    return Math.abs(val);
  }

  private normalizeCategory(cat: string): string {
    const cleaned = cat.trim().toLowerCase();
    if (cleaned.includes("groc") || cleaned.includes("supermarket") || cleaned.includes("food")) return "Groceries";
    if (cleaned.includes("din") || cleaned.includes("restaurant") || cleaned.includes("cafe")) return "Dining";
    if (cleaned.includes("trans") || cleaned.includes("uber") || cleaned.includes("fuel") || cleaned.includes("gas")) return "Transport";
    if (cleaned.includes("util") || cleaned.includes("rent") || cleaned.includes("electric") || cleaned.includes("wifi")) return "Utilities";
    if (cleaned.includes("ent") || cleaned.includes("stream") || cleaned.includes("movie") || cleaned.includes("game")) return "Entertainment";
    if (cleaned.includes("shop") || cleaned.includes("cloth") || cleaned.includes("retail")) return "Shopping";
    if (cleaned.includes("health") || cleaned.includes("med") || cleaned.includes("doctor") || cleaned.includes("fit")) return "Health";
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  private inferCategory(description: string): string {
    const lower = description.toLowerCase();
    if (/(grocery|supermarket|whole foods|trader joe|safeway|walmart|costco|aldi|instacart)/.test(lower)) return "Groceries";
    if (/(uber|lyft|metro|subway|transit|bus|train|petrol|gas|fuel|parking|chevron|shell)/.test(lower)) return "Transport";
    if (/(starbucks|coffee|cafe|mcdonald|chipotle|subway|restaurant|burger|pizza|doordash|ubereats|grubhub|diner)/.test(lower)) return "Dining";
    if (/(netflix|spotify|hulu|disney|prime video|youtube|cinema|theatre|steam|playstation|nintendo|apple music)/.test(lower)) return "Entertainment";
    if (/(rent|mortgage|landlord|water|electric|power|coned|utility|pg&e|verizon|at&t|comcast|internet|wifi)/.test(lower)) return "Utilities";
    if (/(amazon|target|ebay|best buy|apple store|ikea|zara|h&m|nike|clothing|shoes)/.test(lower)) return "Shopping";
    if (/(cvs|walgreens|pharmacy|doctor|dental|clinic|hospital|gym|fitness|crossfit)/.test(lower)) return "Health";
    return "Other";
  }

  private normalizePaymentMethod(method: string): string {
    const lower = method.toLowerCase();
    if (lower.includes("cash")) return "CASH";
    if (lower.includes("upi")) return "UPI";
    if (lower.includes("bank") || lower.includes("ach") || lower.includes("wire") || lower.includes("transfer")) return "BANK_TRANSFER";
    return "CARD";
  }
}
