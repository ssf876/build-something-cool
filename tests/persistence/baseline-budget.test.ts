import { beforeEach, describe, expect, it } from "vitest";
import {
  resetDatabase,
  seedHousehold,
  testDb,
  type SeededHousehold,
} from "./test-db";
import {
  applyBudgetSkeleton,
  getPlannerSnapshot,
} from "@/lib/repositories/planner";
let seeded: SeededHousehold;
beforeEach(async () => {
  await resetDatabase();
  seeded = await seedHousehold(`baseline-${crypto.randomUUID()}`);
});
describe("Applying the starter budget", () => {
  it("populates planner allocations atomically without changing any transaction history", async () => {
    await testDb.transaction.createMany({
      data: [
        {
          accountId: seeded.accountIds.checking,
          categoryId: seeded.categoryIds.groceries,
          kind: "EXPENSE",
          amountCents: -12000,
          date: new Date("2026-09-02"),
          payee: "Grocer",
          reviewState: "AUTO_ACCEPTED",
        },
        {
          accountId: seeded.accountIds.checking,
          categoryId: seeded.categoryIds.groceries,
          kind: "EXPENSE",
          amountCents: 1000,
          date: new Date("2026-09-03"),
          payee: "Grocer refund",
          reviewState: "AUTO_ACCEPTED",
        },
      ],
    });
    const before = await testDb.transaction.findMany({
      orderBy: { id: "asc" },
    });
    await testDb.allocation.update({
      where: {
        monthId_categoryId: {
          monthId: seeded.monthId,
          categoryId: seeded.categoryIds.diningOut,
        },
      },
      data: { assignedCents: 7500 },
    });
    await applyBudgetSkeleton(testDb, seeded.householdId, {
      month: "2026-09",
      lines: [
        {
          categoryId: seeded.categoryIds.groceries,
          cents: 25000,
          group: "NEEDS",
        },
      ],
    });
    const snapshot = await getPlannerSnapshot(
      testDb,
      seeded.householdId,
      "2026-09-01",
    );
    expect(
      snapshot.availability.find(
        (c) => c.categoryId === seeded.categoryIds.groceries,
      )?.assignedCents,
    ).toBe(25000);
    expect(
      snapshot.availability.find(
        (c) => c.categoryId === seeded.categoryIds.diningOut,
      )?.assignedCents,
    ).toBe(7500);
    expect(
      await testDb.transaction.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(before);
    await applyBudgetSkeleton(testDb, seeded.householdId, {
      month: "2026-10",
      lines: [
        {
          categoryId: seeded.categoryIds.diningOut,
          cents: 15000,
          group: "WANTS",
        },
      ],
    });
    expect(
      (
        await getPlannerSnapshot(testDb, seeded.householdId, "2026-10-01")
      ).availability.find((c) => c.categoryId === seeded.categoryIds.diningOut)
        ?.assignedCents,
    ).toBe(15000);
    expect(
      await testDb.transaction.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(before);
  });
  it("rejects foreign categories and invalid amounts without partial allocations", async () => {
    const other = await seedHousehold("other");
    const before = await testDb.allocation.findMany({ orderBy: { id: "asc" } });
    await expect(
      applyBudgetSkeleton(testDb, seeded.householdId, {
        month: "2026-10",
        lines: [
          {
            categoryId: seeded.categoryIds.groceries,
            cents: 10000,
            group: "NEEDS",
          },
          {
            categoryId: other.categoryIds.groceries,
            cents: 10000,
            group: "NEEDS",
          },
        ],
      }),
    ).rejects.toThrow("Unknown category");
    await expect(
      applyBudgetSkeleton(testDb, seeded.householdId, {
        month: "2026-13",
        lines: [],
      }),
    ).rejects.toThrow();
    await expect(
      applyBudgetSkeleton(testDb, seeded.householdId, {
        month: "2026-10",
        lines: [
          {
            categoryId: seeded.categoryIds.groceries,
            cents: -1,
            group: "NEEDS",
          },
        ],
      }),
    ).rejects.toThrow();
    expect(
      await testDb.allocation.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(before);
    expect(
      await testDb.month.findFirst({
        where: { householdId: seeded.householdId, month: 10 },
      }),
    ).toBeNull();
  });
});
