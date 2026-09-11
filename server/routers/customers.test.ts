import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const dbMock = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  getCustomerById: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

vi.mock("../db", () => dbMock);

import { customersRouter } from "./customers";

function createContext(householdId = 47, role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: 900,
      householdId,
      pinHash: null,
      pinFailCount: 0,
      pinLockedUntil: null,
      openId: "record-owner",
      email: null,
      name: "Sanjay",
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

const customerInput = { name: "Pasar Tani stall", phone: "012-3456789", location: "Seremban" };

describe("customers procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.listCustomers.mockResolvedValue([]);
    dbMock.updateCustomer.mockResolvedValue(undefined);
    dbMock.deleteCustomer.mockResolvedValue(undefined);
  });

  it("lets a non-admin (chili) profile manage customers scoped to the household", async () => {
    const caller = customersRouter.createCaller(createContext(47, "user"));

    await caller.list();
    await caller.create(customerInput);
    await caller.update({ id: 9, ...customerInput, phone: "" });
    await caller.delete({ id: 9 });

    expect(dbMock.listCustomers).toHaveBeenCalledWith(47);
    expect(dbMock.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ userId: 47, name: "Pasar Tani stall", phone: "012-3456789" }));
    expect(dbMock.updateCustomer).toHaveBeenCalledWith(47, 9, expect.objectContaining({ name: "Pasar Tani stall", phone: null }));
    expect(dbMock.deleteCustomer).toHaveBeenCalledWith(47, 9);
  });
});
