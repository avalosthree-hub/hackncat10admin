# Handshake client (copy-anywhere)

One file, `handshake.ts`, that talks to Handshake's EDU API. No dependencies.
Copy it into any project (Supabase Edge Function, Node script, or server code).

Without an API key it runs in **demo mode** and returns fake data, so you can
build and demo before the school approves access.

## Getting a key

Handshake does not give keys to individual students. The school's **career
services office** requests EDU API access through its Handshake Relationship
Manager. The API is read-only and limited to that school's data.

## Use it

```ts
import { createHandshakeClient } from "./handshake.ts";

const hs = createHandshakeClient();      // reads HANDSHAKE_API_KEY from the environment
console.log(hs.mode);                    // "demo" until a key is set, then "live"

const events = await hs.getEvents({ page_size: 50 });
const recent = await hs.getEvents({ updated_since: "2026-11-01T00:00:00Z" });
const everything = await hs.listAll("events");   // follows pages
const other = await hs.list("collections");      // any endpoint, no new code needed
```

## Where the key goes

Never in the code or in Git. In Supabase, add a secret named
`HANDSHAKE_API_KEY` (the same way `OPENAI_API_KEY` was added). Locally, set it
as an environment variable.

## Example: Supabase Edge Function that only signed-in users can call

```ts
import { createHandshakeClient } from "./handshake.ts";

Deno.serve(async () => {
  const events = await createHandshakeClient().getEvents({ page_size: 25 });
  return new Response(JSON.stringify(events), {
    headers: { "content-type": "application/json" },
  });
});
```

Leave `verify_jwt` on (the default) for this one, so random visitors can't call it.

## What is confirmed and what is a guess

| Item | Status |
| --- | --- |
| Base URL, `x-api-key` header, `/v1`, `page_size`, `updated_since` | Confirmed in Handshake's docs |
| `/events`, `/employers`, `/applications` | Confirmed to exist |
| `/jobs`, `/appointments` paths | Guess. Check the endpoint list when you have access |
| Pagination token name (`next_page`, `next`, `next_cursor`) | Guess. Edit `tokenOf()` if it differs |
| Field names inside each record | Unknown. Records pass through untouched |

If a guess is wrong, you get a clear error (like 404), not bad data.

## Test it

```
node --experimental-strip-types handshake/test.ts
```

The test runs demo mode and a local fake server, and checks the key header,
paging, and error handling. It never contacts Handshake.
