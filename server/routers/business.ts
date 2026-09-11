import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AttachmentKind } from "../../shared/schema";
import * as attachments from "../attachments";
import * as db from "../db";
import { calculateChiliTotals, calculateSaleTotalCents, calculateSubconTotals } from "../business-calculations";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const dateInput = z.number().int().positive();
const centsInput = z.number().int().min(0).max(100_000_000);
export const textInput = (max: number) => z.string().trim().max(max).optional().transform(value => value || null);
const attachmentIdsInput = z.array(z.number().int().positive()).max(attachments.MAX_ATTACHMENTS_PER_RECORD).default([]);
const recordId = z.number().int().positive();

const subconIncomeSchema = z.object({
  workDate: dateInput,
  jobTitle: z.string().trim().min(1).max(180),
  clientName: textInput(160),
  location: textInput(240),
  incomeCents: centsInput,
  notes: textInput(2000),
  invoiceAttachmentIds: attachmentIdsInput,
});

const workerPaymentInput = z.object({
  staffId: z.number().int().positive(),
  amountCents: centsInput.refine(value => value > 0, "Amount must be greater than zero"),
});

const costLineInput = z.object({
  label: z.string().trim().min(1).max(120),
  amountCents: centsInput.refine(value => value > 0, "Amount must be greater than zero"),
  attachmentIds: attachmentIdsInput,
});

const subconOutgoingSchema = z.object({
  id: recordId,
  costLines: z.array(costLineInput).max(30),
  workerPayments: z.array(workerPaymentInput).max(50),
});

const chiliSaleSchema = z.object({
  saleDate: dateInput,
  customerId: z.number().int().positive(),
  quantityKg: z.number().positive().max(1_000_000),
  pricePerKgCents: centsInput,
  deliveryNotes: textInput(2000),
  attachmentIds: attachmentIdsInput,
});

const chiliExpenseSchema = z.object({
  expenseDate: dateInput,
  category: z.string().trim().min(1).max(120),
  amountCents: centsInput.refine(value => value > 0, "Amount must be greater than zero"),
  notes: textInput(2000),
  attachmentIds: attachmentIdsInput,
});

const yearReportInput = z
  .object({ from: dateInput, to: dateInput })
  .refine(range => range.to > range.from && range.to - range.from <= 367 * 86_400_000, "Invalid date range");

function expectedKinds(ids: number[], kind: AttachmentKind): Record<number, AttachmentKind> {
  return Object.fromEntries(ids.map(id => [id, kind]));
}

async function resolveCustomer(householdId: number, customerId: number) {
  const customer = await db.getCustomerById(householdId, customerId);
  if (!customer) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected customer was not found" });
  }
  return { customerId: customer.id, recipientName: customer.name, customerContact: customer.phone ?? customer.location ?? null };
}

