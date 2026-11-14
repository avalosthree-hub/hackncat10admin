// Run: node --experimental-strip-types handshake/test.ts
import http from "node:http";
import assert from "node:assert/strict";
import { createHandshakeClient, HandshakeError } from "./handshake.ts";

// 1. Demo mode: no key means fake data and no network.
const demo = createHandshakeClient({});
assert.equal(demo.mode, "demo");
const ev = await demo.getEvents();
assert.ok(ev.length > 0 && String(ev[0].name).includes("demo"));
console.log("demo mode ok:", ev.length, "events");

// 2. Live mode against a local fake server: header, params, paging, errors.
const seen: { key?: string; url?: string }[] = [];
const server = http.createServer((req, res) => {
  seen.push({ key: req.headers["x-api-key"] as string, url: req.url });
  if (req.headers["x-api-key"] !== "test-key") { res.statusCode = 401; return res.end("{}"); }
  const u = new URL(req.url!, "http://x");
  if (u.pathname === "/v1/events") {
    const page = u.searchParams.get("page");
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(page
      ? { data: [{ id: 3 }] }
      : { data: [{ id: 1 }, { id: 2 }], next_page: "2" }));
  }
  res.statusCode = 404; res.end("{}");
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}/v1`;

const live = createHandshakeClient({ apiKey: "test-key", baseUrl: base });
assert.equal(live.mode, "live");
const first = await live.getEvents({ page_size: 2, updated_since: "2026-01-01T00:00:00Z" });
assert.equal(first.length, 2);
assert.ok(seen[0].url!.includes("page_size=2") && seen[0].url!.includes("updated_since="));
const all = await live.listAll("events");
assert.deepEqual(all.map((r) => r.id), [1, 2, 3]);
console.log("live mode ok: key header sent, params sent, paging followed");

await assert.rejects(
  createHandshakeClient({ apiKey: "wrong", baseUrl: base }).getEvents(),
  (e: any) => e instanceof HandshakeError && e.status === 401 && !e.message.includes("wrong"),
);
await assert.rejects(live.getJobs(), (e: any) => e.status === 404);
console.log("errors ok: 401 and 404 surfaced, key not leaked");

// 3. forced demo ignores a real key
assert.equal(createHandshakeClient({ apiKey: "k", demo: true }).mode, "demo");
server.close();
console.log("ALL PASSED");
