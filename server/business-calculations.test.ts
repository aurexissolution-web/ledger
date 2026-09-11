import { describe, expect, it } from "vitest";
import { calculateChiliTotals, calculateSaleTotalCents, calculateSubconProjectProfit, calculateSubconTotals } from "./business-calculations";

describe("business calculations", () => {
  it("calculates Subcon income, outgoings, worker payments, and profit inputs", () => {
    expect(calculateSubconTotals([
      { incomeCents: 150_000, expenseCents: 18_000, workerPaymentCents: 45_000 },
      { incomeCents: 80_000, expenseCents: 2_500, workerPaymentCents: 25_000 },
    ])).toEqual({ incomeCents: 230_000, outgoingsCents: 90_500, workerPaymentsCents: 70_000 });
  });

  it("calculates the profit and loss for one Subcon project after staff pay and other costs", () => {
    expect(calculateSubconProjectProfit({ incomeCents: 150_000, expenseCents: 18_000, workerPaymentCents: 45_000 })).toBe(87_000);
    expect(calculateSubconProjectProfit({ incomeCents: 20_000, expenseCents: 12_000, workerPaymentCents: 15_000 })).toBe(-7_000);
  });

  it("calculates Chili income and daily outgoings", () => {
    expect(calculateChiliTotals([{ totalCents: 44_000 }, { totalCents: 10_500 }], [{ amountCents: 5_000 }, { amountCents: 1_250 }]))
      .toEqual({ incomeCents: 54_500, outgoingsCents: 6_250 });
  });

  it("calculates a sale total from quantity and price per kilogram", () => {
    expect(calculateSaleTotalCents(12.5, 880)).toBe(11_000);
  });
});

