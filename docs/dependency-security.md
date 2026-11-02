# Dependency security review — 2 November 2026

This candidate updates the lockfile within existing dependency major versions,
with Next.js and its lint config pinned at 16.4.4. The installed Next route/data
security/upgrade guides were consulted. No canary or forced major update is used.

The initial npm audit reported 38 affected packages: one critical, 14 high,
17 moderate and six low. After the update, npm audit --omit=dev reports zero
known production dependency findings. The complete audit reports 16 moderate
development-tool findings, all connected to minimatch below 11.0.1 through the
ESLint ecosystem. npm suggests incompatible tooling changes (including an old
ESLint downgrade); those were not applied. Existing CommonJS minimatch 3 callers
cannot safely receive a blanket override to a different major API just to make
an audit green. These development findings remain a tracked review item; zero
runtime findings is not a claim that the entire repository is vulnerability-free.
CI now checks production dependencies explicitly, without suppressing the full
audit or disabling lint rules. CI runtime is bounded to limit tooling failures.

Primary advisory reviewed for the Next image dependency vulnerability:
https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
The resulting lockfile includes the fixed sharp dependency. Current audit
metadata, rather than an assumption about feature exposure, drove the update.

A routine Stripe SDK update changed its compile-time expected API date. Stripe is
pinned to the existing 22.2.1 SDK instead of changing payment API behavior. This
candidate makes no API-version, checkout, promotion, payment or webhook operation.
All updated packages and versions are recorded in package-lock.json.

Validation includes a production build, typecheck, lint, offline authorization/
data-contract tests, actual DynamoDB Local transaction/HTTP tests, local snapshot
restore and native firmware serialization/acknowledgement. Paid provider, hosted
Auth0 and hardware tests remain outside this local verification.
