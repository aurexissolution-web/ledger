import { randomUUID } from "node:crypto";
import type { WithId } from "mongodb";
import { COLLECTIONS, ChiliExpense, ChiliSale, Customer, InsertUser, Staff, SubconJob, User, UserRole } from "../shared/schema";
import { ENV } from "./_core/env";
import { getDb as getMongoDb, nextId } from "./mongo";

function withoutMongoId<T extends { _id?: unknown }>(doc: T | null): Omit<T, "_id"> | undefined {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return rest;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getMongoDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      updateSet[field] = value ?? null;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      updateSet.role = "admin";
    }

    if (!updateSet.lastSignedIn) {
      updateSet.lastSignedIn = new Date();
    }
    updateSet.updatedAt = new Date();

    const collection = db.collection(COLLECTIONS.users);
    const existing = await collection.findOne({ openId: user.openId });

    if (existing) {
      await collection.updateOne({ openId: user.openId }, { $set: updateSet });
      return;
    }

    const id = await nextId(db, COLLECTIONS.users);
    const now = new Date();
    await collection.insertOne({
      id,
      householdId: user.householdId ?? id,
      openId: user.openId,
      name: null,
      email: null,
      loginMethod: null,
      role: "user",
      pinHash: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
      ...updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getMongoDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.collection<User>(COLLECTIONS.users).findOne({ openId });
  return withoutMongoId(result) as User | undefined;
}

async function requireDb() {
  const db = await getMongoDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await requireDb();
  const result = await db.collection<User>(COLLECTIONS.users).findOne({ id });
  return withoutMongoId(result) as User | undefined;
}

export async function listProfiles(): Promise<Pick<User, "id" | "name" | "role" | "householdId">[]> {
  const db = await requireDb();
  const results = await db.collection<User>(COLLECTIONS.users).find({ pinHash: { $ne: null } }).sort({ id: 1 }).toArray();
  return results.map(user => ({ id: user.id, name: user.name, role: user.role, householdId: user.householdId }));
}

// The first household allocated is 1, which is also the id (and therefore data
// scope) of the legacy single dev user, so records created before profiles
// existed stay visible to the family.
export async function allocateHouseholdId(): Promise<number> {
  const db = await requireDb();
  return nextId(db, "households");
}

export async function createProfileUser(input: { householdId: number; name: string; role: UserRole; pinHash: string }): Promise<User> {
  const db = await requireDb();
  const id = await nextId(db, COLLECTIONS.users);
  const now = new Date();
  const user: User = {
    id,
    householdId: input.householdId,
    openId: `profile-${randomUUID()}`,
    name: input.name,
    email: null,
    loginMethod: "pin",
    role: input.role,
    pinHash: input.pinHash,
    pinFailCount: 0,
    pinLockedUntil: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  await db.collection(COLLECTIONS.users).insertOne({ ...user });
  return user;
}

export async function setUserPin(userId: number, pinHash: string): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.users).updateOne({ id: userId }, { $set: { pinHash, updatedAt: new Date() } });
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 60_000;

/** ms remaining on an active lockout, or 0 if the profile can attempt a PIN now. Stored in Mongo, not memory, so it survives serverless cold starts. */
export async function getPinLockRemainingMs(userId: number): Promise<number> {
  const db = await requireDb();
  const user = await db.collection<User>(COLLECTIONS.users).findOne({ id: userId }, { projection: { pinLockedUntil: 1 } });
  const lockedUntil = user?.pinLockedUntil;
  if (!lockedUntil) return 0;
  return Math.max(0, new Date(lockedUntil).getTime() - Date.now());
}

/** Records a failed PIN attempt; returns attempts remaining before lockout (0 = now locked). */
export async function recordPinFailure(userId: number): Promise<number> {
  const db = await requireDb();
  const collection = db.collection<User>(COLLECTIONS.users);
  const result = await collection.findOneAndUpdate({ id: userId }, { $inc: { pinFailCount: 1 } }, { returnDocument: "after" });
  const count = result?.pinFailCount ?? 1;
  if (count >= PIN_MAX_ATTEMPTS) {
    await collection.updateOne({ id: userId }, { $set: { pinFailCount: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) } });
    return 0;
  }
  return PIN_MAX_ATTEMPTS - count;
}

export async function clearPinFailures(userId: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.users).updateOne({ id: userId }, { $set: { pinFailCount: 0, pinLockedUntil: null } });
}

export async function touchLastSignedIn(userId: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.users).updateOne({ id: userId }, { $set: { lastSignedIn: new Date() } });
}

// Older documents predate cost lines / attachments; fill the new fields on
// read so every consumer sees one shape. A legacy lump-sum `expenseCents`
// becomes a single "Other costs" line and is persisted itemised on next save.
function normalizeSubconJob(record: WithId<SubconJob>): SubconJob {
  const job = withoutMongoId(record) as SubconJob;
  const legacyCosts = job.expenseCents > 0 ? [{ label: "Other costs", amountCents: job.expenseCents, attachmentIds: [] }] : [];
  return {
    ...job,
    workerPayments: job.workerPayments ?? [],
    costLines: job.costLines ?? legacyCosts,
    invoiceAttachmentIds: job.invoiceAttachmentIds ?? [],
  };
}

export async function listSubconJobs(userId: number): Promise<SubconJob[]> {
  const db = await requireDb();
  const results = await db
    .collection<SubconJob>(COLLECTIONS.subconJobs)
    .find({ userId })
    .sort({ workDate: -1 })
    .toArray();
  return results.map(normalizeSubconJob);
}

export async function getSubconJobById(userId: number, id: number): Promise<SubconJob | undefined> {
  const db = await requireDb();
  const result = await db.collection<SubconJob>(COLLECTIONS.subconJobs).findOne({ userId, id });
  return result ? normalizeSubconJob(result) : undefined;
}

export async function createSubconJob(record: Omit<SubconJob, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await requireDb();
  const id = await nextId(db, COLLECTIONS.subconJobs);
  const now = new Date();
  await db.collection(COLLECTIONS.subconJobs).insertOne({ id, ...record, createdAt: now, updatedAt: now });
  return id;
}

export async function updateSubconJob(userId: number, id: number, changes: Partial<Omit<SubconJob, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.subconJobs).updateOne({ id, userId }, { $set: { ...changes, updatedAt: new Date() } });
}

export async function deleteSubconJob(userId: number, id: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.subconJobs).deleteOne({ id, userId });
}

export async function listChiliSales(userId: number): Promise<ChiliSale[]> {
  const db = await requireDb();
  const results = await db
    .collection<ChiliSale>(COLLECTIONS.chiliSales)
    .find({ userId })
    .sort({ saleDate: -1 })
    .toArray();
  return results.map(normalizeChiliSale);
}

function normalizeChiliSale(record: WithId<ChiliSale>): ChiliSale {
  const sale = withoutMongoId(record) as ChiliSale;
  return { ...sale, customerId: sale.customerId ?? null, attachmentIds: sale.attachmentIds ?? [] };
}

export async function getChiliSaleById(userId: number, id: number): Promise<ChiliSale | undefined> {
  const db = await requireDb();
  const result = await db.collection<ChiliSale>(COLLECTIONS.chiliSales).findOne({ userId, id });
  return result ? normalizeChiliSale(result) : undefined;
}

export async function createChiliSale(record: Omit<ChiliSale, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await requireDb();
  const id = await nextId(db, COLLECTIONS.chiliSales);
  const now = new Date();
  await db.collection(COLLECTIONS.chiliSales).insertOne({ id, ...record, createdAt: now, updatedAt: now });
  return id;
}

export async function updateChiliSale(userId: number, id: number, changes: Partial<Omit<ChiliSale, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.chiliSales).updateOne({ id, userId }, { $set: { ...changes, updatedAt: new Date() } });
}

