import type { ReactNode } from "react";

type Field = { label: string; value: ReactNode; strong?: boolean; tone?: "ink" | "chili" | "muted" };

// Phone-sized stand-in for a table row: title + subtitle, a compact grid of
// labelled values, and the row's action buttons. Pair with a `hidden md:block`
// table for wider screens.
export function MobileRecord({ title, subtitle, badge, fields = [], actions }: { title: ReactNode; subtitle?: ReactNode; badge?: ReactNode; fields?: Field[]; actions?: ReactNode }) {
  const tones = { ink: "text-[#294d38]", chili: "text-[#b34d2e]", muted: "text-foreground" };
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5"><p className="truncate font-semibold">{title}</p>{badge}</div>
          {subtitle ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="-mr-2 -mt-1 flex shrink-0 gap-0.5">{actions}</div> : null}
      </div>
      {fields.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {fields.map(field => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{field.label}</dt>
              <dd className={`mt-0.5 truncate text-sm ${field.strong ? "font-bold" : "font-medium"} ${tones[field.tone ?? "muted"]}`}>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
