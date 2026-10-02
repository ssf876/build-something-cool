"use client";
import { useActionState } from "react";
import { uploadMonarch } from "./actions";
export function Upload() {
  const [message, action, pending] = useActionState(uploadMonarch, "");
  return (
    <form action={action} className="card">
      <h2>Upload your Monarch export</h2>
      <p>
        Use Download Transactions in Monarch. Expenses are negative; income is
        positive. Your data stays in this local SQLite database.
      </p>
      <label htmlFor="csv">Transactions CSV</label>
      <input id="csv" name="csv" type="file" accept=".csv,text/csv" required />
      <button disabled={pending}>
        {pending ? "Importing…" : "Upload and analyze"}
      </button>
      <p role="status">{message}</p>
      <p className="muted">
        Re-uploading skips existing account/date/merchant/amount matches.
        Identical same-day purchases without transaction IDs collapse to one
        row. Export categories determine transfers, income, and refunds.
      </p>
    </form>
  );
}
