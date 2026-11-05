import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import FirmwareInstaller from "@/components/FirmwareInstaller";
import { firmwareStatusLabels, firmwareTargets, type FirmwareStatus } from "@/lib/firmware";

export const metadata: Metadata = {
  title: "Bair1 Firmware Installer",
  description: "Public firmware releases and browser install tooling for Bair1 Seeed Studio XIAO devices.",
  openGraph: {
    title: "Bair1 Firmware Installer",
    description: "Flash and track Bair1 firmware for Seeed Studio XIAO air-quality devices.",
    url: "https://bair1.live/firmware",
    siteName: "Bair1",
  },
};

const statusStyles: Record<FirmwareStatus, string> = {
  release: "bg-primary/15 text-primary border-primary/30",
  beta: "bg-accent/15 text-accent border-accent/30",
  lab: "bg-surface text-muted border-border",
};

const releaseSteps = [
  "Build the firmware with secrets kept outside git.",
  "Flash one reference device and confirm readings reach Bair1.",
  "Attach the signed binary to this release catalog.",
  "Promote the status from Lab to Beta or Release.",
];

export default function FirmwarePage() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <nav className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/bear-logo.png" alt="Bair1" width={36} height={36} className="object-contain" />
            <span className="text-xl font-bold tracking-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
              Bair<span className="text-primary">1</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/device-setup" className="text-sm font-medium text-primary transition-colors hover:text-primary-hover">
              Device setup
            </Link>
            <Link href="/" className="hidden text-sm font-medium text-muted transition-colors hover:text-ink sm:block">
              Home
            </Link>
            <Link href="https://app.bair1.live" className="text-sm font-medium text-muted transition-colors hover:text-ink">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <section className="border-b border-border py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Public firmware tool</p>
            <h1 className="mt-5 text-ink">Bair1 firmware releases for Seeed XIAO devices.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              A single public place to connect boards, pick the right Bair1 firmware, and track which builds are ready for the field.
              The catalog starts with the hardware already built in the Bair1 workspace and can be updated as new releases are promoted.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#installer"
                className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Open Installer
              </a>
              <a
                href="#releases"
                className="rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-muted"
              >
                View Releases
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-bg p-5">
                <p className="text-3xl font-bold text-ink" style={{ fontFamily: "var(--font-display)" }}>
                  {firmwareTargets.length}
                </p>
                <p className="mt-2 text-sm text-muted">tracked firmware targets</p>
              </div>
              <div className="rounded-xl border border-border bg-bg p-5">
                <p className="text-3xl font-bold text-ink" style={{ fontFamily: "var(--font-display)" }}>
                  4
                </p>
                <p className="mt-2 text-sm text-muted">Seeed XIAO board families</p>
              </div>
              <div className="col-span-2 rounded-xl border border-border bg-bg p-5">
                <p className="text-sm font-semibold text-ink">Supported today</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  XIAO ESP32S3, XIAO ESP32S3 Sense, XIAO ESP32C3, XIAO MG24, and XIAO MG24 Sense builds.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="installer" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <FirmwareInstaller />
        </div>
      </section>

      <section id="releases" className="border-y border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-ink">Firmware catalog</h2>
              <p className="mt-4 max-w-2xl text-muted">
                Lab builds are hardware-proven but still moving. Beta builds are ready for controlled installs. Release builds are the public default.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {firmwareTargets.map((target) => (
              <article key={target.slug} className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-ink">{target.name}</h3>
                    <p className="mt-1 text-sm text-muted">{target.board}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[target.status]}`}>
                    {firmwareStatusLabels[target.status]}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-bg px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted/70">Version</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{target.version}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-bg px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted/70">{target.factoryPackage ? "Installation" : "PlatformIO"}</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{target.factoryPackage ? "Factory USB setup" : target.platformioEnv}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {[...target.sensors, ...target.transports].map((label) => (
                    <span key={label} className="rounded-full bg-bg px-3 py-1 text-xs text-muted">
                      {label}
                    </span>
                  ))}
                </div>

                <ul className="mt-5 space-y-2">
                  {target.notes.map((note) => (
                    <li key={note} className="flex gap-2.5 text-sm leading-6 text-muted">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
                  {target.firmwarePath ? (
                    <a
                      href={target.firmwarePath}
                      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                    >
                      {target.factoryPackage ? "Download factory package" : "Download Binary"}
                    </a>
                  ) : (
                    <span className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted">
                      Binary pending
                    </span>
                  )}
                  {target.factoryPackage ? <a href="#installer" className="rounded-lg px-3 py-2 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Use factory USB setup</a> : <code className="rounded-lg bg-bg px-3 py-2 text-xs text-muted">pio run -e {target.platformioEnv} -t upload</code>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="text-ink">Release checklist</h2>
            <p className="mt-4 text-muted">
              Keep this page current by treating every firmware promotion like a small product release.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {releaseSteps.map((step, index) => (
              <div key={step} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {index + 1}
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Image src="/bear-logo.png" alt="Bair1" width={24} height={24} className="object-contain" />
            <span className="text-sm text-muted">Bair1 firmware releases</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted">
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
            <Link href="https://app.bair1.live" className="transition-colors hover:text-ink">
              Dashboard
            </Link>
            <a href="mailto:hello@heysalad.app" className="transition-colors hover:text-ink">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
