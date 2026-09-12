import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { centsToInput, dateInputToTimestamp, formatDate, formatMoney, moneyToCents, timestampToDateInput, todayInput } from "@/lib/format";
import { AttachmentField } from "@/components/AttachmentField";
import { MobileRecord } from "@/components/MobileRecord";
import { Reveal } from "@/components/Reveal";
import { trpc } from "@/lib/trpc";
import { Banknote, BriefcaseBusiness, CalendarDays, Paperclip, Pencil, Plus, ReceiptText, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type WorkerPayment = { staffId: number; staffName: string; amountCents: number };
type CostLine = { label: string; amountCents: number; attachmentIds: number[] };

type SubconRecord = {
  id: number;
  workDate: number;
  jobTitle: string;
  clientName: string | null;
  location: string | null;
  incomeCents: number;
  expenseCents: number;
  costLines: CostLine[];
  invoiceAttachmentIds: number[];
  workerPayments: WorkerPayment[];
  workerPaymentCents: number;
  notes: string | null;
};

type StaffOption = { id: number; name: string };

type IncomeForm = {
  workDate: string;
  jobTitle: string;
  clientName: string;
  location: string;
  income: string;
  notes: string;
  invoiceAttachmentIds: number[];
};

type OutgoingRow = { staffId: number; amount: string };
type CostRow = { label: string; amount: string; attachmentIds: number[] };

const blankIncomeForm = (): IncomeForm => ({ workDate: todayInput(), jobTitle: "", clientName: "", location: "", income: "", notes: "", invoiceAttachmentIds: [] });

function recordToIncomeForm(record: SubconRecord): IncomeForm {
  return { workDate: timestampToDateInput(record.workDate), jobTitle: record.jobTitle, clientName: record.clientName ?? "", location: record.location ?? "", income: centsToInput(record.incomeCents), notes: record.notes ?? "", invoiceAttachmentIds: record.invoiceAttachmentIds };
}

function incomeFormPayload(form: IncomeForm) {
  return { workDate: dateInputToTimestamp(form.workDate), jobTitle: form.jobTitle, clientName: form.clientName, location: form.location, incomeCents: moneyToCents(form.income), notes: form.notes, invoiceAttachmentIds: form.invoiceAttachmentIds };
}

export default function Subcon() {
  const utils = trpc.useUtils();
  const recordsQuery = trpc.business.subcon.list.useQuery();
  const staffQuery = trpc.staff.list.useQuery();
  const staffOptions = (staffQuery.data ?? []) as StaffOption[];

  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<SubconRecord | null>(null);
  const [incomeForm, setIncomeForm] = useState<IncomeForm>(blankIncomeForm);

  const [outgoingDialogOpen, setOutgoingDialogOpen] = useState(false);
  const [outgoingJobId, setOutgoingJobId] = useState<number | null>(null);
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [workerRows, setWorkerRows] = useState<OutgoingRow[]>([]);

  const [deleting, setDeleting] = useState<SubconRecord | null>(null);

  const refresh = async () => { await Promise.all([utils.business.subcon.list.invalidate(), utils.business.overview.invalidate()]); };

  const closeIncomeDialog = () => { setIncomeDialogOpen(false); setEditingIncome(null); setIncomeForm(blankIncomeForm()); };
  const closeOutgoingDialog = () => { setOutgoingDialogOpen(false); setOutgoingJobId(null); setCostRows([]); setWorkerRows([]); };

  const createRecord = trpc.business.subcon.create.useMutation({ onSuccess: async () => { toast.success("Subcon job saved"); await refresh(); closeIncomeDialog(); }, onError: error => toast.error(error.message) });
  const updateIncome = trpc.business.subcon.updateIncome.useMutation({ onSuccess: async () => { toast.success("Project income updated"); await refresh(); closeIncomeDialog(); }, onError: error => toast.error(error.message) });
  const updateOutgoing = trpc.business.subcon.updateOutgoing.useMutation({ onSuccess: async () => { toast.success("Outgoing payments saved"); await refresh(); closeOutgoingDialog(); }, onError: error => toast.error(error.message) });
  const deleteRecord = trpc.business.subcon.delete.useMutation({ onSuccess: async () => { toast.success("Subcon job deleted"); await refresh(); setDeleting(null); }, onError: error => toast.error(error.message) });

  const records = (recordsQuery.data ?? []) as SubconRecord[];
  const totals = useMemo(() => records.reduce((sum, record) => ({ income: sum.income + record.incomeCents, expense: sum.expense + record.expenseCents, wages: sum.wages + record.workerPaymentCents, profit: sum.profit + record.incomeCents - record.expenseCents - record.workerPaymentCents }), { income: 0, expense: 0, wages: 0, profit: 0 }), [records]);

  const isSavingIncome = createRecord.isPending || updateIncome.isPending;

  const openNew = () => { setEditingIncome(null); setIncomeForm(blankIncomeForm()); setIncomeDialogOpen(true); };
  const openEditIncome = (record: SubconRecord) => { setEditingIncome(record); setIncomeForm(recordToIncomeForm(record)); setIncomeDialogOpen(true); };
  const saveIncome = (event: FormEvent) => {
    event.preventDefault();
    const payload = incomeFormPayload(incomeForm);
    if (editingIncome) updateIncome.mutate({ id: editingIncome.id, ...payload });
    else createRecord.mutate(payload);
  };

  const selectedOutgoingRecord = records.find(record => record.id === outgoingJobId) ?? null;

  const hydrateOutgoingForm = (record: SubconRecord) => {
    setOutgoingJobId(record.id);
    setCostRows(record.costLines.map(line => ({ label: line.label, amount: centsToInput(line.amountCents), attachmentIds: line.attachmentIds })));
    setWorkerRows(record.workerPayments.map(payment => ({ staffId: payment.staffId, amount: centsToInput(payment.amountCents) })));
  };
  const openOutgoing = (record: SubconRecord) => { hydrateOutgoingForm(record); setOutgoingDialogOpen(true); };
  const openNewOutgoing = () => { setOutgoingJobId(null); setCostRows([]); setWorkerRows([]); setOutgoingDialogOpen(true); };
  const addCostRow = () => setCostRows(rows => [...rows, { label: "", amount: "", attachmentIds: [] }]);
  const removeCostRow = (index: number) => setCostRows(rows => rows.filter((_, i) => i !== index));
  const updateCostRow = (index: number, changes: Partial<CostRow>) => setCostRows(rows => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  const costTotalCents = costRows.reduce((sum, row) => sum + moneyToCents(row.amount), 0);
  const selectOutgoingProject = (id: number) => {
    const record = records.find(r => r.id === id);
    if (record) hydrateOutgoingForm(record);
  };
  const addWorkerRow = () => setWorkerRows(rows => [...rows, { staffId: 0, amount: "" }]);
  const removeWorkerRow = (index: number) => setWorkerRows(rows => rows.filter((_, i) => i !== index));
  const updateWorkerRow = (index: number, changes: Partial<OutgoingRow>) => setWorkerRows(rows => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  const saveOutgoing = (event: FormEvent) => {
    event.preventDefault();
    if (!outgoingJobId) return;
    const workerPayments = workerRows.filter(row => row.staffId > 0).map(row => ({ staffId: row.staffId, amountCents: moneyToCents(row.amount) }));
    const costLines = costRows.filter(row => row.label.trim() && moneyToCents(row.amount) > 0).map(row => ({ label: row.label.trim(), amountCents: moneyToCents(row.amount), attachmentIds: row.attachmentIds }));
    updateOutgoing.mutate({ id: outgoingJobId, costLines, workerPayments });
  };

  const showZeroOutWarning = selectedOutgoingRecord != null && workerRows.length === 0 && selectedOutgoingRecord.workerPaymentCents > 0;

  return (
    <div className="page-shell">
      <Reveal><section className="page-heading">
        <div>
          <p className="eyebrow">Wiring subcontracting</p>
          <h1 className="display-title">Project P&amp;L, made clear.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">Each entry is one wiring project: record its income first, then who was paid and any other costs.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={openNewOutgoing} disabled={records.length === 0}><Banknote className="mr-1 h-4 w-4" />Add outgoing</Button>
          <Button size="lg" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Add Subcon job</Button>
        </div>
      </section></Reveal>

      <Reveal delay={0.06}><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Project income" value={formatMoney(totals.income)} icon={<Wallet className="h-4 w-4" />} tone="ink" />
        <MiniMetric label="Staff payments" value={formatMoney(totals.wages)} icon={<BriefcaseBusiness className="h-4 w-4" />} tone="chili" />
        <MiniMetric label="Other project costs" value={formatMoney(totals.expense)} icon={<ReceiptText className="h-4 w-4" />} tone="olive" />
        <MiniMetric label="Net project P&amp;L" value={formatMoney(totals.profit)} icon={<TrendingUp className="h-4 w-4" />} tone="ink" />
      </section></Reveal>

      <Reveal delay={0.12}><section className="surface-card mt-8 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e6e2d8] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="eyebrow">Project P&amp;L register</p><h2 className="mt-1 text-lg font-semibold">Income less staff pay and other project costs</h2></div>
          <span className="rounded-full bg-[#f0f2eb] px-3 py-1.5 text-xs font-semibold text-[#4d6347]">{records.length} {records.length === 1 ? "project" : "projects"}</span>
        </div>
        {recordsQuery.isLoading ? <div className="h-72 animate-pulse bg-[#f4f3ed]" /> : records.length ? <RecordTable records={records} onEditIncome={openEditIncome} onOutgoing={openOutgoing} onDelete={setDeleting} /> : <EmptyJobs onAdd={openNew} />}
      </section></Reveal>

      <Dialog open={incomeDialogOpen} onOpenChange={open => { if (!open) closeIncomeDialog(); else setIncomeDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0">
          <form onSubmit={saveIncome}>
            <DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">{editingIncome ? "Edit project income" : "Add a project"}</DialogTitle><DialogDescription>Record the project details and its income. Add who got paid afterwards, from the Outgoing action on the row.</DialogDescription></DialogHeader>
            <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
              <FormField label="Work date" required><Input required type="date" value={incomeForm.workDate} onChange={e => setIncomeForm({ ...incomeForm, workDate: e.target.value })} /></FormField>
              <FormField label="Project name" required><Input required placeholder="e.g. Shop lot rewiring" value={incomeForm.jobTitle} onChange={e => setIncomeForm({ ...incomeForm, jobTitle: e.target.value })} /></FormField>
              <FormField label="Client"><Input placeholder="Client or company" value={incomeForm.clientName} onChange={e => setIncomeForm({ ...incomeForm, clientName: e.target.value })} /></FormField>
              <FormField label="Work location"><Input placeholder="Area, unit or site" value={incomeForm.location} onChange={e => setIncomeForm({ ...incomeForm, location: e.target.value })} /></FormField>
              <FormField label="Income (RM)"><Input inputMode="decimal" type="number" step="0.01" min="0" placeholder="0.00" value={incomeForm.income} onChange={e => setIncomeForm({ ...incomeForm, income: e.target.value })} /></FormField>
              <div className="hidden sm:block" />
              <FormField label="Project notes"><Textarea className="min-h-20" placeholder="Materials, scope, payment status or other details" value={incomeForm.notes} onChange={e => setIncomeForm({ ...incomeForm, notes: e.target.value })} /></FormField>
              <div className="sm:col-span-2"><AttachmentField kind="invoice" label="Invoice" value={incomeForm.invoiceAttachmentIds} onChange={ids => setIncomeForm({ ...incomeForm, invoiceAttachmentIds: ids })} /></div>
            </div>
            <DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closeIncomeDialog}>Cancel</Button><Button type="submit" disabled={isSavingIncome}>{isSavingIncome ? "Saving…" : editingIncome ? "Save changes" : "Save job"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={outgoingDialogOpen} onOpenChange={open => { if (!open) closeOutgoingDialog(); else setOutgoingDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0">
          <form onSubmit={saveOutgoing}>
            <DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">{selectedOutgoingRecord ? `Outgoing for ${selectedOutgoingRecord.jobTitle}` : "Add outgoing"}</DialogTitle><DialogDescription>Pick the project, then record who was paid and any other costs.</DialogDescription></DialogHeader>
            <div className="grid gap-5 px-6 py-6">
              <FormField label="Project" required>
                <Select value={outgoingJobId ? String(outgoingJobId) : undefined} onValueChange={value => selectOutgoingProject(Number(value))}>
                  <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                  <SelectContent>{records.map(record => <SelectItem key={record.id} value={String(record.id)}>{record.jobTitle}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              {showZeroOutWarning ? <p className="rounded-xl border border-[#f0d9c9] bg-[#fff6ee] px-4 py-3 text-sm text-[#9f442c]">This job has an existing staff-payment total of {formatMoney(selectedOutgoingRecord!.workerPaymentCents)} with no itemized breakdown yet — add rows below, or saving will replace it with RM0.00.</p> : null}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><Label className="text-sm font-semibold">Other costs</Label><p className="mt-0.5 text-xs text-muted-foreground">Materials, transport, permits — one line per receipt.</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={addCostRow}><Plus className="mr-1.5 h-3.5 w-3.5" />Add cost</Button>
                </div>
                {costRows.length === 0 ? <p className="rounded-xl border border-dashed border-[#e0dccf] bg-[#fbfaf5] px-4 py-3 text-sm text-muted-foreground">No other costs recorded for this project yet.</p> : (
                  <div className="space-y-4">
                    {costRows.map((row, index) => (
                      <div key={index} className="space-y-2 rounded-xl border border-[#ece9e0] bg-[#fcfbf7] p-3">
                        <div className="flex items-center gap-2">
                          <Input className="min-w-0 flex-1" placeholder="e.g. Cables & conduit" value={row.label} onChange={e => updateCostRow(index, { label: e.target.value })} />
                          <Input className="w-28 shrink-0 sm:w-32" inputMode="decimal" type="number" step="0.01" min="0" placeholder="0.00" value={row.amount} onChange={e => updateCostRow(index, { amount: e.target.value })} />
                          <Button type="button" variant="ghost" size="icon" aria-label="Remove cost" onClick={() => removeCostRow(index)}><X className="h-4 w-4" /></Button>
                        </div>
                        <AttachmentField kind="receipt" compact value={row.attachmentIds} onChange={ids => updateCostRow(index, { attachmentIds: ids })} max={4} />
                      </div>
                    ))}
                    <p className="text-right text-xs font-semibold text-muted-foreground">Other costs total <span className="ml-1 text-foreground">{formatMoney(costTotalCents)}</span></p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label className="text-sm font-semibold">Staff payments</Label><Button type="button" variant="outline" size="sm" onClick={addWorkerRow} disabled={staffOptions.length === 0}><Plus className="mr-1.5 h-3.5 w-3.5" />Add staff payment</Button></div>
                {staffOptions.length === 0 ? <p className="text-sm text-muted-foreground">No staff added yet — add staff from Settings first.</p> : null}
                {workerRows.length === 0 ? null : <div className="space-y-3">
                  {workerRows.map((row, index) => {
                    const availableOptions = staffOptions.filter(option => option.id === row.staffId || !workerRows.some((other, otherIndex) => otherIndex !== index && other.staffId === option.id));
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <Select value={row.staffId > 0 ? String(row.staffId) : undefined} onValueChange={value => updateWorkerRow(index, { staffId: Number(value) })}>
                          <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                          <SelectContent>{availableOptions.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input className="w-28 shrink-0 sm:w-32" inputMode="decimal" type="number" step="0.01" min="0" placeholder="0.00" value={row.amount} onChange={e => updateWorkerRow(index, { amount: e.target.value })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove staff payment" onClick={() => removeWorkerRow(index)}><X className="h-4 w-4" /></Button>
                      </div>
                    );
                  })}
                </div>}
              </div>
            </div>
            <DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closeOutgoingDialog}>Cancel</Button><Button type="submit" disabled={updateOutgoing.isPending || !outgoingJobId}>{updateOutgoing.isPending ? "Saving…" : "Save outgoing"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteDialog record={deleting} onCancel={() => setDeleting(null)} onConfirm={() => deleting && deleteRecord.mutate({ id: deleting.id })} pending={deleteRecord.isPending} description="This will permanently remove the selected Subcon job from your records." />
    </div>
  );
}

function MiniMetric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "ink" | "olive" | "chili" }) {
  const styles = { ink: "icon-tile-ink", olive: "icon-tile-olive", chili: "icon-tile-chili" };
  return <div className="surface-mini rounded-2xl border border-[#e7e3d8] bg-[linear-gradient(180deg,#fffefa,#fcfbf6)] p-5"><div className={`icon-tile h-9 w-9 ${styles[tone]}`}>{icon}</div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{value}</p></div>;
}

function AttachmentBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#eef1e9] px-1.5 py-0.5 text-[10px] font-bold text-[#4d6347]"><Paperclip className="h-2.5 w-2.5" />{count}</span>;
}

function RecordTable({ records, onEditIncome, onOutgoing, onDelete }: { records: SubconRecord[]; onEditIncome: (record: SubconRecord) => void; onOutgoing: (record: SubconRecord) => void; onDelete: (record: SubconRecord) => void }) {
  return <>
    <div className="divide-y divide-[#ece9e0] md:hidden">{records.map(record => {
      const projectProfit = record.incomeCents - record.expenseCents - record.workerPaymentCents;
      const staffNames = record.workerPayments.map(payment => payment.staffName).join(", ");
      const subtitle = [formatDate(record.workDate), record.clientName, record.location, staffNames || null].filter(Boolean).join(" · ");
      const attachmentCount = record.invoiceAttachmentIds.length + record.costLines.reduce((sum, line) => sum + line.attachmentIds.length, 0);
      return <MobileRecord key={record.id} title={record.jobTitle} badge={<AttachmentBadge count={attachmentCount} />} subtitle={subtitle} fields={[{ label: "Income", value: formatMoney(record.incomeCents), tone: "ink" }, { label: "Net P&L", value: formatMoney(projectProfit), strong: true, tone: projectProfit < 0 ? "chili" : "ink" }, { label: "Staff pay", value: formatMoney(record.workerPaymentCents) }, { label: "Other costs", value: formatMoney(record.expenseCents) }]} actions={<><Button aria-label={`Edit income for ${record.jobTitle}`} variant="ghost" size="icon" onClick={() => onEditIncome(record)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Outgoing for ${record.jobTitle}`} variant="ghost" size="icon" onClick={() => onOutgoing(record)}><Banknote className="h-4 w-4" /></Button><Button aria-label={`Delete ${record.jobTitle}`} variant="ghost" size="icon" className="text-[#b34d2e] hover:bg-[#fff0e9] hover:text-[#9e3c25]" onClick={() => onDelete(record)}><Trash2 className="h-4 w-4" /></Button></>} />;
    })}</div>
    <div className="hidden overflow-x-auto md:block"><table className="ledger-table w-full min-w-[980px] text-left"><thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-4">Project</th><th className="px-4 py-4">Date</th><th className="px-4 py-4 text-right">Income</th><th className="px-4 py-4 text-right">Staff pay</th><th className="px-4 py-4 text-right">Other costs</th><th className="px-4 py-4 text-right">Net P&amp;L</th><th className="actions-col px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#ece9e0]">{records.map(record => {
    const projectProfit = record.incomeCents - record.expenseCents - record.workerPaymentCents;
    const staffNames = record.workerPayments.map(payment => payment.staffName).join(", ");
    const attachmentCount = record.invoiceAttachmentIds.length + record.costLines.reduce((sum, line) => sum + line.attachmentIds.length, 0);
    return <tr key={record.id} className="transition-colors hover:bg-[#fcfbf7]"><td className="px-6 py-4"><div className="flex items-center gap-1.5"><p className="font-semibold">{record.jobTitle}</p><AttachmentBadge count={attachmentCount} /></div><p className="mt-1 text-xs text-muted-foreground">{[record.clientName, record.location, staffNames || null].filter(Boolean).join(" · ") || "No client, location or staff added"}</p></td><td className="px-4 py-4 text-sm text-muted-foreground"><div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />{formatDate(record.workDate)}</div></td><td className="px-4 py-4 text-right text-sm font-semibold text-[#294d38]">{formatMoney(record.incomeCents)}</td><td className="px-4 py-4 text-right text-sm">{formatMoney(record.workerPaymentCents)}</td><td className="px-4 py-4 text-right text-sm">{formatMoney(record.expenseCents)}</td><td className={`px-4 py-4 text-right text-sm font-bold ${projectProfit < 0 ? "text-[#b34d2e]" : "text-[#294d38]"}`}>{formatMoney(projectProfit)}</td><td className="actions-col px-6 py-4"><div className="flex justify-end gap-1"><Button aria-label={`Edit income for ${record.jobTitle}`} variant="ghost" size="icon" onClick={() => onEditIncome(record)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Outgoing for ${record.jobTitle}`} variant="ghost" size="icon" onClick={() => onOutgoing(record)}><Banknote className="h-4 w-4" /></Button><Button aria-label={`Delete ${record.jobTitle}`} variant="ghost" size="icon" className="text-[#b34d2e] hover:bg-[#fff0e9] hover:text-[#9e3c25]" onClick={() => onDelete(record)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>;
  })}</tbody></table></div>
  </>;
}

function EmptyJobs({ onAdd }: { onAdd: () => void }) { return <div className="p-6"><div className="empty-panel grid min-h-64 place-items-center px-6 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ebf0e8] text-[#486242]"><BriefcaseBusiness className="h-5 w-5" /></div><h3 className="mt-4 font-semibold">Start your first project P&amp;L.</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Add the project income first, then use the Outgoing action to record who was paid and any other costs.</p><Button className="mt-5" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Add project P&amp;L</Button></div></div></div>; }

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div className="space-y-2"><Label className="text-sm font-semibold">{label}{required ? <span className="ml-1 text-[#b34d2e]">*</span> : null}</Label>{children}</div>; }

function DeleteDialog({ record, onCancel, onConfirm, pending, description }: { record: SubconRecord | null; onCancel: () => void; onConfirm: () => void; pending: boolean; description: string }) { return <AlertDialog open={Boolean(record)} onOpenChange={open => { if (!open) onCancel(); }}><AlertDialogContent className="rounded-2xl border-[#ddd8cc] bg-[#fffefa]"><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep record</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>{pending ? "Deleting…" : "Delete record"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }
