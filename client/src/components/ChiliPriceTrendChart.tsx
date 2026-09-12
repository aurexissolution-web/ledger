// Loaded lazily by ChiliPriceTrend so recharts only downloads on the Chili page.
import { formatMoney } from "@/lib/format";
import { formatKg, longMonth, perKg, priceRange, shortMonth } from "@/lib/chili-price-format";
import { useState } from "react";
import { CartesianGrid, ComposedChart, Customized, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceTrend } from "../../../shared/chili-price-trend";

// The page's chili red (passes 3:1 on the card surface); sale dots are grey context.
const LINE = "#b34d2e";
const DOT = "#bdb8aa";
const SURFACE = "#fffdf8";
const INK = "#26342a";
const MUTED = "#7a7f76";
const GRID = "#ece9e0";
const TOOLTIP_SALES = 5;
/** Below this chart width, label every other month so the names don't run together. */
const NARROW_WIDTH = 560;

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

export default function ChiliPriceTrendChart({ trend }: { trend: PriceTrend }) {
  const rows = trend.months.map(month => ({ month: shortMonth(month.month), avg: month.avgPerKgCents === null ? null : month.avgPerKgCents / 100 }));
  const points = trend.months.flatMap(month => month.sales.map(sale => ({ month: shortMonth(month.month), price: sale.pricePerKgCents / 100 })));
  const prices = points.map(point => point.price);
  const ticks = priceTicks(Math.min(...prices), Math.max(...prices));
  const [narrow, setNarrow] = useState(false);

  return (
    <div className="-mx-2" role="img" aria-label={`Price per kg by month in ${trend.year}. The monthly table below lists every value.`}>
      <ResponsiveContainer width="100%" height={300} onResize={width => setNarrow(width < NARROW_WIDTH)}>
        <ComposedChart data={rows} margin={{ top: 28, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="month" type="category" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: MUTED, fontSize: 12 }} interval={narrow ? 1 : 0} tickMargin={8} />
          <YAxis domain={[ticks[0], ticks.at(-1)!]} ticks={ticks} tickLine={false} axisLine={false} width={58} tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(value: number) => axisMoney.format(value)} />
          {/* filterNull={false}: otherwise recharts hides the tooltip on months without sales. */}
          <Tooltip cursor={{ stroke: "#cfcabb", strokeWidth: 1 }} filterNull={false} isAnimationActive={false} content={({ active, label }) => <TrendTooltip active={active} label={label} trend={trend} />} />
          {/* Not <Scatter data=…>: an item with its own data replaces the chart's rows as the
              x-axis domain, which drops months without sales. Draw on the chart's scales instead. */}
          <Customized component={(props: AxisMaps) => <SaleDots {...props} points={points} />} />
          <Line dataKey="avg" type="linear" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" connectNulls={false} isAnimationActive={false}
            dot={{ r: 4, fill: LINE, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 6, fill: LINE, stroke: SURFACE, strokeWidth: 2 }} />
          <Customized component={(props: AxisMaps) => <BestLabel {...props} trend={trend} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type Scale = ((value: unknown) => number) & { bandwidth?: () => number };
type AxisMaps = { xAxisMap?: Record<string, { scale: Scale }>; yAxisMap?: Record<string, { scale: Scale }> };

function SaleDots({ xAxisMap, yAxisMap, points }: AxisMaps & { points: { month: string; price: number }[] }) {
  const x = Object.values(xAxisMap ?? {})[0]?.scale;
  const y = Object.values(yAxisMap ?? {})[0]?.scale;
  if (!x || !y) return null;
  const offset = (x.bandwidth?.() ?? 0) / 2;
  return (
    <g className="sale-dots">
      {points.map((point, index) => <circle key={index} cx={x(point.month) + offset} cy={y(point.price)} r={4} fill={DOT} stroke={SURFACE} strokeWidth={2} />)}
    </g>
  );
}

function BestLabel({ xAxisMap, yAxisMap, trend }: AxisMaps & { trend: PriceTrend }) {
  const x = Object.values(xAxisMap ?? {})[0]?.scale;
  const y = Object.values(yAxisMap ?? {})[0]?.scale;
  if (!x || !y || trend.bestMonth === null) return null;
  const month = trend.months[trend.bestMonth];
  // Sit above whichever is higher — the month's price or its most expensive sale — so no dot hides it.
  const top = Math.max(month.avgPerKgCents!, month.maxPerKgCents!) / 100;
  const anchor = month.month === 0 ? "start" : month.month === 11 ? "end" : "middle";
  return (
    <text x={x(shortMonth(month.month)) + (x.bandwidth?.() ?? 0) / 2} y={y(top) - 12} textAnchor={anchor} fill={INK} fontSize={12} fontWeight={600}>
      Best · {formatMoney(Math.round(month.avgPerKgCents!))}
    </text>
  );
}

function TrendTooltip({ active, label, trend }: { active?: boolean; label?: string | number; trend: PriceTrend }) {
  const month = trend.months.find(m => shortMonth(m.month) === label);
  if (!active || !month) return null;
  return (
    <div className="min-w-56 max-w-72 rounded-xl border border-[#e3dfd2] bg-[#fffdf8] px-3.5 py-3 text-xs shadow-[0_14px_30px_-14px_rgba(38,52,42,0.35)]">
      <p className="font-semibold text-muted-foreground">{longMonth(month.month)} {trend.year}</p>
      {month.saleCount === 0 ? (
        <p className="mt-1.5 text-muted-foreground">No sales this month</p>
      ) : (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: LINE }} />
            <span className="text-sm font-semibold text-foreground">{perKg(month.avgPerKgCents)}</span>
            <span className="text-muted-foreground">average</span>
          </div>
          <p className="mt-1 text-muted-foreground">{priceRange(month)} · {month.saleCount} {month.saleCount === 1 ? "sale" : "sales"} · {formatKg(month.kg)}</p>
          <ul className="mt-2 space-y-1 border-t border-[#ece9e0] pt-2">
            {month.sales.slice(0, TOOLTIP_SALES).map(sale => (
              <li key={sale.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT }} />
                <span className="truncate">{sale.recipientName}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">{formatKg(Number(sale.quantityKg))} · {perKg(sale.pricePerKgCents)}</span>
              </li>
            ))}
            {month.sales.length > TOOLTIP_SALES ? <li className="text-muted-foreground">+{month.sales.length - TOOLTIP_SALES} more</li> : null}
          </ul>
        </>
      )}
    </div>
  );
}
