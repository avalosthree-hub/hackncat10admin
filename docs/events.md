# Shared event administration

The admin dashboard and student website use the **same** `public.events`, `public.event_rsvps`, and `public.event_calendar_links` tables in the connected Aggie Fetch project. No parallel event or RSVP table was created. The additive event administration migration has been applied to that project. Other environments must already contain the shared Aggie Fetch schema before applying it; the legacy `001_init.sql` is not a baseline for this feature.

## Staff workflow

Visit `#/admin/events` from Events in the existing navigation. Search titles, filter by mailing list, source or publication state, sort by date/title/recent update, and page through results. Open an event to view attendance metrics and paginated attendees filtered by status. Each attendee exposes only account email, attendance status and RSVP update time; no profile directory or Outlook credentials are exposed.

Create a curated event with title, description, mailing list, local start and IANA time zone. End, location/address, HTTPS meeting/registration links, internal RSVP and positive integer capacity are optional. Dates are resolved by the database in the selected zone, independently of the browser's zone. Nonexistent or ambiguous daylight-saving times are rejected. Preview precedes draft saving or publication. All edits retain IDs and existing RSVPs; optimistic `updated_at` checks reject stale writes.

Derived event review displays the source email ID/key, extraction verification and supporting evidence separately from current administrator-corrected details. Authorized administrators can view the original email as inert, read-only text. Corrections protect the event from AI reprocessing, including publication decisions. Incomplete derived dates remain unknown. Admin edits never rewrite the source email.

Use **Claim event** on a derived event card or detail page to open **Verify and claim event**. Review or correct its prefilled information, supply the required start time, preview the details, and check the verification acknowledgment. **Confirm and claim event** atomically saves the corrections and converts the same event to curated. Closing the popup makes no changes. Claiming retains publication status, event ID, RSVPs, calendar links, source email, extraction evidence and unique source key; it protects the event from AI reprocessing. Claimed events appear under Curated Events, with their original email still available in the detail view. Cancelled events cannot be claimed. Concurrent changes reject stale claims and require a refresh.

An Aggie Fetch RSVP is separate from external registration and Outlook calendar addition. Interested does not reserve capacity. The dashboard can unpublish (draft), hide inaccurate derived events (withdrawn), or cancel. Cancellation records server time and optional reason, disables RSVP and retains history. Cancelled events cannot be republished; create a new event when appropriate.

Deletion requires confirmation and is rejected for any event with RSVP, calendar-link or cancellation history. Source email deletion is restricted while derived events reference it. Mailing lists referenced by events also remain protected by the existing foreign key. Retain these lists/events to preserve history.

## Shared data contract

The existing status values remain `draft`, `published`, `withdrawn`. Hidden and cancelled events both use `withdrawn`; **`cancelled_at IS NOT NULL` distinguishes cancellation**, with `cancellation_reason` preserving its explanation. This preserves the student feed's existing publication checks without introducing an incompatible status value. `online_url` is an optional HTTPS meeting link, separate from `registration_url`.

`source_email_post_id`, `source_event_key`, event/list/institution IDs and creation identity are immutable. The only source-type transition is an institution administrator claiming a non-cancelled derived event as curated. Claimed events retain both source references and their unique extraction key. `admin_locked` protects corrections; `evidence` remains the extraction evidence captured before the correction. Raw current extraction and locations are available through the authorized original-email RPC.

The existing email trigger remains the source of derived events, including multi-event extraction and deadline exclusion. Its SQL date/evidence regex escaping was repaired. Reprocessing upserts on the existing `(source_email_post_id, source_event_key)` constraint. Explicit `source_event_id` is preferred; unchanged source evidence can recover an existing key even if AI changes the title. The existing deterministic title/occurrence key remains a fallback. If both source evidence and title change without a stable upstream identifier, identity cannot be inferred reliably; the old event is withdrawn rather than deleting its history. Producers should supply stable `source_event_id` values for such revisions.

The dashboard does not backfill or reprocess historical email automatically. Existing incomplete extraction can be corrected by staff; an authorized pipeline retry uses the repaired parser.

`created_by` and `event_rsvps.user_id` use **auth user IDs** in this shared model. This differs from `institution_admins.user_id` and `list_subscriptions.user_id`, which reference public profile IDs. The generated database types and domain adapters preserve this distinction.

## Authorization and backend operations

Existing RLS policies remain enabled and authoritative: institution admins can manage their institution's events; students read published events only through matching institution/list subscriptions, and derived events additionally require a published matching email. Students write only their own RSVP. No admin permission to impersonate RSVPs was added.

