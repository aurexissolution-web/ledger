import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKg, longMonth, perKg, priceRange } from "@/lib/chili-price-format";
import { formatDate } from "@/lib/format";
import { LineChart as LineChartIcon, Plus, Scale, Tag, TrendingDown, TrendingUp } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { buildPriceTrend, priceTrendYears, type PriceTrend, type PriceTrendSale } from "../../../shared/chili-price-trend";

// recharts is heavy; only fetch it when this card actually draws a chart.
const ChiliPriceTrendChart = lazy(() => import("./ChiliPriceTrendChart"));

export function ChiliPriceTrend({ sales, loading, onAddSale }: { sales: PriceTrendSale[]; loading: boolean; onAddSale: () => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = useMemo(() => Array.from(new Set([...priceTrendYears(sales, currentYear), year])).sort((a, b) => b - a), [sales, currentYear, year]);
  const trend = useMemo(() => buildPriceTrend(sales, year), [sales, year]);

  return (
    <section className="surface-card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e6e2d8] px-6 py-5">
        <div>
          <p className="eyebrow">Price trend</p>
          <h2 className="mt-1 text-lg font-semibold">Price per kg through the year</h2>
          <p className="mt-1 text-sm text-muted-foreground">Each month is total money ÷ total kg, so bigger sales count for more.</p>
        </div>
        <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
          <SelectTrigger className="h-11 w-36" aria-label="Choose a year for the price trend"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-72 animate-pulse bg-[#f4f3ed]" />
      ) : trend.saleCount === 0 ? (
        <EmptyTrend year={year} onAddSale={onAddSale} />
      ) : (
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Scale className="h-4 w-4" />} label={`Average in ${year}`} value={perKg(trend.avgPerKgCents)} detail={`${trend.saleCount} ${trend.saleCount === 1 ? "sale" : "sales"} · ${formatKg(trend.kg)}`} />
            <Tile icon={<TrendingUp className="h-4 w-4" />} label="Best month" value={perKg(trend.bestMonth === null ? null : trend.months[trend.bestMonth].avgPerKgCents)} detail={trend.bestMonth === null ? "" : longMonth(trend.bestMonth)} />
            <Tile icon={<TrendingDown className="h-4 w-4" />} label="Lowest month" value={perKg(trend.lowestMonth === null ? null : trend.months[trend.lowestMonth].avgPerKgCents)} detail={trend.lowestMonth === null ? "" : longMonth(trend.lowestMonth)} />
            <Tile icon={<Tag className="h-4 w-4" />} label="Latest price" value={perKg(trend.latest?.pricePerKgCents ?? null)} detail={trend.latest ? formatDate(trend.latest.saleDate) : ""} />
          </div>
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-[#f4f3ed]" />}><ChiliPriceTrendChart trend={trend} /></Suspense>
          <MonthlyTable trend={trend} />
        </div>
      )}
    </section>
  );
}

function Tile({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#e7e3d8] bg-[linear-gradient(180deg,#fffefa,#fcfbf6)] p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="icon-tile icon-tile-chili h-7 w-7">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-[-0.03em] [font-variant-numeric:proportional-nums]">{value}</p>
      <p className="mt-0.5 min-h-5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function MonthlyTable({ trend }: { trend: PriceTrend }) {
  const months = trend.months.filter(month => month.saleCount > 0);
  const yearRange = priceRange({ minPerKgCents: Math.min(...months.map(m => m.minPerKgCents!)), maxPerKgCents: Math.max(...months.map(m => m.maxPerKgCents!)) });
  const cell = "px-4 py-2.5 text-right";
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#ece9e0]">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <tr><th className="px-4 py-2.5 text-left">Month</th><th className={cell}>Price / kg</th><th className={cell}>Sales</th><th className={cell}>Kg sold</th><th className={cell}>Lowest – highest</th></tr>
        </thead>
        <tbody>
          {months.map(month => (
            <tr key={month.month} className="border-t border-[#ece9e0]">
              <td className="px-4 py-2.5 text-left font-medium">
                {longMonth(month.month)}
                {month.month === trend.bestMonth && months.length > 1 ? <span className="pill pill-chili ml-2 !px-2 !py-0.5 !text-[10px]"><TrendingUp className="h-3 w-3" />Best</span> : null}
              </td>
              <td className={`${cell} font-semibold`}>{perKg(month.avgPerKgCents)}</td>
              <td className={cell}>{month.saleCount}</td>
              <td className={cell}>{formatKg(month.kg)}</td>
              <td className={`${cell} text-muted-foreground`}>{priceRange(month)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#e3dfd2] bg-[#fbfaf5] font-semibold">
            <td className="px-4 py-2.5 text-left">Year {trend.year}</td>
            <td className={cell}>{perKg(trend.avgPerKgCents)}</td>
            <td className={cell}>{trend.saleCount}</td>
            <td className={cell}>{formatKg(trend.kg)}</td>
            <td className={`${cell} font-normal text-muted-foreground`}>{yearRange}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function EmptyTrend({ year, onAddSale }: { year: number; onAddSale: () => void }) {
  return (
    <div className="p-6">
      <div className="empty-panel grid min-h-56 place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0e9] text-[#b34d2e]"><LineChartIcon className="h-5 w-5" /></div>
          <h3 className="mt-4 font-semibold">No chili sales in {year} yet.</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Add a sale to start the price trend — each sale's price per kg is plotted by month.</p>
          <Button onClick={onAddSale} variant="chili" className="mt-5"><Plus className="mr-2 h-4 w-4" />Add sale</Button>
        </div>
      </div>
    </div>
  );
}
