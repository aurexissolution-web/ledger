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
