import type { MonthPrice } from "../../../shared/chili-price-trend";
import { formatMoney } from "./format";

export const shortMonth = (month: number) => new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2000, month, 1));
export const longMonth = (month: number) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2000, month, 1));
export const perKg = (cents: number | null) => (cents === null ? "—" : `${formatMoney(Math.round(cents))}/kg`);
export const formatKg = (kg: number) => `${kg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;

export function priceRange({ minPerKgCents: min, maxPerKgCents: max }: Pick<MonthPrice, "minPerKgCents" | "maxPerKgCents">) {
  if (min === null || max === null) return "—";
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}
