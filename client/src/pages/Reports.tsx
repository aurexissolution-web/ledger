import { useAuth } from "@/_core/hooks/useAuth";
import { BusinessSwitch, useBusinessView, type BusinessView } from "@/components/BusinessSwitch";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { attachmentUrl, downloadUrl } from "@/lib/attachments";
import { downloadTextFile } from "@/lib/download";
import { formatDate, formatMoney } from "@/lib/format";
import { describeLine, saleLines } from "@/lib/chili-grades";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { buildCsv, reportToCsvRows } from "@shared/report-csv";
import type { inferRouterOutputs } from "@trpc/server";
import { BriefcaseBusiness, Download, FileBarChart, FileText, Leaf, Printer, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

type YearReport = inferRouterOutputs<AppRouter>["business"]["yearReport"];
type AttachmentMeta = YearReport["attachments"][number];

const REPORT_NAMES: Record<BusinessView, { title: string; file: string }> = {
  subcon: { title: "Wiring Subcon report", file: "subcon-report" },
  chili: { title: "Chili report", file: "chili-report" },
  both: { title: "Family business report", file: "family-business" },
};

function yearBounds(year: number) {
  return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() };
}

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { from, to } = useMemo(() => yearBounds(year), [year]);
  const reportQuery = trpc.business.yearReport.useQuery({ from, to });
  const report = reportQuery.data;
  const { user } = useAuth();
  const [view, chooseView] = useBusinessView("reports-business", user?.role === "admin");
  const fileName = `${REPORT_NAMES[view].file}-${year}`;

  const attachmentsById = useMemo(() => new Map((report?.attachments ?? []).map(attachment => [attachment.id, attachment])), [report]);

  const downloadCsv = () => {
    if (!report) return;
    const rows = reportToCsvRows({
      subconJobs: view !== "chili" ? report.subcon?.jobs ?? [] : [],
      chiliSales: view !== "subcon" ? report.chili.sales : [],
      chiliExpenses: view !== "subcon" ? report.chili.expenses : [],
      formatDate,
      formatMoney,
    });
    downloadTextFile(`${fileName}.csv`, buildCsv(rows), "text/csv;charset=utf-8");
  };

  const printReport = async () => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".print-appendix img"));
    await Promise.all(images.map(img => img.decode().catch(() => {})));
    // The browser suggests the page title as the PDF's file name.
    const pageTitle = document.title;
    document.title = fileName;
    window.addEventListener("afterprint", () => { document.title = pageTitle; }, { once: true });
    window.print();
  };

  return (
    <div className="page-shell">
      <Reveal>
        <section className="page-heading">
          <div>
            <p className="eyebrow">Reports</p>
            <h1 className="display-title">Ready for the accountant.</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">Every entry for the year, with the invoice or receipt behind it — printable as a PDF, or exported as a spreadsheet.</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
              <SelectTrigger className="h-11 w-36" aria-label="Choose a year"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 6 }, (_, i) => currentYear - i).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="lg" onClick={downloadCsv} disabled={!report}><Download className="mr-1 h-4 w-4" />Download CSV</Button>
            <Button size="lg" onClick={printReport} disabled={!report}><Printer className="mr-1 h-4 w-4" />Print / Save as PDF</Button>
          </div>
        </section>
      </Reveal>

      {user?.role === "admin" ? (
        <Reveal delay={0.03} className="print:hidden">
          <BusinessSwitch value={view} onChange={chooseView} className="mb-5" />
        </Reveal>
      ) : null}

      {reportQuery.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-[#f4f3ed]" /> : report ? <ReportBody year={year} view={view} report={report} attachmentsById={attachmentsById} /> : (
        <div className="empty-panel grid min-h-64 place-items-center px-6 text-center"><p className="text-sm text-muted-foreground">We could not load this report. Please try again.</p></div>
      )}
    </div>
  );
}

