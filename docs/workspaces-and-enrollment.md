# Workspace, enrollment and share rollout

This code does not provision AWS resources or modify customer records. The new
access table must be reviewed/provisioned in isolated staging before the feature
is enabled. Existing owner-only reads remain available with the feature disabled.

## Storage and permissions

Review `infrastructure/customer-access.review.json`. The table uses scope/entry
keys and a sparse userId/workspaceId membership index. Runtime permissions must
be limited to GetItem, PutItem, UpdateItem, Query and ConditionCheckItem on the
approved access table and its named index. Existing device-table GetItem, PutItem
and UpdateItem permissions are needed for enrollment. Transactions use the
underlying DynamoDB permissions, not a TransactWriteItems IAM action.

After staging provisioning and tests, set BAIR1_ACCESS_ENABLED=true only in the
approved deployment. Never point an ordinary preview at production storage.
Disabling the flag rejects workspace/share creation and all new share tokens;
owner access continues. Legacy permanent HMAC share URLs are intentionally invalid.

Workspace membership is explicit. An owner creates a one-time, 24-hour invite
code and shares it with the intended participant; the participant signs in and
accepts it. The code admits one member. Owners can promote existing members or
revoke them; members cannot modify membership or control devices. A device is
private until its owner explicitly chooses workspace visibility. Public feeds
also require both a configured feed entry and explicit public device visibility.
Do not enable public visibility as a bulk migration.

## Device onboarding

A platform super admin provisions a previously unused device ID through
POST /api/admin/enrollments. The response returns a one-time enrollment code;
only its hash is stored. Give the code privately to the physical recipient.
The signed-in recipient submits the code to POST /api/developer/devices.
Codes expire after 24 hours and cannot replace an existing owner.

Developer-key uploads now require an enrolled, owned registry record. They do
not auto-claim arbitrary IDs. Existing enrolled/owned devices continue working.
Use device-bound keys where possible; older account keys remain owner-scoped.
Do not flash a board until the separate hardware hold is lifted.

Ownership transfers are deliberately rejected by ordinary update endpoints.
A reused, newly enrolled ID has a new ownership version. Reading/receipt identity,
telemetry/state keys and command queries isolate that version from the previous
owner. Legacy records remain readable to their existing owner. An archival
transfer UI requires a separately reviewed historical-data migration; there is
no automatic relabeling or deletion of old customer measurements.

## Shares

A permitted owner or workspace manager may create a read-only link for 1–168
hours. Each link has a random secret whose hash is stored, its own revocation
state, an owner binding and an ownership-version binding. Expiry/revocation are
checked consistently on every request; DynamoDB TTL is cleanup, not authorization.
The signed snapshot omits exact location, raw payloads, ownership and email.
At most 100 retained link records per device may be minted before TTL cleanup.

## Verification and rollout gates

Run npm test, npm run test:access against a dedicated loopback DynamoDB Local,
TypeScript, lint and build. Then test two staging identities with workspace
creation/invitation/revocation, wrong-device keys, enrollment replay, expiry,
share revocation and mixed legacy/versioned history. Review resource/IAM settings,
backups, rollback, and changes to previously public feeds before production.
No hosting configuration, merge or deployment is authorized by running tests.

Verified locally on 2 November: 21 offline tests, six DynamoDB Local access/
enrollment/share/history tests, and eleven HTTP/database ingestion tests passed.
The latter retained the 600-event backlog, retries/conflicts, authorization races,
legacy reads and compatible pause behavior. The actual native firmware serializer
and acknowledgement parser passed. TypeScript/build passed; lint retains 25
existing warnings. AWS ValidateTemplate accepted the review template; no resource
was created and runtime IAM/hosted acceptance has not been verified.

New enrollment generations namespace the reading partition as well as event
identity. Legacy partitions are unchanged. A production rollback must be built
from this release's compatible reader; do not promote the October fallback without
rebuilding and validating it against this schema and authorization policy.
