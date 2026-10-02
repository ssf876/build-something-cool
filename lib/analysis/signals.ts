import { normalizePayee } from "@/src/categorizer";
import { LIFE_EVENT_RULE_PACKS } from "@/src/advisor/life-events";
import { isIncome, isTransfer } from "./monarch";

export interface AnalysisTransaction {
  id: string;
  date: string;
  payee: string;
  amountCents: number;
  category: string;
  account: string;
  kind: string;
}
export interface Signal {
  id: string;
  date: string;
  label: string;
  explanation: string;
  transactionIds: string[];
  source: "deterministic";
  kind: "CUSTOM" | "MOVE" | "HOME_PURCHASE" | "WEDDING" | "CHILD";
}
function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length ? ordered[Math.floor(ordered.length / 2)] : 0;
}
export function analyze(transactions: AnalysisTransaction[], year: number) {
  const rows = transactions
    .filter((t) => t.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const eligible = rows.filter(
    (t) => t.kind !== "TRANSFER" && !isTransfer(t.category),
  );
  // Positive credits in expense categories offset spending (refunds).
  const income = eligible.filter(
    (t) => t.kind === "INCOME" || isIncome(t.category),
  );
  const expenses = eligible.filter((t) => !income.includes(t));
  const totalIncomeCents = income.reduce((sum, t) => sum + t.amountCents, 0);
  const totalSpendingCents = expenses.reduce(
    (sum, t) => sum - t.amountCents,
    0,
  );
  const totals = (key: (t: AnalysisTransaction) => string) => {
    const result = new Map<string, number>();
    expenses.forEach((t) =>
      result.set(key(t), (result.get(key(t)) ?? 0) - t.amountCents),
    );
    return [...result]
      .map(([name, cents]) => ({ name, cents }))
      .sort((a, b) => b.cents - a.cents);
  };
  const categorySpending = totals((t) => t.category);
  const merchantSpending = totals((t) => normalizePayee(t.payee));
  const months = [...new Set(rows.map((t) => t.date.slice(0, 7)))].sort();
  const monthlySpending = months.map((name) => ({
    name,
    cents: expenses
      .filter((t) => t.date.startsWith(name))
      .reduce((s, t) => s - t.amountCents, 0),
  }));
  const outflows = expenses.filter((t) => t.amountCents < 0);
  const signals: Signal[] = [];
  const add = (
    id: string,
    label: string,
    explanation: string,
    evidence: AnalysisTransaction[],
    kind: Signal["kind"] = "CUSTOM",
  ) => {
    if (!evidence.length) return;
    signals.push({
      id,
      date: evidence[0].date,
      label,
      explanation,
      transactionIds: evidence.map((t) => t.id),
      source: "deterministic",
      kind,
    });
  };
  const largeThreshold = Math.max(
    100000,
    median(outflows.map((t) => -t.amountCents)) * 5,
  );
  const largeTransactions = outflows.filter(
    (t) => -t.amountCents >= largeThreshold,
  );
  largeTransactions.forEach((t) =>
    add(
      `large:${t.id}`,
      "Unusually large purchase",
      "At least $1,000 and five times the median expense in this export.",
      [t],
    ),
  );
  const baseline = median(monthlySpending.map((m) => m.cents));
  if (months.length >= 3) {
    monthlySpending
      .filter((m) => m.cents >= Math.max(50000, baseline * 1.75))
      .forEach((m) =>
        add(
          `month:${m.name}`,
          "High-spending month",
          "Spending is at least 75% above the median observed month (minimum $500). Partial months can affect this comparison.",
          expenses.filter((t) => t.date.startsWith(m.name)),
        ),
      );
    categorySpending.forEach((category) => {
      const values = months.map((month) =>
        expenses
          .filter(
            (t) => t.category === category.name && t.date.startsWith(month),
          )
          .reduce((s, t) => s - t.amountCents, 0),
      );
      const base = median(values);
      months.forEach((month, i) => {
        if (values[i] >= Math.max(50000, base * 2))
          add(
            `category:${category.name}:${month}`,
            `${category.name} spending spike`,
            "At least $500 and twice the category's median observed month.",
            expenses.filter(
              (t) => t.category === category.name && t.date.startsWith(month),
            ),
          );
      });
    });
  }
  const recurring = [];
  for (const merchant of new Set(
    outflows.map((t) => normalizePayee(t.payee)),
  )) {
    const matches = outflows.filter(
      (t) => normalizePayee(t.payee) === merchant,
    );
    const observed = [
      ...new Set(matches.map((t) => t.date.slice(0, 7))),
    ].sort();
    const amounts = observed.map((month) =>
      matches
        .filter((t) => t.date.startsWith(month))
        .reduce((s, t) => s - t.amountCents, 0),
    );
    const typical = median(amounts);
    const monthNumber = (s: string) =>
      Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
    if (
      observed.length >= 3 &&
      observed.every(
        (month, i) =>
          i === 0 || monthNumber(month) - monthNumber(observed[i - 1]) === 1,
      ) &&
      amounts.every((a) => Math.abs(a - typical) <= typical * 0.2)
    ) {
      recurring.push({
        merchant: matches[0].payee,
        cents: typical,
        months: observed.length,
        transactionIds: matches.map((t) => t.id),
      });
    }
  }
  for (const pack of LIFE_EVENT_RULE_PACKS) {
    const matches = outflows.filter((t) =>
      pack.keywords.some((keyword) =>
        ` ${normalizePayee(`${t.payee} ${t.category}`)} `.includes(
          ` ${keyword} `,
        ),
      ),
    );
    let group: AnalysisTransaction[] = [];
    const emit = () => {
      if (
        group.length >= pack.minMatches ||
        group.some(
          (t) =>
            pack.largePaymentCents != null &&
            -t.amountCents >= pack.largePaymentCents,
        )
      ) {
        add(
          `life:${pack.kind}:${group[0].id}`,
          `Possible ${pack.kind.toLowerCase().replaceAll("_", " ")}`,
          `${group.length} ${pack.evidenceNoun}-related payments clustered within ${pack.windowDays} days. Merchant/category keywords suggest this event; they do not establish it happened.`,
          group,
          pack.kind,
        );
      }
    };
    for (const match of matches) {
      if (
        group.length &&
        Date.parse(match.date) - Date.parse(group[0].date) >=
          pack.windowDays * 86400000
      ) {
        emit();
        group = [];
      }
      group.push(match);
    }
    emit();
  }
  return {
    rows,
    totalIncomeCents,
    totalSpendingCents,
    netCashflowCents: totalIncomeCents - totalSpendingCents,
    monthlySpending,
    categorySpending,
    merchantSpending,
    recurring,
    largeTransactions,
    signals: signals.sort((a, b) => a.date.localeCompare(b.date)),
    excludedTransfers: rows.length - eligible.length,
  };
}
