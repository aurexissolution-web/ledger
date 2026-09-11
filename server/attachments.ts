import { TRPCError } from "@trpc/server";
import { GridFSBucket, ObjectId, type Db } from "mongodb";
import { Readable } from "node:stream";
import { ATTACHMENT_BUCKET, COLLECTIONS, type Attachment, type AttachmentKind, type AttachmentLinkType, type AttachmentMime } from "../shared/schema";
import { getDb, nextId } from "./mongo";

export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_PDF_BYTES = 5_000_000;
export const MAX_ATTACHMENTS_PER_RECORD = 8;
export const MAX_PENDING_PER_HOUSEHOLD = 40;
export const STORAGE_QUOTA_BYTES = 512 * 1024 * 1024;
export const STORAGE_SOFT_LIMIT_BYTES = 450 * 1024 * 1024;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Pure helpers                                                         */
/* ------------------------------------------------------------------ */

export function sniffMime(bytes: Uint8Array): AttachmentMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  return null;
}

/** Returns an error message, or null when the upload is acceptable. */
export function validateUpload(input: { mime: AttachmentMime; sizeBytes: number }): string | null {
  if (input.sizeBytes <= 0) return "The file is empty";
  if (input.mime === "image/jpeg" && input.sizeBytes > MAX_IMAGE_BYTES) return "Photos must be under 1.5 MB after compression";
  if (input.mime === "application/pdf" && input.sizeBytes > MAX_PDF_BYTES) return "PDFs must be under 5 MB";
  return null;
}

/**
 * Every requested id must exist in the household, have the expected kind, and be
 * either still unlinked or already linked to this exact record.
 */
export function validateAttachmentOwnership(docs: Attachment[], expected: Record<number, AttachmentKind>, linkedType: AttachmentLinkType, linkedId: number): void {
  const ids = Object.keys(expected).map(Number);
  const byId = new Map(docs.map(doc => [doc.id, doc]));
  for (const id of ids) {
    const doc = byId.get(id);
    if (!doc) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more attachments were not found" });
    if (doc.kind !== expected[id]) throw new TRPCError({ code: "BAD_REQUEST", message: `Attachment "${doc.fileName}" is a ${doc.kind}, not a ${expected[id]}` });
    const linkedElsewhere = doc.linkedType !== null && !(doc.linkedType === linkedType && doc.linkedId === linkedId);
    if (linkedElsewhere) throw new TRPCError({ code: "BAD_REQUEST", message: `Attachment "${doc.fileName}" already belongs to another record` });
  }
}

export function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

/* ------------------------------------------------------------------ */
/* Storage                                                              */
/* ------------------------------------------------------------------ */

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

function getBucket(db: Db) {
  return new GridFSBucket(db, { bucketName: ATTACHMENT_BUCKET });
}

function collection(db: Db) {
  return db.collection<Attachment>(COLLECTIONS.attachments);
}

function stripMongoId(doc: Attachment | null): Attachment | undefined {
  if (!doc) return undefined;
  const { _id, ...rest } = doc as Attachment & { _id?: unknown };
  return rest;
}

async function putFile(db: Db, fileName: string, contentType: string, buffer: Buffer, householdId: number): Promise<string> {
  const upload = getBucket(db).openUploadStream(fileName, { contentType, metadata: { householdId } });
  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer).pipe(upload).on("error", reject).on("finish", () => resolve());
  });
  return upload.id.toHexString();
}

async function removeFile(db: Db, fileIdHex: string | null): Promise<void> {
  if (!fileIdHex) return;
  try {
    await getBucket(db).delete(new ObjectId(fileIdHex));
  } catch (error) {
    if (!/FileNotFound|not found/i.test(String(error))) throw error;
  }
}

export async function storeAttachment(input: {
  householdId: number;
  uploadedByUserId: number;
  kind: AttachmentKind;
  fileName: string;
  mimeType: AttachmentMime;
  buffer: Buffer;
  width: number | null;
  height: number | null;
}): Promise<Attachment> {
  const db = await requireDb();
  const fileId = await putFile(db, input.fileName, input.mimeType, input.buffer, input.householdId);
  const id = await nextId(db, COLLECTIONS.attachments);
  const now = new Date();
  const attachment: Attachment = {
    id,
    userId: input.householdId,
    uploadedByUserId: input.uploadedByUserId,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    width: input.width,
    height: input.height,
    fileId,
    thumbFileId: null,
    linkedType: null,
    linkedId: null,
    createdAt: now,
    updatedAt: now,
  };
  await collection(db).insertOne({ ...attachment });
  return attachment;
}

export async function storeThumbnail(householdId: number, id: number, buffer: Buffer): Promise<boolean> {
  const db = await requireDb();
  const existing = await collection(db).findOne({ userId: householdId, id });
  if (!existing) return false;
  const thumbFileId = await putFile(db, `thumb-${existing.fileName}`, "image/jpeg", buffer, householdId);
  await removeFile(db, existing.thumbFileId);
  await collection(db).updateOne({ id }, { $set: { thumbFileId, updatedAt: new Date() } });
  return true;
}

