import { requireOnboardedUser } from "@/lib/auth/session";
import { loadAnalysis } from "@/lib/analysis/repository";
import { formatCents } from "@/lib/money";
import { AppShell } from "@/components/shell/AppShell";
import { MonthlyBaselineSection } from "./baseline";
import { Upload } from "./upload";
import { reviewEvent } from "./actions";
export const dynamic = "force-dynamic";
export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const data = await loadAnalysis(user.householdId, Number(params.year));
  const table = (title: string, values: { name: string; cents: number }[]) => (
    <section className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Net spending</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <tr key={v.name}>
              <td>{v.name}</td>
              <td>{formatCents(v.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
  return (
    <AppShell active="analysis" title="Your financial year">
      <Upload />
      {!data.rows.length ? (
        <section className="card">
          <h2>Start with your transactions</h2>
          <p>
            Upload your Monarch CSV to see cash flow, recurring expenses,
            spending spikes, and possible life events. No budget setup required.
          </p>
        </section>
      ) : (
        <>
          <form>
            <label htmlFor="year">Year</label>
            <select id="year" name="year" defaultValue={data.year}>
              {data.years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <button>View year</button>
          </form>
          <section className="card">
            <h2>{data.year} summary</h2>
            <p>
              Observed coverage: {data.rows[0].date} to {data.rows.at(-1)?.date}{" "}
              · {data.rows.length} transactions. This is the uploaded data, not
              necessarily a complete year.
            </p>
            <div className="month-strip">
              {[
                ["Income", data.totalIncomeCents],
                ["Net spending", data.totalSpendingCents],
                ["Net cash flow", data.netCashflowCents],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{formatCents(Number(value))}</strong>
                </div>
              ))}
            </div>
            <p>
              {data.excludedTransfers} transfer/payment rows excluded.
              Expense-category credits offset spending as refunds. Positive
              uncategorized rows count as income. These totals are cash flow,
              not net worth.
            </p>
          </section>
          <MonthlyBaselineSection
            key={`${data.year}:${data.baseline.skeleton.map((line) => `${line.categoryId}:${line.typicalCents}`).join(",")}`}
            baseline={data.baseline}
            year={data.year}
            targetMonth={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
          />
          {table("Monthly spending", data.monthlySpending)}
          {table("Category spending", data.categorySpending)}
          {table("Merchant spending", data.merchantSpending)}
          <section className="card">
            <h2>Recurring monthly expenses</h2>
            <p>
              Likely recurring merchants: at least three consecutive observed
              months with monthly totals within 20% of the median. This can
              include regular shopping; it is not proof of a subscription.
            </p>
            {data.recurring.length ? (
              <ul>
                {data.recurring.map((r) => (
                  <li key={r.merchant}>
                    <strong>{r.merchant}</strong> · typically{" "}
                    {formatCents(r.cents)}/month · {r.months} months
                  </li>
                ))}
              </ul>
            ) : (
              <p>No stable monthly pattern detected yet.</p>
            )}
          </section>
          <section className="card">
            <h2>Unusually large transactions</h2>
            {data.largeTransactions.length ? (
              <ul>
                {data.largeTransactions.map((t) => (
                  <li key={t.id}>
                    {t.date} · {t.payee} · {formatCents(-t.amountCents)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No transactions exceed the current large-purchase threshold.
              </p>
            )}
          </section>
          <section className="card">
            <h2>Your year</h2>
            <p>
              Chronological suggestions from spending signals and keyword rules.
              No ML is used. Confirming an item records your interpretation.
            </p>
            {data.signals
              .filter((s) => s.status !== "DISMISSED")
              .map((s) => (
                <article key={s.id} className="card">
                  <h3>
                    {s.date} · {s.label}
                  </h3>
                  <p>
                    {s.status === "CONFIRMED" ? "Confirmed" : "Possible event"}{" "}
                    · {s.explanation}
                  </p>
                  <details>
                    <summary>
                      Supporting transactions ({s.transactionIds.length})
                    </summary>
                    <ul>
                      {s.transactionIds.map((id) => {
                        const t = data.rows.find((t) => t.id === id)!;
                        return (
                          <li key={id}>
                            {t.date} · {t.payee} · {t.category} · {t.account} ·{" "}
                            {formatCents(t.amountCents)}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                  <form action={reviewEvent}>
                    <input type="hidden" name="id" value={s.reviewId} />
                    <input type="hidden" name="year" value={data.year} />
                    <label>
                      Event name{" "}
                      <input
                        name="label"
                        defaultValue={s.label}
                        maxLength={120}
                      />
                    </label>
                    <button name="status" value="CONFIRMED">
                      Confirm / save name
                    </button>
                    <button name="status" value="DISMISSED">
                      Dismiss
                    </button>
                  </form>
                </article>
              ))}
            {!data.signals.length && (
              <p>
                No strong event signals yet. Three or more observed months help
                detect anomalies.
              </p>
            )}
            {data.signals.some((s) => s.status === "DISMISSED") && (
              <details>
                <summary>Dismissed suggestions</summary>
                {data.signals
                  .filter((s) => s.status === "DISMISSED")
                  .map((s) => (
                    <form key={s.id} action={reviewEvent}>
                      <span>
                        {s.date} · {s.label}
                      </span>
                      <input type="hidden" name="id" value={s.reviewId} />
                      <input type="hidden" name="year" value={data.year} />
                      <button name="status" value="CANDIDATE">
                        Restore
                      </button>
                    </form>
                  ))}
              </details>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
