"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export type Tab = "home" | "map" | "analytics" | "ai" | "developer" | "admin";
export type ViewerRole = "super_admin" | "admin" | "user";

interface NavigationProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  role: ViewerRole;
}

interface NavigationTab {
  id: Tab;
  label: string;
  mobileLabel?: string;
  description: string;
  icon: React.ReactNode;
}

const tabs: NavigationTab[] = [
  {
    id: "home",
    label: "Overview",
    description: "Live device health and current readings",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    id: "map",
    label: "Map",
    description: "Device position and environmental context",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "History, patterns and comparisons",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "Air Guide",
    mobileLabel: "Guide",
    description: "Ask questions about your air-quality data",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    id: "developer",
    label: "Devices & access",
    description: "Notehub, API and firmware connections",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 18l6-6-6-6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 6l-6 6 6 6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l-4 16" />
      </svg>
    ),
  },
  {
    id: "admin",
    label: "Platform admin",
    mobileLabel: "Team",
    description: "Manage workspace access and hardware",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const monitorTabs = tabs.slice(0, 4);
const integrationTab = tabs[4];
const adminTab = tabs[5];

export default function Navigation({ active, onChange, role }: NavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = role === "super_admin";
  const secondaryTabs = isAdmin ? [integrationTab, adminTab] : [integrationTab];
  const secondaryActive = secondaryTabs.some((tab) => tab.id === active);

  const selectTab = (tab: Tab) => {
    setMoreOpen(false);
    onChange(tab);
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-border bg-surface/80 px-4 py-5 backdrop-blur-lg lg:flex lg:flex-col">
        <Link href="/" className="mb-8 block px-2 opacity-95">
          <Logo />
        </Link>

        <div className="mb-3 px-2 text-[10px] font-medium uppercase tracking-wider text-muted/50">
          Monitor
        </div>
        <nav className="flex flex-col gap-1" aria-label="Dashboard">
          {monitorTabs.map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              active={active === tab.id}
              onChange={selectTab}
              variant="sidebar"
            />
          ))}
        </nav>

        <div className="mt-8 mb-3 px-2 text-[10px] font-medium uppercase tracking-wider text-muted/50">
          Build
        </div>
        <nav className="flex flex-col gap-1" aria-label="Platform">
          <NavButton
            tab={integrationTab}
            active={active === integrationTab.id}
            onChange={selectTab}
            variant="sidebar"
          />
        </nav>

        {isAdmin && (
          <>
            <div className="mt-8 mb-3 px-2 text-[10px] font-medium uppercase tracking-wider text-muted/50">
              Manage
            </div>
            <nav className="flex flex-col gap-1" aria-label="Workspace management">
              <NavButton
                tab={adminTab}
                active={active === adminTab.id}
                onChange={selectTab}
                variant="sidebar"
              />
            </nav>
          </>
        )}

        <div className="mt-auto rounded-xl border border-border bg-bg/55 px-3 py-3">
          <div className="text-xs font-medium text-ink/80">
            {isAdmin ? "Platform admin" : "Customer account"}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-muted/60">
            {isAdmin ? "Monitor, integrate and manage access." : "Monitor devices and use air guidance."}
          </div>
        </div>
      </aside>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] flex items-end lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            aria-label="Close more navigation"
            onClick={() => setMoreOpen(false)}
          />
          <div className="relative w-full rounded-t-3xl border-t border-border bg-surface px-4 pb-8 pt-3 shadow-2xl">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <div className="mb-3 px-2">
              <div className="text-sm font-semibold text-ink">Workspace tools</div>
              <div className="text-xs text-muted">Options shown for your access level.</div>
            </div>
            <div className="flex flex-col gap-2">
              {secondaryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    active === tab.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-bg/55 text-ink/80"
                  }`}
                >
                  <span className="shrink-0">{tab.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted">{tab.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-lg lg:hidden">
        <div className="safe-bottom mx-auto flex max-w-5xl items-center justify-around px-2 py-2">
          {monitorTabs.map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              active={active === tab.id}
              onChange={selectTab}
              variant="mobile"
            />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors ${
              secondaryActive ? "text-primary" : "text-muted/50 hover:text-muted"
            }`}
            aria-label="More workspace tools"
            aria-expanded={moreOpen}
          >
            <span className="flex h-[22px] items-center gap-1" aria-hidden="true">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
            <span className="text-xs font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function NavButton({
  tab,
  active,
  onChange,
  variant,
}: {
  tab: NavigationTab;
  active: boolean;
  onChange: (tab: Tab) => void;
  variant: "mobile" | "sidebar";
}) {
  if (variant === "sidebar") {
    return (
      <button
        onClick={() => onChange(tab.id)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted/65 hover:bg-bg/80 hover:text-ink/85"
        }`}
        aria-label={tab.label}
        aria-current={active ? "page" : undefined}
      >
        <span className="shrink-0">{tab.icon}</span>
        <span>{tab.label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onChange(tab.id)}
      className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors ${
        active
          ? "text-primary"
          : "text-muted/50 hover:text-muted"
      }`}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
    >
      {tab.icon}
      <span className="text-xs font-medium">{tab.mobileLabel ?? tab.label}</span>
    </button>
  );
}