export async function getAttachment(householdId: number, id: number): Promise<Attachment | undefined> {
  const db = await requireDb();
  return stripMongoId(await collection(db).findOne({ userId: householdId, id }));
}

export async function getAttachmentsByIds(householdId: number, ids: number[]): Promise<Attachment[]> {
  if (ids.length === 0) return [];
  const db = await requireDb();
  const docs = await collection(db).find({ userId: householdId, id: { $in: uniqueIds(ids) } }).toArray();
  return docs.map(doc => stripMongoId(doc) as Attachment);
}

export async function openDownload(fileIdHex: string) {
  const db = await requireDb();
  return getBucket(db).openDownloadStream(new ObjectId(fileIdHex));
}

export async function linkAttachments(householdId: number, ids: number[], linkedType: AttachmentLinkType, linkedId: number): Promise<void> {
  if (ids.length === 0) return;
  const db = await requireDb();
  await collection(db).updateMany({ userId: householdId, id: { $in: ids } }, { $set: { linkedType, linkedId, updatedAt: new Date() } });
}

export async function deleteAttachments(householdId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await requireDb();
  const docs = await collection(db).find({ userId: householdId, id: { $in: ids } }).toArray();
  // Bytes first, metadata last: a crash leaves a sweepable row, never an invisible blob.
  for (const doc of docs) {
    await removeFile(db, doc.fileId);
    await removeFile(db, doc.thumbFileId);
  }
  await collection(db).deleteMany({ userId: householdId, id: { $in: docs.map(doc => doc.id) } });
}

export async function deleteAttachmentsForRecord(householdId: number, linkedType: AttachmentLinkType, linkedId: number): Promise<void> {
  const db = await requireDb();
  const docs = await collection(db).find({ userId: householdId, linkedType, linkedId }, { projection: { id: 1 } }).toArray();
  await deleteAttachments(householdId, docs.map(doc => doc.id));
}

/**
 * Called after a record is written: links the attachments it now references and
 * removes the ones it no longer does. Validation happens first so a bad id never
 * partially mutates anything.
 */
export async function syncRecordAttachments(input: {
  householdId: number;
  linkedType: AttachmentLinkType;
  linkedId: number;
  expected: Record<number, AttachmentKind>;
  prevIds: number[];
}): Promise<void> {
  const nextIds = Object.keys(input.expected).map(Number);
  if (nextIds.length > 0) {
    const docs = await getAttachmentsByIds(input.householdId, nextIds);
    validateAttachmentOwnership(docs, input.expected, input.linkedType, input.linkedId);
    await linkAttachments(input.householdId, nextIds, input.linkedType, input.linkedId);
  }
  const removed = input.prevIds.filter(id => !nextIds.includes(id));
  await deleteAttachments(input.householdId, removed);
}

export async function validateNewAttachments(householdId: number, expected: Record<number, AttachmentKind>, linkedType: AttachmentLinkType, linkedId: number): Promise<void> {
  const ids = Object.keys(expected).map(Number);
  if (ids.length === 0) return;
  const docs = await getAttachmentsByIds(householdId, ids);
  validateAttachmentOwnership(docs, expected, linkedType, linkedId);
}

export async function countPending(householdId: number): Promise<number> {
  const db = await requireDb();
  return collection(db).countDocuments({ userId: householdId, linkedType: null });
}

export async function storageUsage(): Promise<{ fileCount: number; attachmentBytes: number; storageBytes: number; quotaBytes: number }> {
  const db = await requireDb();
  const [agg] = await collection(db).aggregate<{ count: number; bytes: number }>([{ $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: "$sizeBytes" } } }]).toArray();
  const stats = await db.command({ dbStats: 1 });
  return {
    fileCount: agg?.count ?? 0,
    attachmentBytes: agg?.bytes ?? 0,
    storageBytes: Number(stats.storageSize ?? 0) + Number(stats.indexSize ?? 0),
    quotaBytes: STORAGE_QUOTA_BYTES,
  };
}

export async function sweepOrphans(olderThanMs = ORPHAN_MAX_AGE_MS): Promise<number> {
  const db = await requireDb();
  const cutoff = new Date(Date.now() - olderThanMs);
  const orphans = await collection(db).find({ linkedType: null, createdAt: { $lt: cutoff } }, { projection: { id: 1, userId: 1 } }).toArray();
  for (const orphan of orphans) await deleteAttachments(orphan.userId, [orphan.id]);
  return orphans.length;
}

export function startOrphanSweep(): void {
  const run = () => sweepOrphans().then(count => { if (count > 0) console.log(`[Attachments] Removed ${count} unlinked upload${count === 1 ? "" : "s"}`); }).catch(error => console.warn("[Attachments] Orphan sweep failed:", error));
  setTimeout(run, 10_000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