export async function deleteChiliSale(userId: number, id: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.chiliSales).deleteOne({ id, userId });
}

export async function listChiliExpenses(userId: number): Promise<ChiliExpense[]> {
  const db = await requireDb();
  const results = await db
    .collection<ChiliExpense>(COLLECTIONS.chiliExpenses)
    .find({ userId })
    .sort({ expenseDate: -1 })
    .toArray();
  return results.map(normalizeChiliExpense);
}

function normalizeChiliExpense(record: WithId<ChiliExpense>): ChiliExpense {
  const expense = withoutMongoId(record) as ChiliExpense;
  return { ...expense, attachmentIds: expense.attachmentIds ?? [] };
}

export async function getChiliExpenseById(userId: number, id: number): Promise<ChiliExpense | undefined> {
  const db = await requireDb();
  const result = await db.collection<ChiliExpense>(COLLECTIONS.chiliExpenses).findOne({ userId, id });
  return result ? normalizeChiliExpense(result) : undefined;
}

export async function createChiliExpense(record: Omit<ChiliExpense, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await requireDb();
  const id = await nextId(db, COLLECTIONS.chiliExpenses);
  const now = new Date();
  await db.collection(COLLECTIONS.chiliExpenses).insertOne({ id, ...record, createdAt: now, updatedAt: now });
  return id;
}

export async function updateChiliExpense(userId: number, id: number, changes: Partial<Omit<ChiliExpense, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.chiliExpenses).updateOne({ id, userId }, { $set: { ...changes, updatedAt: new Date() } });
}

export async function deleteChiliExpense(userId: number, id: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.chiliExpenses).deleteOne({ id, userId });
}

export async function listStaff(userId: number): Promise<Staff[]> {
  const db = await requireDb();
  const results = await db.collection<Staff>(COLLECTIONS.staff).find({ userId }).sort({ name: 1 }).toArray();
  return results.map(record => withoutMongoId(record) as Staff);
}

export async function getStaffByIds(userId: number, ids: number[]): Promise<Staff[]> {
  const db = await requireDb();
  const results = await db.collection<Staff>(COLLECTIONS.staff).find({ userId, id: { $in: ids } }).toArray();
  return results.map(record => withoutMongoId(record) as Staff);
}

export async function createStaff(record: Omit<Staff, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await requireDb();
  const id = await nextId(db, COLLECTIONS.staff);
  const now = new Date();
  await db.collection(COLLECTIONS.staff).insertOne({ id, ...record, createdAt: now, updatedAt: now });
}

export async function updateStaff(userId: number, id: number, changes: Partial<Omit<Staff, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.staff).updateOne({ id, userId }, { $set: { ...changes, updatedAt: new Date() } });
}

export async function deleteStaff(userId: number, id: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.staff).deleteOne({ id, userId });
}

export async function listCustomers(userId: number): Promise<Customer[]> {
  const db = await requireDb();
  const results = await db.collection<Customer>(COLLECTIONS.customers).find({ userId }).sort({ name: 1 }).toArray();
  return results.map(record => withoutMongoId(record) as Customer);
}

export async function getCustomerById(userId: number, id: number): Promise<Customer | undefined> {
  const db = await requireDb();
  const result = await db.collection<Customer>(COLLECTIONS.customers).findOne({ userId, id });
  return withoutMongoId(result) as Customer | undefined;
}

export async function createCustomer(record: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await requireDb();
  const id = await nextId(db, COLLECTIONS.customers);
  const now = new Date();
  await db.collection(COLLECTIONS.customers).insertOne({ id, ...record, createdAt: now, updatedAt: now });
}

export async function updateCustomer(userId: number, id: number, changes: Partial<Omit<Customer, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.customers).updateOne({ id, userId }, { $set: { ...changes, updatedAt: new Date() } });
}

export async function deleteCustomer(userId: number, id: number): Promise<void> {
  const db = await requireDb();
  await db.collection(COLLECTIONS.customers).deleteOne({ id, userId });
}
