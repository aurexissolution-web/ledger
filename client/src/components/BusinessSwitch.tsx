import { BriefcaseBusiness, Layers, Leaf } from "lucide-react";
import { useState } from "react";

export type BusinessView = "subcon" | "chili" | "both";

const OPTIONS: { value: BusinessView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "subcon", label: "Subcon", icon: BriefcaseBusiness },
  { value: "chili", label: "Chili", icon: Leaf },
  { value: "both", label: "Both", icon: Layers },
];

function readSaved(storageKey: string): BusinessView {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === "chili" || saved === "both" ? saved : "subcon";
  } catch {
    return "subcon";
  }
}

/**
 * Which business a page is showing, remembered per page on this device.
 * Profiles without Subcon only ever get the chili business.
 */
export function useBusinessView(storageKey: string, canSeeSubcon: boolean) {
  const [saved, setSaved] = useState<BusinessView>(() => readSaved(storageKey));
  const choose = (next: BusinessView) => {
    setSaved(next);
    try { localStorage.setItem(storageKey, next); } catch { /* the choice just won't be remembered */ }
  };
  return [canSeeSubcon ? saved : "chili", choose] as const;
}

export function BusinessSwitch({ value, onChange, className = "" }: { value: BusinessView; onChange: (view: BusinessView) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Which business" className={`grid w-full grid-cols-3 gap-1 rounded-xl border border-[#e3dfd2] bg-[#f7f7f2] p-1 sm:inline-grid sm:w-auto ${className}`}>
      {OPTIONS.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition ${value === option.value ? "bg-white text-foreground shadow-sm ring-1 ring-[#e3dfd2]" : "text-muted-foreground hover:text-foreground"}`}>
          <option.icon className="h-4 w-4" />{option.label}
        </button>
      ))}
    </div>
  );
}
