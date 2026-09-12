import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import type { Attachment, AttachmentKind, AttachmentLinkType, AttachmentMime } from "../shared/schema";
import { fromRow, fromRows, requireSupabase, toRow } from "./supabase";

export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_PDF_BYTES = 5_000_000;
export const MAX_ATTACHMENTS_PER_RECORD = 8;
export const MAX_PENDING_PER_HOUSEHOLD = 40;
// Supabase free-plan Storage allowance.
export const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
export const STORAGE_SOFT_LIMIT_BYTES = 900 * 1024 * 1024;
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


/** File bytes live in the private "attachments" Supabase Storage bucket; `fileId` is the object path. */
const BUCKET = "attachments";

function bucket() {
  return requireSupabase().storage.from(BUCKET);
}

async function putFile(householdId: number, contentType: string, buffer: Buffer): Promise<string> {
  const path = `${householdId}/${randomUUID()}`;
  const { error } = await bucket().upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

async function removeFiles(paths: (string | null)[]): Promise<void> {
  const existing = paths.filter((path): path is string => Boolean(path));
  if (existing.length === 0) return;
  const { error } = await bucket().remove(existing);
  if (error) throw error;
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
  const fileId = await putFile(input.householdId, input.mimeType, input.buffer);
  try {
    const { data } = await requireSupabase()
      .from("attachments")
      .insert(toRow({
        userId: input.householdId,
        uploadedByUserId: input.uploadedByUserId,
        kind: input.kind,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        width: input.width,
        height: input.height,
        fileId,
      }))
      .select("*")
      .single()
      .throwOnError();
    return fromRow<Attachment>(data);
  } catch (error) {
    await removeFiles([fileId]).catch(() => {});
    throw error;
  }
}

export async function storeThumbnail(householdId: number, id: number, buffer: Buffer): Promise<boolean> {
  const existing = await getAttachment(householdId, id);
  if (!existing) return false;
  const thumbFileId = await putFile(householdId, "image/jpeg", buffer);
  await requireSupabase().from("attachments").update({ thumb_file_id: thumbFileId, updated_at: new Date() }).eq("id", id).throwOnError();
  await removeFiles([existing.thumbFileId]);
  return true;
}

export async function getAttachment(householdId: number, id: number): Promise<Attachment | undefined> {
  const { data } = await requireSupabase().from("attachments").select("*").eq("user_id", householdId).eq("id", id).maybeSingle().throwOnError();
  return data ? fromRow<Attachment>(data) : undefined;
}

export async function getAttachmentsByIds(householdId: number, ids: number[]): Promise<Attachment[]> {
  if (ids.length === 0) return [];
  const { data } = await requireSupabase().from("attachments").select("*").eq("user_id", householdId).in("id", uniqueIds(ids)).throwOnError();
  return fromRows<Attachment>(data);
}

/** The file's bytes, or null if the object is missing. */
export async function readFile(fileId: string): Promise<Buffer | null> {
  const { data, error } = await bucket().download(fileId);
  if (error || !data) {
    console.warn(`[Attachments] Could not read ${fileId}:`, error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function linkAttachments(householdId: number, ids: number[], linkedType: AttachmentLinkType, linkedId: number): Promise<void> {
  if (ids.length === 0) return;
  await requireSupabase()
    .from("attachments")
    .update({ linked_type: linkedType, linked_id: linkedId, updated_at: new Date() })
    .eq("user_id", householdId)
    .in("id", ids)
    .throwOnError();
}

export async function deleteAttachments(householdId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = requireSupabase();
  const { data } = await supabase.from("attachments").select("id, file_id, thumb_file_id").eq("user_id", householdId).in("id", ids).throwOnError();
  const docs = fromRows<Pick<Attachment, "id" | "fileId" | "thumbFileId">>(data);
  // Bytes first, metadata last: a crash leaves a sweepable row, never an invisible blob.
  await removeFiles(docs.flatMap(doc => [doc.fileId, doc.thumbFileId]));
  if (docs.length > 0) {
    await supabase.from("attachments").delete().eq("user_id", householdId).in("id", docs.map(doc => doc.id)).throwOnError();
  }
}

export async function deleteAttachmentsForRecord(householdId: number, linkedType: AttachmentLinkType, linkedId: number): Promise<void> {
  const { data } = await requireSupabase()
    .from("attachments")
    .select("id")
    .eq("user_id", householdId)
    .eq("linked_type", linkedType)
    .eq("linked_id", linkedId)
    .throwOnError();
  await deleteAttachments(householdId, (data ?? []).map(doc => doc.id));
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
  const { count } = await requireSupabase()
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", householdId)
    .is("linked_type", null)
    .throwOnError();
  return count ?? 0;
}

export async function storageUsage(): Promise<{ fileCount: number; attachmentBytes: number; storageBytes: number; quotaBytes: number }> {
  const { data } = await requireSupabase().rpc("storage_usage").throwOnError();
  const [usage] = fromRows<{ fileCount: number; attachmentBytes: number; storageBytes: number }>(data);
  return {
    fileCount: Number(usage?.fileCount ?? 0),
    attachmentBytes: Number(usage?.attachmentBytes ?? 0),
    storageBytes: Number(usage?.storageBytes ?? 0),
    quotaBytes: STORAGE_QUOTA_BYTES,
  };
}

export async function sweepOrphans(olderThanMs = ORPHAN_MAX_AGE_MS): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { data } = await requireSupabase().from("attachments").select("id, user_id").is("linked_type", null).lt("created_at", cutoff.toISOString()).throwOnError();
  const orphans = fromRows<Pick<Attachment, "id" | "userId">>(data);
  for (const orphan of orphans) await deleteAttachments(orphan.userId, [orphan.id]);
  return orphans.length;
}

export function startOrphanSweep(): void {
  const run = () => sweepOrphans().then(count => { if (count > 0) console.log(`[Attachments] Removed ${count} unlinked upload${count === 1 ? "" : "s"}`); }).catch(error => console.warn("[Attachments] Orphan sweep failed:", error));
  setTimeout(run, 10_000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