- `admin_create_event(p_list,p_fields)` is SECURITY INVOKER and derives institution from an authorized list. Client-supplied institution/source/creator fields are ignored.
- `admin_event_timestamp(p_local,p_timezone)` validates local times and resolves UTC timestamps. It requires authentication.
- `admin_event_metrics(p_institution,p_events)` returns only aggregate attendance for authorized institution events.
- `admin_event_attendees(p_event,p_offset,p_status)` returns at most 50 minimal attendee rows plus `hasMore` after checking the event's institution.
- `admin_event_original(p_event)` verifies the same institution role and matching source post/list before returning original email data.

The three read RPCs intentionally use SECURITY DEFINER because students' RSVP and profile RLS must remain private. They have explicit authentication/tenant checks, empty search paths, fully qualified references and authenticated-only EXECUTE. The security advisor flags these callable privileged functions for review; this is intentional. Trigger functions are private and not directly executable by browser roles. Student RSVP writes still use existing RLS and the signed-in token.

Capacity changes and attendance writes serialize on the event row. The RSVP trigger acquires `FOR UPDATE`, rechecks published/subscribed availability after the lock and counts Going RSVPs in the backend. Capacity cannot be reduced below confirmed attendance. Concurrent requests cannot consume the same last seat. Cancellation takes the same event row lock through UPDATE.

## Outlook compatibility and configuration

Both event sources expose stable IDs, description, UTC timestamps, IANA zone, location, registration and publication/cancellation information. Existing `event_calendar_links` remain intact. The deployed `outlook-calendar` function was inspected: it uses the same event table, requires publication and subscription, requires a valid end time (or student confirmation), and creates entries idempotently using its existing transaction ID.

Admin edits do **not** update an existing Microsoft Graph calendar entry. A future sync worker can compare `events.updated_at` and `cancelled_at` using the stable event ID. The dashboard makes no claim that Outlook was updated. OAuth tokens remain solely in the existing private-access Outlook tables and server function.

No new frontend secrets or runtime dependencies are required. Existing Vite Supabase URL/public key configuration is sufficient for the admin features. Microsoft OAuth configuration remains the student integration's responsibility. There are no storage buckets in the project, so event image upload is omitted rather than inventing storage infrastructure.

