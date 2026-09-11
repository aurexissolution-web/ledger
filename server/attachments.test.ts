import { describe, expect, it } from "vitest";
import type { Attachment } from "../shared/schema";
import { sniffMime, validateAttachmentOwnership, validateUpload } from "./attachments";

function attachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: 1,
    userId: 47,
    uploadedByUserId: 4,
    kind: "receipt",
    fileName: "receipt.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    width: 800,
    height: 600,
    fileId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    thumbFileId: null,
    linkedType: null,
    linkedId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("sniffMime", () => {
  it("recognises JPEG and PDF magic bytes and rejects anything else", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 rest"))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(sniffMime(new Uint8Array([]))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("enforces per-type size limits", () => {
    expect(validateUpload({ mime: "image/jpeg", sizeBytes: 400_000 })).toBeNull();
    expect(validateUpload({ mime: "image/jpeg", sizeBytes: 2_000_000 })).toMatch(/1.5 MB/);
    expect(validateUpload({ mime: "application/pdf", sizeBytes: 4_000_000 })).toBeNull();
    expect(validateUpload({ mime: "application/pdf", sizeBytes: 6_000_000 })).toMatch(/5 MB/);
    expect(validateUpload({ mime: "image/jpeg", sizeBytes: 0 })).toMatch(/empty/);
  });
});

describe("validateAttachmentOwnership", () => {
  it("accepts unlinked files and files already on this record", () => {
    const docs = [attachment({ id: 1 }), attachment({ id: 2, linkedType: "chiliExpense", linkedId: 9 })];
    expect(() => validateAttachmentOwnership(docs, { 1: "receipt", 2: "receipt" }, "chiliExpense", 9)).not.toThrow();
  });

  it("rejects ids missing from the household (foreign or unknown)", () => {
    expect(() => validateAttachmentOwnership([attachment({ id: 1 })], { 1: "receipt", 2: "receipt" }, "chiliExpense", 9)).toThrow(/not found/);
  });

  it("rejects files linked to a different record", () => {
    const docs = [attachment({ id: 1, linkedType: "chiliExpense", linkedId: 3 })];
    expect(() => validateAttachmentOwnership(docs, { 1: "receipt" }, "chiliExpense", 9)).toThrow(/another record/);
    expect(() => validateAttachmentOwnership(docs, { 1: "receipt" }, "subconJob", 3)).toThrow(/another record/);
  });

  it("rejects a kind mismatch (receipt used as an invoice)", () => {
    expect(() => validateAttachmentOwnership([attachment({ id: 1, kind: "receipt" })], { 1: "invoice" }, "chiliSale", 2)).toThrow(/not a invoice|is a receipt/);
  });
});
