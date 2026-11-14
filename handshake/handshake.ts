/**
 * handshake.ts : a small, copy-anywhere client for Handshake's EDU API.
 *
 * - No dependencies. Uses the standard fetch() that Deno (Supabase Edge
 *   Functions), Node 18+, and browsers all have.
 * - The API key is never written in code. Pass it in, or let fromEnv() read it.
 * - With no key it runs in DEMO mode and returns fake data, so you can build
 *   and show your app before the school approves API access.
 *
 * Handshake's EDU API is read-only and tied to one school. Access is granted
 * to a school's career services office, not to individual students.
 *
 * WHAT IS CONFIRMED vs GUESSED
 *   Confirmed from Handshake's public docs: base URL, the x-api-key header,
 *   the /v1/ prefix, the page_size and updated_since query parameters, and
 *   that /applications, /employers, /events, /event_attendance, /contacts
 *   and /collections exist.
 *   Guessed (check against the real docs once you have a key): the /jobs and
 *   /appointments paths, the pagination token name, and the field names on
 *   each record. Records are passed through untouched, so a wrong guess
 *   cannot corrupt your data.
 */

export type HandshakeRecord = Record<string, unknown>;

export interface ListParams {
  page_size?: number;
  /** ISO date-time. Only records changed since then (delta fetching). */
  updated_since?: string;
  sorting_column?: string;
  sorting_order?: "asc" | "desc";
  [extra: string]: string | number | undefined;
}

export interface HandshakeConfig {
  apiKey?: string;
  baseUrl?: string;
  /** Force demo data even when a key exists. */
  demo?: boolean;
  /** Give up on a request after this many milliseconds. Default 15000. */
  timeoutMs?: number;
}

export class HandshakeError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HandshakeError";
    this.status = status;
  }
}

const DEFAULT_BASE = "https://edu-api.joinhandshake.com/v1";

/** Reads HANDSHAKE_API_KEY (and optional HANDSHAKE_BASE_URL) from Deno or Node. */
export function fromEnv(): HandshakeConfig {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const get = (k: string): string | undefined =>
    g.Deno?.env?.get?.(k) ?? g.process?.env?.[k];
  return {
    apiKey: get("HANDSHAKE_API_KEY") || undefined,
    baseUrl: get("HANDSHAKE_BASE_URL") || undefined,
  };
}

export function createHandshakeClient(config: HandshakeConfig = fromEnv()) {
  const baseUrl = (config.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 15000;
  const demo = config.demo === true || !config.apiKey;

  /** One page of any endpoint. Use this for paths this file doesn't wrap yet. */
  async function get(path: string, params: ListParams = {}): Promise<unknown> {
    if (demo) return demoResponse(path);

    const url = new URL(baseUrl + "/" + path.replace(/^\/+/, ""));
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "x-api-key": config.apiKey!, accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        // Never include the key or full response body in the error.
        throw new HandshakeError(`Handshake returned ${res.status} for ${path}`, res.status);
      }
      return await res.json();
    } catch (e) {
      if (e instanceof HandshakeError) throw e;
      throw new HandshakeError(`Could not reach Handshake: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Pulls the array of records out of a response, whatever it's wrapped in. */
  function records(body: unknown): HandshakeRecord[] {
    if (Array.isArray(body)) return body as HandshakeRecord[];
    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      for (const key of ["data", "results", "items", "records"]) {
        if (Array.isArray(o[key])) return o[key] as HandshakeRecord[];
      }
    }
    return [];
  }

  /** First page only. */
  async function list(path: string, params: ListParams = {}): Promise<HandshakeRecord[]> {
    return records(await get(path, params));
  }

  /**
   * Follows pages until none are left (or maxPages, as a safety stop).
   * GUESS: assumes the response carries a next-page token under next_page,
   * next, or next_cursor. If Handshake uses something else, this returns just
   * the first page, which is safe, and you only need to edit tokenOf() below.
   */
  async function listAll(path: string, params: ListParams = {}, maxPages = 20): Promise<HandshakeRecord[]> {
    const tokenOf = (body: unknown): string | undefined => {
      if (!body || typeof body !== "object") return undefined;
      const o = body as Record<string, unknown>;
      const t = o.next_page ?? o.next ?? o.next_cursor;
      return typeof t === "string" || typeof t === "number" ? String(t) : undefined;
    };

    const out: HandshakeRecord[] = [];
    let page: string | undefined;
    for (let i = 0; i < maxPages; i++) {
      const body = await get(path, page ? { ...params, page } : params);
      out.push(...records(body));
      page = tokenOf(body);
      if (!page || demo) break;
    }
    return out;
  }

  return {
    /** "demo" means fake data, "live" means real Handshake calls. */
    mode: demo ? ("demo" as const) : ("live" as const),
    get,
    list,
    listAll,

    // Confirmed endpoints
    getEvents: (p?: ListParams) => list("events", p),
    getEmployers: (p?: ListParams) => list("employers", p),
    getApplications: (p?: ListParams) => list("applications", p),
    // Paths below are guesses. Check them against Handshake's endpoint list.
    getJobs: (p?: ListParams) => list("jobs", p),
    getAppointments: (p?: ListParams) => list("appointments", p),
  };
}

// ---------------------------------------------------------------------------
// Demo data. Invented and harmless. Field names are guesses, not Handshake's real ones.
// ---------------------------------------------------------------------------
function demoResponse(path: string): unknown {
  const p = path.replace(/^\/+/, "").split("?")[0];
  const data: Record<string, HandshakeRecord[]> = {
    events: [
      { id: "demo-e1", name: "Engineering Career Fair (demo)", starts_at: "2026-11-19T14:00:00Z", location: "Student Union Ballroom" },
      { id: "demo-e2", name: "Resume Review Night (demo)", starts_at: "2026-11-17T23:00:00Z", location: "Career Center" },
    ],
    employers: [{ id: "demo-m1", name: "Example Motors (demo)" }],
    jobs: [{ id: "demo-j1", title: "Mechanical Engineering Intern (demo)", employer: "Example Motors (demo)", apply_by: "2026-12-01" }],
    appointments: [{ id: "demo-a1", type: "Mock interview (demo)", starts_at: "2026-11-18T15:30:00Z" }],
    applications: [{ id: "demo-p1", job_id: "demo-j1", status: "submitted" }],
  };
  return { data: data[p] ?? [], demo: true };
}
