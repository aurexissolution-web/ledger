/**
 * Chili price-per-kg trend for one calendar year, month by month.
 *
 * A month's price is weighted by kg — Σ(price × kg) ÷ Σkg — so it reflects
 * what was actually earned per kg, not an average of sale prices. Sales at
 * RM0 (given away) are left out: they aren't a market price.
 *
 * Months are bucketed in the runtime's local time, matching how sale dates
 * are entered and shown (client/src/lib/format.ts saves them at local noon).
 *
 * Each grade gets its own trend: a sale's grade lines are split into one
 * price point per grade (see gradePoints / buildGradeTrends).
 */
import { CHILI_GRADES, type ChiliGrade, type ChiliGradeLine } from "./schema";

export type PriceTrendSale = {
  id: number;
  saleDate: number;
  recipientName: string;
  quantityKg: string;
  pricePerKgCents: number;
};

export type MonthPrice = {
  /** 0 = January … 11 = December. */
  month: number;
  saleCount: number;
  kg: number;
  /** Weighted by kg, full precision; null when the month has no priced sales. */
  avgPerKgCents: number | null;
  minPerKgCents: number | null;
  maxPerKgCents: number | null;
  /** The month's priced sales, oldest first. */
  sales: PriceTrendSale[];
};

export type PriceTrend = {
  year: number;
  /** Always 12 entries, January first. */
  months: MonthPrice[];
  saleCount: number;
  kg: number;
  avgPerKgCents: number | null;
  bestMonth: number | null;
  lowestMonth: number | null;
  latest: { saleDate: number; pricePerKgCents: number } | null;
};

const byDateThenId = (a: PriceTrendSale, b: PriceTrendSale) => a.saleDate - b.saleDate || a.id - b.id;

function isPriced(sale: PriceTrendSale) {
  return sale.pricePerKgCents > 0 && Number(sale.quantityKg) > 0;
}

function weightedAverage(sales: PriceTrendSale[]): { kg: number; avgPerKgCents: number | null } {
  let kg = 0;
  let value = 0;
  for (const sale of sales) {
    const saleKg = Number(sale.quantityKg);
    kg += saleKg;
    value += sale.pricePerKgCents * saleKg;
  }
  return { kg, avgPerKgCents: kg > 0 ? value / kg : null };
}

export function buildPriceTrend(sales: PriceTrendSale[], year: number): PriceTrend {
  const inYear = sales.filter(sale => isPriced(sale) && new Date(sale.saleDate).getFullYear() === year).sort(byDateThenId);

  const months: MonthPrice[] = Array.from({ length: 12 }, (_, month) => {
    const monthSales = inYear.filter(sale => new Date(sale.saleDate).getMonth() === month);
    const prices = monthSales.map(sale => sale.pricePerKgCents);
    return {
      month,
      saleCount: monthSales.length,
      ...weightedAverage(monthSales),
      minPerKgCents: prices.length ? Math.min(...prices) : null,
      maxPerKgCents: prices.length ? Math.max(...prices) : null,
      sales: monthSales,
    };
  });

  let bestMonth: number | null = null;
  let lowestMonth: number | null = null;
  for (const { month, avgPerKgCents } of months) {
    if (avgPerKgCents === null) continue;
    // Strict comparisons keep the earlier month on a tie.
    if (bestMonth === null || avgPerKgCents > months[bestMonth].avgPerKgCents!) bestMonth = month;
    if (lowestMonth === null || avgPerKgCents < months[lowestMonth].avgPerKgCents!) lowestMonth = month;
  }

  const last = inYear.at(-1);
  return {
    year,
    months,
    saleCount: inYear.length,
    ...weightedAverage(inYear),
    bestMonth,
    lowestMonth,
    latest: last ? { saleDate: last.saleDate, pricePerKgCents: last.pricePerKgCents } : null,
  };
}

export type GradedSale = {
  id: number;
  saleDate: number;
  recipientName: string;
  /** Missing or empty on sales recorded before grades existed. */
  gradeLines?: Pick<ChiliGradeLine, "grade" | "quantityKg" | "pricePerKgCents">[] | null;
};

/** One price point per sale that includes `grade`. Sales without grade lines are skipped. */
export function gradePoints(sales: GradedSale[], grade: ChiliGrade): PriceTrendSale[] {
  return sales.flatMap(sale =>
    (sale.gradeLines ?? [])
      .filter(line => line.grade === grade)
      .map(line => ({ id: sale.id, saleDate: sale.saleDate, recipientName: sale.recipientName, quantityKg: line.quantityKg, pricePerKgCents: line.pricePerKgCents })),
  );
}

export function buildGradeTrends(sales: GradedSale[], year: number): Record<ChiliGrade, PriceTrend> {
  return Object.fromEntries(CHILI_GRADES.map(grade => [grade, buildPriceTrend(gradePoints(sales, grade), year)])) as Record<ChiliGrade, PriceTrend>;
}

/** Years with a priced sale of any grade, plus the current year, newest first. */
export function gradedTrendYears(sales: GradedSale[], currentYear: number): number[] {
  return priceTrendYears(CHILI_GRADES.flatMap(grade => gradePoints(sales, grade)), currentYear);
}

/** Years that have priced sales, plus the current year, newest first. */
export function priceTrendYears(sales: PriceTrendSale[], currentYear: number): number[] {
  const years = new Set([currentYear]);
  for (const sale of sales) if (isPriced(sale)) years.add(new Date(sale.saleDate).getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
