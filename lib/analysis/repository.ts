import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseMonarch, isIncome, isTransfer } from "./monarch";
import { buildMonthlyBaseline } from "./baseline";
import { analyze } from "./signals";

export async function importMonarch(householdId: string, text: string) {
  const parsed = parseMonarch(text);
  let imported = 0,
    duplicates = 0;
  await prisma.$transaction(
    async (db) => {
      const accounts = await db.account.findMany({ where: { householdId } });
      const categories = await db.category.findMany({ where: { householdId } });
      for (const row of parsed.rows) {
        let account = accounts.find((a) => a.name === row.account);
        if (!account) {
          account = await db.account.create({
            data: {
              householdId,
              name: row.account,
              kind: "CHECKING",
              startingCents: 0,
            },
          });
          accounts.push(account);
        }
        let category = categories.find((c) => c.name === row.category);
        if (!category) {
          category = await db.category.create({
            data: { householdId, name: row.category, group: "NEEDS" },
          });
          categories.push(category);
        }
        if (
          await db.transaction.findUnique({
            where: {
              accountId_externalId: {
                accountId: account.id,
                externalId: row.externalId,
              },
            },
          })
        ) {
          duplicates++;
          continue;
        }
        await db.transaction.create({
          data: {
            accountId: account.id,
            categoryId: category.id,
            externalId: row.externalId,
            date: new Date(`${row.date}T00:00:00Z`),
            payee: row.payee,
            amountCents: row.amountCents,
            note: row.note || null,
            kind: isTransfer(row.category)
              ? "TRANSFER"
              : isIncome(row.category) ||
                  (row.category === "Uncategorized" && row.amountCents > 0)
                ? "INCOME"
                : "EXPENSE",
            reviewState: "AUTO_ACCEPTED",
          },
        });
        imported++;
      }
    },
    { timeout: 120000 },
  );
  return { imported, duplicates, errors: parsed.errors };
}
export async function loadAnalysis(
  householdId: string,
  requestedYear?: number,
) {
  const stored = await prisma.transaction.findMany({
    where: { account: { householdId }, pending: false },
    include: { account: true, category: true },
    orderBy: { date: "asc" },
  });
  const rows = stored.map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    payee: t.payee,
    amountCents: t.amountCents,
    category: t.category?.name ?? "Uncategorized",
    account: t.account.name,
    kind: t.kind,
  }));
  const years = [...new Set(rows.map((t) => Number(t.date.slice(0, 4))))].sort(
    (a, b) => b - a,
  );
  const year =
    requestedYear && years.includes(requestedYear)
      ? requestedYear
      : (years[0] ?? new Date().getFullYear());
  const result = analyze(rows, year);
  const reviews = await prisma.lifeEvent.findMany({ where: { householdId } });
  const signals = result.signals.map((signal) => {
    const id = `analysis-${createHash("sha256").update(`${householdId}:${signal.id}`).digest("hex")}`;
    const review = reviews.find((r) => r.id === id);
    return {
      ...signal,
      reviewId: id,
      status: review?.status ?? "CANDIDATE",
      label: review?.evidence ?? signal.label,
    };
  });
  const categories = await prisma.category.findMany({ where: { householdId } });
  const baseline = buildMonthlyBaseline(result.rows, categories);
  return { ...result, signals, year, years, baseline };
}
