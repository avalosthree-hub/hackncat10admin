# Email attachments and institution topics

Future inbound emails use the verified `receive-email` Resend webhook. The older `inbound-email` function is a legacy prototype and is not deployed for this workflow. No historical messages were reclassified or attachment-backfilled during implementation.

## Institution topics

Institution Topics (`#/admin/topics`) edits `institutions.hashtags`. The migration seeds it with the case-insensitive union of that institution's existing list labels. Legacy `list.hashtags` values remain for compatibility but no longer govern classification or list editing. Existing `email_posts.hashtags` remain unchanged. Student preference topics and list descriptions use the institution settings through the existing personalization RPC; historical published-post topics remain available for existing feed preferences.

The classifier aims for two genuinely relevant institution topics, uses one when it is the only applicable label, and allows up to four. It never pads with unrelated labels, never invents labels, and returns none if no configured topic fits. Server-side filtering deduplicates against the allowed institution labels and caps output at four. Both new-email ingestion and the explicitly invoked retry classifier read these institution settings. No retry/backfill was invoked for existing messages.

`admin_set_institution_topics` changes only the selected institution's topics after an explicit institution-admin check; it rejects stale settings, blank/oversized labels and unauthorized callers. Its SECURITY DEFINER execution is intentional: general institution UPDATE access remains closed.

## Attachment storage

For a newly received email, the server fetches each attachment's signed download URL from Resend and streams the bytes into the private `email-attachments` Supabase bucket. Only provider IDs enter object paths (`institution/post/attachment`); filenames remain display metadata. Provider URLs and access tokens are never saved in browser-visible attachment data.

Saved `email_posts.attachments` entries include provider ID, display filename, MIME type, size, status, bucket and storage path. Limits are 20 MB per file, 50 MB per email and 20 files; larger/unavailable files retain descriptive statuses rather than broken links. The receive-email webhook returns a retryable response on transient storage failures. Duplicate deliveries finish missing attachments without reclassifying already published messages; stable object paths and completed-file checks make retries idempotent. Partial uploads use the same deterministic paths on retry.

Storage SELECT policies reuse email-post RLS and also verify path ownership and stored attachment metadata. Institution admins can access their institution's authorized emails; students need a published post and a current matching list subscription. Anonymous users cannot access files. Browser roles cannot upload, overwrite, or delete files. Files belonging to deleted/unsubscribed/hidden posts cannot receive fresh signed links. Previously issued links expire after 60 seconds.

Admin feed cards, the original-email section of Event Review, and student `AnnouncementCard` render download controls when saved files are available. Each download requests a short-lived signed URL under the current user's token, fetches the file, and starts a browser download. HTML and other attachments are downloaded rather than embedded as active page content. Existing emails with metadata only display “File not stored”; no historical fetch is implied.

`receive-email` verifies Svix signatures; `retry-email` verifies the service-role bearer internally. Both retain their pre-existing disabled gateway JWT setting and pinned dependency import maps. Required existing secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `OPENAI_API_KEY`, plus Supabase-provided server credentials. No frontend secrets or new runtime libraries are introduced. `chrono-node` and `luxon` are pinned development dependencies here for classifier tests.

## Validation

- Admin TypeScript/Vite build and 16 Node tests pass.
- Browser regression checks use mocked data and cover institution-topic saves, list independence, attachment download signing, and existing event/admin workflows.
- `supabase/tests/institution_topics_and_attachments.sql` passes with rolled-back fixtures: tenant/admin/student/anonymous authorization, private attachment reads and write denial, subscription/publication gating, optimistic topic edits, and preservation of historical email tags.
- Student production build passes. Its test suite passes 41/42; the unrelated `tests/home-hub-db.test.mjs` fails with an existing SQL syntax error near `then` in its generated query. That test and its SQL source were not changed.
- The migration and both ingestion functions are deployed. No real email was sent or processed as a test; actual provider delivery remains to be observed on the next incoming email.

References: [Resend attachment API schema](https://github.com/resend/resend-openapi/blob/main/resend.yaml), [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Supabase signed downloads](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).


## Institution sender directory and multiple-list delivery

Approved Senders (`#/admin/senders`) is a searchable institution-wide address book. Saving an address alone does not approve it for publication. **Add sender** on a mailing list offers **Choose saved sender**, with search, or **Add new address**. New approved addresses are registered in the directory automatically. An address may be approved on multiple lists; removing one approval preserves other lists and the reusable address-book entry.

`institution_senders` stores one normalized address per institution and is readable/addable only by that institution's administrators. `list_senders` now enforces uniqueness on `(list_id,sender_email)` rather than globally. Existing approval rows remain in place. Sender routing remains based on the sender address until recipient-domain routing is implemented.

For a new verified delivery, the receiver snapshots all matching approved lists into service-only `email_deliveries`, then creates one `email_posts` row for each original destination. The provider ID is stored in `provider_email_id`; new internal `email_id` values combine provider and list IDs. Each institution is classified once using its own topics/timezone; individual posts, events, subscriptions and attachment permissions remain list scoped. Attachments use each post's protected storage path.

Retries reuse the original destination snapshot, skip published/draft copies and finish partial deliveries or attachment storage. Later approvals do not backfill previously delivered emails. Processing claims use optimistic locking and can recover after a ten-minute lease expires. Legacy emails retain their existing IDs and list associations and are recognized without rewriting or reclassifying them. Explicit retry requests continue to target one stored email record, preserving its assigned list.

Validation: 18 Node tests pass, including all-list publication, one classification per institution, retry idempotency and legacy preservation. Browser checks cover saved-sender search and reuse across two lists. Rolled-back SQL fixtures verify same-address multiple approvals, directory deduplication, removing a single approval, cross-institution and student denial. No historical emails were reprocessed and no real email was sent for testing.


The saved-sender picker supports multiple checkbox selections, preserves selections across searches, and offers **Select all shown** and **Clear selection**. Already-approved addresses are disabled. Approval inserts the selected addresses together in one transaction, so a failure cannot partially approve the selection. The picker uses explicit dark text on white rows, gold selected states, visible focus outlines, and a live selected count.

**Remove** on Approved Senders opens a confirmation listing affected mailing lists. Removing an institution sender deletes its directory entry and all its institution list approvals atomically, while preserving existing email posts and other institutions' copies of the same address. A foreign key from each approval to its canonical directory entry provides cascading removal even for direct table deletion; the approval trigger derives the correct directory ID on every write. Existing sender/recipient routing decisions for already received delivery snapshots are retained; new deliveries use current approvals. The removal RPC is SECURITY INVOKER and uses existing institution-admin checks and row policies.
