import { GradeBadge } from "@/components/GradeBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHILI_GRADES, type ChiliGrade } from "@/lib/chili-grades";
import { formatKg, longMonth, perKg } from "@/lib/chili-price-format";
import { formatDate } from "@/lib/format";
import { LineChart as LineChartIcon, Plus, Scale, Tag, TrendingDown, TrendingUp } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { buildGradeTrends, gradedTrendYears, type GradedSale, type PriceTrend } from "../../../shared/chili-price-trend";

// recharts is heavy; only fetch it when this card actually draws a chart.
const ChiliPriceTrendChart = lazy(() => import("./ChiliPriceTrendChart"));

export type GradeTrends = Record<ChiliGrade, PriceTrend>;

export function ChiliPriceTrend({ sales, loading, onAddSale }: { sales: GradedSale[]; loading: boolean; onAddSale: () => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = useMemo(() => Array.from(new Set([...gradedTrendYears(sales, currentYear), year])).sort((a, b) => b - a), [sales, currentYear, year]);
  const trends = useMemo(() => buildGradeTrends(sales, year), [sales, year]);
  const hasSales = CHILI_GRADES.some(grade => trends[grade].saleCount > 0);

  return (
    <section className="surface-card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e6e2d8] px-6 py-5">
        <div>
          <p className="eyebrow">Price trend</p>
          <h2 className="mt-1 text-lg font-semibold">Price per kg through the year, by grade</h2>
          <p className="mt-1 text-sm text-muted-foreground">Each month is total money ÷ total kg for that grade, so bigger sales count for more.</p>
        </div>
        <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
          <SelectTrigger className="h-11 w-36" aria-label="Choose a year for the price trend"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-72 animate-pulse bg-[#f4f3ed]" />
      ) : !hasSales ? (
        <EmptyTrend year={year} onAddSale={onAddSale} />
      ) : (
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Scale className="h-4 w-4" />} label={`Average in ${year}`} rows={grade => ({ value: perKg(trends[grade].avgPerKgCents), detail: trends[grade].saleCount ? formatKg(trends[grade].kg) : "" })} />
            <Tile icon={<TrendingUp className="h-4 w-4" />} label="Best month" rows={grade => monthRow(trends[grade], trends[grade].bestMonth)} />
            <Tile icon={<TrendingDown className="h-4 w-4" />} label="Lowest month" rows={grade => monthRow(trends[grade], trends[grade].lowestMonth)} />
            <Tile icon={<Tag className="h-4 w-4" />} label="Latest price" rows={grade => ({ value: perKg(trends[grade].latest?.pricePerKgCents ?? null), detail: trends[grade].latest ? formatDate(trends[grade].latest!.saleDate) : "" })} />
          </div>
          <Suspense fallback={<div className="h-[340px] animate-pulse rounded-2xl bg-[#f4f3ed]" />}><ChiliPriceTrendChart trends={trends} year={year} /></Suspense>
          <MonthlyTable trends={trends} year={year} />
        </div>
      )}
    </section>
  );
}

function monthRow(trend: PriceTrend, month: number | null) {
  return month === null ? { value: "—", detail: "" } : { value: perKg(trend.months[month].avgPerKgCents), detail: longMonth(month) };
}

function Tile({ icon, label, rows }: { icon: React.ReactNode; label: string; rows: (grade: ChiliGrade) => { value: string; detail: string } }) {
  return (
    <div className="rounded-2xl border border-[#e7e3d8] bg-[linear-gradient(180deg,#fffefa,#fcfbf6)] p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="icon-tile icon-tile-chili h-7 w-7">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <div className="mt-3 space-y-2">
        {CHILI_GRADES.map(grade => {
          const row = rows(grade);
          return (
            <div key={grade} className="flex items-start gap-2">
              <span className="mt-0.5"><GradeBadge grade={grade} /></span>
              <div className="min-w-0">
                <p className="text-base font-semibold leading-tight tracking-[-0.02em] [font-variant-numeric:proportional-nums]">{row.value}</p>
                {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyTable({ trends, year }: { trends: GradeTrends; year: number }) {
  const months = trends.A.months.map(month => month.month).filter(month => CHILI_GRADES.some(grade => trends[grade].months[month].saleCount > 0));
  const monthsWithData = (grade: ChiliGrade) => trends[grade].months.filter(month => month.saleCount > 0).length;
  const cell = "px-3 py-2.5 text-right";
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#ece9e0]">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="bg-[#f8f7f1] text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left">Month</th>
            {CHILI_GRADES.map(grade => (
              <th key={grade} colSpan={2} className="border-l border-[#ece9e0] px-3 py-2.5 text-center"><span className="inline-flex items-center gap-1.5 normal-case tracking-normal"><GradeBadge grade={grade} label /></span></th>
            ))}
          </tr>
          <tr className="border-t border-[#ece9e0]">
            <th />
            {CHILI_GRADES.map(grade => [
              <th key={`${grade}-price`} className={`${cell} border-l border-[#ece9e0]`}>Price / kg</th>,
              <th key={`${grade}-kg`} className={cell}>Kg</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {months.map(month => (
            <tr key={month} className="border-t border-[#ece9e0]">
              <td className="px-4 py-2.5 text-left font-medium">{longMonth(month)}</td>
              {CHILI_GRADES.map(grade => {
                const data = trends[grade].months[month];
                const best = month === trends[grade].bestMonth && monthsWithData(grade) > 1;
                return [
                  <td key={`${grade}-price`} className={`${cell} border-l border-[#ece9e0] font-semibold`}>
                    {best ? <span className="pill pill-chili mr-2 !px-1.5 !py-0.5 !text-[10px]"><TrendingUp className="h-3 w-3" />Best</span> : null}
                    {perKg(data.avgPerKgCents)}
                  </td>,
                  <td key={`${grade}-kg`} className={`${cell} text-muted-foreground`}>{data.saleCount ? formatKg(data.kg) : "—"}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#e3dfd2] bg-[#fbfaf5] font-semibold">
            <td className="px-4 py-2.5 text-left">Year {year}</td>
            {CHILI_GRADES.map(grade => [
              <td key={`${grade}-price`} className={`${cell} border-l border-[#ece9e0]`}>{perKg(trends[grade].avgPerKgCents)}</td>,
              <td key={`${grade}-kg`} className={cell}>{trends[grade].saleCount ? formatKg(trends[grade].kg) : "—"}</td>,
            ])}
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
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Add a sale to start the price trend — each grade's price per kg is plotted by month.</p>
          <Button onClick={onAddSale} variant="chili" className="mt-5"><Plus className="mr-2 h-4 w-4" />Add sale</Button>
        </div>
      </div>
    </div>
  );
}
