> Production update: the reviewed backend is now deployed. See [production deployment](production-deployment.md) for current status and the production-configured fallback. Device flashing remains on hold. Earlier approval holds below describe prior stages.

# Compatible ingestion-pause fallback

Status: prepared and exercised in isolated staging. Production execution remains on hold.

This fallback keeps the validated reader that understands both legacy ISO timestamp keys and new `ISO#event-hash` keys. Setting `BAIR1_INGESTION_MODE=paused` rejects `/api/readings` and `/api/integrations/notehub` POSTs with HTTP 503, `ok:false`, `stored:false` and `Retry-After:60`, before any ingestion writes. Existing history and event receipts remain intact. Other application functions are not globally disabled.

This is an ingestion-pause fallback, **not restoration of the old twelve-second writer or a database downgrade**. Keeping the new reader is necessary for timestamp compatibility. The hosted rehearsal verified 631 mixed-format rows remained readable, both ingestion routes refused writes, and switching requests back to the active candidate recognized an earlier event as a duplicate. One new event then produced exactly one extra row (632 total), also readable through the fallback.

## Prepared artifacts

- Candidate and fallback source are on `codex/bair1-two-second-ingestion` in this worktree.
- The immutable staging deployment URLs are recorded in `docs/evidence/staging-candidate-deployment.json` and `staging-rollback-deployment.json`.
- `infrastructure/rollback.env.example` records the pause setting. Runtime version for final staging: Node 24, matching the current production project.
- SHA-256 source inventory is in `docs/evidence/staging-source.sha256`.

## Future production procedure — requires approval

1. Use the reviewed source revision, production project, production credentials and production table names. Keep `BAIR1_TABLE_PREFIX` unset for production. **Do not promote either staging deployment to production:** they deliberately use staging storage and restricted staging credentials.
2. Prepare a separate production-configured fallback deployment with `BAIR1_INGESTION_MODE=paused`, then verify its read API against authorized existing data and confirm ingestion is paused. Preparing this production deployment is not authorized by the current staging request.
3. If activation is approved, direct production traffic to that compatible fallback. Confirm existing history, 503 ingestion responses and unchanged row/receipt counts. Do not roll back to the old unmodified revision and do not delete or rewrite the tables.
4. Repair the writer, validate it in staging, then obtain approval to resume. Verify a queued retry returns duplicate without adding a row and a new event stores once.

Paused devices continue retrying and may fill their four-minute RAM queues; newer measurements are then dropped. This fallback protects stored history and avoids false acknowledgements, but cannot preserve unbounded offline device data. A longer outage or a no-loss requirement needs a separate acquisition/buffering plan.