function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} was not found` });
}

export const businessRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    // Only admins (Dad) run the Subcon business; everyone else gets a Chili-only view.
    const canSeeSubcon = ctx.user.role === "admin";
    const [subcon, chiliSales, chiliExpenses] = await Promise.all([
      canSeeSubcon ? db.listSubconJobs(ctx.user.householdId) : Promise.resolve([]),
      db.listChiliSales(ctx.user.householdId),
      db.listChiliExpenses(ctx.user.householdId),
    ]);
    const subconTotals = calculateSubconTotals(subcon);
    const chiliTotals = calculateChiliTotals(chiliSales, chiliExpenses);
    const incomeCents = subconTotals.incomeCents + chiliTotals.incomeCents;
    const outgoingsCents = subconTotals.outgoingsCents + chiliTotals.outgoingsCents;
    const recentActivity = [
      ...subcon.map(record => ({ id: `subcon-${record.id}`, date: record.workDate, kind: "Subcon job", title: record.jobTitle, amountCents: record.incomeCents - record.expenseCents - record.workerPaymentCents })),
      ...chiliSales.map(record => ({ id: `sale-${record.id}`, date: record.saleDate, kind: "Chili sale", title: record.recipientName, amountCents: record.totalCents })),
      ...chiliExpenses.map(record => ({ id: `expense-${record.id}`, date: record.expenseDate, kind: "Chili expense", title: record.category, amountCents: -record.amountCents })),
    ].sort((a, b) => b.date - a.date).slice(0, 6);
    return {
      incomeCents,
      outgoingsCents,
      profitCents: incomeCents - outgoingsCents,
      subcon: { ...subconTotals, profitCents: subconTotals.incomeCents - subconTotals.outgoingsCents },
      chili: { ...chiliTotals, profitCents: chiliTotals.incomeCents - chiliTotals.outgoingsCents },
      recentActivity,
      canSeeSubcon,
    };
  }),

  yearReport: protectedProcedure.input(yearReportInput).query(async ({ ctx, input }) => {
    const householdId = ctx.user.householdId;
    const canSeeSubcon = ctx.user.role === "admin";
    const inRange = (timestamp: number) => timestamp >= input.from && timestamp < input.to;
    const [jobs, sales, expenses] = await Promise.all([
      canSeeSubcon ? db.listSubconJobs(householdId) : Promise.resolve([]),
      db.listChiliSales(householdId),
      db.listChiliExpenses(householdId),
    ]);
    const subconJobs = jobs.filter(job => inRange(job.workDate)).sort((a, b) => a.workDate - b.workDate);
    const chiliSales = sales.filter(sale => inRange(sale.saleDate)).sort((a, b) => a.saleDate - b.saleDate);
    const chiliExpenses = expenses.filter(expense => inRange(expense.expenseDate)).sort((a, b) => a.expenseDate - b.expenseDate);
    const attachmentIds = [
      ...subconJobs.flatMap(job => [...job.invoiceAttachmentIds, ...job.costLines.flatMap(line => line.attachmentIds)]),
      ...chiliSales.flatMap(sale => sale.attachmentIds),
      ...chiliExpenses.flatMap(expense => expense.attachmentIds),
    ];
    const attachmentDocs = await attachments.getAttachmentsByIds(householdId, attachmentIds);
    const subconTotals = calculateSubconTotals(subconJobs);
    const chiliTotals = calculateChiliTotals(chiliSales, chiliExpenses);
    return {
      from: input.from,
      to: input.to,
      canSeeSubcon,
      subcon: canSeeSubcon ? { jobs: subconJobs, totals: { ...subconTotals, profitCents: subconTotals.incomeCents - subconTotals.outgoingsCents } } : null,
      chili: { sales: chiliSales, expenses: chiliExpenses, totals: { ...chiliTotals, profitCents: chiliTotals.incomeCents - chiliTotals.outgoingsCents } },
      attachments: attachmentDocs.map(doc => ({ id: doc.id, kind: doc.kind, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, hasThumb: doc.thumbFileId !== null, linkedType: doc.linkedType, linkedId: doc.linkedId })),
    };
  }),

  subcon: router({
    list: adminProcedure.query(({ ctx }) => db.listSubconJobs(ctx.user.householdId)),
    create: adminProcedure.input(subconIncomeSchema).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const expected = expectedKinds(input.invoiceAttachmentIds, "invoice");
      await attachments.validateNewAttachments(householdId, expected, "subconJob", -1);
      const id = await db.createSubconJob({ userId: householdId, ...input, expenseCents: 0, costLines: [], workerPayments: [], workerPaymentCents: 0 });
      await attachments.syncRecordAttachments({ householdId, linkedType: "subconJob", linkedId: id, expected, prevIds: [] });
      return { success: true, id };
    }),
    updateIncome: adminProcedure.input(subconIncomeSchema.extend({ id: recordId })).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const { id, ...changes } = input;
      const existing = (await db.getSubconJobById(householdId, id)) ?? notFound("Subcon job");
      const expected = expectedKinds(changes.invoiceAttachmentIds, "invoice");
      await attachments.validateNewAttachments(householdId, expected, "subconJob", id);
      await db.updateSubconJob(householdId, id, changes);
      await attachments.syncRecordAttachments({ householdId, linkedType: "subconJob", linkedId: id, expected, prevIds: existing.invoiceAttachmentIds });
      return { success: true };
    }),
    updateOutgoing: adminProcedure.input(subconOutgoingSchema).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const { id, costLines, workerPayments } = input;
      const existing = (await db.getSubconJobById(householdId, id)) ?? notFound("Subcon job");

      const staffIds = workerPayments.map(payment => payment.staffId);
      if (new Set(staffIds).size !== staffIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Each staff member can only appear once per job" });
      }
      const staff = await db.getStaffByIds(householdId, staffIds);
      if (staff.length !== staffIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected staff members were not found" });
      }
      const staffById = new Map(staff.map(member => [member.id, member]));
      const resolvedPayments = workerPayments.map(payment => ({
        staffId: payment.staffId,
        staffName: staffById.get(payment.staffId)!.name,
        amountCents: payment.amountCents,
      }));
      const workerPaymentCents = resolvedPayments.reduce((sum, payment) => sum + payment.amountCents, 0);

      const receiptIds = costLines.flatMap(line => line.attachmentIds);
      if (new Set(receiptIds).size !== receiptIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Each receipt can only be attached to one cost line" });
      }
      const expected = expectedKinds(receiptIds, "receipt");
      await attachments.validateNewAttachments(householdId, expected, "subconJob", id);
      const expenseCents = costLines.reduce((sum, line) => sum + line.amountCents, 0);

      await db.updateSubconJob(householdId, id, { expenseCents, costLines, workerPayments: resolvedPayments, workerPaymentCents });
      await attachments.syncRecordAttachments({
        householdId,
        linkedType: "subconJob",
        linkedId: id,
        // Invoices stay linked to the job; only diff the receipts this save controls.
        expected: { ...expected, ...expectedKinds(existing.invoiceAttachmentIds, "invoice") },
        prevIds: existing.costLines.flatMap(line => line.attachmentIds),
      });
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => {
      await db.deleteSubconJob(ctx.user.householdId, input.id);
      await attachments.deleteAttachmentsForRecord(ctx.user.householdId, "subconJob", input.id);
      return { success: true };
    }),
  }),

  chili: router({
    list: protectedProcedure.query(async ({ ctx }) => ({
      sales: await db.listChiliSales(ctx.user.householdId),
      expenses: await db.listChiliExpenses(ctx.user.householdId),
    })),
    createSale: protectedProcedure.input(chiliSaleSchema).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const expected = expectedKinds(input.attachmentIds, "invoice");
      await attachments.validateNewAttachments(householdId, expected, "chiliSale", -1);
      const customer = await resolveCustomer(householdId, input.customerId);
      const totalCents = calculateSaleTotalCents(input.quantityKg, input.pricePerKgCents);
      const id = await db.createChiliSale({ ...input, ...customer, userId: householdId, quantityKg: input.quantityKg.toFixed(2), totalCents });
      await attachments.syncRecordAttachments({ householdId, linkedType: "chiliSale", linkedId: id, expected, prevIds: [] });
      return { success: true, id };
    }),
    updateSale: protectedProcedure.input(chiliSaleSchema.extend({ id: recordId })).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const { id, ...changes } = input;
      const existing = (await db.getChiliSaleById(householdId, id)) ?? notFound("Chili sale");
      const expected = expectedKinds(changes.attachmentIds, "invoice");
      await attachments.validateNewAttachments(householdId, expected, "chiliSale", id);
      const customer = await resolveCustomer(householdId, changes.customerId);
      const totalCents = calculateSaleTotalCents(changes.quantityKg, changes.pricePerKgCents);
      await db.updateChiliSale(householdId, id, { ...changes, ...customer, quantityKg: changes.quantityKg.toFixed(2), totalCents });
      await attachments.syncRecordAttachments({ householdId, linkedType: "chiliSale", linkedId: id, expected, prevIds: existing.attachmentIds });
      return { success: true };
    }),
    deleteSale: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => {
      await db.deleteChiliSale(ctx.user.householdId, input.id);
      await attachments.deleteAttachmentsForRecord(ctx.user.householdId, "chiliSale", input.id);
      return { success: true };
    }),
    createExpense: protectedProcedure.input(chiliExpenseSchema).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const expected = expectedKinds(input.attachmentIds, "receipt");
      await attachments.validateNewAttachments(householdId, expected, "chiliExpense", -1);
      const id = await db.createChiliExpense({ ...input, userId: householdId });
      await attachments.syncRecordAttachments({ householdId, linkedType: "chiliExpense", linkedId: id, expected, prevIds: [] });
      return { success: true, id };
    }),
    updateExpense: protectedProcedure.input(chiliExpenseSchema.extend({ id: recordId })).mutation(async ({ ctx, input }) => {
      const householdId = ctx.user.householdId;
      const { id, ...changes } = input;
      const existing = (await db.getChiliExpenseById(householdId, id)) ?? notFound("Chili expense");
      const expected = expectedKinds(changes.attachmentIds, "receipt");
      await attachments.validateNewAttachments(householdId, expected, "chiliExpense", id);
      await db.updateChiliExpense(householdId, id, changes);
      await attachments.syncRecordAttachments({ householdId, linkedType: "chiliExpense", linkedId: id, expected, prevIds: existing.attachmentIds });
      return { success: true };
    }),
    deleteExpense: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => {
      await db.deleteChiliExpense(ctx.user.householdId, input.id);
      await attachments.deleteAttachmentsForRecord(ctx.user.householdId, "chiliExpense", input.id);
      return { success: true };
    }),
  }),
});
