export type ReportCsvSubconJob = {
  workDate: number;
  jobTitle: string;
  clientName: string | null;
  incomeCents: number;
  costLines: { label: string; amountCents: number }[];
  workerPayments: { staffName: string; amountCents: number }[];
};
export type ReportCsvChiliSale = {
  saleDate: number;
  recipientName: string;
  quantityKg: string;
  totalCents: number;
  /** Empty on sales recorded before grades existed. */
  gradeLines?: { grade: string; quantityKg: string; pricePerKgCents: number; totalCents: number }[];
};
export type ReportCsvChiliExpense = { expenseDate: number; category: string; amountCents: number };

export type ReportCsvInput = {
  subconJobs: ReportCsvSubconJob[];
  chiliSales: ReportCsvChiliSale[];
  chiliExpenses: ReportCsvChiliExpense[];
  formatDate: (timestamp: number) => string;
  formatMoney: (cents: number) => string;
};

const HEADER = ["Business", "Type", "Date", "Description", "Party", "Qty", "Income (RM)", "Expense (RM)", "Notes"];
const UTF8_BOM = "﻿";

/** RFC-4180 quoting: wrap in quotes (doubling any inner quotes) whenever the field contains a comma, quote, or newline. */
export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(rows: string[][]): string {
  return UTF8_BOM + rows.map(row => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export function reportToCsvRows(input: ReportCsvInput): string[][] {
  const { formatDate, formatMoney } = input;
  const rows: string[][] = [HEADER];

  for (const job of input.subconJobs) {
    rows.push(["Subcon", "Income", formatDate(job.workDate), job.jobTitle, job.clientName ?? "", "", formatMoney(job.incomeCents), "", ""]);
    for (const line of job.costLines) {
      rows.push(["Subcon", "Cost", formatDate(job.workDate), `${job.jobTitle} — ${line.label}`, job.clientName ?? "", "", "", formatMoney(line.amountCents), ""]);
    }
    for (const payment of job.workerPayments) {
      rows.push(["Subcon", "Staff payment", formatDate(job.workDate), job.jobTitle, payment.staffName, "", "", formatMoney(payment.amountCents), ""]);
    }
  }

  for (const sale of input.chiliSales) {
    if (!sale.gradeLines?.length) {
      rows.push(["Chili", "Sale", formatDate(sale.saleDate), sale.recipientName, sale.recipientName, `${sale.quantityKg} kg`, formatMoney(sale.totalCents), "", ""]);
      continue;
    }
    // One row per grade (like Subcon cost lines), so rows still sum to the sale total.
    for (const line of sale.gradeLines) {
      rows.push(["Chili", "Sale", formatDate(sale.saleDate), `${sale.recipientName} — Grade ${line.grade}`, sale.recipientName, `${line.quantityKg} kg`, formatMoney(line.totalCents), "", `${formatMoney(line.pricePerKgCents)}/kg`]);
    }
  }

  for (const expense of input.chiliExpenses) {
    rows.push(["Chili", "Expense", formatDate(expense.expenseDate), expense.category, "", "", "", formatMoney(expense.amountCents), ""]);
  }

  return rows;
}
