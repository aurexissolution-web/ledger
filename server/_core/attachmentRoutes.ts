import express, { type Express, type Request, type Response } from "express";
import type { Attachment, AttachmentKind, User } from "../../shared/schema";
import * as attachments from "../attachments";
import { sdk } from "./sdk";

const rawFile = express.raw({ type: ["image/jpeg", "application/pdf"], limit: "5mb" });
const rawThumb = express.raw({ type: "image/jpeg", limit: "300kb" });

async function requireUser(req: Request, res: Response): Promise<User | null> {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ error: "Please sign in" });
    return null;
  }
}

function canRead(user: User, attachment: Attachment): "ok" | "forbidden" | "hidden" {
  if (attachment.linkedType === "subconJob" && user.role !== "admin") return "forbidden";
  if (attachment.linkedType === null && attachment.uploadedByUserId !== user.id && user.role !== "admin") return "hidden";
  return "ok";
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDimension(value: unknown): number | null {
  const n = Number(value);
  return typeof value === "string" && Number.isInteger(n) && n > 0 && n < 20_000 ? n : null;
}

async function loadReadable(req: Request, res: Response): Promise<{ user: User; attachment: Attachment } | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  const id = parseId(req.params.id);
  const attachment = id ? await attachments.getAttachment(user.householdId, id) : undefined;
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return null; }
  const access = canRead(user, attachment);
  if (access === "forbidden") { res.status(403).json({ error: "You don't have access to this file" }); return null; }
  if (access === "hidden") { res.status(404).json({ error: "Attachment not found" }); return null; }
  return { user, attachment };
}

function sendFile(res: Response, stream: NodeJS.ReadableStream, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  stream.on("error", () => { if (!res.headersSent) res.status(404).json({ error: "File data missing" }); else res.end(); });
  stream.pipe(res);
}

export function registerAttachmentRoutes(app: Express) {
  app.post("/api/attachments/upload", rawFile, async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!Buffer.isBuffer(req.body)) { res.status(415).json({ error: "Send the file bytes with a JPEG or PDF content type" }); return; }
    const body = req.body as Buffer;
    const mime = attachments.sniffMime(body);
    if (!mime || mime !== req.headers["content-type"]) { res.status(415).json({ error: "Only JPEG photos and PDF files are accepted" }); return; }
    const sizeError = attachments.validateUpload({ mime, sizeBytes: body.length });
    if (sizeError) { res.status(413).json({ error: sizeError }); return; }
    const kind = req.query.kind;
    if (kind !== "invoice" && kind !== "receipt") { res.status(400).json({ error: "kind must be invoice or receipt" }); return; }
    if ((await attachments.countPending(user.householdId)) >= attachments.MAX_PENDING_PER_HOUSEHOLD) { res.status(429).json({ error: "Too many unsaved uploads. Save or cancel your open forms first." }); return; }
    const usage = await attachments.storageUsage();
    if (usage.storageBytes > attachments.STORAGE_SOFT_LIMIT_BYTES) { res.status(507).json({ error: "Storage is almost full. Remove old attachments or upgrade the database plan." }); return; }
    const rawName = typeof req.query.name === "string" ? req.query.name.trim().slice(0, 200) : "";
    const fileName = rawName || (mime === "application/pdf" ? "document.pdf" : "photo.jpg");
    const attachment = await attachments.storeAttachment({
      householdId: user.householdId,
      uploadedByUserId: user.id,
      kind: kind as AttachmentKind,
      fileName,
      mimeType: mime,
      buffer: body,
      width: parseDimension(req.query.width),
      height: parseDimension(req.query.height),
    });
    res.status(201).json({ id: attachment.id });
  });

  app.post("/api/attachments/:id/thumb", rawThumb, async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!Buffer.isBuffer(req.body) || attachments.sniffMime(req.body) !== "image/jpeg") { res.status(415).json({ error: "Thumbnail must be a JPEG" }); return; }
    const id = parseId(req.params.id);
    const attachment = id ? await attachments.getAttachment(user.householdId, id) : undefined;
    if (!attachment || attachment.uploadedByUserId !== user.id) { res.status(404).json({ error: "Attachment not found" }); return; }
    await attachments.storeThumbnail(user.householdId, attachment.id, req.body as Buffer);
    res.json({ ok: true });
  });

  app.get("/api/attachments/:id/file", async (req, res) => {
    const loaded = await loadReadable(req, res);
    if (!loaded) return;
    const { attachment } = loaded;
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const stream = await attachments.openDownload(attachment.fileId);
    sendFile(res, stream, {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    });
  });

  app.get("/api/attachments/:id/thumb", async (req, res) => {
    const loaded = await loadReadable(req, res);
    if (!loaded) return;
    const { attachment } = loaded;
    if (!attachment.thumbFileId) { res.status(404).json({ error: "No thumbnail" }); return; }
    const stream = await attachments.openDownload(attachment.thumbFileId);
    sendFile(res, stream, { "Content-Type": "image/jpeg" });
  });
}
