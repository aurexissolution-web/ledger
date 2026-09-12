import { Reveal } from "@/components/Reveal";
import { formatDate, formatMoney } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness, Leaf, Plus, TrendingUp, WalletCards } from "lucide-react";
import { useLocation } from "wouter";

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  tone: "ink" | "olive" | "chili";
  icon: React.ComponentType<{ className?: string }>;
};

function MetricCard({ label, value, hint, tone, icon: Icon }: MetricCardProps) {
  return (
    <div className={`metric-card metric-${tone} h-full`}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-75">{label}</p>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-8 text-[2.1rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.5rem]">{value}</p>
      <p className="mt-3 text-sm opacity-75">{hint}</p>
    </div>
  );
}

export default function Overview() {
  const [, setLocation] = useLocation();
  const overview = trpc.business.overview.useQuery();

  if (overview.isLoading) {
    return <OverviewSkeleton />;
  }

  if (overview.error || !overview.data) {
    return (
      <div className="empty-state">
        <WalletCards className="mx-auto h-6 w-6 text-[#b34d2e]" />
        <h1>We could not load your records.</h1>
        <p>Please refresh this page. Your existing records remain safely stored.</p>
      </div>
    );
  }

  const { data } = overview;
  const hasActivity = data.recentActivity.length > 0;
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="page-shell">
      <Reveal>
        <section className="page-heading">
          <div>
            <p className="eyebrow">Family business command centre</p>
            <h1 className="display-title">Everything, in balance.</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">
              A clear, shared view of the wiring subcontracting and chili businesses — from money earned to the work behind it.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="status-chip"><span className="status-dot" />All-time business view</span>
            <span className="text-xs font-medium text-muted-foreground">{today}</span>
          </div>
        </section>
      </Reveal>

      <section className="grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.05} className="h-full"><MetricCard label="Income recorded" value={formatMoney(data.incomeCents)} hint={data.canSeeSubcon ? "Across both businesses" : "From the chili business"} tone="ink" icon={ArrowUpRight} /></Reveal>
        <Reveal delay={0.1} className="h-full"><MetricCard label="Outgoings" value={formatMoney(data.outgoingsCents)} hint="Costs, wages and daily expenses" tone="olive" icon={ArrowDownRight} /></Reveal>
        <Reveal delay={0.15} className="h-full"><MetricCard label="Net position" value={formatMoney(data.profitCents)} hint="Income less all outgoings" tone="chili" icon={TrendingUp} /></Reveal>
      </section>

      <Reveal delay={0.2}>
        <section className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="surface-card overflow-hidden">
            <div className="flex flex-col gap-5 border-b border-[#e9e5db] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">Business pulse</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Income and costs, separated clearly</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.canSeeSubcon ? (
                  <button className="quick-action" onClick={() => setLocation("/subcon")}>
                    <BriefcaseBusiness className="h-4 w-4" /> Record Subcon work
                  </button>
                ) : null}
                <button className="quick-action quick-action-chili" onClick={() => setLocation("/chili")}>
                  <Leaf className="h-4 w-4" /> Record Chili sale
                </button>
              </div>
            </div>
            <div className={`grid gap-4 p-6 ${data.canSeeSubcon ? "sm:grid-cols-2" : ""}`}>
              {data.canSeeSubcon ? <BusinessPulse name="Wiring Subcon" description="Jobs, worker pay and operating costs" icon={<BriefcaseBusiness className="h-5 w-5" />} income={data.subcon.incomeCents} outgoings={data.subcon.outgoingsCents} profit={data.subcon.profitCents} accent="subcon" onOpen={() => setLocation("/subcon")} /> : null}
              <BusinessPulse name="Chili Agriculture" description="Sales, delivery value and daily expenses" icon={<Leaf className="h-5 w-5" />} income={data.chili.incomeCents} outgoings={data.chili.outgoingsCents} profit={data.chili.profitCents} owed={data.chili.owedCents} owedCount={data.chili.owedCount} accent="chili" onOpen={() => setLocation("/chili")} />
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-[#e9e5db] p-6">
              <div>
                <p className="eyebrow">Latest activity</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Your most recent entries</h2>
              </div>
              <button className="icon-tile icon-tile-olive lift h-10 w-10 rounded-full" onClick={() => setLocation(data.canSeeSubcon ? "/subcon" : "/chili")} aria-label="Record a new entry">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {hasActivity ? (
              <div className="divide-y divide-[#ece9e0] px-4 py-2">
                {data.recentActivity.map(activity => (
                  <ActivityRow key={activity.id} title={activity.title} kind={activity.kind} date={activity.date} amountCents={activity.amountCents} />
                ))}
              </div>
            ) : (
              <div className="p-6">
                <div className="empty-panel p-8 text-center">
                  <div className="icon-tile icon-tile-ink mx-auto h-11 w-11"><WalletCards className="h-5 w-5" /></div>
                  <p className="mt-4 font-semibold">Your record book is ready.</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Add your first Subcon job or Chili sale to start seeing activity here.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </Reveal>
    </div>
  );
}

function ActivityRow({ title, kind, date, amountCents }: { title: string; kind: string; date: number; amountCents: number }) {
  const isChiliExpense = kind === "Chili expense";
  const isChiliSale = kind === "Chili sale";
  const tile = isChiliExpense ? "icon-tile-chili" : isChiliSale ? "icon-tile-olive" : "icon-tile-ink";
  const Icon = isChiliExpense ? ArrowDownRight : isChiliSale ? Leaf : BriefcaseBusiness;
  const negative = amountCents < 0;
  return (
    <div className="activity-row flex items-center justify-between gap-4 px-2 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`icon-tile h-9 w-9 shrink-0 ${tile}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{kind} · {formatDate(date)}</p>
        </div>
      </div>
      <p className={`shrink-0 text-sm font-bold ${negative ? "text-[#b34d2e]" : "text-[#294d38]"}`}>
        {negative ? "−" : "+"}{formatMoney(Math.abs(amountCents))}
      </p>
    </div>
  );
}

function BusinessPulse({ name, description, icon, income, outgoings, profit, owed = 0, owedCount = 0, accent, onOpen }: { name: string; description: string; icon: React.ReactNode; income: number; outgoings: number; profit: number; owed?: number; owedCount?: number; accent: "subcon" | "chili"; onOpen: () => void }) {
  const tile = accent === "subcon" ? "icon-tile-ink" : "icon-tile-chili";
  return (
    <button type="button" onClick={onOpen} className="group lift relative rounded-2xl border border-[#e8e4da] bg-[linear-gradient(180deg,#fdfcf8,#f8f7f1)] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none focus-visible:ring-[3px] focus-visible:ring-[#5f7d68]/30">
      <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-[#9aa198] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      <div className="flex items-start gap-3">
        <div className={`icon-tile h-10 w-10 shrink-0 ${tile}`}>{icon}</div>
        <div>
          <h3 className="font-semibold tracking-[-0.02em]">{name}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 divide-x divide-[#ebe7dc]">
        <SmallTotal label="In" value={formatMoney(income)} />
        <SmallTotal label="Out" value={formatMoney(outgoings)} className="pl-3" />
        <SmallTotal label="Net" value={formatMoney(profit)} strong negative={profit < 0} className="pl-3" />
      </div>
      {owed > 0 ? (
        <p className="mt-4 flex items-center justify-between rounded-xl bg-[#fff4ee] px-3 py-2 text-xs font-semibold text-[#9f442c]">
          <span>Owed to you · {owedCount} unpaid {owedCount === 1 ? "delivery" : "deliveries"}</span>
          <span>{formatMoney(owed)}</span>
        </p>
      ) : null}
    </button>
  );
}

function SmallTotal({ label, value, strong = false, negative = false, className = "" }: { label: string; value: string; strong?: boolean; negative?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm tracking-[-0.03em] ${strong ? "font-bold" : "font-medium"} ${strong ? (negative ? "text-[#b34d2e]" : "text-[#294d38]") : ""}`}>{value}</p>
    </div>
  );
}

function OverviewSkeleton() {
  return <div className="page-shell animate-pulse"><div className="h-28 rounded-2xl bg-[#eae8df]" /><div className="mt-8 grid gap-4 lg:grid-cols-3"><div className="h-44 rounded-3xl bg-[#e4e6df]" /><div className="h-44 rounded-3xl bg-[#e4e6df]" /><div className="h-44 rounded-3xl bg-[#e4e6df]" /></div><div className="mt-8 grid gap-6 xl:grid-cols-2"><div className="h-96 rounded-3xl bg-[#eeece5]" /><div className="h-96 rounded-3xl bg-[#eeece5]" /></div></div>;
}
