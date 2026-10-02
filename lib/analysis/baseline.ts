import type { CategoryGroup } from "@/src/engine";
import { normalizePayee } from "@/src/categorizer";
import { isIncome, isTransfer } from "./monarch";
import type { AnalysisTransaction } from "./signals";

export type ExpensePattern =
  "recurring fixed" | "recurring variable" | "periodic" | "irregular/seasonal";
export interface BaselineItem {
  name: string;
  monthsAppearing: number;
  monthsObserved: number;
  typicalCents: number;
  medianActiveMonthCents: number;
  rangeLowCents: number;
  rangeHighCents: number;
  recentThreeMonthAverageCents: number;
  variabilityPercent: number;
  classification: ExpensePattern;
  consistency: "High" | "Medium" | "Low";
  explanation: string;
  transactionIds: string[];
  monthly: { month: string; cents: number }[];
}
export interface BudgetLine extends BaselineItem {
  categoryId: string;
  group: CategoryGroup;
}
export interface MonthlyBaseline {
  categories: BaselineItem[];
  merchants: BaselineItem[];
  skeleton: BudgetLine[];
  excluded: BaselineItem[];
  regularTotalCents: number;
  periodicReserveCents: number;
  months: string[];
}
export function medianCents(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
const monthIndex = (month: string) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const eventCategory = (name: string) =>
  /\b(moving|move|wedding|bridal|vacation|travel|holiday|closing costs|down payment|home purchase)\b/i.test(
    name,
  );
export function suggestedGroup(
  name: string,
  existing: CategoryGroup = "NEEDS",
): CategoryGroup {
  if (existing !== "NEEDS") return existing;
  if (/\b(debt|loan|student loan|savings)\b/i.test(name))
    return "SAVINGS_DEBTS";
  if (/\b(investment|retirement)\b/i.test(name)) return "INVESTMENTS";
  if (
    /\b(restaurants?|dining|entertainment|shopping|hobbies|gifts|coffee|alcohol|streaming)\b/i.test(
      name,
    )
  )
    return "WANTS";
  return "NEEDS";
}
export function buildMonthlyBaseline(
  transactions: AnalysisTransaction[],
  categories: { id: string; name: string; group: CategoryGroup }[],
): MonthlyBaseline {
  const observed = [
    ...new Set(transactions.map((t) => t.date.slice(0, 7))),
  ].sort();
  const months: string[] = [];
  if (observed.length)
    for (
      let index = monthIndex(observed[0]);
      index <= monthIndex(observed.at(-1)!);
      index++
    ) {
      months.push(
        `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`,
      );
    }
  const spend = transactions.filter(
    (t) =>
      t.kind !== "TRANSFER" &&
      t.kind !== "INCOME" &&
      !isTransfer(t.category) &&
      !isIncome(t.category),
  );
  const describe = (
    name: string,
    rows: AnalysisTransaction[],
    isEvent: boolean,
  ): BaselineItem => {
    const monthly = months.map((month) => ({
      month,
      cents: Math.max(
        0,
        rows
          .filter((t) => t.date.startsWith(month))
          .reduce((sum, t) => sum - t.amountCents, 0),
      ),
    }));
    const active = monthly.filter((m) => m.cents > 0);
    const amounts = active.map((m) => m.cents);
    const medianActiveMonthCents = medianCents(amounts);
    const deviations = amounts.map((amount) =>
      Math.abs(amount - medianActiveMonthCents),
    );
    const variabilityPercent = medianActiveMonthCents
      ? Math.round((medianCents(deviations) * 100) / medianActiveMonthCents)
      : 0;
    const sorted = [...amounts].sort((a, b) => a - b);
    const rangeLowCents = sorted[Math.floor((sorted.length - 1) * 0.25)] ?? 0;
    const rangeHighCents = sorted[Math.ceil((sorted.length - 1) * 0.75)] ?? 0;
    const gaps = active
      .slice(1)
      .map((m, i) => monthIndex(m.month) - monthIndex(active[i].month));
    const cadence = medianCents(gaps);
    const regular = active.length >= 3 && active.length >= months.length * 0.6;
    const periodic =
      active.length >= 3 &&
      cadence >= 2 &&
      gaps.every((gap) => Math.abs(gap - cadence) <= 1);
    const stableFraction =
      amounts.filter(
        (a) =>
          Math.abs(a - medianActiveMonthCents) <= medianActiveMonthCents * 0.1,
      ).length / Math.max(1, amounts.length);
    const classification: ExpensePattern = isEvent
      ? "irregular/seasonal"
      : regular
        ? variabilityPercent <= 10 && stableFraction >= 0.75
          ? "recurring fixed"
          : "recurring variable"
        : periodic
          ? "periodic"
          : "irregular/seasonal";
    const typicalCents =
      classification === "periodic"
        ? Math.round(medianActiveMonthCents / cadence)
        : classification.startsWith("recurring")
          ? medianCents(monthly.map((m) => m.cents))
          : medianActiveMonthCents;
    const recent = monthly.slice(-3);
    const explanation = isEvent
      ? "Event/travel category: excluded from regular monthly budget suggestions."
      : classification === "periodic"
        ? `Median active-month cost spread over its observed ${cadence}-month interval; this is a monthly reserve, not a monthly bill.`
        : classification.startsWith("recurring")
          ? "Median of calendar-month net spending, including zero-spend months between the first and last observed month. One-off spikes do not drive the median."
          : active.length < 3
            ? "Fewer than three spending months: insufficient evidence for a regular budget item; possibly a one-off purchase."
            : "Infrequent or uneven spending without a consistent interval: keep outside the regular budget.";
    return {
      name,
      monthsAppearing: active.length,
      monthsObserved: months.length,
      typicalCents,
      medianActiveMonthCents,
      rangeLowCents,
      rangeHighCents,
      recentThreeMonthAverageCents: recent.length
        ? Math.round(
            recent.reduce((sum, m) => sum + m.cents, 0) / recent.length,
          )
        : 0,
      variabilityPercent,
      classification,
      consistency:
        active.length >= 6 &&
        active.length >= months.length * 0.8 &&
        variabilityPercent <= 20
          ? "High"
          : classification !== "irregular/seasonal"
            ? "Medium"
            : "Low",
      explanation,
      transactionIds: rows.map((t) => t.id),
      monthly,
    };
  };
  const categoryItems = [...new Set(spend.map((t) => t.category))]
    .map((name) =>
      describe(
        name,
        spend.filter((t) => t.category === name),
        eventCategory(name),
      ),
    )
    .sort((a, b) => b.typicalCents - a.typicalCents);
  const merchants = [...new Set(spend.map((t) => normalizePayee(t.payee)))]
    .map((key) => {
      const rows = spend.filter((t) => normalizePayee(t.payee) === key);
      return describe(
        rows[0].payee,
        rows,
        rows.every((t) => eventCategory(t.category)),
      );
    })
    .sort((a, b) => b.typicalCents - a.typicalCents);
  const skeleton: BudgetLine[] = categoryItems
    .filter(
      (item) =>
        item.classification !== "irregular/seasonal" && item.typicalCents > 0,
    )
    .flatMap((item) => {
      const category = categories.find((c) => c.name === item.name);
      return category
        ? [
            {
              ...item,
              categoryId: category.id,
              group: suggestedGroup(item.name, category.group),
            },
          ]
        : [];
    });
  return {
    categories: categoryItems,
    merchants,
    skeleton,
    excluded: categoryItems.filter(
      (c) => c.classification === "irregular/seasonal",
    ),
    regularTotalCents: skeleton
      .filter((c) => c.classification.startsWith("recurring"))
      .reduce((sum, c) => sum + c.typicalCents, 0),
    periodicReserveCents: skeleton
      .filter((c) => c.classification === "periodic")
      .reduce((sum, c) => sum + c.typicalCents, 0),
    months,
  };
}
