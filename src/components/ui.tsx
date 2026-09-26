import type { ReactNode } from "react";

/* Presentational primitives. No hooks — safe in both server and client trees. */

export type Tone = "neutral" | "amber" | "signal" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-panel-3 text-mist-300 border-line",
  amber: "bg-amber-soft text-amber border-amber/30",
  signal: "bg-signal-soft text-signal border-signal/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
};

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-medium tracking-wide ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const color =
    tone === "signal"
      ? "bg-signal"
      : tone === "danger"
        ? "bg-danger"
        : tone === "amber"
          ? "bg-amber"
          : tone === "info"
            ? "bg-info"
            : "bg-mist-600";
  return <span className={`inline-block size-[7px] rounded-full ${color}`} />;
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={`surface p-5 ${className}`}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber/80">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-mist-100">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-mist-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const valueTone = tone === "danger" ? "text-danger" : tone === "signal" ? "text-signal" : "text-mist-100";
  return (
    <div className="surface px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">{label}</div>
      <div className={`mt-1.5 font-mono text-[22px] leading-7 tracking-tight ${valueTone}`}>{value}</div>
      {hint ? <div className="mt-1 text-[12px] text-mist-500">{hint}</div> : null}
    </div>
  );
}

export function Meter({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 85 ? "bg-signal" : clamped >= 55 ? "bg-amber" : "bg-danger";
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-850">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      {label ? <div className="mt-1.5 text-[12px] text-mist-500">{label}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-4 text-mist-600">{hint}</span> : null}
    </label>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-mist-300">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-mist-600">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-600">{children}</span>
      <span className="hairline flex-1" />
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const border =
    tone === "danger"
      ? "border-danger/35 bg-danger-soft/60"
      : tone === "amber"
        ? "border-amber/35 bg-amber-soft/60"
        : tone === "signal"
          ? "border-signal/35 bg-signal-soft/60"
          : "border-info/30 bg-info-soft/50";
  const text = tone === "danger" ? "text-danger" : tone === "amber" ? "text-amber" : tone === "signal" ? "text-signal" : "text-info";
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] leading-5 ${border}`}>
      {title ? <div className={`mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] ${text}`}>{title}</div> : null}
      <div className="text-mist-200">{children}</div>
    </div>
  );
}
