import { randomUUID } from "node:crypto";
import type { ChiliExpense, ChiliSale, Customer, InsertUser, Staff, SubconJob, User, UserRole } from "../shared/schema";
import { ENV } from "./_core/env";
import { fromRow, fromRows, getSupabase, requireSupabase, toRow } from "./supabase";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    for (const field of textFields) {
      const value = user[field];
      if (value !== undefined) updateSet[field] = value ?? null;
    }

    if (user.role !== undefined) {
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      updateSet.role = "admin";
    }
    updateSet.lastSignedIn = user.lastSignedIn ?? new Date();
    updateSet.updatedAt = new Date();

    const { data: existing } = await supabase.from("users").select("id").eq("open_id", user.openId).maybeSingle().throwOnError();
    if (existing) {
      await supabase.from("users").update(toRow(updateSet)).eq("open_id", user.openId).throwOnError();
      return;
    }

    const { data: created } = await supabase
      .from("users")
      .insert(toRow({ householdId: user.householdId ?? 0, openId: user.openId, role: "user", ...updateSet }))
      .select("id")
      .single()
      .throwOnError();
    // A new user's household defaults to itself.
    if (user.householdId === undefined) {
      await supabase.from("users").update({ household_id: created.id }).eq("id", created.id).throwOnError();
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const { data } = await supabase.from("users").select("*").eq("open_id", openId).maybeSingle().throwOnError();
  return data ? fromRow<User>(data) : undefined;
}

/**
 * The cheapest real query. Proves the database answers — and counts as
 * activity, which keeps Supabase's free plan from pausing the project after
 * a quiet week (see /api/health and the daily cron).
 */
export async function ping(): Promise<void> {
  await requireSupabase().from("users").select("id").limit(1).throwOnError();
}

export async function getUserById(id: number): Promise<User | undefined> {
  const { data } = await requireSupabase().from("users").select("*").eq("id", id).maybeSingle().throwOnError();
  return data ? fromRow<User>(data) : undefined;
}

export async function listProfiles(): Promise<Pick<User, "id" | "name" | "role" | "householdId">[]> {
  const { data } = await requireSupabase().from("users").select("id, name, role, household_id").not("pin_hash", "is", null).order("id").throwOnError();
  return fromRows(data);
}

export async function allocateHouseholdId(): Promise<number> {
  const { data } = await requireSupabase().rpc("allocate_household_id").throwOnError();
  return Number(data);
}

export async function createProfileUser(input: { householdId: number; name: string; role: UserRole; pinHash: string }): Promise<User> {
  const { data } = await requireSupabase()
    .from("users")
    .insert(toRow({ householdId: input.householdId, openId: `profile-${randomUUID()}`, name: input.name, loginMethod: "pin", role: input.role, pinHash: input.pinHash }))
    .select("*")
    .single()
    .throwOnError();
  return fromRow<User>(data);
}

