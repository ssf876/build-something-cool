import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MonthlyBaselineSection } from "@/app/analysis/baseline";
import { buildMonthlyBaseline } from "@/lib/analysis/baseline";
import type { AnalysisTransaction } from "@/lib/analysis/signals";
const { apply } = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("@/app/analysis/actions", () => ({ applyBaseline: apply }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function baseline() {
  const rows: AnalysisTransaction[] = [1, 2, 3].map((month) => ({
    id: String(month),
    date: `2026-0${month}-10`,
    payee: "Grocer",
    category: "Groceries",
    amountCents: -10000,
    kind: "EXPENSE",
    account: "Checking",
  }));
  return buildMonthlyBaseline(rows, [
    { id: "groceries", name: "Groceries", group: "NEEDS" },
  ]);
}
describe("Editable monthly baseline", () => {
  it("requires explicit confirmation and never applies on initial render or editing", () => {
    render(
      <MonthlyBaselineSection
        baseline={baseline()}
        year={2026}
        targetMonth="2026-10"
      />,
    );
    expect(screen.getByRole("checkbox", { name: /I confirm/ })).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Use this as my starting budget" }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Monthly amount ($)"), {
      target: { value: "125.50" },
    });
    expect(screen.getByText("$125.50")).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
  });
  it("preserves an edited amount when moving groups and exposes explainable evidence", () => {
    render(
      <MonthlyBaselineSection
        baseline={baseline()}
        year={2026}
        targetMonth="2026-10"
      />,
    );
    fireEvent.change(screen.getByLabelText("Monthly amount ($)"), {
      target: { value: "150.00" },
    });
    fireEvent.change(screen.getByLabelText("Budget group"), {
      target: { value: "WANTS" },
    });
    expect(screen.getByLabelText("Monthly amount ($)")).toHaveValue("150.00");
    expect(screen.getByLabelText("Budget group")).toHaveValue("WANTS");
    expect(
      screen.getAllByText(/Appears in 3 of 3 calendar months/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "Groceries" }));
    expect(
      screen.getByText("Edited starter budget").nextElementSibling,
    ).toHaveTextContent("$0.00");
    expect(apply).not.toHaveBeenCalled();
  });
});
