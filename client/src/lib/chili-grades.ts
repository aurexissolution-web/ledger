import { CHILI_GRADES, type ChiliGrade, type ChiliGradeLine } from "../../../shared/schema";
import { formatKg } from "./chili-price-format";
import { centsToInput, formatMoney, moneyToCents } from "./format";

export { CHILI_GRADES, type ChiliGrade };

/**
 * Grade colours for charts and badges. Validated as a pair on the card surface
 * (#fffdf8) for lightness, chroma, colour-blind separation and 3:1 contrast.
 */
export const GRADE_COLORS: Record<ChiliGrade, string> = { A: "#b34d2e", B: "#3b6fb6" };

type SaleWithGrades = { quantityKg: string; pricePerKgCents: number; totalCents: number; gradeLines?: ChiliGradeLine[] | null };

/** A sale's grade lines. Sales recorded before grades existed come back as one line with `grade: null`. */
export function saleLines(sale: SaleWithGrades): (Omit<ChiliGradeLine, "grade"> & { grade: ChiliGrade | null })[] {
  if (sale.gradeLines?.length) return sale.gradeLines;
  return [{ grade: null, quantityKg: sale.quantityKg, pricePerKgCents: sale.pricePerKgCents, totalCents: sale.totalCents }];
}

/** "A · 30 kg @ RM12.00" (or "30 kg @ RM12.00" for an ungraded sale). */
export function describeLine(line: ReturnType<typeof saleLines>[number]) {
  return `${line.grade ? `${line.grade} · ` : ""}${formatKg(Number(line.quantityKg))} @ ${formatMoney(line.pricePerKgCents)}`;
}

/* ---- Sale form rows --------------------------------------------------- */

export type GradeRow = { kg: string; price: string };
export type GradeRows = Record<ChiliGrade, GradeRow>;

export const blankGradeRows = (): GradeRows => ({ A: { kg: "", price: "" }, B: { kg: "", price: "" } });

/** Fill the form from a saved sale; an ungraded older sale opens as Grade A. */
export function gradeRowsFromSale(sale: SaleWithGrades): GradeRows {
  const rows = blankGradeRows();
  for (const line of saleLines(sale)) rows[line.grade ?? "A"] = { kg: line.quantityKg, price: centsToInput(line.pricePerKgCents) };
  return rows;
}

/** Rows with a kg amount, in the shape the server's `grades` input expects. */
export function gradeRowsToInput(rows: GradeRows) {
  return CHILI_GRADES.filter(grade => Number(rows[grade].kg) > 0).map(grade => ({
    grade,
    quantityKg: Number(rows[grade].kg),
    pricePerKgCents: moneyToCents(rows[grade].price || "0"),
  }));
}

/** Same rounding as the server's calculateSaleTotalCents. */
export function gradeRowTotalCents(row: GradeRow) {
  return Math.round(Number(row.kg || 0) * moneyToCents(row.price || "0"));
}

/** Most recent price per grade, from sales listed newest first. */
export function latestGradePrices(sales: SaleWithGrades[]): Partial<Record<ChiliGrade, number>> {
  const latest: Partial<Record<ChiliGrade, number>> = {};
  for (const sale of sales) {
    for (const line of sale.gradeLines ?? []) if (latest[line.grade] === undefined) latest[line.grade] = line.pricePerKgCents;
  }
  return latest;
}
