import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const dbMock = vi.hoisted(() => ({
  listSubconJobs: vi.fn(),
  getSubconJobById: vi.fn(),
  createSubconJob: vi.fn(),
  updateSubconJob: vi.fn(),
  deleteSubconJob: vi.fn(),
  getStaffByIds: vi.fn(),
  getCustomerById: vi.fn(),
  listChiliSales: vi.fn(),
  getChiliSaleById: vi.fn(),
  createChiliSale: vi.fn(),
  updateChiliSale: vi.fn(),
  deleteChiliSale: vi.fn(),
  getChiliSalesByIds: vi.fn(),
  markChiliSalesPaid: vi.fn(),
  listChiliExpenses: vi.fn(),
  getChiliExpenseById: vi.fn(),
  createChiliExpense: vi.fn(),
  updateChiliExpense: vi.fn(),
  deleteChiliExpense: vi.fn(),
}));

const attachmentsMock = vi.hoisted(() => ({
  MAX_ATTACHMENTS_PER_RECORD: 8,
  validateNewAttachments: vi.fn(),
  syncRecordAttachments: vi.fn(),
  deleteAttachmentsForRecord: vi.fn(),
  getAttachmentsByIds: vi.fn(),
}));

vi.mock("../db", () => dbMock);
vi.mock("../attachments", () => attachmentsMock);

import { businessRouter } from "./business";

