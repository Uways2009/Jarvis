"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/* Interactive primitives. */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-amber text-ink-950 hover:bg-amber-bright border-transparent font-semibold shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]",
  secondary: "bg-panel-3 text-mist-100 hover:bg-panel-2 border-line hover:border-mist-600/60",
  ghost: "bg-transparent text-mist-300 hover:text-mist-100 hover:bg-panel-2 border-transparent",
  danger: "bg-danger-soft text-danger hover:bg-danger/20 border-danger/35",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      className={`text-[12px] ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`}
    />
  );
}

export function Toast({ message, tone = "neutral" }: { message: string; tone?: "neutral" | "danger" | "signal" }) {
  const color =
    tone === "danger"
      ? "border-danger/40 bg-danger-soft"
      : tone === "signal"
        ? "border-signal/40 bg-signal-soft"
        : "border-line bg-panel-2";
  return (
    <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-[13px] text-mist-100 shadow-xl ${color}`}>
      {message}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; hint?: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel/70 p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] transition-colors ${
              isActive
                ? "bg-panel-3 text-mist-100 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
                : "text-mist-500 hover:text-mist-300"
            }`}
            title={tab.hint}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="surface overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] text-mist-200 hover:bg-panel-2"
      >
        <span className="font-medium">{summary}</span>
        <span className="text-mist-600">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="border-t border-line-soft px-4 py-4">{children}</div> : null}
    </div>
  );
}
