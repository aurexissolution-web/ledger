import { z } from "zod";
import { PAYMENT_TERMS } from "../../shared/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { textInput } from "./business";

const customerRecordSchema = z.object({
  name: z.string().trim().min(1).max(180),
  phone: textInput(60),
  location: textInput(240),
  paymentTerms: z.enum(PAYMENT_TERMS).default("on_delivery"),
});

export const customersRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.listCustomers(ctx.user.householdId)),
  create: protectedProcedure.input(customerRecordSchema).mutation(async ({ ctx, input }) => {
    await db.createCustomer({ userId: ctx.user.householdId, ...input });
    return { success: true };
  }),
  update: protectedProcedure.input(customerRecordSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...changes } = input;
    await db.updateCustomer(ctx.user.householdId, id, changes);
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await db.deleteCustomer(ctx.user.householdId, input.id);
    return { success: true };
  }),
});