function createContext(userId = 47, role: "admin" | "user" = "admin"): TrpcContext {
  return {
    user: {
      id: userId,
      householdId: userId,
      pinHash: null,
      pinFailCount: 0,
      pinLockedUntil: null,
      openId: "record-owner",
      email: "owner@example.com",
      name: "Record Owner",
      loginMethod: "pin",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const existingJob = {
  id: 9,
  userId: 47,
  workDate: 1_700_000_000_000,
  jobTitle: "Cable termination",
  clientName: null,
  location: null,
  incomeCents: 150_000,
  expenseCents: 5_000,
  costLines: [{ label: "Old cost", amountCents: 5_000, attachmentIds: [21] }],
  invoiceAttachmentIds: [20],
  workerPayments: [],
  workerPaymentCents: 0,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const subconIncomeInput = {
  workDate: 1_700_000_000_000,
  jobTitle: "Cable termination",
  clientName: "A client",
  location: "A site",
  incomeCents: 150_000,
  notes: "Completed safely",
  invoiceAttachmentIds: [20],
};

const subconOutgoingInput = {
  costLines: [
    { label: "Materials", amountCents: 10_000, attachmentIds: [31] },
    { label: "Transport", amountCents: 2_500, attachmentIds: [] },
  ],
  workerPayments: [{ staffId: 5, amountCents: 45_000 }],
};

const chiliSaleInput = {
  saleDate: 1_700_000_000_000,
  customerId: 3,
  grades: [{ grade: "A" as const, quantityKg: 15.5, pricePerKgCents: 850 }],
  deliveryNotes: "Collected at farm gate",
  attachmentIds: [40],
};

describe("business procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.listSubconJobs.mockResolvedValue([]);
    dbMock.listChiliSales.mockResolvedValue([]);
    dbMock.listChiliExpenses.mockResolvedValue([]);
    dbMock.getSubconJobById.mockResolvedValue(existingJob);
    dbMock.createSubconJob.mockResolvedValue(77);
    dbMock.updateSubconJob.mockResolvedValue(undefined);
    dbMock.deleteSubconJob.mockResolvedValue(undefined);
    dbMock.getStaffByIds.mockResolvedValue([{ id: 5, userId: 47, name: "A worker", icNumber: null, bankAccountNumber: null }]);
    dbMock.getCustomerById.mockResolvedValue({ id: 3, userId: 81, name: "Market customer", phone: "012-0000000", location: null });
    dbMock.getChiliSaleById.mockResolvedValue({ id: 11, attachmentIds: [41] });
    dbMock.getChiliExpenseById.mockResolvedValue({ id: 14, attachmentIds: [] });
    dbMock.createChiliSale.mockResolvedValue(88);
    dbMock.createChiliExpense.mockResolvedValue(89);
    dbMock.updateChiliSale.mockResolvedValue(undefined);
    dbMock.deleteChiliSale.mockResolvedValue(undefined);
    dbMock.markChiliSalesPaid.mockResolvedValue(undefined);
    dbMock.deleteChiliExpense.mockResolvedValue(undefined);
    attachmentsMock.validateNewAttachments.mockResolvedValue(undefined);
    attachmentsMock.syncRecordAttachments.mockResolvedValue(undefined);
    attachmentsMock.deleteAttachmentsForRecord.mockResolvedValue(undefined);
    attachmentsMock.getAttachmentsByIds.mockResolvedValue([]);
  });

  it("scopes Subcon list, income update, and delete operations to the signed-in user", async () => {
    const caller = businessRouter.createCaller(createContext(47));

    await caller.subcon.list();
    await caller.subcon.updateIncome({ id: 9, ...subconIncomeInput });
    await caller.subcon.delete({ id: 9 });

    expect(dbMock.listSubconJobs).toHaveBeenCalledWith(47);
    expect(dbMock.updateSubconJob).toHaveBeenCalledWith(47, 9, expect.objectContaining({ jobTitle: "Cable termination", invoiceAttachmentIds: [20] }));
    expect(dbMock.deleteSubconJob).toHaveBeenCalledWith(47, 9);
    expect(attachmentsMock.deleteAttachmentsForRecord).toHaveBeenCalledWith(47, "subconJob", 9);
  });

  it("links a new job's invoice after inserting it", async () => {
    const caller = businessRouter.createCaller(createContext(47));

    await caller.subcon.create(subconIncomeInput);

    expect(attachmentsMock.validateNewAttachments).toHaveBeenCalledWith(47, { 20: "invoice" }, "subconJob", -1);
    expect(dbMock.createSubconJob).toHaveBeenCalledWith(expect.objectContaining({ userId: 47, costLines: [], expenseCents: 0 }));
    expect(attachmentsMock.syncRecordAttachments).toHaveBeenCalledWith({ householdId: 47, linkedType: "subconJob", linkedId: 77, expected: { 20: "invoice" }, prevIds: [] });
  });

  it("itemises Subcon costs, derives the total, and syncs receipts against the previous lines", async () => {
    const caller = businessRouter.createCaller(createContext(47));

    await caller.subcon.updateOutgoing({ id: 9, ...subconOutgoingInput });

    expect(dbMock.getStaffByIds).toHaveBeenCalledWith(47, [5]);
    expect(dbMock.updateSubconJob).toHaveBeenCalledWith(47, 9, {
      expenseCents: 12_500,
      costLines: subconOutgoingInput.costLines,
      workerPayments: [{ staffId: 5, staffName: "A worker", amountCents: 45_000 }],
      workerPaymentCents: 45_000,
    });
    expect(attachmentsMock.syncRecordAttachments).toHaveBeenCalledWith({
      householdId: 47,
      linkedType: "subconJob",
      linkedId: 9,
      expected: { 31: "receipt", 20: "invoice" },
      prevIds: [21],
    });
  });

  it("rejects the same receipt on two cost lines", async () => {
    const caller = businessRouter.createCaller(createContext(47));
    const duplicate = { ...subconOutgoingInput, costLines: [{ label: "A", amountCents: 1, attachmentIds: [31] }, { label: "B", amountCents: 1, attachmentIds: [31] }] };

    await expect(caller.subcon.updateOutgoing({ id: 9, ...duplicate })).rejects.toThrow(/one cost line/);
    expect(dbMock.updateSubconJob).not.toHaveBeenCalled();
  });

  it("rejects Subcon outgoing payments for staff the caller does not own", async () => {
    dbMock.getStaffByIds.mockResolvedValue([]);
    const caller = businessRouter.createCaller(createContext(47));

    await expect(caller.subcon.updateOutgoing({ id: 9, ...subconOutgoingInput })).rejects.toThrow();
    expect(dbMock.updateSubconJob).not.toHaveBeenCalled();
  });

  it("blocks non-admin profiles from Subcon and hides it from their overview", async () => {
    const caller = businessRouter.createCaller(createContext(52, "user"));

    await expect(caller.subcon.list()).rejects.toThrow();
    await expect(caller.subcon.create({ workDate: 1_700_000_000_000, jobTitle: "Hidden", clientName: "", location: "", incomeCents: 1, notes: "" })).rejects.toThrow();

    const overview = await caller.overview();

    expect(dbMock.listSubconJobs).not.toHaveBeenCalled();
    expect(dbMock.listChiliSales).toHaveBeenCalledWith(52);
    expect(overview.canSeeSubcon).toBe(false);
  });

  it("scopes Chili reads and record changes to the signed-in user and syncs invoices", async () => {
    const caller = businessRouter.createCaller(createContext(81));

    await caller.chili.list();
    await caller.chili.updateSale({ id: 11, ...chiliSaleInput });
    await caller.chili.deleteExpense({ id: 14 });

    expect(dbMock.listChiliSales).toHaveBeenCalledWith(81);
    expect(dbMock.listChiliExpenses).toHaveBeenCalledWith(81);
    expect(dbMock.getCustomerById).toHaveBeenCalledWith(81, 3);
    expect(dbMock.updateChiliSale).toHaveBeenCalledWith(81, 11, expect.objectContaining({ customerId: 3, recipientName: "Market customer", customerContact: "012-0000000", totalCents: 13_175, attachmentIds: [40] }));
    expect(attachmentsMock.syncRecordAttachments).toHaveBeenCalledWith({ householdId: 81, linkedType: "chiliSale", linkedId: 11, expected: { 40: "invoice" }, prevIds: [41] });
    expect(dbMock.deleteChiliExpense).toHaveBeenCalledWith(81, 14);
    expect(attachmentsMock.deleteAttachmentsForRecord).toHaveBeenCalledWith(81, "chiliExpense", 14);
  });

  it("stores both grades of a Chili sale as lines with derived sale totals", async () => {
    const caller = businessRouter.createCaller(createContext(81));

    await caller.chili.createSale({ ...chiliSaleInput, grades: [{ grade: "B", quantityKg: 20, pricePerKgCents: 800 }, { grade: "A", quantityKg: 30, pricePerKgCents: 1_200 }] });

    const record = dbMock.createChiliSale.mock.calls[0][0];
    expect(record).toMatchObject({
      userId: 81,
      customerId: 3,
      recipientName: "Market customer",
      gradeLines: [
        { grade: "A", quantityKg: "30.00", pricePerKgCents: 1_200, totalCents: 36_000 },
        { grade: "B", quantityKg: "20.00", pricePerKgCents: 800, totalCents: 16_000 },
      ],
      quantityKg: "50.00",
      pricePerKgCents: 1_040,
      totalCents: 52_000,
    });
    expect(record).not.toHaveProperty("grades");
  });

  it("rejects Chili sales with no grades or the same grade twice", async () => {
    const caller = businessRouter.createCaller(createContext(81));

    await expect(caller.chili.createSale({ ...chiliSaleInput, grades: [] })).rejects.toThrow(/at least one grade/);
    await expect(caller.chili.createSale({ ...chiliSaleInput, grades: [{ grade: "A", quantityKg: 1, pricePerKgCents: 100 }, { grade: "A", quantityKg: 2, pricePerKgCents: 100 }] })).rejects.toThrow(/only appear once/);
    expect(dbMock.createChiliSale).not.toHaveBeenCalled();
  });

  it("records whether a Chili sale is paid, and rejects a payment dated before the sale", async () => {
    const caller = businessRouter.createCaller(createContext(81));
    const day = 86_400_000;

    await caller.chili.createSale(chiliSaleInput);
    await caller.chili.createSale({ ...chiliSaleInput, paidAt: chiliSaleInput.saleDate + day });
    await caller.chili.updateSale({ id: 11, ...chiliSaleInput, paidAt: null });

    expect(dbMock.createChiliSale.mock.calls.map(([record]) => record.paidAt)).toEqual([null, chiliSaleInput.saleDate + day]);
    expect(dbMock.updateChiliSale).toHaveBeenCalledWith(81, 11, expect.objectContaining({ paidAt: null }));
    await expect(caller.chili.createSale({ ...chiliSaleInput, paidAt: chiliSaleInput.saleDate - day })).rejects.toThrow(/before the sale date/);
    await expect(caller.chili.updateSale({ id: 11, ...chiliSaleInput, paidAt: chiliSaleInput.saleDate - day })).rejects.toThrow(/before the sale date/);
    expect(dbMock.createChiliSale).toHaveBeenCalledTimes(2);
  });

  it("marks several of the household's sales paid at once", async () => {
    const saleDate = 1_700_000_000_000;
    dbMock.getChiliSalesByIds.mockResolvedValue([{ id: 5, saleDate }, { id: 6, saleDate: saleDate + 1 }]);
    const caller = businessRouter.createCaller(createContext(81));

    await expect(caller.chili.markPaid({ ids: [5, 6, 5], paidAt: saleDate + 5 })).resolves.toEqual({ success: true, count: 2 });
    expect(dbMock.getChiliSalesByIds).toHaveBeenCalledWith(81, [5, 6]);
    expect(dbMock.markChiliSalesPaid).toHaveBeenCalledWith(81, [5, 6], saleDate + 5);
  });

  it("refuses to mark unknown sales paid or date a payment before a sale", async () => {
    const saleDate = 1_700_000_000_000;
    const caller = businessRouter.createCaller(createContext(81));

    dbMock.getChiliSalesByIds.mockResolvedValue([{ id: 5, saleDate }]);
    await expect(caller.chili.markPaid({ ids: [5, 99], paidAt: saleDate })).rejects.toThrow(/not found/);
    await expect(caller.chili.markPaid({ ids: [5], paidAt: saleDate - 1 })).rejects.toThrow(/before the sale date/);
    await expect(caller.chili.markPaid({ ids: [], paidAt: saleDate })).rejects.toThrow();
    expect(dbMock.markChiliSalesPaid).not.toHaveBeenCalled();
  });

  it("reports how much is still owed for chili in the overview", async () => {
    dbMock.listChiliSales.mockResolvedValue([
      { id: 1, saleDate: 1, customerId: 3, recipientName: "Kedai", totalCents: 36_000, paidAt: null },
      { id: 2, saleDate: 2, customerId: 3, recipientName: "Kedai", totalCents: 20_000, paidAt: null },
      { id: 3, saleDate: 3, customerId: 4, recipientName: "Pasar", totalCents: 9_000, paidAt: 3 },
    ]);
    const overview = await businessRouter.createCaller(createContext(81)).overview();

    expect(overview.chili).toMatchObject({ incomeCents: 65_000, owedCents: 56_000, owedCount: 2 });
  });

  it("rejects Chili sales for a customer the household does not own", async () => {
    dbMock.getCustomerById.mockResolvedValue(undefined);
    const caller = businessRouter.createCaller(createContext(81));

    await expect(caller.chili.createSale(chiliSaleInput)).rejects.toThrow(/not found/);
    expect(dbMock.createChiliSale).not.toHaveBeenCalled();
  });

  describe("yearReport", () => {
    const from = new Date(2026, 0, 1).getTime();
    const to = new Date(2027, 0, 1).getTime();

    it("filters records to the range (from inclusive, to exclusive) and collects their attachments", async () => {
      dbMock.listSubconJobs.mockResolvedValue([
        { ...existingJob, id: 1, workDate: from, invoiceAttachmentIds: [1], costLines: [{ label: "x", amountCents: 100, attachmentIds: [2] }], expenseCents: 100, incomeCents: 1000 },
        { ...existingJob, id: 2, workDate: to, invoiceAttachmentIds: [3], costLines: [], expenseCents: 0, incomeCents: 5 },
        { ...existingJob, id: 3, workDate: from - 1, invoiceAttachmentIds: [4], costLines: [], expenseCents: 0, incomeCents: 7 },
      ]);
      dbMock.listChiliSales.mockResolvedValue([{ id: 5, saleDate: from + 1000, totalCents: 500, attachmentIds: [6] }]);
      dbMock.listChiliExpenses.mockResolvedValue([{ id: 7, expenseDate: to - 1, amountCents: 50, attachmentIds: [] }]);
      const caller = businessRouter.createCaller(createContext(47));

      const report = await caller.yearReport({ from, to });

      expect(report.subcon?.jobs.map(job => job.id)).toEqual([1]);
      expect(report.subcon?.totals).toEqual({ incomeCents: 1000, outgoingsCents: 100, workerPaymentsCents: 0, profitCents: 900 });
      expect(report.chili.totals).toEqual({ incomeCents: 500, outgoingsCents: 50, profitCents: 450 });
      expect(attachmentsMock.getAttachmentsByIds).toHaveBeenCalledWith(47, [1, 2, 6]);
    });

    it("gives non-admin profiles a Chili-only report without touching Subcon data", async () => {
      const caller = businessRouter.createCaller(createContext(52, "user"));

      const report = await caller.yearReport({ from, to });

      expect(report.subcon).toBeNull();
      expect(report.canSeeSubcon).toBe(false);
      expect(dbMock.listSubconJobs).not.toHaveBeenCalled();
    });

    it("rejects ranges longer than a year", async () => {
      const caller = businessRouter.createCaller(createContext(47));
      await expect(caller.yearReport({ from, to: from + 400 * 86_400_000 })).rejects.toThrow();
    });
  });
});
