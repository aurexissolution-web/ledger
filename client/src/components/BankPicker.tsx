import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { BANK_GROUPS, type BankName } from "../../../shared/banks";

/** Searchable list of every bank a staff member can be paid into. `""` means none chosen. */
export function BankPicker({ value, onChange }: { value: BankName | ""; onChange: (bank: BankName | "") => void }) {
  const [open, setOpen] = useState(false);
  const choose = (bank: BankName | "") => { onChange(bank); setOpen(false); };

  return (
    // `modal` keeps the list scrollable while it sits inside a dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-label="Bank" className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[#ddd9cc] bg-[#fffdf8] px-3.5 py-2 text-left text-sm shadow-[inset_0_1px_2px_rgba(38,52,42,0.04)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-[#cfcabb] focus-visible:border-[#5f7d68] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#5f7d68]/20", !value && "text-[#9aa198]")}>
          <span className="truncate">{value || "Choose a bank"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="Search banks…" />
          <CommandList>
            <CommandEmpty>No bank matches that.</CommandEmpty>
            {value ? (
              <CommandGroup>
                <CommandItem value="Clear bank" onSelect={() => choose("")}><X />Clear bank</CommandItem>
              </CommandGroup>
            ) : null}
            {BANK_GROUPS.map(group => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.banks.map(bank => (
                  <CommandItem key={bank} value={bank} onSelect={() => choose(bank)}>
                    <Check className={cn(bank === value ? "opacity-100" : "opacity-0")} />
                    {bank}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
