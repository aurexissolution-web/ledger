import { z } from "zod";
import { BANK_NAMES } from "../../shared/banks";
import * as db from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { textInput } from "./business";

const staffRecordSchema = z.object({
  name: z.string().trim().min(1).max(180),
  icNumber: textInput(40),
  bankName: z.enum(BANK_NAMES).or(z.literal("")).optional().transform(value => value || null),
  bankAccountNumber: textInput(40),
});

export const staffRouter = router({
  list: adminProcedure.query(({ ctx }) => db.listStaff(ctx.user.householdId)),
  create: adminProcedure.input(staffRecordSchema).mutation(async ({ ctx, input }) => {
    await db.createStaff({ userId: ctx.user.householdId, ...input });
    return { success: true };
  }),
  update: adminProcedure.input(staffRecordSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...changes } = input;
    await db.updateStaff(ctx.user.householdId, id, changes);
    return { success: true };
  }),
  delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await db.deleteStaff(ctx.user.householdId, input.id);
    return { success: true };
  }),
});
