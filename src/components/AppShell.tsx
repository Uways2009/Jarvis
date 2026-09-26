"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Dot, Pill } from "./ui";

interface Health {
  capabilities: {
    twilio: { ok: boolean; missing: string[]; fromNumber?: string };
    fishAudio: { ok: boolean; missing: string[]; model: string };
    llm: { ok: boolean; provider?: string; model?: string };
    liveCallsArmed: boolean;
    webhookBaseUrl: string;
  };
  profile: { label: string; placeholder: boolean; version: number; completeness: { score: number } };
  counters: { calls: number; liveCalls: number; liveCalls24h: number; dailyCap: number; clips: number };
}

const NAV = [
  { href: "/", label: "Console", note: "State of play" },
  { href: "/outreach", label: "Outreach", note: "Compose calls" },
  { href: "/calls", label: "Dispatch", note: "Dial and log" },
  { href: "/voice", label: "Voice Lab", note: "Fish Audio TTS" },
  { href: "/profile", label: "Business Brain", note: "Profile data" },
  { href: "/briefings", label: "Briefings", note: "Brief and drill" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = (await res.json()) as Health;
        if (alive) setHealth(data);
      } catch {
        /* the shell degrades quietly; pages surface their own errors */
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const caps = health?.capabilities;

  return (
    <div className="flex min-h-screen">
      {/* Rail */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-ink-900/70 px-4 py-6 backdrop-blur lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-1">
          <span className="grid size-9 place-items-center rounded-lg border border-amber/40 bg-amber-soft font-mono text-[15px] font-semibold text-amber">
            N
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-[0.02em] text-mist-100">NEXOVIRA</span>
            <span className="block text-[11px] tracking-[0.1em] text-mist-600 uppercase">Chief of staff</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                  active ? "bg-panel-3 text-mist-100" : "text-mist-500 hover:bg-panel/70 hover:text-mist-200"
                }`}
              >
                <span className="text-[13.5px] font-medium">{item.label}</span>
                <span
                  className={`text-[10.5px] tracking-wide ${active ? "text-amber" : "text-mist-600 group-hover:text-mist-500"}`}
                >
                  {item.note}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 px-1 pt-6">
          <div className="hairline" />
          <div className="space-y-2 text-[11.5px] leading-4 text-mist-600">
            <div className="flex items-center justify-between">
              <span>Calls / 24h</span>
              <span className="font-mono text-mist-300">
                {health ? `${health.counters.liveCalls24h}/${health.counters.dailyCap}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Voice clips</span>
              <span className="font-mono text-mist-300">{health ? health.counters.clips : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Brain</span>
              <span className="font-mono text-mist-300">
                {health ? `${health.profile.completeness.score}%` : "—"}
              </span>
            </div>
          </div>
          <p className="pt-1 text-[11px] leading-4 text-mist-600">
            Discloses AI voice. Honours opt-outs permanently. Dials only inside permitted hours.
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-ink-950/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="grid size-7 place-items-center rounded-md border border-amber/40 bg-amber-soft font-mono text-[12px] text-amber">
                N
              </span>
              <span className="text-[13px] font-semibold tracking-wide">NEXOVIRA</span>
            </div>

            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <Pill tone={caps?.liveCallsArmed ? "danger" : "signal"}>
                <Dot tone={caps?.liveCallsArmed ? "danger" : "signal"} />
                {caps?.liveCallsArmed ? "LIVE DIALING ARMED" : "DRY-RUN ONLY"}
              </Pill>
              <Pill tone={caps?.twilio.ok ? "signal" : "neutral"}>
                Twilio {caps ? (caps.twilio.ok ? "wired" : `missing ${caps.twilio.missing.length}`) : "…"}
              </Pill>
              <Pill tone={caps?.fishAudio.ok ? "signal" : "neutral"}>
                Fish Audio {caps ? (caps.fishAudio.ok ? caps.fishAudio.model : "no key") : "…"}
              </Pill>
              <Pill tone={caps?.llm.ok ? "info" : "neutral"}>
                {caps?.llm.ok ? `Polish: ${caps.llm.provider}` : "Engine only"}
              </Pill>
              {health?.profile.placeholder ? <Pill tone="danger">Profile empty</Pill> : null}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/calls"
                className="rounded-lg border border-amber/40 bg-amber-soft px-3 py-1.5 text-[12.5px] font-medium text-amber transition-colors hover:bg-amber/20"
              >
                Dispatch desk
              </Link>
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="mt-3 flex gap-1 overflow-x-auto lg:hidden">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] ${
                    active ? "bg-panel-3 text-mist-100" : "text-mist-500"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

        <footer className="border-t border-line px-4 py-4 text-[11.5px] text-mist-600 sm:px-6">
          NEXOVIRA · business-profile grounded · every live call requires an explicit authorisation
          phrase · nothing is dialled without keys and intent.
        </footer>
      </div>
    </div>
  );
}
