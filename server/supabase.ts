import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client. It uses the project's secret key, which
 * bypasses row-level security, so it must never reach the browser.
 * Tables, RPC functions and the storage bucket come from supabase/schema.sql.
 *
 * supabase-js eagerly looks up a global WebSocket for Realtime, which only
 * exists from Node 22 — hence engines.node ">=22" in package.json.
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.warn("[Database] SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
    return null;
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Fail fast rather than leave the sign-in screen hanging on a stalled request.
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) }) },
  });
  return _client;
}

export function requireSupabase(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY on the server");
  return supabase;
}

// Columns are snake_case in Postgres and camelCase in the app. jsonb values
// (cost lines, attachment id lists) already use camelCase and pass through.
const DATE_FIELDS = new Set(["createdAt", "updatedAt", "lastSignedIn", "pinLockedUntil"]);

export function fromRow<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const field = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[field] = DATE_FIELDS.has(field) && typeof value === "string" ? new Date(value) : value;
  }
  return result as T;
}

export function fromRows<T>(rows: Record<string, unknown>[] | null): T[] {
  return (rows ?? []).map(row => fromRow<T>(row));
}

export function toRow(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));
}
