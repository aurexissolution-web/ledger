import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "../../shared/schema";
import type { TrpcContext } from "../_core/context";

const storeMock = vi.hoisted(() => ({
  getAttachmentsByIds: vi.fn(),
  getAttachment: vi.fn(),
  deleteAttachments: vi.fn(),
  storageUsage: vi.fn(),
}));

vi.mock("../attachments", () => storeMock);

import { attachmentsRouter } from "./attachments";

function createContext(role: "admin" | "user", userId = 5): TrpcContext {
  return {
    user: { id: userId, householdId: 47, pinHash: null, pinFailCount: 0, pinLockedUntil: null, openId: "profile", email: null, name: "Sanjay", loginMethod: "pin", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function doc(overrides: Partial<Attachment>): Attachment {
  return { id: 1, userId: 47, uploadedByUserId: 5, kind: "receipt", fileName: "r.jpg", mimeType: "image/jpeg", sizeBytes: 10, width: null, height: null, fileId: "a".repeat(24), thumbFileId: null, linkedType: null, linkedId: null, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

describe("attachments router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMock.deleteAttachments.mockResolvedValue(undefined);
  });

  it("scopes lookups to the household and hides Subcon files from non-admins", async () => {
    storeMock.getAttachmentsByIds.mockResolvedValue([doc({ id: 1, linkedType: "chiliExpense", linkedId: 2 }), doc({ id: 3, linkedType: "subconJob", linkedId: 9 })]);

    const asUser = await attachmentsRouter.createCaller(createContext("user")).byIds({ ids: [1, 3] });
    expect(storeMock.getAttachmentsByIds).toHaveBeenCalledWith(47, [1, 3]);
    expect(asUser.map(a => a.id)).toEqual([1]);

    const asAdmin = await attachmentsRouter.createCaller(createContext("admin")).byIds({ ids: [1, 3] });
    expect(asAdmin.map(a => a.id)).toEqual([1, 3]);
  });

  it("deletes only unlinked uploads", async () => {
    storeMock.getAttachment.mockResolvedValue(doc({ id: 1, linkedType: "chiliExpense", linkedId: 2 }));
    await expect(attachmentsRouter.createCaller(createContext("user")).delete({ id: 1 })).rejects.toThrow(/Remove this file/);
    expect(storeMock.deleteAttachments).not.toHaveBeenCalled();

    storeMock.getAttachment.mockResolvedValue(doc({ id: 1 }));
    await expect(attachmentsRouter.createCaller(createContext("user")).delete({ id: 1 })).resolves.toEqual({ success: true });
    expect(storeMock.deleteAttachments).toHaveBeenCalledWith(47, [1]);
  });

  it("stops a profile deleting someone else's pending upload", async () => {
    storeMock.getAttachment.mockResolvedValue(doc({ id: 1, uploadedByUserId: 4 }));
    await expect(attachmentsRouter.createCaller(createContext("user", 5)).delete({ id: 1 })).rejects.toThrow(/own uploads/);
  });
});
