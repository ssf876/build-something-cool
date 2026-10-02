import { parseCsv } from "@/src/feed/csv";
import {
  parseAmountToCents,
  parseCalendarDate,
  deriveExternalId,
} from "@/src/feed/mapping";

export interface MonarchRow {
  date: string;
  payee: string;
  amountCents: number;
  account: string;
  category: string;
  note: string;
  externalId: string;
}
export function parseMonarch(text: string) {
  const [header, ...lines] = parseCsv(text);
  const headers = header?.map((h) => h.trim().toLowerCase()) ?? [];
  for (const required of [
    "date",
    "merchant",
    "amount",
    "account",
    "category",
  ]) {
    if (!headers.includes(required))
      throw new Error(`Not a Monarch export: missing ${required} column.`);
    if (headers.filter((h) => h === required).length !== 1)
      throw new Error(`Duplicate ${required} column.`);
  }
  const rows: MonarchRow[] = [],
    errors: string[] = [];
  lines.forEach((line, index) => {
    if (line.every((c) => !c.trim())) return;
    const get = (key: string) => (line[headers.indexOf(key)] ?? "").trim();
    const date = parseCalendarDate(get("date"));
    const amountCents = parseAmountToCents(get("amount"));
    if (
      !date ||
      amountCents === null ||
      !Number.isSafeInteger(amountCents) ||
      Math.abs(amountCents) > 2147483647 ||
      !get("merchant") ||
      !get("account")
    ) {
      errors.push(
        `Row ${index + 2}: invalid date, amount, merchant, or account.`,
      );
      return;
    }
    const payee = get("merchant");
    rows.push({
      date,
      payee,
      amountCents,
      account: get("account"),
      category: get("category") || "Uncategorized",
      note: get("notes"),
      externalId:
        get("transaction id") || deriveExternalId({ date, payee, amountCents }),
    });
  });
  return { rows, errors };
}
export function isTransfer(category: string) {
  return /^(transfers?|credit card payments?|credit card payoffs?|balance adjustments?|account transfers?|internal transfers?|savings transfers?|investment transfers?|buy|sell)$/i.test(
    category.trim(),
  );
}
export function isIncome(category: string) {
  return /^(income|paychecks?|salary|interest|interest income|dividends?|business income|other income|rental income|investment income|bonus|bonuses)$/i.test(
    category.trim(),
  );
}
