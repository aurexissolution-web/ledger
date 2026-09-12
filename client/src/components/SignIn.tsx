import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp";
import { BriefcaseBusiness, Delete, Leaf, Lock, ShieldCheck } from "lucide-react";
import { useContext, useEffect, useState } from "react";

type Profile = { id: number; name: string; role: "admin" | "user" };

const PIN_LENGTH = 4;
const LAST_PROFILE_KEY = "last-profile-id";

export function roleLabel(role: Profile["role"]) {
  return role === "admin" ? "Full access" : "Chili only";
}

function readLastProfile() {
  try { return localStorage.getItem(LAST_PROFILE_KEY) ?? ""; } catch { return ""; }
}

export function SignIn() {
  const utils = trpc.useUtils();
  // One retry, not React Query's default three: each failed attempt can take
  // several seconds server-side, and the error state below offers a retry.
  const profilesQuery = trpc.auth.profiles.useQuery(undefined, { retry: 1 });
  const profiles: Profile[] = profilesQuery.data ?? [];
  const [selectedId, setSelectedId] = useState(readLastProfile);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const login = trpc.auth.loginWithPin.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); },
    onError: error => { setMessage(error.message); setPin(""); setShake(true); setTimeout(() => setShake(false), 500); },
  });
  const selected = profiles.find(profile => String(profile.id) === selectedId) ?? null;
  const busy = login.isPending;

  const choose = (value: string) => {
    setSelectedId(value);
    setPin("");
    setMessage(null);
    try { localStorage.setItem(LAST_PROFILE_KEY, value); } catch { /* per-device convenience only */ }
  };

  const submit = (value: string) => {
    if (!selected) { setMessage("Choose who you are first."); return; }
    if (busy || value.length < PIN_LENGTH) return;
    setMessage(null);
    login.mutate({ userId: selected.id, pin: value });
  };

  const pressDigit = (digit: string) => {
    if (!selected) { setMessage("Choose who you are first."); return; }
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setMessage(null);
    if (next.length === PIN_LENGTH) submit(next);
  };
  const backspace = () => { if (!busy) { setPin(current => current.slice(0, -1)); setMessage(null); } };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("role") === "combobox")) return;
      if (/^\d$/.test(event.key)) { event.preventDefault(); pressDigit(event.key); }
      else if (event.key === "Backspace") { event.preventDefault(); backspace(); }
      else if (event.key === "Enter") { event.preventDefault(); submit(pin); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="surface-card grid w-full max-w-4xl overflow-hidden md:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <aside className="relative isolate overflow-hidden bg-[linear-gradient(160deg,#2a4535_0%,#1a2b21_100%)] px-7 py-7 text-[#f6f5ee] md:px-10 md:py-11">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_70%)]" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(200,110,80,0.28),transparent_70%)]" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur"><span className="font-serif text-xl leading-none">K</span></div>
            <div>
              <p className="font-semibold tracking-[-0.02em]">Keluarga Ledger</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Business records</p>
            </div>
          </div>
          <div className="relative mt-8 hidden md:block">
            <h2 className="font-serif text-[2.4rem] leading-[1.02] tracking-[-0.04em]">The family's books,<br />in one place.</h2>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">Income, payments and profit for both businesses — shared between you, private to the family.</p>
            <ul className="mt-9 space-y-4 text-sm">
              <Feature icon={<BriefcaseBusiness className="h-4 w-4" />} title="Wiring Subcon" body="Per-project income, staff pay and net P&L." />
              <Feature icon={<Leaf className="h-4 w-4" />} title="Chili Agriculture" body="Sales by customer, daily farm costs." />
              <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Two profiles, one ledger" body="Each of you signs in with your own PIN." />
            </ul>
          </div>
          <p className="relative mt-8 hidden text-xs text-white/50 md:block">{today}</p>
        </aside>

        {/* Sign-in panel */}
        <section className="px-6 py-8 sm:px-9 sm:py-10">
          <p className="eyebrow">Sign in</p>
          <h1 className="display-title mt-3 !text-[2rem]">Welcome back.</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose who you are, then enter your {PIN_LENGTH}-digit PIN.</p>

          <div className="mt-7 space-y-2">
            <Label className="text-sm font-semibold">Who's signing in?</Label>
            <Select value={selectedId} onValueChange={choose} disabled={profilesQuery.isLoading}>
              <SelectTrigger className="h-14 w-full rounded-2xl px-3 text-base [&>span]:flex-1" aria-label="Choose your profile">
                <SelectValue placeholder={profilesQuery.isLoading ? "Loading profiles…" : "Choose a profile"} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(profile => (
                  <SelectItem key={profile.id} value={String(profile.id)} className="py-2.5">
                    <span className="flex items-center gap-3">
                      <ProfileAvatar name={profile.name} size="sm" />
                      <span className="flex flex-col text-left leading-tight">
                        <span className="font-semibold">{profile.name}</span>
                        <span className="text-[11px] text-muted-foreground">{roleLabel(profile.role)}</span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {profilesQuery.isError ? (
              <p className="flex items-center justify-between gap-3 text-xs font-medium text-[#b34d2e]" role="alert">
                <span>Couldn't load profiles — the server can't reach the database.</span>
                <button type="button" className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50" disabled={profilesQuery.isFetching} onClick={() => profilesQuery.refetch()}>
                  {profilesQuery.isFetching ? "Retrying…" : "Retry"}
                </button>
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">PIN</Label>
              <span className={`text-xs font-medium ${message ? "text-[#b34d2e]" : "text-transparent"}`} aria-live="polite">{message ?? "placeholder"}</span>
            </div>
            <div className={`mt-3 flex justify-center gap-3 ${shake ? "animate-shake" : ""}`} aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`} role="status">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                const filled = index < pin.length;
                const active = index === pin.length && Boolean(selected) && !busy;
                return (
                  <div key={index} className={`grid h-14 w-14 place-items-center rounded-2xl border-2 transition-all duration-150 ${filled ? "border-[#22372c] bg-[#22372c] shadow-[0_8px_18px_-10px_rgba(34,55,44,0.7)]" : active ? "border-[#5f7d68] bg-[#fffdf8] ring-[3px] ring-[#5f7d68]/20" : "border-[#ddd9cc] bg-[#fffdf8]"}`}>
                    {filled ? <span className="h-3 w-3 rounded-full bg-[#fffdf8]" /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`mt-6 grid grid-cols-3 gap-2 transition-opacity ${selected ? "" : "opacity-50"}`}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => <Key key={digit} label={digit} onPress={() => pressDigit(digit)} disabled={busy} />)}
            <div aria-hidden />
            <Key label="0" onPress={() => pressDigit("0")} disabled={busy} />
            <Key label={<Delete className="h-5 w-5" />} ariaLabel="Delete last digit" onPress={backspace} disabled={busy || pin.length === 0} subtle />
          </div>

          <Button className="mt-6 h-12 w-full text-base" size="lg" disabled={!selected || pin.length < PIN_LENGTH || busy} onClick={() => submit(pin)}>{busy ? "Checking…" : "Open ledger"}</Button>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Lock className="h-3 w-3" />Private to your family. PINs are never stored in plain text.</p>
        </section>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="block text-white/65">{body}</span></span>
    </li>
  );
}

function Key({ label, ariaLabel, onPress, disabled, subtle }: { label: React.ReactNode; ariaLabel?: string; onPress: () => void; disabled?: boolean; subtle?: boolean }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onPress}
      className={`h-14 rounded-2xl text-xl font-semibold tracking-[-0.02em] transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#5f7d68]/30 ${subtle ? "text-[#5b6a5f] hover:bg-[#eef0e8]" : "border border-[#e3dfd2] bg-[linear-gradient(180deg,#fffefa,#f6f4ed)] text-[#22372c] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(38,52,42,0.05)] hover:border-[#cfcabb] hover:bg-[linear-gradient(180deg,#ffffff,#f1efe6)]"}`}
    >
      {label}
    </button>
  );
}

export function PinInput({ value, onChange, onComplete, disabled, autoFocus, compact }: { value: string; onChange: (value: string) => void; onComplete?: (value: string) => void; disabled?: boolean; autoFocus?: boolean; compact?: boolean }) {
  return (
    <OTPInput maxLength={PIN_LENGTH} value={value} onChange={onChange} onComplete={onComplete} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" disabled={disabled} autoFocus={autoFocus} containerClassName={`flex items-center ${compact ? "gap-2" : "gap-3"} has-disabled:opacity-50`}>
      <PinSlots compact={compact} />
    </OTPInput>
  );
}

function PinSlots({ compact }: { compact?: boolean }) {
  const context = useContext(OTPInputContext);
  const size = compact ? "h-11 w-11" : "h-14 w-14";
  return (
    <>
      {context.slots.map((slot, index) => (
        <div key={index} className={`relative grid ${size} place-items-center rounded-xl border bg-[#fffdf8] shadow-[inset_0_1px_2px_rgba(38,52,42,0.04)] transition-all ${slot.isActive ? "border-[#5f7d68] ring-[3px] ring-[#5f7d68]/20" : "border-[#ddd9cc]"}`}>
          {slot.char ? <span aria-hidden className="block h-2.5 w-2.5 rounded-full bg-[#22372c]" /> : null}
          {slot.hasFakeCaret ? <span className="absolute h-6 w-px animate-pulse bg-[#22372c]" /> : null}
        </div>
      ))}
    </>
  );
}

export function ProfileAvatar({ name, size = "md", className = "" }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = size === "lg" ? "h-20 w-20 text-3xl" : size === "sm" ? "h-8 w-8 text-sm" : "h-14 w-14 text-xl";
  return <span className={`grid ${dims} shrink-0 place-items-center rounded-full bg-[linear-gradient(150deg,#2d4938,#1a2b21)] font-serif text-[#fffdfa] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_20px_-12px_rgba(34,55,44,0.7)] ring-1 ring-white/10 ${className}`}>{name.trim().charAt(0).toUpperCase() || "?"}</span>;
}
