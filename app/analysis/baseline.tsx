"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { parseAmountToCents } from "@/src/feed/mapping";
import type { BaselineItem, MonthlyBaseline } from "@/lib/analysis/baseline";
import { applyBaseline } from "./actions";
const GROUPS = [
  ["NEEDS", "Needs"],
  ["WANTS", "Wants"],
  ["SAVINGS_DEBTS", "Savings / Debts"],
  ["INVESTMENTS", "Investments"],
] as const;
function Evidence({ item }: { item: BaselineItem }) {
  return (
    <details>
      <summary>Why this amount?</summary>
      <p>{item.explanation}</p>
      <ul>
        <li>
          Appears in {item.monthsAppearing} of {item.monthsObserved} calendar
          months
        </li>
        <li>
          Median active-month spend: {formatCents(item.medianActiveMonthCents)}
        </li>
        <li>
          Typical active-month range (middle 50%):{" "}
          {formatCents(item.rangeLowCents)} – {formatCents(item.rangeHighCents)}
        </li>
        <li>
          Recent {Math.min(3, item.monthsObserved)}-month average:{" "}
          {formatCents(item.recentThreeMonthAverageCents)}
        </li>
        <li>
          Median amount deviation: {item.variabilityPercent}% · Consistency:{" "}
          {item.consistency}
        </li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Observed month</th>
            <th>Net spend</th>
          </tr>
        </thead>
        <tbody>
          {item.monthly.map((m) => (
            <tr key={m.month}>
              <td>{m.month}</td>
              <td>{formatCents(m.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
export function MonthlyBaselineSection({
  baseline,
  year,
  targetMonth,
}: {
  baseline: MonthlyBaseline;
  year: number;
  targetMonth: string;
}) {
  const [state, action, pending] = useActionState(applyBaseline, {
    message: "",
  });
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      baseline.skeleton.map((line) => [
        line.categoryId,
        {
          amount: `${Math.floor(line.typicalCents / 100)}.${String(line.typicalCents % 100).padStart(2, "0")}`,
          group: line.group,
          included: true,
        },
      ]),
    ),
  );
  const total = baseline.skeleton.reduce(
    (sum, line) =>
      drafts[line.categoryId].included
        ? sum + (parseAmountToCents(drafts[line.categoryId].amount) ?? 0)
        : sum,
    0,
  );
  return (
    <section className="card">
      <h2>Monthly Baseline</h2>
      <h3>Your regular month</h3>
      <p>
        Based on {baseline.months.length} calendar months in {year}. Medians
        reduce the effect of one-off spikes. Months without transactions between
        the first and last observed month count as zero; incomplete exports and
        partial months reduce reliability.
      </p>
      <div className="month-strip">
        <div>
          <span>Regular monthly spend</span>
          <strong>{formatCents(baseline.regularTotalCents)}</strong>
        </div>
        <div>
          <span>Periodic monthly reserves</span>
          <strong>{formatCents(baseline.periodicReserveCents)}</strong>
        </div>
        <div>
          <span>Edited starter budget</span>
          <strong>{formatCents(total)}</strong>
        </div>
      </div>
      <h3>Recurring monthly commitments</h3>
      <p>
        Merchant patterns are included in category totals below; they are not
        added twice. Repeated shopping can look like a commitment, so review the
        evidence.
      </p>
      {baseline.merchants
        .filter((m) => m.classification.startsWith("recurring"))
        .map((m) => (
          <article key={m.name}>
            <h4>
              {m.name} · {formatCents(m.typicalCents)}/month
            </h4>
            <p>
              {m.classification} · {m.monthsAppearing}/{m.monthsObserved} months
              · {m.consistency} consistency
            </p>
            <Evidence item={m} />
          </article>
        ))}
      {!baseline.merchants.some((m) =>
        m.classification.startsWith("recurring"),
      ) && <p>Not enough history to identify monthly commitments yet.</p>}
      <h3>Editable starter budget</h3>
      <p>
        Amounts are median monthly estimates, or reserves for periodic expenses.
        Group guesses are editable. Applying replaces only selected categories
        in the chosen month; other allocations and all transactions are
        preserved. Group edits apply to the category across months. This is a
        spending draft, not a claim that income already funds it.
      </p>
      <form action={action}>
        <input type="hidden" name="year" value={year} />
        <label>
          Budget month{" "}
          <input
            type="month"
            name="month"
            defaultValue={targetMonth}
            required
          />
        </label>
        {GROUPS.map(([key, label]) => (
          <fieldset key={key}>
            <legend>{label}</legend>
            {baseline.skeleton
              .filter((line) => drafts[line.categoryId].group === key)
              .map((line) => (
                <article key={line.categoryId}>
                  <label>
                    <input
                      type="checkbox"
                      name="category"
                      value={line.categoryId}
                      checked={drafts[line.categoryId].included}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [line.categoryId]: {
                            ...drafts[line.categoryId],
                            included: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    {line.name}
                  </label>
                  <p>
                    {line.classification} · Suggested{" "}
                    {formatCents(line.typicalCents)}/month · {line.consistency}{" "}
                    consistency
                  </p>
                  <label>
                    Monthly amount ($){" "}
                    <input
                      name={`amount:${line.categoryId}`}
                      inputMode="decimal"
                      value={drafts[line.categoryId].amount}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [line.categoryId]: {
                            ...drafts[line.categoryId],
                            amount: e.target.value,
                          },
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Budget group{" "}
                    <select
                      name={`group:${line.categoryId}`}
                      value={drafts[line.categoryId].group}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [line.categoryId]: {
                            ...drafts[line.categoryId],
                            group: e.target.value as typeof line.group,
                          },
                        })
                      }
                    >
                      {GROUPS.map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Evidence item={line} />
                </article>
              ))}
          </fieldset>
        ))}
        {!baseline.skeleton.length && (
          <p>
            No regular categories yet. At least three spending months are needed
            for suggestions.
          </p>
        )}
        <label>
          <input type="checkbox" name="confirm" value="yes" required /> I
          confirm replacing the selected amounts in this budget month.
        </label>
        <button disabled={pending || !baseline.skeleton.length}>
          {pending ? "Saving…" : "Use this as my starting budget"}
        </button>
        <p role="status">{state.message}</p>
        {state.month && (
          <Link href={`/planner?month=${state.month}`}>
            Open your {state.month} monthly planner
          </Link>
        )}
      </form>
      <h3>Keep outside your regular budget</h3>
      {baseline.excluded.map((item) => (
        <article key={item.name}>
          <h4>{item.name}</h4>
          <p>
            {item.classification} · {item.monthsAppearing}/{item.monthsObserved}{" "}
            months · typical active-month cost {formatCents(item.typicalCents)}
          </p>
          <Evidence item={item} />
        </article>
      ))}
      {!baseline.excluded.length && <p>No irregular categories identified.</p>}
      <details>
        <summary>
          All merchant patterns, including periodic and irregular expenses
        </summary>
        {baseline.merchants.map((item) => (
          <article key={item.name}>
            <h4>
              {item.name} · {item.classification}
            </h4>
            <p>
              {formatCents(item.typicalCents)}{" "}
              {item.classification === "periodic"
                ? "monthly reserve"
                : "typical spend"}
            </p>
            <Evidence item={item} />
          </article>
        ))}
      </details>
    </section>
  );
}
