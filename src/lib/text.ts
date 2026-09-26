const WORD_RE = /[a-z0-9']+/g;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "for", "from",
  "has", "have", "how", "i", "in", "is", "it", "its", "just", "me", "more",
  "my", "no", "not", "of", "on", "or", "our", "so", "that", "the", "their",
  "them", "then", "there", "they", "this", "to", "too", "up", "us", "was",
  "we", "were", "what", "when", "which", "who", "will", "with", "you", "your",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).filter(
    (t) => t.length > 2 && !STOPWORDS.has(t),
  );
}

/** Cheap suffix stripping so "sequencing"/"sequence" and "routing"/"route" align. */
export function stem(token: string): string {
  for (const suffix of ["ings", "ing", "ers", "er", "ions", "ion", "es", "s"]) {
    if (token.length > suffix.length + 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export function stemSet(text: string): Set<string> {
  return new Set(tokenize(text).map(stem));
}

/** Overlap score in the 0..1 range between a query and a candidate phrase. */
export function overlapScore(query: Set<string>, candidate: string): number {
  const candidateTokens = tokenize(candidate).map(stem);
  if (candidateTokens.length === 0 || query.size === 0) return 0;
  let hits = 0;
  for (const token of candidateTokens) if (query.has(token)) hits += 1;
  return hits / Math.sqrt(candidateTokens.length * Math.max(query.size, 1));
}

export function words(text: string): number {
  return (text.match(WORD_RE) ?? []).length;
}

/** Speaking pace used across the console: ~150 wpm conversational delivery. */
export function estimateSeconds(text: string): number {
  return Math.round((words(text) / 150) * 60);
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || Number.isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}

export function normalizePhone(value: string): string {
  // Only remove presentation characters. Never silently turn letters or an
  // extension into a different destination, or guess a missing country code.
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) return "";
  const compact = trimmed.replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  return compact;
}

/**
 * Local hour at a moment for an IANA timezone. Used by the quiet-hours gate —
 * a number's local clock, not yours, decides whether it may be dialled.
 */
export function localHour(timeZone: string, at: Date = new Date()): number | null {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(at);
    const hour = Number.parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : null;
  } catch {
    return null;
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const delta = Math.max(0, Date.now() - then);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** Cut at a word boundary and mark the elision — never split a word mid-flight. */
export function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[,;:—-]$/, "")}…`;
}

/** The first sentence, if the input holds more than one. */
export function firstSentence(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0].trim() : clean;
}

/** Guarantee terminal punctuation before a line is spoken. */
export function asSentence(text: string): string {
  const clean = text.trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Split a paragraph into sentence-shaped lines for the teleprompter. */
export function toLines(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
