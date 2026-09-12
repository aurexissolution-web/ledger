import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { centsToInput, dateInputToTimestamp, formatDate, formatMoney, moneyToCents, timestampToDateInput, todayInput } from "@/lib/format";
import { AttachmentField } from "@/components/AttachmentField";
import { ChiliPriceTrend } from "@/components/ChiliPriceTrend";
import { GradeBadge } from "@/components/GradeBadge";
import { CHILI_GRADES, blankGradeRows, describeLine, gradeRowTotalCents, gradeRowsFromSale, gradeRowsToInput, latestGradePrices, saleLines, type ChiliGrade, type GradeRow, type GradeRows } from "@/lib/chili-grades";
import { formatKg } from "@/lib/chili-price-format";
import type { ChiliGradeLine } from "../../../shared/schema";
import { summarizeOwed, type CustomerOwed, type OwedSummary } from "../../../shared/chili-payments";
import { MobileRecord } from "@/components/MobileRecord";
import { Reveal } from "@/components/Reveal";
import { trpc } from "@/lib/trpc";
import { CircleCheck, CircleDollarSign, Clock, HandCoins, Leaf, Paperclip, Pencil, Plus, ReceiptText, Trash2, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type ChiliSale = { id: number; saleDate: number; customerId: number | null; recipientName: string; customerContact: string | null; gradeLines: ChiliGradeLine[]; quantityKg: string; pricePerKgCents: number; totalCents: number; deliveryNotes: string | null; attachmentIds: number[]; paidAt: number | null };
type ChiliExpense = { id: number; expenseDate: number; category: string; amountCents: number; notes: string | null; attachmentIds: number[] };
type CustomerOption = { id: number; name: string; phone: string | null; location: string | null; paymentTerms: "on_delivery" | "next_delivery" };
/** A payment being recorded: the customer's unpaid sales and which of them this payment covers. */
type PaymentDraft = { group: CustomerOwed<ChiliSale>; selected: number[]; paidOn: string };
type SaleForm = { saleDate: string; customerId: string; grades: GradeRows; deliveryNotes: string; attachmentIds: number[]; paid: boolean; paidOn: string };
type ExpenseForm = { expenseDate: string; category: string; amount: string; notes: string; attachmentIds: number[] };
const blankSale = (): SaleForm => ({ saleDate: todayInput(), customerId: "", grades: blankGradeRows(), deliveryNotes: "", attachmentIds: [], paid: true, paidOn: "" });
const blankExpense = (): ExpenseForm => ({ expenseDate: todayInput(), category: "", amount: "", notes: "", attachmentIds: [] });
const saleToForm = (record: ChiliSale): SaleForm => ({ saleDate: timestampToDateInput(record.saleDate), customerId: record.customerId ? String(record.customerId) : "", grades: gradeRowsFromSale(record), deliveryNotes: record.deliveryNotes ?? "", attachmentIds: record.attachmentIds, paid: record.paidAt !== null, paidOn: record.paidAt !== null ? timestampToDateInput(record.paidAt) : "" });
const expenseToForm = (record: ChiliExpense): ExpenseForm => ({ expenseDate: timestampToDateInput(record.expenseDate), category: record.category, amount: centsToInput(record.amountCents), notes: record.notes ?? "", attachmentIds: record.attachmentIds });

export default function Chili() {
  const utils = trpc.useUtils();
  const query = trpc.business.chili.list.useQuery();
  const customersQuery = trpc.customers.list.useQuery();
  const customers = (customersQuery.data ?? []) as CustomerOption[];
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<ChiliSale | null>(null);
  const [editingExpense, setEditingExpense] = useState<ChiliExpense | null>(null);
  const [saleForm, setSaleForm] = useState<SaleForm>(blankSale);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(blankExpense);
  const [deleting, setDeleting] = useState<{ type: "sale"; record: ChiliSale } | { type: "expense"; record: ChiliExpense } | null>(null);
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const refresh = async () => { await Promise.all([utils.business.chili.list.invalidate(), utils.business.overview.invalidate(), utils.customers.list.invalidate()]); };
  const closeSale = () => { setSaleDialogOpen(false); setEditingSale(null); setSaleForm(blankSale()); };
  const closeExpense = () => { setExpenseDialogOpen(false); setEditingExpense(null); setExpenseForm(blankExpense()); };
  const createSale = trpc.business.chili.createSale.useMutation({ onSuccess: async () => { toast.success("Chili sale saved"); await refresh(); closeSale(); }, onError: error => toast.error(error.message) });
  const updateSale = trpc.business.chili.updateSale.useMutation({ onSuccess: async () => { toast.success("Chili sale updated"); await refresh(); closeSale(); }, onError: error => toast.error(error.message) });
  const markPaid = trpc.business.chili.markPaid.useMutation({ onSuccess: async result => { toast.success(result.count === 1 ? "Payment recorded" : `Payment recorded for ${result.count} sales`); await refresh(); setPayment(null); }, onError: error => toast.error(error.message) });
  const deleteSale = trpc.business.chili.deleteSale.useMutation({ onSuccess: async () => { toast.success("Chili sale deleted"); await refresh(); setDeleting(null); }, onError: error => toast.error(error.message) });
  const createExpense = trpc.business.chili.createExpense.useMutation({ onSuccess: async () => { toast.success("Daily expense saved"); await refresh(); closeExpense(); }, onError: error => toast.error(error.message) });
  const updateExpense = trpc.business.chili.updateExpense.useMutation({ onSuccess: async () => { toast.success("Daily expense updated"); await refresh(); closeExpense(); }, onError: error => toast.error(error.message) });
  const deleteExpense = trpc.business.chili.deleteExpense.useMutation({ onSuccess: async () => { toast.success("Daily expense deleted"); await refresh(); setDeleting(null); }, onError: error => toast.error(error.message) });
  const sales = (query.data?.sales ?? []) as ChiliSale[];
  const expenses = (query.data?.expenses ?? []) as ChiliExpense[];
  const totals = useMemo(() => ({ income: sales.reduce((sum, sale) => sum + sale.totalCents, 0), outgoings: expenses.reduce((sum, expense) => sum + expense.amountCents, 0) }), [sales, expenses]);
  const latestPrices = latestGradePrices(sales);
  const latestPriceLabel = CHILI_GRADES.filter(grade => latestPrices[grade] !== undefined).map(grade => `${grade} ${formatMoney(latestPrices[grade]!)}`).join(" · ") || (sales[0] ? formatMoney(sales[0].pricePerKgCents) : "—");
  const saleGrades = gradeRowsToInput(saleForm.grades);
  const owed = useMemo(() => summarizeOwed(sales), [sales]);
  // Default: everything except today's delivery — the usual "pay for the last one when we bring the next" case.
  const openPayment = (group: CustomerOwed<ChiliSale>, only?: ChiliSale) => {
    const earlier = group.sales.filter(sale => timestampToDateInput(sale.saleDate) !== todayInput()).map(sale => sale.id);
    setPayment({ group, selected: only ? [only.id] : earlier.length ? earlier : group.sales.map(sale => sale.id), paidOn: todayInput() });
  };
  const markSalePaid = (sale: ChiliSale) => { const group = owed.customers.find(entry => entry.sales.some(item => item.id === sale.id)); if (group) openPayment(group, sale); };
  const chooseCustomer = (value: string) => { const customer = customers.find(entry => String(entry.id) === value); setSaleForm(form => ({ ...form, customerId: value, ...(!editingSale && customer ? { paid: customer.paymentTerms !== "next_delivery" } : {}) })); };
  const isSavingSale = createSale.isPending || updateSale.isPending;
  const isSavingExpense = createExpense.isPending || updateExpense.isPending;
  const selectedCustomer = customers.find(customer => String(customer.id) === saleForm.customerId) ?? null;
  const saveSale = (event: FormEvent) => { event.preventDefault(); if (!selectedCustomer || saleGrades.length === 0) return; const payload = { saleDate: dateInputToTimestamp(saleForm.saleDate), customerId: selectedCustomer.id, grades: saleGrades, deliveryNotes: saleForm.deliveryNotes, attachmentIds: saleForm.attachmentIds, paidAt: saleForm.paid ? dateInputToTimestamp(saleForm.paidOn || saleForm.saleDate) : null }; if (editingSale) updateSale.mutate({ id: editingSale.id, ...payload }); else createSale.mutate(payload); };
  const saveExpense = (event: FormEvent) => { event.preventDefault(); const payload = { expenseDate: dateInputToTimestamp(expenseForm.expenseDate), category: expenseForm.category, amountCents: moneyToCents(expenseForm.amount), notes: expenseForm.notes, attachmentIds: expenseForm.attachmentIds }; if (editingExpense) updateExpense.mutate({ id: editingExpense.id, ...payload }); else createExpense.mutate(payload); };
  const confirmDelete = () => { if (!deleting) return; if (deleting.type === "sale") deleteSale.mutate({ id: deleting.record.id }); else deleteExpense.mutate({ id: deleting.record.id }); };

  return <div className="page-shell">
    <Reveal><section className="page-heading"><div><p className="eyebrow">Chili agriculture</p><h1 className="display-title">From harvest to handover.</h1><p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">Keep each sale, delivery and day-to-day farm cost visible, so your chili business stays grounded in the real numbers.</p></div><div className="flex gap-2"><Button variant="outline" size="lg" onClick={() => { setEditingExpense(null); setExpenseForm(blankExpense()); setExpenseDialogOpen(true); }}><ReceiptText className="mr-1 h-4 w-4" />Add expense</Button><Button variant="chili" size="lg" onClick={() => { setEditingSale(null); setSaleForm(blankSale()); setSaleDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add sale</Button></div></section></Reveal>
    <Reveal delay={0.06}><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ChiliMetric label="Sales delivered" value={formatMoney(totals.income)} icon={<CircleDollarSign className="h-4 w-4" />} tone="chili" /><ChiliMetric label="Owed to you" value={owed.count ? formatMoney(owed.totalCents) : "All paid"} detail={owed.count ? `${owed.count} unpaid ${owed.count === 1 ? "delivery" : "deliveries"}` : "Nothing waiting for payment"} icon={<HandCoins className="h-4 w-4" />} tone="chili" /><ChiliMetric label="Daily outgoings" value={formatMoney(totals.outgoings)} icon={<ReceiptText className="h-4 w-4" />} tone="olive" /><ChiliMetric label="Latest price / kg" value={latestPriceLabel} icon={<Leaf className="h-4 w-4" />} tone="ink" /></section></Reveal>
    {owed.count ? <Reveal delay={0.08}><OwedCard owed={owed} onRecord={group => openPayment(group)} /></Reveal> : null}
    <Reveal delay={0.1}><ChiliPriceTrend sales={sales} loading={query.isLoading} onAddSale={() => { setEditingSale(null); setSaleForm(blankSale()); setSaleDialogOpen(true); }} /></Reveal>
    <Reveal delay={0.15}><section className="mt-8 grid gap-6 min-[1680px]:grid-cols-[1.16fr_0.84fr]">
      <div className="surface-card overflow-hidden"><div className="flex items-start justify-between gap-4 border-b border-[#e6e2d8] px-6 py-5"><div><p className="eyebrow">Sales & delivery ledger</p><h2 className="mt-1 text-lg font-semibold">Who received your chili, and at what price</h2></div><span className="rounded-full bg-[#fff0e9] px-3 py-1.5 text-xs font-semibold text-[#a4452a]">{sales.length} {sales.length === 1 ? "sale" : "sales"}</span></div>{query.isLoading ? <div className="h-72 animate-pulse bg-[#f4f3ed]" /> : sales.length ? <SalesTable records={sales} onMarkPaid={markSalePaid} onEdit={record => { setEditingSale(record); setSaleForm(saleToForm(record)); setSaleDialogOpen(true); }} onDelete={record => setDeleting({ type: "sale", record })} /> : <EmptyPanel type="sales" onAdd={() => { setEditingSale(null); setSaleForm(blankSale()); setSaleDialogOpen(true); }} />}</div>
      <div className="surface-card overflow-hidden"><div className="flex items-start justify-between gap-4 border-b border-[#e6e2d8] px-6 py-5"><div><p className="eyebrow">Daily farm costs</p><h2 className="mt-1 text-lg font-semibold">Every amount going out</h2></div><span className="rounded-full bg-[#f0f2eb] px-3 py-1.5 text-xs font-semibold text-[#4d6347]">{expenses.length} {expenses.length === 1 ? "cost" : "costs"}</span></div>{query.isLoading ? <div className="h-72 animate-pulse bg-[#f4f3ed]" /> : expenses.length ? <ExpenseList records={expenses} onEdit={record => { setEditingExpense(record); setExpenseForm(expenseToForm(record)); setExpenseDialogOpen(true); }} onDelete={record => setDeleting({ type: "expense", record })} /> : <EmptyPanel type="expenses" onAdd={() => { setEditingExpense(null); setExpenseForm(blankExpense()); setExpenseDialogOpen(true); }} />}</div>
    </section></Reveal>

    <Dialog open={saleDialogOpen} onOpenChange={open => { if (!open) closeSale(); else setSaleDialogOpen(true); }}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0"><form onSubmit={saveSale}><DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">{editingSale ? "Edit chili sale" : "Add a chili sale"}</DialogTitle><DialogDescription>Capture the recipient, each grade's kg and price, and delivery details.</DialogDescription></DialogHeader><div className="grid gap-5 px-6 py-6 sm:grid-cols-2"><InputField label="Sale date" required><Input required type="date" value={saleForm.saleDate} onChange={e => setSaleForm({ ...saleForm, saleDate: e.target.value })} /></InputField><InputField label="Customer" required><Select value={saleForm.customerId || undefined} onValueChange={chooseCustomer}><SelectTrigger className="w-full" aria-label="Choose a customer"><SelectValue placeholder={customers.length ? "Choose who took the chili" : "No customers yet"} /></SelectTrigger><SelectContent>{customers.map(customer => <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}{customer.location ? ` · ${customer.location}` : ""}</SelectItem>)}</SelectContent></Select>{customers.length === 0 ? <p className="text-xs text-muted-foreground">Add your chili customers in Settings first.</p> : editingSale && !editingSale.customerId ? <p className="text-xs text-muted-foreground">This older sale was for “{editingSale.recipientName}” — pick them from your customers to keep editing.</p> : null}</InputField><InputField label="Contact details"><div className="flex h-10 items-center rounded-lg border border-[#e3dfd2] bg-[#f7f7f2] px-3.5 text-sm text-muted-foreground">{selectedCustomer ? [selectedCustomer.phone, selectedCustomer.location].filter(Boolean).join(" · ") || "No contact saved" : "Pick a customer to see their details"}</div></InputField><GradeFields rows={saleForm.grades} onChange={grades => setSaleForm({ ...saleForm, grades })} legacy={Boolean(editingSale && !editingSale.gradeLines?.length)} /><PaymentField form={saleForm} customer={selectedCustomer} editing={Boolean(editingSale)} onChange={patch => setSaleForm({ ...saleForm, ...patch })} /><InputField label="Delivery notes"><Textarea className="min-h-24" placeholder="Delivery location, packaging, collection notes…" value={saleForm.deliveryNotes} onChange={e => setSaleForm({ ...saleForm, deliveryNotes: e.target.value })} /></InputField><div className="sm:col-span-2"><AttachmentField kind="invoice" label="Invoice" value={saleForm.attachmentIds} onChange={ids => setSaleForm({ ...saleForm, attachmentIds: ids })} /></div></div><DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closeSale}>Cancel</Button><Button type="submit" variant="chili" disabled={isSavingSale || !selectedCustomer || saleGrades.length === 0}>{isSavingSale ? "Saving…" : editingSale ? "Save changes" : "Save sale"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={expenseDialogOpen} onOpenChange={open => { if (!open) closeExpense(); else setExpenseDialogOpen(true); }}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0"><form onSubmit={saveExpense}><DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">{editingExpense ? "Edit daily expense" : "Add a daily expense"}</DialogTitle><DialogDescription>Keep fertiliser, transport, supplies and other daily costs accounted for.</DialogDescription></DialogHeader><div className="grid gap-5 px-6 py-6 sm:grid-cols-2"><InputField label="Expense date" required><Input required type="date" value={expenseForm.expenseDate} onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /></InputField><InputField label="Expense category" required><Input required placeholder="e.g. Fertiliser" value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} /></InputField><InputField label="Amount (RM)" required><Input required inputMode="decimal" type="number" min="0.01" step="0.01" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></InputField><InputField label="Notes"><Textarea className="min-h-24" placeholder="Supplier, purpose or other details" value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} /></InputField><div className="sm:col-span-2"><AttachmentField kind="receipt" label="Receipt" value={expenseForm.attachmentIds} onChange={ids => setExpenseForm({ ...expenseForm, attachmentIds: ids })} /></div></div><DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closeExpense}>Cancel</Button><Button type="submit" disabled={isSavingExpense}>{isSavingExpense ? "Saving…" : editingExpense ? "Save changes" : "Save expense"}</Button></DialogFooter></form></DialogContent></Dialog>
    <PaymentDialog draft={payment} saving={markPaid.isPending} onChange={setPayment} onClose={() => setPayment(null)} onConfirm={draft => markPaid.mutate({ ids: draft.selected, paidAt: dateInputToTimestamp(draft.paidOn) })} />
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null); }}><AlertDialogContent className="rounded-2xl border-[#ddd8cc] bg-[#fffefa]"><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the selected {deleting?.type === "sale" ? "Chili sale" : "daily expense"} from your records.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep record</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleteSale.isPending || deleteExpense.isPending} onClick={confirmDelete}>Delete record</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function ChiliMetric({ label, value, detail, icon, tone }: { label: string; value: string; detail?: string; icon: React.ReactNode; tone: "ink" | "olive" | "chili" }) { const styles = { ink: "icon-tile-ink", olive: "icon-tile-olive", chili: "icon-tile-chili" }; return <div className="surface-mini rounded-2xl border border-[#e7e3d8] bg-[linear-gradient(180deg,#fffefa,#fcfbf6)] p-5"><div className={`icon-tile h-9 w-9 ${styles[tone]}`}>{icon}</div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{value}</p>{detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}</div>; }
function InputField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div className="space-y-2"><Label className="text-sm font-semibold">{label}{required ? <span className="ml-1 text-[#b34d2e]">*</span> : null}</Label>{children}</div>; }
function AttachmentBadge({ count }: { count: number }) { if (count === 0) return null; return <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#eef1e9] px-1.5 py-0.5 text-[10px] font-bold text-[#4d6347]"><Paperclip className="h-2.5 w-2.5" />{count}</span>; }
function SalesTable({ records, onEdit, onDelete, onMarkPaid }: { records: ChiliSale[]; onEdit: (record: ChiliSale) => void; onDelete: (record: ChiliSale) => void; onMarkPaid: (record: ChiliSale) => void }) { return <><div className="divide-y divide-[#ece9e0] md:hidden">{records.map(record => <MobileRecord key={record.id} title={record.recipientName} badge={<AttachmentBadge count={record.attachmentIds.length} />} subtitle={`${formatDate(record.saleDate)}${record.customerContact ? ` · ${record.customerContact}` : ""}`} fields={[{ label: "Quantity", value: saleLines(record).map(line => `${line.grade ? `${line.grade} ` : ""}${formatKg(Number(line.quantityKg))}`).join(" · ") }, { label: "Price / kg", value: saleLines(record).map(line => `${line.grade ? `${line.grade} ` : ""}${formatMoney(line.pricePerKgCents)}`).join(" · ") }, { label: "Sale total", value: formatMoney(record.totalCents), strong: true, tone: "chili" }, { label: "Payment", value: <PaymentStatus paidAt={record.paidAt} /> }]} actions={<>{record.paidAt === null ? <MarkPaidButton record={record} onMarkPaid={onMarkPaid} /> : null}<Button aria-label={`Edit sale to ${record.recipientName}`} variant="ghost" size="icon" onClick={() => onEdit(record)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Delete sale to ${record.recipientName}`} variant="ghost" size="icon" className="text-[#b34d2e] hover:bg-[#fff0e9] hover:text-[#9e3c25]" onClick={() => onDelete(record)}><Trash2 className="h-4 w-4" /></Button></>} />)}</div><div className="hidden overflow-x-auto md:block"><table className="ledger-table w-full min-w-[780px] text-left"><thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-4">Recipient</th><th className="px-4 py-4">Quantity</th><th className="px-4 py-4">Price/kg</th><th className="px-4 py-4 text-right">Sale total</th><th className="px-4 py-4">Payment</th><th className="actions-col px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#ece9e0]">{records.map(record => <tr key={record.id} className="hover:bg-[#fcfbf7]"><td className="px-6 py-4"><div className="flex items-center gap-1.5"><p className="font-semibold">{record.recipientName}</p><AttachmentBadge count={record.attachmentIds.length} /></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(record.saleDate)}{record.customerContact ? ` · ${record.customerContact}` : ""}</p></td><td className="px-4 py-4 text-sm"><div className="space-y-1.5">{saleLines(record).map(line => <div key={line.grade ?? "-"} className="flex h-5 items-center gap-2">{line.grade ? <GradeBadge grade={line.grade} /> : null}{formatKg(Number(line.quantityKg))}</div>)}</div></td><td className="px-4 py-4 text-sm"><div className="space-y-1.5">{saleLines(record).map(line => <div key={line.grade ?? "-"} className="flex h-5 items-center">{formatMoney(line.pricePerKgCents)}</div>)}</div></td><td className="px-4 py-4 text-right text-sm font-semibold text-[#9f442c]">{formatMoney(record.totalCents)}</td><td className="px-4 py-4"><PaymentStatus paidAt={record.paidAt} /></td><td className="actions-col px-6 py-4"><div className="flex justify-end gap-1">{record.paidAt === null ? <MarkPaidButton record={record} onMarkPaid={onMarkPaid} /> : null}<Button aria-label={`Edit sale to ${record.recipientName}`} variant="ghost" size="icon" onClick={() => onEdit(record)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Delete sale to ${record.recipientName}`} variant="ghost" size="icon" className="text-[#b34d2e] hover:bg-[#fff0e9] hover:text-[#9e3c25]" onClick={() => onDelete(record)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div></>; }
function ExpenseList({ records, onEdit, onDelete }: { records: ChiliExpense[]; onEdit: (record: ChiliExpense) => void; onDelete: (record: ChiliExpense) => void }) { return <div className="divide-y divide-[#ece9e0]">{records.map(record => <div key={record.id} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-[#fcfbf7]"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-sm font-semibold">{record.category}</p><AttachmentBadge count={record.attachmentIds.length} /></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(record.expenseDate)}{record.notes ? ` · ${record.notes}` : ""}</p></div><div className="flex shrink-0 items-center gap-1"><p className="whitespace-nowrap text-sm font-semibold text-[#5a6744]">{formatMoney(record.amountCents)}</p><Button aria-label={`Edit ${record.category}`} variant="ghost" size="icon" onClick={() => onEdit(record)}><Pencil className="h-3.5 w-3.5" /></Button><Button aria-label={`Delete ${record.category}`} variant="ghost" size="icon" className="text-[#b34d2e] hover:bg-[#fff0e9] hover:text-[#9e3c25]" onClick={() => onDelete(record)}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>)}</div>; }
function EmptyPanel({ type, onAdd }: { type: "sales" | "expenses"; onAdd: () => void }) { const sales = type === "sales"; return <div className="p-6"><div className="empty-panel grid min-h-64 place-items-center px-6 text-center"><div><div className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${sales ? "bg-[#fff0e9] text-[#b34d2e]" : "bg-[#ebf0e8] text-[#486242]"}`}>{sales ? <Truck className="h-5 w-5" /> : <ReceiptText className="h-5 w-5" />}</div><h3 className="mt-4 font-semibold">{sales ? "No chili sales yet." : "No daily expenses yet."}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{sales ? "Add a sale when you hand over chili to record the recipient, price and quantity." : "Add a cost whenever money goes out for the farm."}</p><Button onClick={onAdd} variant={sales ? "chili" : "default"} className="mt-5"><Plus className="mr-2 h-4 w-4" />{sales ? "Add sale" : "Add expense"}</Button></div></div></div>; }

function GradeFields({ rows, onChange, legacy }: { rows: GradeRows; onChange: (rows: GradeRows) => void; legacy: boolean }) {
  const update = (grade: ChiliGrade, patch: Partial<GradeRow>) => onChange({ ...rows, [grade]: { ...rows[grade], ...patch } });
  const totalCents = CHILI_GRADES.reduce((sum, grade) => sum + (Number(rows[grade].kg) > 0 ? gradeRowTotalCents(rows[grade]) : 0), 0);
  const columns = "grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_4.75rem] items-center gap-2 sm:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_6rem]";
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-semibold">Quantity and price by grade</Label>
        <span className="text-xs text-muted-foreground">Fill one or both</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#e3dfd2] bg-white">
        <div className={`${columns} bg-[#f8f7f1] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground`}>
          {/* The A/B badges label the column on phones, where "Grade" would run into "Kg". */}
          <span className="hidden sm:inline">Grade</span><span className="sm:hidden" /><span>Kg</span><span>RM / kg</span><span className="text-right">Total</span>
        </div>
        {CHILI_GRADES.map(grade => {
          const row = rows[grade];
          const hasKg = Number(row.kg) > 0;
          return (
            <div key={grade} className={`${columns} border-t border-[#ece9e0] px-3 py-2.5`}>
              <span className="flex items-center gap-1.5"><GradeBadge grade={grade} /><span className="hidden text-sm font-semibold sm:inline">Grade {grade}</span></span>
              <Input aria-label={`Grade ${grade} quantity (kg)`} inputMode="decimal" type="number" min="0.01" step="0.01" placeholder="0.00" value={row.kg} onChange={e => update(grade, { kg: e.target.value })} />
              <Input aria-label={`Grade ${grade} price per kg (RM)`} required={hasKg} inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" value={row.price} onChange={e => update(grade, { price: e.target.value })} />
              <span className="text-right text-sm font-semibold">{hasKg ? formatMoney(gradeRowTotalCents(row)) : "—"}</span>
            </div>
          );
        })}
        <div className="flex items-center justify-between border-t border-[#e3dfd2] bg-[#fbfaf5] px-3 py-2.5 text-sm font-semibold">
          <span>Estimated sale total</span>
          <span className="text-[#9f442c]">{formatMoney(totalCents)}</span>
        </div>
      </div>
      {legacy ? <p className="text-xs text-muted-foreground">This older sale had no grade, so it opens as Grade A — change it if needed.</p> : null}
      {!legacy && !CHILI_GRADES.some(grade => Number(rows[grade].kg) > 0) ? <p className="text-xs text-muted-foreground">Enter the kg for at least one grade.</p> : null}
    </div>
  );
}

const shortDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", ...(new Date(timestamp).getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) }).format(new Date(timestamp));

/** Paid (with the date) or Unpaid — icon and text, never colour alone. */
function PaymentStatus({ paidAt }: { paidAt: number | null }) {
  return paidAt === null
    ? <span className="pill pill-chili !px-2 !py-0.5 !text-[11px]"><Clock className="h-3 w-3" />Unpaid</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#4d6347]"><CircleCheck className="h-3.5 w-3.5" />Paid {shortDate(paidAt)}</span>;
}

function MarkPaidButton({ record, onMarkPaid }: { record: ChiliSale; onMarkPaid: (record: ChiliSale) => void }) {
  return <Button aria-label={`Mark sale to ${record.recipientName} paid`} title="Mark paid" variant="ghost" size="icon" className="text-[#4d6347] hover:bg-[#eef1e9]" onClick={() => onMarkPaid(record)}><CircleCheck className="h-4 w-4" /></Button>;
}

function PaymentField({ form, customer, editing, onChange }: { form: SaleForm; customer: CustomerOption | null; editing: boolean; onChange: (patch: Partial<SaleForm>) => void }) {
  const options = [{ paid: true, label: "Paid" }, { paid: false, label: "Pay later" }];
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Payment</Label>
      <div role="radiogroup" aria-label="Payment" className="grid grid-cols-2 gap-1 rounded-xl border border-[#e3dfd2] bg-[#f7f7f2] p-1">
        {options.map(option => (
          <button key={option.label} type="button" role="radio" aria-checked={form.paid === option.paid} onClick={() => onChange({ paid: option.paid })}
            className={`h-9 rounded-lg text-sm font-semibold transition ${form.paid === option.paid ? "bg-white text-foreground shadow-sm ring-1 ring-[#e3dfd2]" : "text-muted-foreground hover:text-foreground"}`}>
            {option.label}
          </button>
        ))}
      </div>
      {form.paid ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">Paid on</span>
          <Input type="date" aria-label="Paid on" className="h-9" min={form.saleDate} value={form.paidOn || form.saleDate} onChange={e => onChange({ paidOn: e.target.value })} />
        </div>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">It stays under "Owed to you" until you record the payment.</p>
      )}
      {customer && !editing ? <p className="text-xs text-muted-foreground">{customer.name} usually pays {customer.paymentTerms === "next_delivery" ? "on the next delivery" : "on delivery"}.</p> : null}
    </div>
  );
}

function OwedCard({ owed, onRecord }: { owed: OwedSummary<ChiliSale>; onRecord: (group: CustomerOwed<ChiliSale>) => void }) {
  return (
    <section className="surface-card mt-8 overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-[#e6e2d8] px-6 py-5">
        <div>
          <p className="eyebrow">Owed to you</p>
          <h2 className="mt-1 text-lg font-semibold">Deliveries waiting for payment</h2>
        </div>
        <span className="rounded-full bg-[#fff0e9] px-3 py-1.5 text-xs font-semibold text-[#a4452a]">{formatMoney(owed.totalCents)}</span>
      </div>
      <ul className="divide-y divide-[#ece9e0]">
        {owed.customers.map(group => (
          <li key={group.key} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div className="min-w-0">
              <p className="font-semibold">{group.recipientName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{group.count} unpaid {group.count === 1 ? "delivery" : "deliveries"} · since {formatDate(group.oldestSaleDate)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-[#9f442c]">{formatMoney(group.owedCents)}</span>
              <Button size="sm" variant="outline" onClick={() => onRecord(group)}><HandCoins className="mr-1.5 h-4 w-4" />Record payment</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaymentDialog({ draft, saving, onChange, onClose, onConfirm }: { draft: PaymentDraft | null; saving: boolean; onChange: (draft: PaymentDraft) => void; onClose: () => void; onConfirm: (draft: PaymentDraft) => void }) {
  const selectedSales = draft ? draft.group.sales.filter(sale => draft.selected.includes(sale.id)) : [];
  const totalCents = selectedSales.reduce((sum, sale) => sum + sale.totalCents, 0);
  // A payment can't be dated before the deliveries it covers.
  const earliestPaidOn = selectedSales.length ? timestampToDateInput(Math.max(...selectedSales.map(sale => sale.saleDate))) : undefined;
  const toggle = (id: number, checked: boolean) => draft && onChange({ ...draft, selected: checked ? [...draft.selected, id] : draft.selected.filter(item => item !== id) });
  return (
    <Dialog open={Boolean(draft)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0">
        {draft ? (
          <form onSubmit={event => { event.preventDefault(); if (selectedSales.length) onConfirm(draft); }}>
            <DialogHeader className="dialog-header px-6 py-5">
              <DialogTitle className="text-xl">Record a payment</DialogTitle>
              <DialogDescription>Tick the deliveries {draft.group.recipientName} is paying for.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 px-6 py-6">
              <ul className="divide-y divide-[#ece9e0] overflow-hidden rounded-xl border border-[#e3dfd2] bg-white">
                {draft.group.sales.map(sale => (
                  <li key={sale.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[#fcfbf7]">
                      <Checkbox className="mt-0.5" checked={draft.selected.includes(sale.id)} onCheckedChange={checked => toggle(sale.id, checked === true)} aria-label={`Delivery on ${formatDate(sale.saleDate)}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{formatDate(sale.saleDate)}{timestampToDateInput(sale.saleDate) === todayInput() ? <span className="ml-2 text-xs font-medium text-muted-foreground">today</span> : null}</span>
                        <span className="block text-xs text-muted-foreground">{saleLines(sale).map(describeLine).join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[#9f442c]">{formatMoney(sale.totalCents)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <InputField label="Paid on" required><Input required type="date" min={earliestPaidOn} value={draft.paidOn} onChange={e => onChange({ ...draft, paidOn: e.target.value })} /></InputField>
              <div className="flex items-center justify-between rounded-xl bg-[#f8f7f1] px-4 py-3 text-sm font-semibold"><span>Payment received</span><span className="text-[#9f442c]">{formatMoney(totalCents)}</span></div>
            </div>
            <DialogFooter className="dialog-footer px-6 py-4">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="chili" disabled={saving || selectedSales.length === 0}>{saving ? "Saving…" : `Mark ${selectedSales.length} ${selectedSales.length === 1 ? "sale" : "sales"} paid`}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
