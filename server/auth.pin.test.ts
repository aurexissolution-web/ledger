import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../shared/schema";
import type { TrpcContext } from "./_core/context";

const dbMock = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  allocateHouseholdId: vi.fn(),
  createProfileUser: vi.fn(),
  getUserById: vi.fn(),
  touchLastSignedIn: vi.fn(),
  setUserPin: vi.fn(),
  getPinLockRemainingMs: vi.fn(),
  recordPinFailure: vi.fn(),
  clearPinFailures: vi.fn(),
}));

const sdkMock = vi.hoisted(() => ({ createSessionToken: vi.fn() }));

vi.mock("./db", () => dbMock);
vi.mock("./_core/sdk", async importOriginal => ({ ...(await importOriginal<object>()), sdk: sdkMock }));

import { hashPin, verifyPin } from "./_core/pin";
import { DEFAULT_PIN, appRouter } from "./routers";

function profileUser(id: number, pinHash: string, name = "Dad", role: User["role"] = "admin"): User {
  return { id, householdId: 1, openId: `profile-${id}`, name, email: null, loginMethod: "pin", role, pinHash, pinFailCount: 0, pinLockedUntil: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

function createContext(user: User | null = null) {
  const cookies: { name: string; value: string }[] = [];
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { cookies.push({ name, value }); } } as unknown as TrpcContext["res"],
  };
  return { ctx, cookies };
}

describe("auth profiles + PIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.createSessionToken.mockResolvedValue("session-token");
    dbMock.allocateHouseholdId.mockResolvedValue(1);
    dbMock.touchLastSignedIn.mockResolvedValue(undefined);
    dbMock.setUserPin.mockResolvedValue(undefined);
    dbMock.getPinLockRemainingMs.mockResolvedValue(0);
    dbMock.clearPinFailures.mockResolvedValue(undefined);
  });

  it("seeds Dad (full access) and Sanjay (chili only) in one household on first use", async () => {
    const created: { householdId: number; name: string; role: string; pinHash: string }[] = [];
    dbMock.listProfiles.mockImplementation(async () => created.map((profile, index) => ({ id: index + 1, name: profile.name, role: profile.role, householdId: profile.householdId })));
    dbMock.createProfileUser.mockImplementation(async (input: (typeof created)[number]) => { created.push(input); return profileUser(created.length, input.pinHash, input.name); });
    const caller = appRouter.createCaller(createContext().ctx);

    const profiles = await caller.auth.profiles();

    expect(profiles).toEqual([{ id: 1, name: "Dad", role: "admin" }, { id: 2, name: "Sanjay", role: "user" }]);
    expect(created.every(profile => profile.householdId === 1)).toBe(true);
    expect(created[0].pinHash).not.toContain(DEFAULT_PIN);
    await expect(verifyPin(DEFAULT_PIN, created[0].pinHash)).resolves.toBe(true);
  });

  it("does not seed again once profiles exist", async () => {
    dbMock.listProfiles.mockResolvedValue([{ id: 1, name: "Dad", role: "admin", householdId: 1 }]);
    const caller = appRouter.createCaller(createContext().ctx);

    await caller.auth.profiles();

    expect(dbMock.createProfileUser).not.toHaveBeenCalled();
  });

  it("signs in with the correct PIN and sets the session cookie", async () => {
    dbMock.getUserById.mockResolvedValue(profileUser(7, await hashPin("1234")));
    const { ctx, cookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.loginWithPin({ userId: 7, pin: "1234" })).resolves.toEqual({ success: true });

    expect(cookies).toEqual([{ name: "app_session_id", value: "session-token" }]);
    expect(sdkMock.createSessionToken).toHaveBeenCalledWith("profile-7", expect.objectContaining({ name: "Dad" }));
    expect(dbMock.touchLastSignedIn).toHaveBeenCalledWith(7);
  });

  it("rejects a wrong PIN and locks the profile after five failures (state kept in the database, not memory)", async () => {
    dbMock.getUserById.mockResolvedValue(profileUser(8, await hashPin("1234")));
    // Simulate the stateful database counter/lock that db.recordPinFailure/getPinLockRemainingMs
    // would maintain — this is exactly what makes lockout survive a serverless cold start.
    let failCount = 0;
    let lockedUntil = 0;
    dbMock.getPinLockRemainingMs.mockImplementation(async () => Math.max(0, lockedUntil - Date.now()));
    dbMock.recordPinFailure.mockImplementation(async () => {
      failCount += 1;
      if (failCount >= 5) {
        lockedUntil = Date.now() + 60_000;
        failCount = 0;
        return 0;
      }
      return 5 - failCount;
    });
    const { ctx, cookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.loginWithPin({ userId: 8, pin: "0000" })).rejects.toThrow(/Incorrect PIN\. 4 attempts left/);
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(caller.auth.loginWithPin({ userId: 8, pin: "0000" })).rejects.toThrow();
    }
    await expect(caller.auth.loginWithPin({ userId: 8, pin: "0000" })).rejects.toThrow(/Too many attempts.*locked/);
    await expect(caller.auth.loginWithPin({ userId: 8, pin: "1234" })).rejects.toThrow(/Too many attempts.*Try again/);
    expect(cookies).toHaveLength(0);
  });

  it("never exposes the PIN hash through auth.me", async () => {
    const caller = appRouter.createCaller(createContext(profileUser(9, await hashPin("1234"))).ctx);

    const me = await caller.auth.me();

    expect(me?.name).toBe("Dad");
    expect(me).not.toHaveProperty("pinHash");
  });

  it("changes the PIN only when the current PIN is correct", async () => {
    const caller = appRouter.createCaller(createContext(profileUser(10, await hashPin("1234"))).ctx);

    await expect(caller.auth.changePin({ currentPin: "9999", newPin: "4321" })).rejects.toThrow(/Current PIN is incorrect/);
    expect(dbMock.setUserPin).not.toHaveBeenCalled();

    await expect(caller.auth.changePin({ currentPin: "1234", newPin: "4321" })).resolves.toEqual({ success: true });
    expect(dbMock.setUserPin).toHaveBeenCalledWith(10, expect.not.stringContaining("4321"));
  });
});
