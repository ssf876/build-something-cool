"use server";
import type { CategoryGroup } from "@/src/engine";
import { parseAmountToCents } from "@/src/feed/mapping";
import { applyBudgetSkeleton } from "@/lib/repositories/planner";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { importMonarch, loadAnalysis } from "@/lib/analysis/repository";

export async function uploadMonarch(_previous: string, form: FormData) {
  const user = await requireOnboardedUser();
  const file = form.get("csv");
  if (!(file instanceof File) || !file.size)
    return "Choose a Monarch CSV file.";
  if (file.size > 10 * 1024 * 1024)
    return "Please use a CSV smaller than 10 MB.";
  try {
    const result = await importMonarch(user.householdId, await file.text());
    revalidatePath("/analysis");
    return `Imported ${result.imported} transactions; skipped ${result.duplicates} duplicates; rejected ${result.errors.length} rows. ${result.errors.slice(0, 20).join(" ")}`;
  } catch (error) {
    return error instanceof Error && /CSV|column|quote/.test(error.message)
      ? error.message
      : "Import failed; no transactions were saved. Check the CSV and local database setup.";
  }
}
export async function reviewEvent(form: FormData) {
  const user = await requireOnboardedUser();
  const data = await loadAnalysis(user.householdId, Number(form.get("year")));
  const signal = data.signals.find((s) => s.reviewId === form.get("id"));
  const status = String(form.get("status"));
  if (!signal || !["CONFIRMED", "DISMISSED", "CANDIDATE"].includes(status))
    throw new Error("Invalid event review.");
  const label =
    String(form.get("label") ?? signal.label)
      .trim()
      .slice(0, 120) || signal.label;
  const fields = {
    householdId: user.householdId,
    kind: signal.kind,
    status: status as "CONFIRMED" | "DISMISSED" | "CANDIDATE",
    evidence: label,
    seasonStart: new Date(`${signal.date}T00:00:00Z`),
  };
  await prisma.lifeEvent.upsert({
    where: { id: signal.reviewId },
    create: { id: signal.reviewId, ...fields },
    update: fields,
  });
  revalidatePath("/analysis");
}

export async function applyBaseline(
  _previous: { message: string; month?: string },
  form: FormData,
): Promise<{ message: string; month?: string }> {
  const user = await requireOnboardedUser();
  if (form.get("confirm") !== "yes")
    return {
      message: "Confirm replacing the selected category amounts first.",
    };
  try {
    const data = await loadAnalysis(user.householdId, Number(form.get("year")));
    const selected = form.getAll("category").map(String);
    const lines = selected.map((categoryId) => {
      if (
        !data.baseline.skeleton.some((line) => line.categoryId === categoryId)
      )
        throw new Error("Suggestions changed; reload the baseline.");
      const cents = parseAmountToCents(
        String(form.get(`amount:${categoryId}`)),
      );
      if (cents === null || cents < 0)
        throw new Error(
          "Enter a valid non-negative amount for every selected category.",
        );
      return {
        categoryId,
        cents,
        group: String(form.get(`group:${categoryId}`)) as CategoryGroup,
      };
    });
    const month = String(form.get("month"));
    await applyBudgetSkeleton(prisma, user.householdId, { month, lines });
    revalidatePath("/analysis");
    revalidatePath("/planner");
    return {
      message: `Starting budget saved for ${month}. Transaction history is unchanged.`,
      month,
    };
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Could not save the starting budget.",
    };
  }
}
