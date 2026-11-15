# Host sensor readings through Notehub

The Notehub adapter keeps the cloud device identity derived from the authenticated Notecard event. A host device ID is measurement provenance, not an ownership claim.

Host samples can include a hardware-derived XIAO device ID, a 32-character uppercase hexadecimal boot session, non-negative integer sequence/uptime, and an event ID formed as `deviceId:bootSession:sequence`. When that tuple is internally consistent, its `capturedAt` (epoch seconds/milliseconds or an ISO timestamp) takes precedence over the Notehub queue timestamp. Invalid or future sensor capture times fall back to the gateway event time. Server receipt time remains separate, and historical stored events are not rewritten.

The sanitized payload retains this validated tuple under `sourceSample`. Complete valid nested SPS30 readings retain the four mass concentrations, five cumulative number concentrations and typical particle size, with explicit units. Arbitrary body fields, private modem/SIM identifiers and malformed particle objects are excluded. The adapter continues to use the Notehub event ID for delivery deduplication and the existing Notecard-derived cloud ID for authorization.

Validation: regression tests reproduce a sensor reading queued 65 seconds after measurement, test invalid time/origin fallback, verify particle-bin retention and verify no host ID changes the cloud device identity. The physical cellular path was separately checked against real Notehub route receipts and persisted Bair1 readings; this is transport verification, not sensor calibration acceptance.
