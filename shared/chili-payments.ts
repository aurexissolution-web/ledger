/**
 * Who still owes for chili, grouped by customer. A sale is either paid (with
 * the date) or unpaid; customers who pay "on the next delivery" build up
 * unpaid sales until they settle them.
 */

export type PayableSale = {
  id: number;
  saleDate: number;
  customerId: number | null;
  recipientName: string;
  totalCents: number;
  paidAt: number | null;
};

export type CustomerOwed<T extends PayableSale = PayableSale> = {
  /** Stable grouping key: the customer id, or the name for sales recorded before the roster. */
  key: string;
  customerId: number | null;
  recipientName: string;
  count: number;
  owedCents: number;
  oldestSaleDate: number;
  /** Unpaid sales, oldest first. */
  sales: T[];
};

export type OwedSummary<T extends PayableSale = PayableSale> = { totalCents: number; count: number; customers: CustomerOwed<T>[] };

export function summarizeOwed<T extends PayableSale>(sales: T[]): OwedSummary<T> {
  const groups = new Map<string, CustomerOwed<T>>();
  for (const sale of sales) {
    if (sale.paidAt !== null) continue;
    const key = sale.customerId !== null ? `id:${sale.customerId}` : `name:${sale.recipientName}`;
    const group = groups.get(key) ?? { key, customerId: sale.customerId, recipientName: sale.recipientName, count: 0, owedCents: 0, oldestSaleDate: sale.saleDate, sales: [] };
    group.count += 1;
    group.owedCents += sale.totalCents;
    group.oldestSaleDate = Math.min(group.oldestSaleDate, sale.saleDate);
    group.sales.push(sale);
    groups.set(key, group);
  }
  const customers = Array.from(groups.values())
    .map(group => ({ ...group, sales: group.sales.sort((a, b) => a.saleDate - b.saleDate || a.id - b.id) }))
    .sort((a, b) => b.owedCents - a.owedCents || a.oldestSaleDate - b.oldestSaleDate);
  return {
    totalCents: customers.reduce((sum, group) => sum + group.owedCents, 0),
    count: customers.reduce((sum, group) => sum + group.count, 0),
    customers,
  };
}