export async function setUserPin(userId: number, pinHash: string): Promise<void> {
  await requireSupabase().from("users").update({ pin_hash: pinHash, updated_at: new Date() }).eq("id", userId).throwOnError();
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_SECONDS = 60;

/** ms remaining on an active lockout, or 0 if the profile can attempt a PIN now. Stored in the database, not memory, so it survives serverless cold starts. */
export async function getPinLockRemainingMs(userId: number): Promise<number> {
  const { data } = await requireSupabase().from("users").select("pin_locked_until").eq("id", userId).maybeSingle().throwOnError();
  const lockedUntil = data?.pin_locked_until;
  if (!lockedUntil) return 0;
  return Math.max(0, new Date(lockedUntil).getTime() - Date.now());
}

/** Records a failed PIN attempt; returns attempts remaining before lockout (0 = now locked). */
export async function recordPinFailure(userId: number): Promise<number> {
  const { data } = await requireSupabase()
    .rpc("record_pin_failure", { p_user_id: userId, p_max_attempts: PIN_MAX_ATTEMPTS, p_lock_seconds: PIN_LOCK_SECONDS })
    .throwOnError();
  return Number(data);
}

export async function clearPinFailures(userId: number): Promise<void> {
  await requireSupabase().from("users").update({ pin_fail_count: 0, pin_locked_until: null }).eq("id", userId).throwOnError();
}

export async function touchLastSignedIn(userId: number): Promise<void> {
  await requireSupabase().from("users").update({ last_signed_in: new Date() }).eq("id", userId).throwOnError();
}

type Changes<T> = Partial<Omit<T, "id" | "userId" | "createdAt" | "updatedAt">>;

/* Household-scoped record tables all share the same shape of queries. */

async function listRecords<T>(table: string, userId: number, orderBy: string, ascending: boolean): Promise<T[]> {
  const { data } = await requireSupabase().from(table).select("*").eq("user_id", userId).order(orderBy, { ascending }).throwOnError();
  return fromRows<T>(data);
}

async function getRecord<T>(table: string, userId: number, id: number): Promise<T | undefined> {
  const { data } = await requireSupabase().from(table).select("*").eq("user_id", userId).eq("id", id).maybeSingle().throwOnError();
  return data ? fromRow<T>(data) : undefined;
}

async function createRecord(table: string, record: Record<string, unknown>): Promise<number> {
  const { data } = await requireSupabase().from(table).insert(toRow(record)).select("id").single().throwOnError();
  return data.id;
}

async function updateRecord(table: string, userId: number, id: number, changes: Record<string, unknown>): Promise<void> {
  await requireSupabase().from(table).update(toRow({ ...changes, updatedAt: new Date() })).eq("id", id).eq("user_id", userId).throwOnError();
}

async function deleteRecord(table: string, userId: number, id: number): Promise<void> {
  await requireSupabase().from(table).delete().eq("id", id).eq("user_id", userId).throwOnError();
}

export const listSubconJobs = (userId: number) => listRecords<SubconJob>("subcon_jobs", userId, "work_date", false);
export const getSubconJobById = (userId: number, id: number) => getRecord<SubconJob>("subcon_jobs", userId, id);
export const createSubconJob = (record: Omit<SubconJob, "id" | "createdAt" | "updatedAt">) => createRecord("subcon_jobs", record);
export const updateSubconJob = (userId: number, id: number, changes: Changes<SubconJob>) => updateRecord("subcon_jobs", userId, id, changes);
export const deleteSubconJob = (userId: number, id: number) => deleteRecord("subcon_jobs", userId, id);

export const listChiliSales = (userId: number) => listRecords<ChiliSale>("chili_sales", userId, "sale_date", false);
export const getChiliSaleById = (userId: number, id: number) => getRecord<ChiliSale>("chili_sales", userId, id);
export const createChiliSale = (record: Omit<ChiliSale, "id" | "createdAt" | "updatedAt">) => createRecord("chili_sales", record);
export const updateChiliSale = (userId: number, id: number, changes: Changes<ChiliSale>) => updateRecord("chili_sales", userId, id, changes);
export const deleteChiliSale = (userId: number, id: number) => deleteRecord("chili_sales", userId, id);

export async function getChiliSalesByIds(userId: number, ids: number[]): Promise<ChiliSale[]> {
  if (ids.length === 0) return [];
  const { data } = await requireSupabase().from("chili_sales").select("*").eq("user_id", userId).in("id", ids).throwOnError();
  return fromRows<ChiliSale>(data);
}

/** Settles several sales at once, e.g. everything a customer paid for on their next delivery. */
export async function markChiliSalesPaid(userId: number, ids: number[], paidAt: number): Promise<void> {
  if (ids.length === 0) return;
  await requireSupabase().from("chili_sales").update({ paid_at: paidAt, updated_at: new Date() }).eq("user_id", userId).in("id", ids).throwOnError();
}

export const listChiliExpenses = (userId: number) => listRecords<ChiliExpense>("chili_expenses", userId, "expense_date", false);
export const getChiliExpenseById = (userId: number, id: number) => getRecord<ChiliExpense>("chili_expenses", userId, id);
export const createChiliExpense = (record: Omit<ChiliExpense, "id" | "createdAt" | "updatedAt">) => createRecord("chili_expenses", record);
export const updateChiliExpense = (userId: number, id: number, changes: Changes<ChiliExpense>) => updateRecord("chili_expenses", userId, id, changes);
export const deleteChiliExpense = (userId: number, id: number) => deleteRecord("chili_expenses", userId, id);

export const listStaff = (userId: number) => listRecords<Staff>("staff", userId, "name", true);
export const createStaff = async (record: Omit<Staff, "id" | "createdAt" | "updatedAt">) => { await createRecord("staff", record); };
export const updateStaff = (userId: number, id: number, changes: Changes<Staff>) => updateRecord("staff", userId, id, changes);
export const deleteStaff = (userId: number, id: number) => deleteRecord("staff", userId, id);

export async function getStaffByIds(userId: number, ids: number[]): Promise<Staff[]> {
  if (ids.length === 0) return [];
  const { data } = await requireSupabase().from("staff").select("*").eq("user_id", userId).in("id", ids).throwOnError();
  return fromRows<Staff>(data);
}

export const listCustomers = (userId: number) => listRecords<Customer>("chili_customers", userId, "name", true);
export const getCustomerById = (userId: number, id: number) => getRecord<Customer>("chili_customers", userId, id);
export const createCustomer = async (record: Omit<Customer, "id" | "createdAt" | "updatedAt">) => { await createRecord("chili_customers", record); };
export const updateCustomer = (userId: number, id: number, changes: Changes<Customer>) => updateRecord("chili_customers", userId, id, changes);
export const deleteCustomer = (userId: number, id: number) => deleteRecord("chili_customers", userId, id);