function ReportBody({ year, view, report, attachmentsById }: { year: number; view: BusinessView; report: YearReport; attachmentsById: Map<number, AttachmentMeta> }) {
  const subcon = view !== "chili" ? report.subcon : null;
  const chili = view !== "subcon" ? report.chili : null;
  const incomeCents = (subcon?.totals.incomeCents ?? 0) + (chili?.totals.incomeCents ?? 0);
  const outgoingsCents = (subcon?.totals.outgoingsCents ?? 0) + (chili?.totals.outgoingsCents ?? 0);

  const appendixEntries: { caption: string; ids: number[] }[] = [];
  for (const job of subcon?.jobs ?? []) {
    if (job.invoiceAttachmentIds.length) appendixEntries.push({ caption: `Subcon job · ${job.jobTitle} · ${formatDate(job.workDate)} · Invoice`, ids: job.invoiceAttachmentIds });
    for (const line of job.costLines) {
      if (line.attachmentIds.length) appendixEntries.push({ caption: `Subcon job · ${job.jobTitle} · ${formatDate(job.workDate)} · Receipt — ${line.label}`, ids: line.attachmentIds });
    }
  }
  for (const sale of chili?.sales ?? []) {
    if (sale.attachmentIds.length) appendixEntries.push({ caption: `Chili sale · ${sale.recipientName} · ${formatDate(sale.saleDate)} · Invoice`, ids: sale.attachmentIds });
  }
  for (const expense of chili?.expenses ?? []) {
    if (expense.attachmentIds.length) appendixEntries.push({ caption: `Chili expense · ${expense.category} · ${formatDate(expense.expenseDate)} · Receipt`, ids: expense.attachmentIds });
  }

  return (
    <>
      <h2 className="mb-4 hidden text-xl font-semibold print:block">{REPORT_NAMES[view].title} · {year}</h2>
      <Reveal delay={0.05}>
        <section className="grid gap-4 lg:grid-cols-3 print:grid-cols-3">
          <ReportMetric label={`Income · ${year}`} value={formatMoney(incomeCents)} tone="ink" icon={Wallet} />
          <ReportMetric label="Outgoings" value={formatMoney(outgoingsCents)} tone="olive" icon={FileBarChart} />
          <ReportMetric label="Net profit" value={formatMoney(incomeCents - outgoingsCents)} tone="chili" icon={FileText} />
        </section>
      </Reveal>

      {subcon ? (
        <Reveal delay={0.1}>
          <section className="print-section surface-card mt-8 overflow-hidden">
            <SectionHeader icon={BriefcaseBusiness} eyebrow="Wiring subcontracting" title="Subcon jobs" count={subcon.jobs.length} />
            {subcon.jobs.length === 0 ? <EmptySection label="No Subcon jobs recorded this year." /> : (
              <div className="overflow-x-auto"><table className="ledger-table w-full min-w-[820px] text-left"><thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-3">Project</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Income</th><th className="px-4 py-3 text-right">Staff pay</th><th className="px-4 py-3 text-right">Other costs</th><th className="px-6 py-3 text-right">Net</th></tr></thead><tbody className="divide-y divide-[#ece9e0]">
                {subcon.jobs.map(job => (
                  <tr key={job.id} className="print-section align-top">
                    <td className="px-6 py-3">
                      <p className="font-semibold">{job.jobTitle}</p>
                      {job.clientName ? <p className="text-xs text-muted-foreground">{job.clientName}</p> : null}
                      {job.costLines.length ? <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{job.costLines.map((line, i) => <li key={i}>· {line.label}: {formatMoney(line.amountCents)}</li>)}</ul> : null}
                      {job.workerPayments.length ? <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{job.workerPayments.map((payment, i) => <li key={i}>· Paid {payment.staffName}: {formatMoney(payment.amountCents)}</li>)}</ul> : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(job.workDate)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#294d38]">{formatMoney(job.incomeCents)}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatMoney(job.workerPaymentCents)}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatMoney(job.expenseCents)}</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-[#294d38]">{formatMoney(job.incomeCents - job.expenseCents - job.workerPaymentCents)}</td>
                  </tr>
                ))}
                <tr className="bg-[#f8f7f1] font-semibold"><td className="px-6 py-3" colSpan={2}>Totals</td><td className="px-4 py-3 text-right">{formatMoney(subcon.totals.incomeCents)}</td><td className="px-4 py-3 text-right">{formatMoney(subcon.totals.workerPaymentsCents)}</td><td className="px-4 py-3 text-right">{formatMoney(subcon.totals.outgoingsCents - subcon.totals.workerPaymentsCents)}</td><td className="px-6 py-3 text-right">{formatMoney(subcon.totals.profitCents)}</td></tr>
              </tbody></table></div>
            )}
          </section>
        </Reveal>
      ) : null}

      {chili ? (
        <>
          <Reveal delay={0.15}>
            <section className="print-section surface-card mt-8 overflow-hidden">
              <SectionHeader icon={Leaf} eyebrow="Chili agriculture" title="Sales" count={chili.sales.length} />
              {chili.sales.length === 0 ? <EmptySection label="No chili sales recorded this year." /> : (
                <div className="overflow-x-auto"><table className="ledger-table w-full min-w-[620px] text-left"><thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-3">Recipient</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Grade · quantity · price</th><th className="px-4 py-3">Payment</th><th className="px-6 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-[#ece9e0]">
                  {chili.sales.map(sale => <tr key={sale.id} className="print-section"><td className="px-6 py-3 font-semibold">{sale.recipientName}</td><td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(sale.saleDate)}</td><td className="px-4 py-3 text-sm">{saleLines(sale).map(line => <div key={line.grade ?? "-"}>{describeLine(line)}</div>)}</td><td className="px-4 py-3 text-sm">{sale.paidAt === null ? <span className="font-semibold text-[#b34d2e]">Unpaid</span> : <span className="text-muted-foreground">Paid {formatDate(sale.paidAt)}</span>}</td><td className="px-6 py-3 text-right text-sm font-semibold text-[#9f442c]">{formatMoney(sale.totalCents)}</td></tr>)}
                  <tr className="bg-[#f8f7f1] font-semibold"><td className="px-6 py-3" colSpan={4}>Total</td><td className="px-6 py-3 text-right">{formatMoney(chili.sales.reduce((sum, sale) => sum + sale.totalCents, 0))}</td></tr>
                  {chili.sales.some(sale => sale.paidAt === null) ? <tr className="text-sm"><td className="px-6 py-3 text-muted-foreground" colSpan={4}>Still unpaid</td><td className="px-6 py-3 text-right font-semibold text-[#b34d2e]">{formatMoney(chili.sales.filter(sale => sale.paidAt === null).reduce((sum, sale) => sum + sale.totalCents, 0))}</td></tr> : null}
                </tbody></table></div>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.18}>
            <section className="print-section surface-card mt-8 overflow-hidden">
              <SectionHeader icon={FileBarChart} eyebrow="Chili agriculture" title="Daily expenses" count={chili.expenses.length} />
              {chili.expenses.length === 0 ? <EmptySection label="No chili expenses recorded this year." /> : (
                <div className="overflow-x-auto"><table className="ledger-table w-full min-w-[520px] text-left"><thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-6 py-3">Category</th><th className="px-4 py-3">Date</th><th className="px-6 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-[#ece9e0]">
                  {chili.expenses.map(expense => <tr key={expense.id} className="print-section"><td className="px-6 py-3 font-semibold">{expense.category}</td><td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(expense.expenseDate)}</td><td className="px-6 py-3 text-right text-sm">{formatMoney(expense.amountCents)}</td></tr>)}
                  <tr className="bg-[#f8f7f1] font-semibold"><td className="px-6 py-3" colSpan={2}>Total</td><td className="px-6 py-3 text-right">{formatMoney(chili.expenses.reduce((sum, expense) => sum + expense.amountCents, 0))}</td></tr>
                </tbody></table></div>
              )}
            </section>
          </Reveal>
        </>
      ) : null}

      <Reveal delay={0.22}>
        <section className="print-section surface-card mt-8 overflow-hidden">
          <SectionHeader icon={FileText} eyebrow="Appendix" title="Invoices & receipts" count={appendixEntries.reduce((sum, entry) => sum + entry.ids.length, 0)} />
          {appendixEntries.length === 0 ? <EmptySection label="No invoices or receipts attached this year." /> : (
            <div className="print-appendix space-y-6 p-6">
              {appendixEntries.map((entry, entryIndex) => (
                <div key={entryIndex} className="space-y-3">
                  <p className="text-sm font-semibold">{entry.caption}</p>
                  {entry.ids.map(id => {
                    const meta = attachmentsById.get(id);
                    if (!meta) return null;
                    if (meta.mimeType === "application/pdf") {
                      return <a key={id} href={downloadUrl(id)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-[#e3dfd2] bg-[#fbfaf5] px-4 py-3 text-sm text-[#4d6347] hover:underline"><FileText className="h-4 w-4 shrink-0" />{meta.fileName}</a>;
                    }
                    return <img key={id} src={attachmentUrl(id)} alt={entry.caption} loading="eager" className="print-attachment max-h-[70vh] w-full max-w-md rounded-xl border border-[#e3dfd2] object-contain" />;
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>
    </>
  );
}

function ReportMetric({ label, value, tone, icon: Icon }: { label: string; value: string; tone: "ink" | "olive" | "chili"; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-75">{label}</p>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/12 ring-1 ring-white/15"><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-8 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, eyebrow, title, count }: { icon: React.ComponentType<{ className?: string }>; eyebrow: string; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#e6e2d8] px-6 py-5">
      <div className="flex items-center gap-3"><span className="icon-tile icon-tile-ink h-9 w-9"><Icon className="h-4 w-4" /></span><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold">{title}</h2></div></div>
      <span className="pill pill-ink">{count}</span>
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return <div className="p-6"><div className="empty-panel grid min-h-32 place-items-center px-6 text-center"><p className="text-sm text-muted-foreground">{label}</p></div></div>;
}
