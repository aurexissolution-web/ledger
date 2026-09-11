import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as attachments from "../attachments";
import { protectedProcedure, router } from "../_core/trpc";

export const attachmentsRouter = router({
  byIds: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).max(64) })).query(async ({ ctx, input }) => {
    const docs = await attachments.getAttachmentsByIds(ctx.user.householdId, input.ids);
    const visible = ctx.user.role === "admin" ? docs : docs.filter(doc => doc.linkedType !== "subconJob");
    return visible.map(doc => ({ id: doc.id, kind: doc.kind, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, width: doc.width, height: doc.height, hasThumb: doc.thumbFileId !== null, linkedType: doc.linkedType, linkedId: doc.linkedId }));
  }),
  // Only files that were never saved onto a record can be deleted directly;
  // linked files are removed by editing the record they belong to.
  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const doc = await attachments.getAttachment(ctx.user.householdId, input.id);
    if (!doc) return { success: true };
    if (doc.linkedType !== null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Remove this file from its record and save instead" });
    }
    if (doc.uploadedByUserId !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only remove your own uploads" });
    }
    await attachments.deleteAttachments(ctx.user.householdId, [doc.id]);
    return { success: true };
  }),
  usage: protectedProcedure.query(() => attachments.storageUsage()),
});
