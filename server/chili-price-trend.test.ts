import { describe, expect, it } from "vitest";
import { buildPriceTrend, priceTrendYears, type PriceTrendSale } from "../shared/chili-price-trend";

let nextId = 1;
// Local noon, the same way the app saves sale dates.
function sale(year: number, month: number, day: number, kg: number, pricePerKgCents: number, recipientName = "Buyer"): PriceTrendSale {
  return { id: nextId++, saleDate: new Date(year, month, day, 12).getTime(), recipientName, quantityKg: kg.toFixed(2), pricePerKgCents };
}

describe("buildPriceTrend", () => {
  it("weights a month's price by kg, not by number of sales", () => {
    const trend = buildPriceTrend([sale(2026, 2, 3, 100, 1000), sale(2026, 2, 20, 10, 1400)], 2026);
    const march = trend.months[2];
    expect(march.avgPerKgCents).toBeCloseTo((100 * 1000 + 10 * 1400) / 110);
    expect(Math.round(march.avgPerKgCents!)).toBe(1036); // RM10.36/kg, not the RM12 simple average
    expect(march).toMatchObject({ saleCount: 2, kg: 110, minPerKgCents: 1000, maxPerKgCents: 1400 });
  });

  it("buckets sales into their month, including the January and December edges", () => {
    const trend = buildPriceTrend([sale(2026, 0, 1, 5, 800), sale(2026, 11, 31, 5, 1200), sale(2026, 5, 15, 5, 900)], 2026);
    expect(trend.months).toHaveLength(12);
    expect(trend.months.map(m => m.saleCount)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
    expect(trend.months[0].avgPerKgCents).toBe(800);
    expect(trend.months[11].avgPerKgCents).toBe(1200);
  });

  it("ignores other years and RM0 give-aways", () => {
    const trend = buildPriceTrend([sale(2025, 2, 3, 50, 2000), sale(2027, 2, 3, 50, 2000), sale(2026, 2, 3, 40, 0), sale(2026, 2, 4, 10, 1100)], 2026);
    expect(trend.saleCount).toBe(1);
    expect(trend.kg).toBe(10);
    expect(trend.months[2]).toMatchObject({ saleCount: 1, avgPerKgCents: 1100, minPerKgCents: 1100 });
  });

  it("leaves months without sales as gaps and finds the best and lowest months", () => {
    const trend = buildPriceTrend([sale(2026, 1, 10, 20, 900), sale(2026, 4, 10, 20, 1500), sale(2026, 8, 10, 20, 700)], 2026);
    expect(trend.months[0]).toMatchObject({ saleCount: 0, kg: 0, avgPerKgCents: null, minPerKgCents: null, maxPerKgCents: null });
    expect(trend.bestMonth).toBe(4);
    expect(trend.lowestMonth).toBe(8);
  });

  it("keeps the earlier month when two months tie", () => {
    const trend = buildPriceTrend([sale(2026, 3, 1, 10, 1000), sale(2026, 6, 1, 10, 1000)], 2026);
    expect(trend.bestMonth).toBe(3);
    expect(trend.lowestMonth).toBe(3);
  });

  it("weights the year average by kg and reports the latest priced sale", () => {
    const first = sale(2026, 0, 5, 100, 1000);
    const latest = sale(2026, 6, 9, 10, 2000);
    const trend = buildPriceTrend([latest, sale(2026, 6, 9, 5, 0), first], 2026);
    expect(trend.avgPerKgCents).toBeCloseTo((100 * 1000 + 10 * 2000) / 110);
    expect(trend.latest).toEqual({ saleDate: latest.saleDate, pricePerKgCents: 2000 });
    expect(trend.months[6].sales.map(s => s.id)).toEqual([latest.id]);
  });

  it("orders a month's sales oldest first, same-day sales by id", () => {
    const a = sale(2026, 2, 9, 1, 1000);
    const b = sale(2026, 2, 9, 1, 1100);
    const c = sale(2026, 2, 2, 1, 1200);
    expect(buildPriceTrend([b, a, c], 2026).months[2].sales.map(s => s.id)).toEqual([c.id, a.id, b.id]);
  });

  it("returns an empty trend for a year without sales", () => {
    const trend = buildPriceTrend([sale(2025, 5, 1, 10, 1000)], 2026);
    expect(trend).toMatchObject({ year: 2026, saleCount: 0, kg: 0, avgPerKgCents: null, bestMonth: null, lowestMonth: null, latest: null });
    expect(trend.months.every(m => m.saleCount === 0 && m.avgPerKgCents === null)).toBe(true);
  });
});

describe("priceTrendYears", () => {
  it("lists years with priced sales plus the current year, newest first, without duplicates", () => {
    const sales = [sale(2024, 3, 1, 5, 900), sale(2026, 3, 1, 5, 900), sale(2024, 8, 1, 5, 900), sale(2023, 1, 1, 5, 0)];
    expect(priceTrendYears(sales, 2027)).toEqual([2027, 2026, 2024]);
    expect(priceTrendYears([], 2026)).toEqual([2026]);
  });
});
