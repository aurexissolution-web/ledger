import { describe, expect, it } from "vitest";
import { buildCsv, csvEscape, reportToCsvRows } from "../shared/report-csv";

describe("csvEscape", () => {
  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsv", () => {
  it("joins rows with CRLF and prefixes a UTF-8 BOM for Excel", () => {
    const csv = buildCsv([["a", "b"], ["c,d", "e"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a,b\r\n"c,d",e\r\n');
  });
});

describe("reportToCsvRows", () => {
  const formatDate = (ts: number) => `date:${ts}`;
  const formatMoney = (cents: number) => `RM${(cents / 100).toFixed(2)}`;

  it("emits one row per job income, cost line, and worker payment, plus one row per sale and expense", () => {
    const rows = reportToCsvRows({
      subconJobs: [{
        workDate: 1,
        jobTitle: "Shop rewiring",
        clientName: "ABC Sdn Bhd",
        incomeCents: 500_000,
        costLines: [{ label: "Cables", amountCents: 15_000 }],
        workerPayments: [{ staffName: "Ali", amountCents: 120_000 }],
      }],
      chiliSales: [{ saleDate: 2, recipientName: "Pasar Tani", quantityKg: "10.00", totalCents: 8_000 }],
      chiliExpenses: [{ expenseDate: 3, category: "Fertiliser", amountCents: 5_000 }],
      formatDate,
      formatMoney,
    });

    expect(rows).toHaveLength(6); // header + income + cost line + worker payment + sale + expense
    expect(rows[1]).toEqual(["Subcon", "Income", "date:1", "Shop rewiring", "ABC Sdn Bhd", "", "RM5000.00", "", ""]);
    expect(rows[2]).toEqual(["Subcon", "Cost", "date:1", "Shop rewiring — Cables", "ABC Sdn Bhd", "", "", "RM150.00", ""]);
    expect(rows[3]).toEqual(["Subcon", "Staff payment", "date:1", "Shop rewiring", "Ali", "", "", "RM1200.00", ""]);
    expect(rows[4]).toEqual(["Chili", "Sale", "date:2", "Pasar Tani", "Pasar Tani", "10.00 kg", "RM80.00", "", ""]);
    expect(rows[5]).toEqual(["Chili", "Expense", "date:3", "Fertiliser", "", "", "", "RM50.00", ""]);
  });

  it("splits a graded chili sale into one row per grade that sum to the sale total", () => {
    const rows = reportToCsvRows({
      subconJobs: [],
      chiliSales: [{
        saleDate: 4,
        recipientName: "Kedai Ah Seng",
        quantityKg: "50.00",
        totalCents: 52_000,
        gradeLines: [
          { grade: "A", quantityKg: "30.00", pricePerKgCents: 1_200, totalCents: 36_000 },
          { grade: "B", quantityKg: "20.00", pricePerKgCents: 800, totalCents: 16_000 },
        ],
      }],
      chiliExpenses: [],
      formatDate,
      formatMoney,
    });

    expect(rows.slice(1)).toEqual([
      ["Chili", "Sale", "date:4", "Kedai Ah Seng — Grade A", "Kedai Ah Seng", "30.00 kg", "RM360.00", "", "RM12.00/kg"],
      ["Chili", "Sale", "date:4", "Kedai Ah Seng — Grade B", "Kedai Ah Seng", "20.00 kg", "RM160.00", "", "RM8.00/kg"],
    ]);
  });

  it("returns just the header when there are no records", () => {
    expect(reportToCsvRows({ subconJobs: [], chiliSales: [], chiliExpenses: [], formatDate, formatMoney })).toHaveLength(1);
  });
});
