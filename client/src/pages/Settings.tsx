import { useAuth } from "@/_core/hooks/useAuth";
import { MobileRecord } from "@/components/MobileRecord";
import { Reveal } from "@/components/Reveal";
import { PinInput, ProfileAvatar, roleLabel } from "@/components/SignIn";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { KeyRound, Leaf, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="page-shell">
      <Reveal>
        <section className="page-heading">
          <div>
            <p className="eyebrow">Settings</p>
            <h1 className="display-title">{isAdmin ? "People, on record." : "Your profile and customers."}</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">{isAdmin ? "Manage who can sign in, the customers who take your chili, and the staff you pay on wiring jobs." : "Change your PIN and keep the list of customers who take your chili. The staff roster is managed from Dad's profile."}</p>
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.05}><ProfilesCard /></Reveal>
      <Reveal delay={0.1}><CustomersCard /></Reveal>
      {isAdmin ? <Reveal delay={0.15}><StaffCard /></Reveal> : null}
      <Reveal delay={0.2}><StorageCard /></Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

function CardHeader({ eyebrow, title, description, badge, action }: { eyebrow: string; title: string; description?: string; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#e6e2d8] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="eyebrow">{eyebrow}</p>{badge}</div>
        <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 [&>button]:w-full sm:[&>button]:w-auto">{action}</div> : null}
    </div>
  );
}

function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <Button aria-label={`Edit ${name}`} variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button aria-label={`Remove ${name}`} variant="ghost" size="icon" className="text-[#b34d2e] hover:bg-[#fff0e9] hover:text-[#9e3c25]" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </>
  );
}

