"use client";
import { useEffect, useRef, useState } from "react";
import type { DeviceOption } from "@/app/dashboard/page";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { UPLOAD_URL } from "@/lib/device-setup";
import AccessView from "./AccessView";
import DeveloperView from "./DeveloperView";

type Receipt = {
  deviceId: string;
  receivedAt: string | null;
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
};
export default function ConnectionView({
  device,
  onChange,
}: {
  device?: DeviceOption;
  onChange: () => Promise<void>;
}) {
  const [step, setStep] = useState<"enroll" | "keys" | "verify">("enroll");
  const panel = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) panel.current?.focus();
    previousStep.current = step;
  }, [step]);
  return (
    <div className="connection-page">
      <header className="connection-page-heading">
        <h1>Devices & access</h1>
        <p>
          Connect a board, create its upload key, then confirm a real
          measurement reached Bair1.
        </p>
      </header>
      <nav className="connection-steps" aria-label="Device connection steps">
        {(
          [
            ["enroll", "Enroll your board"],
            ["keys", "Create an upload key"],
            ["verify", "Verify an upload"],
          ] as const
        ).map(([id, label], i) => (
          <button
            key={id}
            aria-pressed={step === id}
            onClick={() => setStep(id)}
          >
            <span aria-hidden="true">{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div
        className="connection-content"
        ref={panel}
        tabIndex={-1}
        role="region"
        aria-label={
          step === "enroll"
            ? "Enroll your board"
            : step === "keys"
              ? "Create an upload key"
              : "Verify an upload"
        }
      >
        {step === "enroll" ? (
          <AccessView
            mode="enroll"
            device={device}
            onChange={async () => {
              await onChange();
              setStep("keys");
            }}
          />
        ) : step === "keys" ? (
          <DeveloperView
            preferredDevice={device?.isOwner ? device.deviceId : ""}
            onEnroll={() => setStep("enroll")}
          />
        ) : (
          <UploadVerification device={device} />
        )}
      </div>
      <details className="connection-details">
        <summary>Sharing & workspaces</summary>
        <p className="my-4 max-w-2xl text-sm text-muted">
          Devices start private. Share only when you want someone else to see
          their readings. Invitations and public links are separate from upload
          keys.
        </p>
        <AccessView mode="sharing" device={device} onChange={onChange} />
      </details>
    </div>
  );
}

function UploadVerification({ device }: { device?: DeviceOption }) {
  const request = useAuthenticatedFetch();
  const [result, setResult] = useState<{
    deviceId: string;
    reading: Receipt | null;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(null);
      setError("");
    }, 0);
    return () => clearTimeout(timer);
  }, [device?.deviceId]);
  async function check() {
    if (!device || checking) return;
    const id = device.deviceId;
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const r = await request("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "query UploadCheck($deviceId: String!) { latestReading(deviceId: $deviceId) { deviceId receivedAt timestamp temperature humidity pressure } }",
          variables: { deviceId: id },
        }),
      });
      const body = await r.json();
      if (!r.ok || body.errors)
        throw new Error(
          r.status === 401
            ? "Your session expired. Sign in again."
            : "The upload check could not be completed. Retry, or refresh your devices if access changed.",
        );
      if (body.data?.latestReading && body.data.latestReading.deviceId !== id)
        throw new Error(
          "The response did not match the selected device. Refresh your devices.",
        );
      setResult({ deviceId: id, reading: body.data?.latestReading ?? null });
      setCheckedAt(Date.now());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Upload verification failed. Try again.",
      );
    } finally {
      setChecking(false);
    }
  }
  const visible = result?.deviceId === device?.deviceId ? result : null;
  const reading = visible?.reading;
  const recent =
    reading?.receivedAt &&
    Number.isFinite(Date.parse(reading.receivedAt)) &&
    checkedAt - Date.parse(reading.receivedAt) >= 0 &&
    checkedAt - Date.parse(reading.receivedAt) < 120000;
  return (
    <section className="connection-stack">
      <div className="connection-heading">
        <div>
          <h2>Verify a real upload</h2>
          <p>
            Wi-Fi connectivity alone does not complete the server test. Upload
            real sensor readings and confirm they can be read back.
          </p>
        </div>
      </div>
      <dl className="connection-facts">
        <div>
          <dt>Upload endpoint</dt>
          <dd>
            <code>{UPLOAD_URL}</code>
          </dd>
        </div>
        <div>
          <dt>Selected board</dt>
          <dd>{device?.name || "No device selected"}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        Use the device selector at the top of the dashboard to choose the board
        you are testing.
      </p>
      <button
        className="connection-primary"
        disabled={!device || checking}
        onClick={() => void check()}
      >
        {checking ? "Checking server…" : "Check latest upload"}
      </button>
      {error && (
        <p role="alert" className="connection-error">
          {error}
        </p>
      )}
      <div role="status" aria-live="polite">
        {visible &&
          (reading ? (
            <div className="connection-notice">
              <h3>
                {recent
                  ? "A recent upload reached Bair1"
                  : "A stored reading was found"}
              </h3>
              <p>
                {reading.receivedAt
                  ? `Received ${new Date(reading.receivedAt).toLocaleString("en-GB", { timeZone: "UTC", hour12: false }) + " UTC"}.`
                  : "The server receipt time is unavailable for this older record."}{" "}
                {!recent &&
                  "Upload a new sample, then check again to prove the current connection."}
              </p>
              <dl className="connection-measurements">
                {(
                  [
                    ["Temperature", reading.temperature, "°C"],
                    ["Humidity", reading.humidity, "%"],
                    ["Pressure", reading.pressure, "hPa"],
                  ] as const
                ).map(([label, value, unit]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value == null ? "Not supplied" : `${value} ${unit}`}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted">
                This confirms storage and readback for one reading. Complete the
                factory checklist below before signing off the test.
              </p>
            </div>
          ) : (
            <div className="connection-notice">
              <h3>No stored measurement found</h3>
              <p>
                Check the board&apos;s POST response. A 404 with “enroll this
                device before uploading” means enrollment is missing. A 401
                means the key or upload permission needs checking.
              </p>
            </div>
          ))}
      </div>
      <section>
        <h3>Factory test pass criteria</h3>
        <ol className="connection-checklist">
          <li>
            The board is enrolled and the key belongs to the same account.
          </li>
          <li>
            POST real BME280 and dual ADC measurements to the endpoint above.
          </li>
          <li>
            Receive HTTP 200, <code>ok: true</code> and{" "}
            <code>outcome: stored</code>. An unchanged retry returns{" "}
            <code>outcome: duplicate</code>.
          </li>
          <li>
            Read back and compare every reported field, timestamp and event
            identity. A blank particulate or AQI value is expected on a
            BME280-only board.
          </li>
          <li>
            Record a timed run, retry/queue results and the operator&apos;s
            sign-off. A 120-sample RAM queue is not durable across a reboot.
          </li>
        </ol>
      </section>
      <details className="connection-details">
        <summary>Understand an upload error</summary>
        <dl className="connection-errors">
          <div>
            <dt>401 Unauthorized</dt>
            <dd>Check the key is current and has write:readings.</dd>
          </div>
          <div>
            <dt>404 Enrollment required</dt>
            <dd>
              Enroll the exact board ID before uploading. A different message,
              “device not found”, means the owning account, key restriction or
              access state needs checking.
            </dd>
          </div>
          <div>
            <dt>409 Event conflict</dt>
            <dd>
              Retry with the original payload unchanged. Give new measurements
              new event identities.
            </dd>
          </div>
          <div>
            <dt>503 Unavailable</dt>
            <dd>The sample is not acknowledged. Retain it and retry later.</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
