# Sika Planner

Zero-based budgeting that answers one question instantly: how much do I actually
have left, right now, in every category — including what I put on a credit card
or pulled from an ATM.

Desktop-first web app: Next.js (App Router) + TypeScript strict + SQLite via
Prisma, with Vitest unit tests and Playwright wired for e2e.

## Getting started

```bash
pnpm install
cp .env.example .env   # SQLite file location for local dev
pnpm db:migrate        # apply Prisma migrations
pnpm dev               # http://localhost:3000
```

## Commands

| Command           | What it does                        |
| ----------------- | ----------------------------------- |
| `pnpm lint`       | ESLint (flat config)                |
| `pnpm typecheck`  | `tsc --noEmit`                      |
| `pnpm test`       | Vitest unit tests                   |
| `pnpm test:e2e`   | Playwright (needs `pnpm dev` or CI) |
| `pnpm build`      | Production build                    |
| `pnpm format`     | Prettier write                      |
| `pnpm db:migrate` | `prisma migrate dev` (local)        |
| `pnpm db:deploy`  | `prisma migrate deploy` (CI-like)   |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, migrations,
and the production build on every PR.

## Conventions

- **Money is Int cents everywhere** — never floats. See `lib/money.ts`.
- Package manager is **pnpm** (pinned via `packageManager`).
- Full product spec lives in the Obvious project ("Sika Planner — v1 Product &
  Technical Spec").

## Local financial analysis MVP

Use Node >=20 and the pinned pnpm version (or `corepack pnpm`).

```bash
pnpm install
cp .env.example .env
pnpm db:deploy
pnpm db:generate
pnpm dev:local
```

Open http://127.0.0.1:3000. Local mode bypasses authentication/onboarding and
uses a dedicated `sika-local` household. It is single-user: keep this server
bound to loopback. The normal `pnpm dev` retains authentication unless
`SIKA_LOCAL_MODE=true` is explicitly configured.

Download Transactions from Monarch, then upload the CSV on Financial Review.
Required headers: Date, Merchant, Category, Account, Amount. Notes and
Transaction ID are optional. Dates accept ISO or M/D/YYYY; signed amounts use
negative expenses and positive credits. Try `examples/monarch-demo.csv` first.
Data is persisted in SQLite; there is no external model or network inference.
The 10 MB upload limit is enforced server-side.

Analytics include unreviewed transactions. Income categories (e.g. Paychecks,
Interest, Other Income) count as income; credits in expense categories offset
spending. Positive uncategorized transactions count as income. Transfer,
Credit Card Payment, and Balance Adjustments categories are excluded.
Check Monarch categories before exporting: ambiguous categories can affect
these classifications. Account balances and net worth are not inferred.

Dedupe uses the existing account/date/merchant/amount key, or Transaction ID
when present. Identical same-day purchases without IDs collapse to one row.
Renaming an account/merchant or changing an amount changes that identity.
Recurring expenses require three consecutive months with stable monthly
merchant totals; spending anomalies need three observed months. Partial
months and incomplete exports can skew the baselines. Events are deterministic
suggestions with transaction evidence, not facts. Confirm, rename, dismiss,
and restore decisions persist in the existing LifeEvent table. The pure signal
objects include source, kind, and transaction IDs for later model interpretation.

### Monthly Baseline and starter budget

Financial Review includes **Your regular month** for the selected year. It
classifies category and merchant patterns as recurring fixed, recurring
variable, periodic, or irregular/seasonal. Monthly estimates use medians;
periodic items use the median active-month cost divided by their observed
interval as a monthly reserve. Merchant estimates are informational and are
not added on top of category totals.

Expand **Why this amount?** for months observed, the active-month median,
typical range, recent three-month average, variability, and monthly evidence.
Calendar gaps within the export's date span count as zero; incomplete exports
and partial months can reduce accuracy. At least three spending months are
needed for regular/periodic suggestions. Event/travel categories and sparse
one-off spending are excluded from the default budget skeleton.

Edit amounts and groups, deselect unwanted categories, choose a budget month,
and check the confirmation box before clicking **Use this as my starting
budget**. Applying replaces selected category allocations atomically, preserves
other allocations and transaction history, and opens that month in the existing
planner. Category group edits apply across months. An unfunded draft may show
negative Ready to Assign; the baseline does not fabricate income.
