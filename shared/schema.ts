/**
 * Data types for MongoDB-backed collections.
 * Numeric `id`/`userId` fields are assigned by a Mongo counters collection
 * (see server/mongo.ts) so the rest of the app can keep treating them as
 * plain auto-incrementing integers, same as the previous MySQL schema.
 */

export const COLLECTIONS = {
  users: "users",
  subconJobs: "subcon_jobs",
  chiliSales: "chili_sales",
  chiliExpenses: "chili_expenses",
  staff: "staff",
  customers: "chili_customers",
  attachments: "attachments",
} as const;

/** GridFS bucket holding attachment bytes (creates `attachment_files.files` / `.chunks`). */
export const ATTACHMENT_BUCKET = "attachment_files";

export type AttachmentKind = "invoice" | "receipt";
export type AttachmentLinkType = "subconJob" | "chiliSale" | "chiliExpense";
export type AttachmentMime = "image/jpeg" | "application/pdf";

/** A receipt/invoice file. Bytes live in GridFS; this is the metadata row. */
export type Attachment = {
  id: number;
  /** Household scope, stored as `userId` like every other record. */
  userId: number;
  /** Profile that uploaded it; gates access while the file is still unlinked. */
  uploadedByUserId: number;
  kind: AttachmentKind;
  fileName: string;
  mimeType: AttachmentMime;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** GridFS ObjectId (hex) of the full file. */
  fileId: string;
  /** GridFS ObjectId (hex) of the client-made JPEG thumbnail; null for PDFs. */
  thumbFileId: string | null;
  /** null until a record save links it; unlinked files are swept after 24h. */
  linkedType: AttachmentLinkType | null;
  linkedId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SubconCostLine = {
  label: string;
  amountCents: number;
  attachmentIds: number[];
};

export type UserRole = "user" | "admin";

export type User = {
  id: number;
  /** Data scope shared by every profile in the family. Records store it as `userId`. */
  householdId: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  /** Salted scrypt hash; null for accounts that never set a PIN (e.g. legacy OAuth users). */
  pinHash: string | null;
  /** Failed PIN attempts since the last success or lockout. Stored in Mongo (not memory) so lockout survives serverless cold starts. */
  pinFailCount: number;
  /** Set once pinFailCount hits the limit; null when not locked. */
  pinLockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type PublicUser = Omit<User, "pinHash" | "pinFailCount" | "pinLockedUntil">;

export type InsertUser = {
  openId: string;
  householdId?: number;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: UserRole;
  lastSignedIn?: Date;
};

export type Staff = {
  id: number;
  userId: number;
  name: string;
  icNumber: string | null;
  bankAccountNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SubconWorkerPayment = {
  staffId: number;
  staffName: string;
  amountCents: number;
};

export type SubconJob = {
  id: number;
  userId: number;
  workDate: number;
  jobTitle: string;
  clientName: string | null;
  location: string | null;
  incomeCents: number;
  /** Derived, stored sum of `costLines[].amountCents`. */
  expenseCents: number;
  costLines: SubconCostLine[];
  invoiceAttachmentIds: number[];
  workerPayments: SubconWorkerPayment[];
  workerPaymentCents: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Someone who buys/takes chili from the family. */
export type Customer = {
  id: number;
  userId: number;
  name: string;
  phone: string | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChiliSale = {
  id: number;
  userId: number;
  saleDate: number;
  /** Roster reference; null on sales recorded before the customer roster existed. */
  customerId: number | null;
  /** Snapshots of the customer at sale time — survive later renames/deletions. */
  recipientName: string;
  customerContact: string | null;
  quantityKg: string;
  pricePerKgCents: number;
  totalCents: number;
  deliveryNotes: string | null;
  attachmentIds: number[];
  createdAt: Date;
  updatedAt: Date;
};

export type ChiliExpense = {
  id: number;
  userId: number;
  expenseDate: number;
  category: string;
  amountCents: number;
  notes: string | null;
  attachmentIds: number[];
  createdAt: Date;
  updatedAt: Date;
};
