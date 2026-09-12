import { GRADE_COLORS, type ChiliGrade } from "@/lib/chili-grades";

/** Letter badge for a chili grade: the colour ties it to the chart, the letter keeps it readable without colour. */
export function GradeBadge({ grade, label = false }: { grade: ChiliGrade; label?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-foreground">
      <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: GRADE_COLORS[grade] }} aria-hidden={label}>{grade}</span>
      {label ? <span>Grade {grade}</span> : null}
    </span>
  );
}
