// Loaded lazily by ChiliPriceTrend so recharts only downloads on the Chili page.
import { GradeBadge } from "@/components/GradeBadge";
import { CHILI_GRADES, GRADE_COLORS, type ChiliGrade } from "@/lib/chili-grades";
import { formatKg, longMonth, perKg, priceRange, shortMonth } from "@/lib/chili-price-format";
import { useState } from "react";
import { CartesianGrid, ComposedChart, Customized, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GradeTrends } from "./ChiliPriceTrend";

// Grade colours come from GRADE_COLORS (validated as a pair); each sale is a
// faint dot in its grade's colour behind the monthly line.
const SURFACE = "#fffdf8";
const INK = "#26342a";
const MUTED = "#7a7f76";
const GRID = "#ece9e0";
const DOT_OPACITY = 0.4;
const TOOLTIP_SALES = 5;
/** Below this chart width, label every other month so the names don't run together. */
const NARROW_WIDTH = 560;
/** End labels closer than this (px) would overlap, so both are dropped; the legend still names the lines. */
const LABEL_GAP = 14;

const axisMoney = new Intl.NumberFormat(undefined, { style: "currency", currency: "MYR", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Even RM steps (1 / 2 / 2.5 / 5 × 10ⁿ) with half a step of headroom either side. */
function priceTicks(low: number, high: number) {
  const raw = Math.max(high - low, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(candidate => candidate >= raw)!;
  const from = Math.max(0, Math.floor((low - step / 2) / step) * step);
  const to = Math.ceil((high + step / 2) / step) * step;
  const ticks: number[] = [];
  for (let value = from; value <= to + step / 1000; value += step) ticks.push(Math.round(value * 100) / 100);
  return ticks;
}

type Point = { grade: ChiliGrade; month: string; price: number };

export default function ChiliPriceTrendChart({ trends, year }: { trends: GradeTrends; year: number }) {
  const rows = trends.A.months.map(({ month }) => ({
    month: shortMonth(month),
    ...Object.fromEntries(CHILI_GRADES.map(grade => [grade, trends[grade].months[month].avgPerKgCents === null ? null : trends[grade].months[month].avgPerKgCents! / 100])),
  }));
  const points: Point[] = CHILI_GRADES.flatMap(grade => trends[grade].months.flatMap(month => month.sales.map(sale => ({ grade, month: shortMonth(month.month), price: sale.pricePerKgCents / 100 }))));
  const prices = points.map(point => point.price);
  const ticks = priceTicks(Math.min(...prices), Math.max(...prices));
  const [narrow, setNarrow] = useState(false);

  return (
    <div>
      <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Chart legend">
        {CHILI_GRADES.map(grade => (
          <li key={grade} className="flex items-center gap-2"><span className="h-0.5 w-4 rounded-full" style={{ background: GRADE_COLORS[grade] }} /><span className="font-semibold text-foreground">Grade {grade}</span> price / kg</li>
        ))}
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#9a9689] opacity-60" />each sale</li>
      </ul>
      <div className="-mx-2" role="img" aria-label={`Price per kg by month in ${year} for Grade A and Grade B. The monthly table below lists every value.`}>
        <ResponsiveContainer width="100%" height={300} onResize={width => setNarrow(width < NARROW_WIDTH)}>
          <ComposedChart data={rows} margin={{ top: 16, right: 24, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" type="category" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: MUTED, fontSize: 12 }} interval={narrow ? 1 : 0} tickMargin={8} />
            <YAxis domain={[ticks[0], ticks.at(-1)!]} ticks={ticks} tickLine={false} axisLine={false} width={58} tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(value: number) => axisMoney.format(value)} />
            {/* filterNull={false}: otherwise recharts hides the tooltip on months without sales. */}
            <Tooltip cursor={{ stroke: "#cfcabb", strokeWidth: 1 }} filterNull={false} isAnimationActive={false} content={({ active, label }) => <TrendTooltip active={active} label={label} trends={trends} year={year} />} />
            {/* Not <Scatter data=…>: an item with its own data replaces the chart's rows as the
                x-axis domain, which drops months without sales. Draw on the chart's scales instead. */}
            <Customized component={(props: AxisMaps) => <SaleDots {...props} points={points} />} />
            {CHILI_GRADES.map(grade => (
              <Line key={grade} dataKey={grade} name={`Grade ${grade}`} type="linear" stroke={GRADE_COLORS[grade]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" connectNulls={false} isAnimationActive={false}
                dot={{ r: 4, fill: GRADE_COLORS[grade], stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 6, fill: GRADE_COLORS[grade], stroke: SURFACE, strokeWidth: 2 }} />
            ))}
            <Customized component={(props: AxisMaps) => <EndLabels {...props} rows={rows} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Scale = ((value: unknown) => number) & { bandwidth?: () => number };
type AxisMaps = { xAxisMap?: Record<string, { scale: Scale }>; yAxisMap?: Record<string, { scale: Scale }> };

function scales({ xAxisMap, yAxisMap }: AxisMaps) {
  const x = Object.values(xAxisMap ?? {})[0]?.scale;
  const y = Object.values(yAxisMap ?? {})[0]?.scale;
  if (!x || !y) return null;
  return { x: (month: string) => x(month) + (x.bandwidth?.() ?? 0) / 2, y };
}

function SaleDots({ points, ...axes }: AxisMaps & { points: Point[] }) {
  const s = scales(axes);
  if (!s) return null;
  return (
    <g className="sale-dots">
      {points.map((point, index) => <circle key={index} data-grade={point.grade} cx={s.x(point.month)} cy={s.y(point.price)} r={4} fill={GRADE_COLORS[point.grade]} fillOpacity={DOT_OPACITY} stroke={SURFACE} strokeWidth={2} />)}
    </g>
  );
}

/** "A" / "B" beside each line's last point (text in ink; the legend carries the colour). */
function EndLabels({ rows, ...axes }: AxisMaps & { rows: ({ month: string } & Record<string, unknown>)[] }) {
  const s = scales(axes);
  if (!s) return null;
  const ends = CHILI_GRADES.flatMap(grade => {
    const last = [...rows].reverse().find(row => typeof row[grade] === "number");
    return last ? [{ grade, x: s.x(last.month), y: s.y(last[grade] as number) }] : [];
  });
  const collide = ends.length === 2 && Math.abs(ends[0].x - ends[1].x) < 1 && Math.abs(ends[0].y - ends[1].y) < LABEL_GAP;
  if (collide) return null;
  return (
    <g className="end-labels">
      {ends.map(end => <text key={end.grade} x={end.x + 9} y={end.y + 4} fill={INK} fontSize={12} fontWeight={700}>{end.grade}</text>)}
    </g>
  );
}

function TrendTooltip({ active, label, trends, year }: { active?: boolean; label?: string | number; trends: GradeTrends; year: number }) {
  const index = trends.A.months.findIndex(m => shortMonth(m.month) === label);
  if (!active || index < 0) return null;
  const months = CHILI_GRADES.map(grade => ({ grade, data: trends[grade].months[index] }));
  const sales = months
    .flatMap(({ grade, data }) => data.sales.map(sale => ({ ...sale, grade })))
    .sort((a, b) => a.saleDate - b.saleDate || a.id - b.id);
  return (
    <div className="min-w-60 max-w-80 rounded-xl border border-[#e3dfd2] bg-[#fffdf8] px-3.5 py-3 text-xs shadow-[0_14px_30px_-14px_rgba(38,52,42,0.35)]">
      <p className="font-semibold text-muted-foreground">{longMonth(index)} {year}</p>
      {sales.length === 0 ? (
        <p className="mt-1.5 text-muted-foreground">No sales this month</p>
      ) : (
        <>
          <div className="mt-1.5 space-y-1.5">
            {months.map(({ grade, data }) => (
              <div key={grade}>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: GRADE_COLORS[grade] }} />
                  <span className="text-sm font-semibold text-foreground">{perKg(data.avgPerKgCents)}</span>
                  <span className="text-muted-foreground">Grade {grade}</span>
                </div>
                <p className="pl-5 text-muted-foreground">{data.saleCount ? `${priceRange(data)} · ${data.saleCount} ${data.saleCount === 1 ? "sale" : "sales"} · ${formatKg(data.kg)}` : "No sales"}</p>
              </div>
            ))}
          </div>
          <ul className="mt-2 space-y-1 border-t border-[#ece9e0] pt-2">
            {sales.slice(0, TOOLTIP_SALES).map(sale => (
              <li key={`${sale.id}-${sale.grade}`} className="flex items-center gap-2">
                <GradeBadge grade={sale.grade} />
                <span className="truncate">{sale.recipientName}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">{formatKg(Number(sale.quantityKg))} · {perKg(sale.pricePerKgCents)}</span>
              </li>
            ))}
            {sales.length > TOOLTIP_SALES ? <li className="text-muted-foreground">+{sales.length - TOOLTIP_SALES} more</li> : null}
          </ul>
        </>
      )}
    </div>
  );
}
