import { CHILI_GRADES, type ChiliGrade, type ChiliSale } from "../shared/schema";

export type SubconTotalsInput = {
  incomeCents: number;
  expenseCents: number;
  workerPaymentCents: number;
};

export type ChiliTotalsInput = {
  totalCents: number;
};

export type ChiliExpenseTotalsInput = {
  amountCents: number;
};

export function calculateSubconTotals(records: SubconTotalsInput[]) {
  return records.reduce(
    (totals, record) => ({
      incomeCents: totals.incomeCents + record.incomeCents,
      outgoingsCents: totals.outgoingsCents + record.expenseCents + record.workerPaymentCents,
      workerPaymentsCents: totals.workerPaymentsCents + record.workerPaymentCents,
    }),
    { incomeCents: 0, outgoingsCents: 0, workerPaymentsCents: 0 },
  );
}

export function calculateSubconProjectProfit(record: SubconTotalsInput) {
  return record.incomeCents - record.expenseCents - record.workerPaymentCents;
}

export function calculateChiliTotals(sales: ChiliTotalsInput[], expenses: ChiliExpenseTotalsInput[]) {
  const incomeCents = sales.reduce((total, sale) => total + sale.totalCents, 0);
  const outgoingsCents = expenses.reduce((total, expense) => total + expense.amountCents, 0);
  return { incomeCents, outgoingsCents };
}

export function calculateSaleTotalCents(quantityKg: number, pricePerKgCents: number) {
  return Math.round(quantityKg * pricePerKgCents);
}

export type GradeLineInput = { grade: ChiliGrade; quantityKg: number; pricePerKgCents: number };

/**
 * Turns the form's grade rows into stored grade lines plus the sale-level
 * fields every other view reads: total kg, total money, and the kg-weighted
 * price per kg.
 */
export function calculateGradedSale(lines: GradeLineInput[]): Pick<ChiliSale, "gradeLines" | "quantityKg" | "pricePerKgCents" | "totalCents"> {
  const sorted = [...lines].sort((a, b) => CHILI_GRADES.indexOf(a.grade) - CHILI_GRADES.indexOf(b.grade));
  const gradeLines = sorted.map(line => ({
    grade: line.grade,
    quantityKg: line.quantityKg.toFixed(2),
    pricePerKgCents: line.pricePerKgCents,
    totalCents: calculateSaleTotalCents(line.quantityKg, line.pricePerKgCents),
  }));
  const kg = sorted.reduce((sum, line) => sum + line.quantityKg, 0);
  const value = sorted.reduce((sum, line) => sum + line.quantityKg * line.pricePerKgCents, 0);
  return {
    gradeLines,
    quantityKg: kg.toFixed(2),
    pricePerKgCents: kg > 0 ? Math.round(value / kg) : 0,
    totalCents: gradeLines.reduce((sum, line) => sum + line.totalCents, 0),
  };
}
