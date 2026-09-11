import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PublicUser, User, UserRole } from "../shared/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { PIN_PATTERN, hashPin, verifyPin } from "./_core/pin";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import type { TrpcContext } from "./_core/context";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { attachmentsRouter } from "./routers/attachments";
import { businessRouter } from "./routers/business";
import { customersRouter } from "./routers/customers";
import { staffRouter } from "./routers/staff";

const pinInput = z.string().regex(PIN_PATTERN, "PIN must be 4 to 6 digits");

// The family's two fixed profiles. Dad runs both businesses; Sanjay only the
// chili side, so he gets the restricted "user" role. Both start with the same
// default PIN and change it from Settings.
export const DEFAULT_PIN = "1234";
const DEFAULT_PROFILES: { name: string; role: UserRole }[] = [
  { name: "Dad", role: "admin" },
  { name: "Sanjay", role: "user" },
];

let seeding: Promise<void> | null = null;

async function ensureProfiles() {
  const existing = await db.listProfiles();
  if (existing.length > 0) return existing;
  seeding ??= (async () => {
    const householdId = await db.allocateHouseholdId();
    const pinHash = await hashPin(DEFAULT_PIN);
    for (const profile of DEFAULT_PROFILES) {
      await db.createProfileUser({ householdId, name: profile.name, role: profile.role, pinHash });
    }
  })().finally(() => { seeding = null; });
  await seeding;
  return db.listProfiles();
}

function toPublicUser(user: User): PublicUser {
  const { pinHash, ...publicUser } = user;
  return publicUser;
}

async function startSession(ctx: TrpcContext, user: User) {
  const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "", expiresInMs: ONE_YEAR_MS });
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? toPublicUser(ctx.user) : null)),
    profiles: publicProcedure.query(async () => {
      const profiles = await ensureProfiles();
      return profiles.map(profile => ({ id: profile.id, name: profile.name ?? "Profile", role: profile.role }));
    }),
    loginWithPin: publicProcedure.input(z.object({ userId: z.number().int().positive(), pin: pinInput })).mutation(async ({ ctx, input }) => {
      const lockMs = await db.getPinLockRemainingMs(input.userId);
      if (lockMs > 0) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many attempts. Try again in ${Math.ceil(lockMs / 1000)}s.` });
      }
      const user = await db.getUserById(input.userId);
      if (!user?.pinHash || !(await verifyPin(input.pin, user.pinHash))) {
        const remaining = await db.recordPinFailure(input.userId);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: remaining > 0 ? `Incorrect PIN. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} left.` : "Too many attempts. This profile is locked for 1 minute.",
        });
      }
      await db.clearPinFailures(user.id);
      await db.touchLastSignedIn(user.id);
      await startSession(ctx, user);
      return { success: true };
    }),
    changePin: protectedProcedure.input(z.object({ currentPin: pinInput, newPin: pinInput })).mutation(async ({ ctx, input }) => {
      if (!ctx.user.pinHash || !(await verifyPin(input.currentPin, ctx.user.pinHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current PIN is incorrect" });
      }
      await db.setUserPin(ctx.user.id, await hashPin(input.newPin));
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  business: businessRouter,
  staff: staffRouter,
  customers: customersRouter,
  attachments: attachmentsRouter,
});

export type AppRouter = typeof appRouter;
