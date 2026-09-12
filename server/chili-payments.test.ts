import { describe, expect, it } from "vitest";
import { summarizeOwed, type PayableSale } from "../shared/chili-payments";

let nextId = 1;
function sale(day: number, customerId: number | null, recipientName: string, totalCents: number, paidAt: number | null = null): PayableSale {
  return { id: nextId++, saleDate: new Date(2026, 8, day, 12).getTime(), customerId, recipientName, totalCents, paidAt };
}

describe("summarizeOwed", () => {
  it("adds up unpaid sales per customer and ignores paid ones", () => {
    const summary = summarizeOwed([
      sale(1, 3, "Kedai Ah Seng", 36_000),
      sale(8, 3, "Kedai Ah Seng", 20_000),
      sale(2, 4, "Pasar Tani", 15_000, new Date(2026, 8, 2, 12).getTime()),
      sale(5, 4, "Pasar Tani", 9_000),
    ]);
    expect(summary.totalCents).toBe(65_000);
    expect(summary.count).toBe(3);
    expect(summary.customers.map(c => [c.recipientName, c.count, c.owedCents])).toEqual([
      ["Kedai Ah Seng", 2, 56_000],
      ["Pasar Tani", 1, 9_000],
    ]);
  });

  it("lists each customer's unpaid sales oldest first and records the oldest date", () => {
    const newer = sale(9, 3, "Kedai", 100);
    const older = sale(2, 3, "Kedai", 100);
    const [group] = summarizeOwed([newer, older]).customers;
    expect(group.sales.map(s => s.id)).toEqual([older.id, newer.id]);
    expect(group.oldestSaleDate).toBe(older.saleDate);
  });

  it("puts the biggest balance first, then the longest-waiting on a tie", () => {
    const summary = summarizeOwed([sale(5, 1, "B", 500), sale(1, 2, "A", 500), sale(3, 3, "C", 900)]);
    expect(summary.customers.map(c => c.recipientName)).toEqual(["C", "A", "B"]);
  });

  it("groups sales recorded before the customer roster by name", () => {
    const summary = summarizeOwed([sale(1, null, "Old Buyer", 100), sale(2, null, "Old Buyer", 200), sale(3, 7, "Old Buyer", 50)]);
    expect(summary.customers.map(c => [c.key, c.owedCents])).toEqual([["name:Old Buyer", 300], ["id:7", 50]]);
  });

  it("is empty when everything is paid", () => {
    expect(summarizeOwed([sale(1, 1, "A", 100, 1)])).toEqual({ totalCents: 0, count: 0, customers: [] });
  });
});