The pre-existing leaked-password protection setting remains disabled. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Intentional privileged RPC findings are explained above; see [SECURITY DEFINER advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Validation results

- `npm test`: five existing validation checks pass.
- `npm run build`: TypeScript and Vite production build pass with the generated shared database types wired into the client.
- `npm run test:browser`: existing admin regressions plus event creation, preview, timezone submission, publication, AI review/correction/original email, draft saving, attendance display, cancellation confirmation, filters, mobile layout and student route denial pass. Browser API/session fixtures are mocked; no real user login or Microsoft OAuth was performed.
- `supabase/tests/event_administration.sql`: executed against the live shared schema with anonymous/student/admin roles; all fixture mutations roll back. Covers tenant reads/updates/deletes, student creation/edit/impersonation denial, curated creation, subscribed publication, hidden drafts, derived references/time parsing, deadline exclusion, idempotency on label changes, overrides, stable IDs and RSVP preservation, capacity, cancellation, DST rejection, attendee authorization and OAuth table privacy.
- Existing `supabase/tests/institution_admin_dashboard.sql`: passed against the updated schema; fixtures rolled back.
- Separate concurrent-session test: two authenticated students requested the final seat while the first transaction held the event row lock for three seconds. One Going RSVP committed, the second returned `This event is at capacity`, and the final Going count was exactly one. All committed race-test fixtures (including auth accounts) were deleted and cleanup verified.

Run SQL scripts as postgres on a development copy of the shared schema. This repository contains additive admin migrations, not the complete student backend baseline.

## Changed files

- `src/features/events/components/Events.tsx`: list, detail, editor/preview, original email, attendees and publication controls.
- `src/features/events/api/events.ts`: shared typed models and reusable scoped data access.
- `src/lib/database.types.ts`: generated live public database schema, including event/RSVP tables and RPCs.
- `src/lib/supabase.ts`, `src/features/admin/api/admin.ts`, `src/features/home/api/feed.ts`: typed client and existing nullable/domain-response adapters.
- `src/features/admin/components/AdminStudio.tsx`, `src/components/Sidebar.tsx`, `src/app/hooks/useRoute.ts`: existing role-checked workspace integration.
- `src/style.css`: responsive event forms, filters and attendance metrics using the existing design.
- `supabase/migrations/20261114161943_event_administration.sql`: additive shared-model fields, guards, scoped RPCs, parser repair and source-key matching.
- `supabase/tests/event_administration.sql`, `tests/browser-smoke.mjs`: SQL authorization/behavior tests and expanded UI regressions.
- `README.md`, this document: operation, shared contract, validation and configuration details.

## Claim verification

`supabase/tests/claim_derived_events.sql` uses rolled-back fixtures to check student and cross-institution denial, required details, successful conversion, verified status with an optional end time, stable source identity, RSVP retention, stale writes, reverse-conversion denial, reprocessing idempotency, and source withdrawal protection. The claim migration is applied to the shared Aggie Fetch database.

## Derived event verification queue

Derived Events defaults to **Most RSVPs first**. The institution-authorized `admin_derived_event_queue` RPC ranks all matching derived events by Going + Interested descending, then Going descending, date and ID, before returning a 12-event page. Not Going does not increase priority. Search and mailing-list filters apply before ranking. Other sort options remain available.

Derived cards show a projected attendance range from Going to Going + Interested, capped at capacity. This is an RSVP signal rather than a statistical forecast. Chips use the upper end: No RSVPs yet (0), Early traction (1–24), Growing traction (25–74), High traction (75+). Total positive RSVPs are displayed separately, including interest beyond capacity. RSVP-disabled events with no responses show zero rather than inferred interest.

The queue RPC intentionally uses SECURITY DEFINER to aggregate private RSVP rows, with explicit authentication and institution-admin checks, an empty search path, and authenticated-only execution. It returns counts and event records, never student identities. SQL regression fixtures in `supabase/tests/derived_event_traction.sql` verify ranking across pages, filters, counts, and tenant/student/anonymous denial; fixtures roll back.

## Dedicated Event Review workspace

Open **Event Review** in the sidebar (`#/admin/event-review`). This is a separate workspace from Events, restricted to the same institution administrators. It loads derived events by Going + Interested RSVPs and opens a prefilled editor for each event. Cancelled and hidden events are excluded. Original extraction evidence and an authorized original-email viewer are available below the editor.

Edit the details and choose **Preview event**. Check the verification acknowledgment, then swipe right on the preview card (or choose **Approve event →**) to save the corrections, convert the event to curated, and publish it. Required fields, timezone checks, optimistic concurrency, source identity and RSVP preservation use the existing claim backend. Failed approvals retain the edited card and show the error; **Refresh queue** reloads current event data.

Swipe left or choose **Deny / skip** to discard the unsaved edits and advance. This action makes no database changes and does not hide the event from students. Skipped events stay out of the current workspace session, across page fetches; leaving the workspace or starting a new session brings them back. Approved events move out of the derived queue. The queue automatically advances and offers a new session when no eligible cards remain.

Touch and mouse gestures require at least 90 pixels of deliberate horizontal movement; vertical scrolling and cancelled gestures do not submit decisions. Approval swipes are disabled until verification is acknowledged. Buttons provide the same decisions for keyboard users. Traction bands and attendance ranges sit beside publication badges on cards, event details and the review header.


Event Review automatically loads the original email at the bottom of the source-information section for each card. The subject, sender and full saved body appear as readable text. Saved `extraction.text` and `extraction.timeText` quotations are highlighted in the subject/body with capitalization- and whitespace-tolerant matching; overlaps are merged without changing source text. Normalized or edited event values are not used as evidence. Missing quotations and unavailable bodies are explicitly identified. HTML-only messages are converted to text with script/style content removed and rendered as React text. Failed loads offer a retry; changing cards cancels stale UI updates.

## All-day and date-based schedules

The editor and Event Review support **Specific date and time**, **All day**, **Date only — time not specified**, and **End date only — time not specified**. All-day/date-only schedules require a start date with an optional inclusive end date; end-date-only schedules require only the end date. Timed events continue to require a start timestamp when curated or claimed. All-day and date-only events can be approved and published without inventing an exact time.

`events.schedule_type` records the choice and `event_end_date` stores an optional inclusive end date. Date-based schedules keep `starts_at` and `ends_at` null. `event_date` is the start date, or the known end date for end-date-only announcements to preserve existing date-based feed consumers. The shared upcoming-events RPC keeps date ranges visible through their end date in the event timezone. Existing derived date-only records are prefilled as Date only when opened. Database constraints enforce valid date ranges and prohibit timestamps on date-based schedules; all existing institution access, source identity and RSVP controls remain in place.

The admin UI displays the date range and whether it is all-day or has no specified time. Existing student calendar export/Outlook flows may still ask for time confirmation; this change does not convert those clients to all-day calendar export.
