import dns from "node:dns";
import { Db, MongoClient } from "mongodb";
import { COLLECTIONS } from "../shared/schema";

// Some local networks (e.g. phone hotspots) run DNS resolvers that can't
// answer the SRV lookup mongodb+srv:// needs, failing with EBADRESP. Public
// resolvers handle it reliably, so prefer them for local dev. Skip this on
// Vercel (and other real hosting) — its network doesn't have that problem,
// and this would just add an unnecessary extra DNS round-trip to every cold
// start.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()]);
}

let _client: MongoClient | null = null;
let _db: Db | null = null;
let _connecting: Promise<Db | null> | null = null;

async function connect(): Promise<Db | null> {
  const uri = process.env.DATABASE_URL;
  if (!uri) return null;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ openId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.users).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.subconJobs).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.subconJobs).createIndex({ userId: 1 }),
    db.collection(COLLECTIONS.chiliSales).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.chiliSales).createIndex({ userId: 1 }),
    db.collection(COLLECTIONS.chiliExpenses).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.chiliExpenses).createIndex({ userId: 1 }),
    db.collection(COLLECTIONS.staff).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.staff).createIndex({ userId: 1 }),
    db.collection(COLLECTIONS.customers).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.customers).createIndex({ userId: 1 }),
    db.collection(COLLECTIONS.attachments).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.attachments).createIndex({ userId: 1, linkedType: 1, linkedId: 1 }),
    db.collection(COLLECTIONS.attachments).createIndex({ linkedType: 1, createdAt: 1 }),
  ]);

  _client = client;
  return db;
}

// Lazily create the Mongo connection so local tooling can run without a DB.
export async function getDb(): Promise<Db | null> {
  if (_db) return _db;
  if (!_connecting) {
    _connecting = connect().catch(error => {
      console.warn("[Database] Failed to connect:", error);
      return null;
    });
  }
  _db = await _connecting;
  return _db;
}

/** Atomically allocates the next integer id for a collection, mimicking MySQL AUTO_INCREMENT. */
export async function nextId(db: Db, sequenceName: string): Promise<number> {
  const result = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: sequenceName },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
  const seq = result?.seq;
  if (typeof seq !== "number") {
    throw new Error(`Failed to allocate id for ${sequenceName}`);
  }
  return seq;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
    _connecting = null;
  }
}
