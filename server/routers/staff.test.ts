import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const dbMock = vi.hoisted(() => ({
  listStaff: vi.fn(),
  getStaffByIds: vi.fn(),
  createStaff: vi.fn(),
  updateStaff: vi.fn(),
  deleteStaff: vi.fn(),
}));

vi.mock("../db", () => dbMock);

import { staffRouter } from "./staff";

function createContext(userId = 47): TrpcContext {
  return {
    user: {
      id: userId,
      householdId: userId,
      pinHash: null,
      openId: "record-owner",
      email: "owner@example.com",
      name: "Record Owner",
      loginMethod: "pin",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const staffInput = {
  name: "A worker",
  icNumber: "990101-01-1234",
  bankAccountNumber: "1234567890",
};

describe("staff procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.listStaff.mockResolvedValue([]);
    dbMock.updateStaff.mockResolvedValue(undefined);
    dbMock.deleteStaff.mockResolvedValue(undefined);
  });

  it("scopes Staff list, update, and delete operations to the signed-in user", async () => {
    const caller = staffRouter.createCaller(createContext(47));

    await caller.list();
    await caller.update({ id: 9, ...staffInput });
    await caller.delete({ id: 9 });

    expect(dbMock.listStaff).toHaveBeenCalledWith(47);
    expect(dbMock.updateStaff).toHaveBeenCalledWith(47, 9, expect.objectContaining({ name: "A worker" }));
    expect(dbMock.deleteStaff).toHaveBeenCalledWith(47, 9);
  });

  it("creates a staff member scoped to the signed-in user", async () => {
    const caller = staffRouter.createCaller(createContext(47));

    await caller.create(staffInput);

    expect(dbMock.createStaff).toHaveBeenCalledWith(expect.objectContaining({ userId: 47, name: "A worker" }));
  });
});
