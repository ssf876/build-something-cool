import { describe, expect, it } from "vitest";
import { buildMonthlyBaseline, medianCents } from "@/lib/analysis/baseline";
import type { AnalysisTransaction } from "@/lib/analysis/signals";
function row(
  month: number,
  category: string,
  cents: number,
  payee = category,
): AnalysisTransaction {
  return {
    id: `${month}:${category}:${cents}`,
    date: `2026-${String(month).padStart(2, "0")}-15`,
    category,
    payee,
    amountCents: -cents,
    account: "Checking",
    kind: "EXPENSE",
  };
}
const categories = [
  { id: "rent", name: "Rent", group: "NEEDS" as const },
  { id: "dining", name: "Dining Out", group: "NEEDS" as const },
  { id: "insurance", name: "Insurance", group: "NEEDS" as const },
  { id: "moving", name: "Moving", group: "NEEDS" as const },
];
describe("Monthly baseline", () => {
  it("detects fixed monthly merchants and keeps commitments inside category totals", () => {
    const data = buildMonthlyBaseline(
      [1, 2, 3, 4, 5, 6].map((m) => row(m, "Rent", 140000, "Landlord")),
      categories,
    );
    expect(data.merchants[0]).toMatchObject({
      name: "Landlord",
      classification: "recurring fixed",
      monthsAppearing: 6,
      typicalCents: 140000,
      consistency: "High",
    });
    expect(data.regularTotalCents).toBe(140000);
  });
  it("excludes transfers, card payments, and other non-spend movements", () => {
    const rows = [1, 2, 3].flatMap((m) => [
      row(m, "Rent", 10000),
      row(m, "Credit Card Payment", 90000),
      row(m, "Balance Adjustments", 80000),
      row(m, "Investment Transfer", 70000),
      { ...row(m, "Anything", 60000), kind: "TRANSFER" },
    ]);
    const data = buildMonthlyBaseline(rows, categories);
    expect(data.categories.map((c) => c.name)).toEqual(["Rent"]);
    expect(data.regularTotalCents).toBe(10000);
  });
  it("uses robust medians despite a large one-off spike and handles refunds", () => {
    const rows = [10000, 11000, 9000, 1000000, 10000, 12000].map((a, i) =>
      row(i + 1, "Dining Out", a),
    );
    const data = buildMonthlyBaseline(rows, categories);
    expect(data.skeleton[0].typicalCents).toBe(10500);
    expect(data.skeleton[0].classification).toBe("recurring variable");
    expect(data.skeleton[0].recentThreeMonthAverageCents).toBe(340667);
    const refunded = buildMonthlyBaseline(
      [1, 2, 3].flatMap((m) => [row(m, "Rent", 10000), row(m, "Rent", -2000)]),
      categories,
    );
    expect(refunded.regularTotalCents).toBe(8000);
    expect(medianCents([1, 2])).toBe(2);
  });
  it("classifies quarterly expenses as periodic monthly reserves", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => row(m, "Rent", 10000));
    rows.push(...[1, 4, 7].map((m) => row(m, "Insurance", 30000)));
    const data = buildMonthlyBaseline(rows, categories);
    expect(data.skeleton.find((c) => c.name === "Insurance")).toMatchObject({
      classification: "periodic",
      typicalCents: 10000,
      monthsAppearing: 3,
      monthsObserved: 9,
    });
    expect(data.periodicReserveCents).toBe(10000);
  });
  it("groups a budget skeleton and excludes event and sparse one-off categories", () => {
    const rows = [1, 2, 3].flatMap((m) => [
      row(m, "Rent", 10000),
      row(m, "Dining Out", 5000),
      row(m, "Moving", 100000),
    ]);
    rows.push(row(2, "Laptop", 300000));
    const data = buildMonthlyBaseline(rows, categories);
    expect(data.skeleton.map((c) => [c.categoryId, c.group])).toEqual([
      ["rent", "NEEDS"],
      ["dining", "WANTS"],
    ]);
    expect(data.excluded.map((c) => c.name)).toContain("Moving");
    expect(data.excluded.map((c) => c.name)).toContain("Laptop");
  });
  it("does not infer a monthly budget from two observations and reports calendar gaps", () => {
    const data = buildMonthlyBaseline(
      [row(1, "Rent", 10000), row(3, "Rent", 10000)],
      categories,
    );
    expect(data.months).toHaveLength(3);
    expect(data.categories[0].monthsAppearing).toBe(2);
    expect(data.skeleton).toEqual([]);
    expect(buildMonthlyBaseline([], categories).regularTotalCents).toBe(0);
  });
});
