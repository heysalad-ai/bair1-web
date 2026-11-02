# In-flight reads, identity and observation integrity

This is a follow-up review candidate on the customer-isolation stack. It closes
races found during validation; no hosted account, secret, record or device changed.

Private GraphQL, customer JSON/CSV, REST state/readings/analytics and AI/voice reads
re-read access after retrieval. Results are discarded if owner/enrollment changes
or workspace access is revoked during the read. Commands, acknowledgement/state
writes and authenticated ingestion use a registry condition in the transaction;
stale authorization cannot write into another enrollment. Device edits cannot
upsert a deleted registry entry and customer edits condition on the snapshot.
Only successful acknowledgements may update LED state. These are synthetic
commands written to local test storage; no command was sent to hardware.

Every new admin, system-ingestion or Notehub registration gets a fresh ownership
version. Existing legacy records keep their namespace. In particular, deleting
and recreating an administrative registration cannot inherit legacy history.
Direct owner transfers remain unsupported, pending an approved history migration.

Public latest now uses the same explicit projection as feed history, removing
legacy diagnostic fields. Publication is rechecked around retrieval. The public
client calls capture freshness unknown when only receipt time is known.

Auth0 identity is its verified subject, not an email match. Automatic legacy
email migration is removed, including for verified addresses, because it could
move roles/history to another identity. Existing subject-bound users are preserved.
Any unbound pre-seeded identity now requires an approved explicit subject mapping;
do not restore automatic email linking to recover those accounts. First-login
creation is conditional and role reads are consistent. Initial platform bootstrap
fails closed unless BOTH ADMIN_BOOTSTRAP_SECRET and ADMIN_BOOTSTRAP_SUB are
configured; it can only approve that exact verified subject. Provisioning those
values or changing platform roles requires explicit hosted approval.

Notehub event.when is gateway capture provenance; source received time is not
promoted to capture time. Server receipt is recorded separately. Stable event IDs
deduplicate retries even with unknown capture time. Environmental-only events now
enter the shared measurement history with absent PM/AQI fields null. This changes
new ingestion only; the 90-day historical Notecard events are not backfilled into
the 14-day readings store. Unknown pressure units remain unavailable. Sparse
measurements track their own observation order and unknown capture labels. Storage
failures return retryable 503, rather than treating a database failure as bad data.

Acceptance evidence: actual local transaction tests cover owner changes and
workspace revocation during reads, stale command/state writes and enrollment-bound
history. HTTP/database tests cover environmental Notehub events with no capture
time and stable-ID retries. Offline tests cover bootstrap configuration, first-login
races, strict numeric normalization and public projection. Browser review verified
that a newly received value with unknown capture time displays Unknown, never Live.
Cloud two-account acceptance and production rollout remain unexecuted gates.