function EmptyPanel({ icon, tone, title, body, action }: { icon: React.ReactNode; tone: "ink" | "chili"; title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="p-5 sm:p-6">
      <div className="empty-panel grid min-h-52 place-items-center px-5 py-8 text-center">
        <div>
          <div className={`icon-tile mx-auto h-12 w-12 ${tone === "chili" ? "icon-tile-chili" : "icon-tile-ink"}`}>{icon}</div>
          <h3 className="mt-4 font-semibold">{title}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
          <div className="mt-5">{action}</div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}{required ? <span className="ml-1 text-[#b34d2e]">*</span> : null}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ConfirmRemove({ open, title, body, pending, confirmLabel, onCancel, onConfirm }: { open: boolean; title: string; body: string; pending: boolean; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={isOpen => { if (!isOpen) onCancel(); }}>
      <AlertDialogContent className="rounded-2xl border-[#ddd8cc] bg-[#fffefa]">
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>{pending ? "Removing…" : confirmLabel}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Profiles & PIN                                                       */
/* ------------------------------------------------------------------ */

function ProfilesCard() {
  const { user } = useAuth();
  const profilesQuery = trpc.auth.profiles.useQuery();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const closePinDialog = () => { setPinDialogOpen(false); setCurrentPin(""); setNewPin(""); setConfirmPin(""); };
  const changePin = trpc.auth.changePin.useMutation({ onSuccess: () => { toast.success("Your PIN has been updated"); closePinDialog(); }, onError: error => toast.error(error.message) });
  const profiles = profilesQuery.data ?? [];
  const ready = currentPin.length === 4 && newPin.length === 4 && confirmPin.length === 4;
  const savePin = (event: FormEvent) => {
    event.preventDefault();
    if (newPin !== confirmPin) { toast.error("New PINs don't match"); setConfirmPin(""); return; }
    changePin.mutate({ currentPin, newPin });
  };

  return (
    <section className="surface-card mt-2 overflow-hidden">
      <CardHeader
        eyebrow="Profiles & sign-in"
        title="Who can open this ledger"
        description="Both profiles start with the PIN 1234 — each of you should change it once."
        action={<Button variant="outline" onClick={() => setPinDialogOpen(true)}><KeyRound className="mr-1 h-4 w-4" />Change my PIN</Button>}
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        {profiles.map(profile => {
          const isMe = profile.id === user?.id;
          return (
            <div key={profile.id} className={`relative flex items-center gap-4 rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${isMe ? "border-[#cdd9cc] bg-[linear-gradient(180deg,#f6f9f3,#eef3ea)]" : "border-[#e7e3d8] bg-[linear-gradient(180deg,#fffefa,#fcfbf6)]"}`}>
              <ProfileAvatar name={profile.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold tracking-[-0.01em]">{profile.name}</p>
                  {isMe ? <span className="pill pill-ink !py-0.5 !text-[10px]">You</span> : null}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {profile.role === "admin" ? <ShieldCheck className="h-3.5 w-3.5 text-[#4d6347]" /> : <Leaf className="h-3.5 w-3.5 text-[#9f442c]" />}
                  {roleLabel(profile.role)}{profile.role === "admin" ? " · Overview, Subcon, Chili, Settings" : " · Overview, Chili, Settings"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={pinDialogOpen} onOpenChange={open => { if (!open) closePinDialog(); else setPinDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0">
          <form onSubmit={savePin}>
            <DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">Change your PIN</DialogTitle><DialogDescription>Enter your current PIN, then choose a new 4-digit PIN.</DialogDescription></DialogHeader>
            <div className="grid gap-5 px-6 py-6">
              <FormField label="Current PIN" required><PinInput value={currentPin} onChange={setCurrentPin} compact autoFocus /></FormField>
              <FormField label="New PIN" required><PinInput value={newPin} onChange={setNewPin} compact /></FormField>
              <FormField label="Confirm new PIN" required><PinInput value={confirmPin} onChange={setConfirmPin} compact /></FormField>
            </div>
            <DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closePinDialog}>Cancel</Button><Button type="submit" disabled={!ready || changePin.isPending}>{changePin.isPending ? "Saving…" : "Update PIN"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Chili customers                                                      */
/* ------------------------------------------------------------------ */

type PaymentTerms = "on_delivery" | "next_delivery";
type CustomerRecord = { id: number; name: string; phone: string | null; location: string | null; paymentTerms: PaymentTerms };
type CustomerForm = { name: string; phone: string; location: string; paymentTerms: PaymentTerms };
const blankCustomer = (): CustomerForm => ({ name: "", phone: "", location: "", paymentTerms: "on_delivery" });
const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = { on_delivery: "Pays on delivery", next_delivery: "Pays on next delivery" };

function CustomersCard() {
  const utils = trpc.useUtils();
  const customersQuery = trpc.customers.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<CustomerForm>(blankCustomer);
  const [deleting, setDeleting] = useState<CustomerRecord | null>(null);
  const refresh = async () => { await utils.customers.list.invalidate(); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(blankCustomer()); };
  const createCustomer = trpc.customers.create.useMutation({ onSuccess: async () => { toast.success("Customer added"); await refresh(); closeDialog(); }, onError: error => toast.error(error.message) });
  const updateCustomer = trpc.customers.update.useMutation({ onSuccess: async () => { toast.success("Customer updated"); await refresh(); closeDialog(); }, onError: error => toast.error(error.message) });
  const deleteCustomer = trpc.customers.delete.useMutation({ onSuccess: async () => { toast.success("Customer removed"); await refresh(); setDeleting(null); }, onError: error => toast.error(error.message) });
  const customers = (customersQuery.data ?? []) as CustomerRecord[];
  const isSaving = createCustomer.isPending || updateCustomer.isPending;
  const openNew = () => { setEditing(null); setForm(blankCustomer()); setDialogOpen(true); };
  const openEdit = (record: CustomerRecord) => { setEditing(record); setForm({ name: record.name, phone: record.phone ?? "", location: record.location ?? "", paymentTerms: record.paymentTerms ?? "on_delivery" }); setDialogOpen(true); };
  const save = (event: FormEvent) => { event.preventDefault(); if (editing) updateCustomer.mutate({ id: editing.id, ...form }); else createCustomer.mutate(form); };

  return (
    <section className="surface-card mt-6 overflow-hidden">
      <CardHeader
        eyebrow="Chili customers"
        title="The people who take chili from you"
        description="Pick from this list when recording a chili sale."
        badge={<span className="pill pill-chili">{customers.length} {customers.length === 1 ? "customer" : "customers"}</span>}
        action={<Button variant="chili" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Add customer</Button>}
      />
      {customersQuery.isLoading ? <div className="h-40 animate-pulse bg-[#f4f3ed]" /> : customers.length ? (
        <>
          <div className="divide-y divide-[#ece9e0] md:hidden">
            {customers.map(record => (
              <MobileRecord key={record.id} title={record.name} subtitle={[record.phone, record.location].filter(Boolean).join(" · ") || "No contact saved"} fields={[{ label: "Payment", value: PAYMENT_TERMS_LABELS[record.paymentTerms ?? "on_delivery"] }]} actions={<RowActions name={record.name} onEdit={() => openEdit(record)} onDelete={() => setDeleting(record)} />} />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="ledger-table w-full text-left">
              <thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-4">Customer</th><th className="px-4 py-4">Phone</th><th className="px-4 py-4">Location</th><th className="px-4 py-4">Payment</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-[#ece9e0]">
                {customers.map(record => (
                  <tr key={record.id} className="transition-colors hover:bg-[#fcfbf7]">
                    <td className="px-6 py-4 font-semibold">{record.name}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{record.phone || "—"}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{record.location || "—"}</td>
                    <td className="px-4 py-4 text-sm">{PAYMENT_TERMS_LABELS[record.paymentTerms ?? "on_delivery"]}</td>
                    <td className="px-6 py-4"><div className="flex justify-end gap-1"><RowActions name={record.name} onEdit={() => openEdit(record)} onDelete={() => setDeleting(record)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyPanel icon={<Leaf className="h-5 w-5" />} tone="chili" title="No customers yet." body="Add the stalls, shops and people who buy your chili, then choose them when recording a sale." action={<Button variant="chili" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Add customer</Button>} />
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0">
          <form onSubmit={save}>
            <DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">{editing ? "Edit customer" : "Add a customer"}</DialogTitle><DialogDescription>Who they are and how to reach them.</DialogDescription></DialogHeader>
            <div className="grid gap-5 px-6 py-6">
              <FormField label="Name" required><Input required autoFocus placeholder="e.g. Pasar Tani stall, Kak Mah" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField>
              <FormField label="Phone"><Input inputMode="tel" placeholder="Phone number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></FormField>
              <FormField label="Location"><Input placeholder="Market, shop or area" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></FormField>
              <FormField label="Payment habit">
                <Select value={form.paymentTerms} onValueChange={value => setForm({ ...form, paymentTerms: value as PaymentTerms })}>
                  <SelectTrigger className="w-full" aria-label="Payment habit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_delivery">Pays on delivery</SelectItem>
                    <SelectItem value="next_delivery">Pays on the next delivery</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">New sales for this customer start as {form.paymentTerms === "next_delivery" ? "unpaid, until they pay on the next delivery" : "paid"}. You can still change it on each sale.</p>
              </FormField>
            </div>
            <DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button><Button type="submit" variant="chili" disabled={isSaving}>{isSaving ? "Saving…" : editing ? "Save changes" : "Save customer"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmRemove open={Boolean(deleting)} title="Remove this customer?" body="They'll no longer appear when recording new sales. Past sales keep their name, so your history is unaffected." pending={deleteCustomer.isPending} confirmLabel="Remove customer" onCancel={() => setDeleting(null)} onConfirm={() => deleting && deleteCustomer.mutate({ id: deleting.id })} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Staff (Dad only)                                                     */
/* ------------------------------------------------------------------ */

type StaffRecord = { id: number; name: string; icNumber: string | null; bankAccountNumber: string | null };
type StaffForm = { name: string; icNumber: string; bankAccountNumber: string };
const blankStaff = (): StaffForm => ({ name: "", icNumber: "", bankAccountNumber: "" });

function StaffCard() {
  const utils = trpc.useUtils();
  const staffQuery = trpc.staff.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRecord | null>(null);
  const [form, setForm] = useState<StaffForm>(blankStaff);
  const [deleting, setDeleting] = useState<StaffRecord | null>(null);
  const refresh = async () => { await utils.staff.list.invalidate(); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(blankStaff()); };
  const createStaff = trpc.staff.create.useMutation({ onSuccess: async () => { toast.success("Staff member added"); await refresh(); closeDialog(); }, onError: error => toast.error(error.message) });
  const updateStaff = trpc.staff.update.useMutation({ onSuccess: async () => { toast.success("Staff member updated"); await refresh(); closeDialog(); }, onError: error => toast.error(error.message) });
  const deleteStaff = trpc.staff.delete.useMutation({ onSuccess: async () => { toast.success("Staff member removed"); await refresh(); setDeleting(null); }, onError: error => toast.error(error.message) });
  const staff = (staffQuery.data ?? []) as StaffRecord[];
  const isSaving = createStaff.isPending || updateStaff.isPending;
  const openNew = () => { setEditing(null); setForm(blankStaff()); setDialogOpen(true); };
  const openEdit = (record: StaffRecord) => { setEditing(record); setForm({ name: record.name, icNumber: record.icNumber ?? "", bankAccountNumber: record.bankAccountNumber ?? "" }); setDialogOpen(true); };
  const save = (event: FormEvent) => { event.preventDefault(); if (editing) updateStaff.mutate({ id: editing.id, ...form }); else createStaff.mutate(form); };

  return (
    <section className="surface-card mt-6 overflow-hidden">
      <CardHeader
        eyebrow="Subcon staff"
        title="Everyone you pay for wiring work"
        description="Name, IC number and bank account, so every job payment is traceable to a person."
        badge={<span className="pill pill-ink">{staff.length} {staff.length === 1 ? "staff member" : "staff members"}</span>}
        action={<Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Add staff</Button>}
      />
      {staffQuery.isLoading ? <div className="h-40 animate-pulse bg-[#f4f3ed]" /> : staff.length ? (
        <>
          <div className="divide-y divide-[#ece9e0] md:hidden">
            {staff.map(record => (
              <MobileRecord key={record.id} title={record.name} fields={[{ label: "IC number", value: record.icNumber || "—" }, { label: "Bank account", value: record.bankAccountNumber || "—" }]} actions={<RowActions name={record.name} onEdit={() => openEdit(record)} onDelete={() => setDeleting(record)} />} />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="ledger-table w-full text-left">
              <thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-4">Name</th><th className="px-4 py-4">IC number</th><th className="px-4 py-4">Bank account</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-[#ece9e0]">
                {staff.map(record => (
                  <tr key={record.id} className="transition-colors hover:bg-[#fcfbf7]">
                    <td className="px-6 py-4 font-semibold">{record.name}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{record.icNumber || "—"}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{record.bankAccountNumber || "—"}</td>
                    <td className="px-6 py-4"><div className="flex justify-end gap-1"><RowActions name={record.name} onEdit={() => openEdit(record)} onDelete={() => setDeleting(record)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyPanel icon={<Users className="h-5 w-5" />} tone="ink" title="Add your first staff member." body="Once added, they'll show up as a choice when recording who was paid on a Subcon job." action={<Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Add staff</Button>} />
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl border-[#ddd8cc] bg-[#fffefa] p-0">
          <form onSubmit={save}>
            <DialogHeader className="dialog-header px-6 py-5"><DialogTitle className="text-xl">{editing ? "Edit staff member" : "Add a staff member"}</DialogTitle><DialogDescription>Their name, IC number and bank account so payments can be traced to them.</DialogDescription></DialogHeader>
            <div className="grid gap-5 px-6 py-6">
              <FormField label="Name" required><Input required autoFocus placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField>
              <FormField label="IC number"><Input inputMode="numeric" placeholder="Identification card number" value={form.icNumber} onChange={e => setForm({ ...form, icNumber: e.target.value })} /></FormField>
              <FormField label="Bank account number"><Input inputMode="numeric" placeholder="Bank account number" value={form.bankAccountNumber} onChange={e => setForm({ ...form, bankAccountNumber: e.target.value })} /></FormField>
            </div>
            <DialogFooter className="dialog-footer px-6 py-4"><Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : editing ? "Save changes" : "Save staff member"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmRemove open={Boolean(deleting)} title="Remove this staff member?" body="They'll no longer appear as an option for new job payments. Past job records that already paid them keep their name, so your existing history is unaffected." pending={deleteStaff.isPending} confirmLabel="Remove staff member" onCancel={() => setDeleting(null)} onConfirm={() => deleting && deleteStaff.mutate({ id: deleting.id })} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Storage usage                                                        */
/* ------------------------------------------------------------------ */

function StorageCard() {
  const usageQuery = trpc.attachments.usage.useQuery();
  const usage = usageQuery.data;
  if (!usage) return null;
  const percent = Math.min(100, (usage.storageBytes / usage.quotaBytes) * 100);
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <section className="surface-card mt-6 overflow-hidden">
      <CardHeader eyebrow="Storage" title="Space used by receipts and invoices" description={`${usage.fileCount} file${usage.fileCount === 1 ? "" : "s"} · ${mb(usage.storageBytes)} MB of ${mb(usage.quotaBytes)} MB used`} />
      <div className="px-5 pb-5 sm:px-6 sm:pb-6"><Progress value={percent} className="h-2" /></div>
    </section>
  );
}
