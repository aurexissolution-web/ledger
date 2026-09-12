import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ ping: vi.fn() }));
vi.mock("./db", () => dbMock);

import { registerHealthRoutes } from "./_core/healthRoutes";

describe("/api/health", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let url: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    registerHealthRoutes(app);
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`;
  });
  afterEach(() => new Promise(resolve => server.close(resolve)));

  it("reports up after a real database query, without caching", async () => {
    dbMock.ping.mockResolvedValue(undefined);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, database: "up" });
    expect(dbMock.ping).toHaveBeenCalledTimes(1);
  });

  it("returns 503 with no details when the database is unreachable", async () => {
    dbMock.ping.mockRejectedValue(new Error("Invalid API key"));
    const res = await fetch(url);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, database: "down" });
  });
});
