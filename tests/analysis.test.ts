import { describe, expect, it } from "vitest";
import { parseMonarch } from "@/lib/analysis/monarch";
import { analyze, type AnalysisTransaction } from "@/lib/analysis/signals";
import { readFileSync } from "node:fs";
function fixture(): AnalysisTransaction[] {
  return parseMonarch(
    readFileSync("examples/monarch-demo.csv", "utf8"),
  ).rows.map((r, i) => ({
    ...r,
    id: String(i),
    kind: r.category === "Paychecks" ? "INCOME" : "EXPENSE",
  }));
}
describe("Monarch analysis", () => {
  it("computes cash flow including refunds and excluding both payment legs", () => {
    const data = analyze(fixture(), 2026);
    expect(data.totalIncomeCents).toBe(1800000);
    expect(data.totalSpendingCents).toBe(895000);
    expect(data.netCashflowCents).toBe(905000);
    expect(data.excludedTransfers).toBe(2);
  });
  it("finds stable recurring merchants and whole-year moving evidence", () => {
    const data = analyze(fixture(), 2026);
    expect(data.recurring.map((r) => r.merchant)).toContain("Stream TV");
    const move = data.signals.find((s) => s.kind === "MOVE");
    expect(move?.date).toBe("2026-04-10");
    expect(move?.transactionIds).toHaveLength(2);
    expect(data.signals.some((s) => s.id.startsWith("month:"))).toBe(true);
  });
  it("rejects malformed rows and requires Monarch headers", () => {
    expect(() => parseMonarch("Date,Amount\n2026-01-01,1")).toThrow(
      "missing merchant",
    );
    const result = parseMonarch(
      'Date,Merchant,Category,Account,Amount\n2026-02-30,Shop,Shopping,Card,-5\n2026-02-01,"Shop, Inc",Shopping,Card,-5',
    );
    expect(result.errors).toHaveLength(1);
    expect(result.rows[0].amountCents).toBe(-500);
  });
  it("uses stable dedupe identity independent of category and notes", () => {
    const a = parseMonarch(
      "Date,Merchant,Category,Account,Amount,Notes\n2026-01-01,Shop,Shopping,Card,-5,first",
    ).rows[0];
    const b = parseMonarch(
      "Date,Merchant,Category,Account,Amount,Notes\n2026-01-01,Shop,Other,Card,-5,second",
    ).rows[0];
    expect(a.externalId).toBe(b.externalId);
    expect(analyze(fixture(), 2025).signals).toEqual([]);
  });
});
