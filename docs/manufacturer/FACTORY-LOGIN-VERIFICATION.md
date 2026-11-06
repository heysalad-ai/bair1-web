# Factory-only local login acceptance

User scope: Auth0-free sign-in for manufacturer provisioning/testing only, keeping existing customer/dashboard authentication and device ownership/keys intact. Existing approved factory grant, quota and expiry remain authoritative.

Acceptance proof:
- Password verifier uses salted scrypt; plaintext never stored/logged. Exact existing operator user/batch bound to login and session.
- Random server-side sessions, hash-only storage, Secure/HttpOnly/SameSite=Strict host cookie, absolute <=8h and grant expiry, revocable through credential version and grant.
- Atomic shared login rate limits; generic wrong-user/password errors; bounded request bodies; same-origin checks for login/logout/cookie-auth mutations; no secret in URLs/localStorage.
- Native session accepted only on factory endpoints. Cannot authenticate dashboard GraphQL, admin, developer keys or upload endpoints; cannot see another owner/batch. Legacy bearer factory auth remains compatible.
- Login logout, expiry/revocation, tampering, CSRF, concurrency/rate limits, wrong password, active grant and real factory handlers covered with loopback DynamoDB.
- Actual production build, typecheck, lint, full tests and HTTP smoke pass. Desktop/mobile UI checked in browser; real factory login/list/logout verified without configuring/flashing hardware.
- Existing BME280/SPS30 packages and upload keys unchanged. Manufacturer gets direct URL and clear Simplified Chinese instructions. Private credentials remain outside git and chat.
