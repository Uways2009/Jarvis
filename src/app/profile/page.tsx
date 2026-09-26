"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, Spinner, Tabs } from "@/components/ui-client";
import { Card, CardHeader, Field, Meter, Notice, Pill, SectionLabel } from "@/components/ui";
import type {
  BusinessProfile,
  IcpSegment,
  ObjectionPlay,
  PricingTier,
  ProofPoint,
  Service,
} from "@/lib/types";

type TabId = "company" | "offer" | "market" | "grounding" | "voice" | "compliance";

const TABS: { id: TabId; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "offer", label: "Offer" },
  { id: "market", label: "Buyers" },
  { id: "grounding", label: "Local market" },
  { id: "voice", label: "Voice" },
  { id: "compliance", label: "Compliance" },
];

function SubCard({ title, onRemove, children }: { title: string; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line-soft bg-ink-900/45 p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-mist-200">{title}</h3>
        {onRemove ? (
          <button onClick={onRemove} className="text-[12px] text-danger/80 hover:text-danger">
            Remove
          </button>
        ) : null}
      </header>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** One item per line — fast for operators, and it keeps the JSON clean. */
function LinesField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="field resize-y"
        rows={rows}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
      />
    </Field>
  );
}

export default function BusinessBrainPage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [tab, setTab] = useState<TabId>("company");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "signal" | "danger"; text: string } | null>(null);
  const [completeness, setCompleteness] = useState<{ score: number; missing: string[] } | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = (await res.json()) as {
        profile: BusinessProfile;
        completeness: { score: number; missing: string[] };
      };
      setProfile(data.profile);
      setCompleteness(data.completeness);
    };
    void load();
  }, []);

  const patch = (updater: (draft: BusinessProfile) => BusinessProfile) =>
    setProfile((prev) => (prev ? updater(structuredClone(prev)) : prev));

  async function save() {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        profile: BusinessProfile;
        completeness: { score: number; missing: string[] };
        error?: string;
      };
      if (!data.ok) {
        setMessage({ tone: "danger", text: data.error ?? "Save failed." });
        return;
      }
      setProfile(data.profile);
      setCompleteness(data.completeness);
      setMessage({ tone: "signal", text: `Saved. Brain now at v${data.profile.meta.version}.` });
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-3 text-mist-500">
        <Spinner /> Loading the business brain…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber/80">Grounding</div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em]">Business brain</h1>
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-mist-500">
            Everything NEXOVIRA says, prices, proves and refuses is derived from this. Change it here and the
            composer, the dialler and the drill all move with it — no redeploy, no prompt archaeology.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={profile.meta.placeholder ? "danger" : "signal"}>
            {profile.meta.placeholder ? "Empty" : `v${profile.meta.version}`}
          </Pill>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : null}
            Save profile
          </Button>
        </div>
      </header>

      {message ? <Notice tone={message.tone === "signal" ? "signal" : "danger"}>{message.text}</Notice> : null}

      {completeness ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[240px] flex-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mist-600">
                  Completeness
                </span>
                <span className="font-mono text-[13px] text-mist-200">{completeness.score}%</span>
              </div>
              <Meter value={completeness.score} />
            </div>
            {completeness.missing.length ? (
              <p className="max-w-xl text-[12.5px] leading-5 text-mist-500">
                Still missing: {completeness.missing.join(" · ")}
              </p>
            ) : (
              <p className="text-[12.5px] text-signal">Complete — composition will be specific.</p>
            )}
          </div>
        </Card>
      ) : null}

      {profile.meta.placeholder ? (
        <Notice tone="danger" title="This profile is empty">
          Nothing here is invented on your behalf. Everything the console says is derived from these fields,
          so composition and live dispatch stay blocked until the essentials are filled in — company name,
          at least one service, and how you describe what you do.
        </Notice>
      ) : null}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "company" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader eyebrow="Identity" title="Company" />
            <div className="space-y-3.5">
              <Field label="Name">
                <input
                  className="field"
                  value={profile.company.name}
                  onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, name: e.target.value } }))}
                />
              </Field>
              <Field label="One-liner" hint="One sentence. If it needs a comma splice, it is not a one-liner.">
                <textarea
                  className="field min-h-[64px] resize-y"
                  value={profile.company.oneLiner}
                  onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, oneLiner: e.target.value } }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <input
                    className="field"
                    value={profile.company.category}
                    onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, category: e.target.value } }))}
                  />
                </Field>
                <Field label="Website">
                  <input
                    className="field"
                    value={profile.company.website}
                    onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, website: e.target.value } }))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="HQ">
                  <input
                    className="field"
                    value={profile.company.hq}
                    onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, hq: e.target.value } }))}
                  />
                </Field>
                <Field label="Timezone" hint="IANA. Governs the calling-hours gate.">
                  <input
                    className="field"
                    value={profile.company.timezone}
                    onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, timezone: e.target.value } }))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Founded">
                  <input
                    className="field"
                    value={profile.company.founded}
                    onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, founded: e.target.value } }))}
                  />
                </Field>
                <Field label="Size">
                  <input
                    className="field"
                    value={profile.company.size}
                    onChange={(e) => patch((p) => ({ ...p, company: { ...p.company, size: e.target.value } }))}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Caller identity"
              title="Who is speaking"
              subtitle="Read on every call. The callback number is offered in the voicemail."
            />
            <div className="space-y-3.5">
              <Field label="Caller name">
                <input
                  className="field"
                  value={profile.sender.name}
                  onChange={(e) => patch((p) => ({ ...p, sender: { ...p.sender, name: e.target.value } }))}
                />
              </Field>
              <Field label="Role">
                <input
                  className="field"
                  value={profile.sender.role}
                  onChange={(e) => patch((p) => ({ ...p, sender: { ...p.sender, role: e.target.value } }))}
                />
              </Field>
              <Field label="Callback number" hint="E.164. Also used as the warm-transfer target when no dedicated number is set.">
                <input
                  className="field font-mono"
                  value={profile.sender.callbackNumber}
                  onChange={(e) => patch((p) => ({ ...p, sender: { ...p.sender, callbackNumber: e.target.value } }))}
                />
              </Field>
              <Field label="Email">
                <input
                  className="field"
                  value={profile.sender.email}
                  onChange={(e) => patch((p) => ({ ...p, sender: { ...p.sender, email: e.target.value } }))}
                />
              </Field>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader eyebrow="Positioning" title="Pitch, value and proof" />
            <div className="space-y-3.5">
              <Field label="Elevator pitch" hint="Four sentences maximum. Problem, mechanism, result.">
                <textarea
                  className="field min-h-[110px] resize-y"
                  value={profile.positioning.elevatorPitch}
                  onChange={(e) =>
                    patch((p) => ({ ...p, positioning: { ...p.positioning, elevatorPitch: e.target.value } }))
                  }
                />
              </Field>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <LinesField
                  label="Value propositions"
                  hint="One per line. Outcome-shaped."
                  value={profile.positioning.valueProps}
                  onChange={(next) =>
                    patch((p) => ({ ...p, positioning: { ...p.positioning, valueProps: next } }))
                  }
                  rows={5}
                />
                <LinesField
                  label="Differentiators"
                  hint="One per line. Structural, not adjectival."
                  value={profile.positioning.differentiators}
                  onChange={(next) =>
                    patch((p) => ({ ...p, positioning: { ...p.positioning, differentiators: next } }))
                  }
                  rows={5}
                />
              </div>

              <SectionLabel>Proof points</SectionLabel>
              <div className="grid gap-3 md:grid-cols-2">
                {profile.positioning.proofPoints.map((proof, index) => (
                  <SubCard
                    key={proof.id}
                    title={proof.label || `Proof ${index + 1}`}
                    onRemove={() =>
                      patch((p) => ({
                        ...p,
                        positioning: {
                          ...p.positioning,
                          proofPoints: p.positioning.proofPoints.filter((item) => item.id !== proof.id),
                        },
                      }))
                    }
                  >
                    <Field label="Client / situation">
                      <input
                        className="field"
                        value={proof.label}
                        onChange={(e) =>
                          patch((p) => {
                            p.positioning.proofPoints = p.positioning.proofPoints.map((item) =>
                              item.id === proof.id ? { ...item, label: e.target.value } : item,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                    <Field label="What you did">
                      <textarea
                        className="field min-h-[60px] resize-y"
                        value={proof.detail}
                        onChange={(e) =>
                          patch((p) => {
                            p.positioning.proofPoints = p.positioning.proofPoints.map((item) =>
                              item.id === proof.id ? { ...item, detail: e.target.value } : item,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                    <Field label="Metric" hint="Numbers win arguments. If you have one, lead with it.">
                      <input
                        className="field"
                        value={proof.metric ?? ""}
                        onChange={(e) =>
                          patch((p) => {
                            p.positioning.proofPoints = p.positioning.proofPoints.map((item) =>
                              item.id === proof.id ? { ...item, metric: e.target.value } : item,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                  </SubCard>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  patch((p) => {
                    const blank: ProofPoint = {
                      id: `pp_${Date.now()}`,
                      label: "",
                      detail: "",
                      metric: "",
                    };
                    p.positioning.proofPoints = [...p.positioning.proofPoints, blank];
                    return p;
                  })
                }
              >
                Add proof point
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "offer" ? (
        <div className="space-y-5">
          <Card>
            <CardHeader
              eyebrow="Services"
              title="What you sell"
              subtitle="Outcomes and qualifiers matter more than descriptions — the composer matches prospect language against them."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {profile.services.map((service: Service, index) => (
                <SubCard
                  key={service.id}
                  title={service.name || `Service ${index + 1}`}
                  onRemove={() =>
                    patch((p) => ({ ...p, services: p.services.filter((s) => s.id !== service.id) }))
                  }
                >
                  <Field label="Name">
                    <input
                      className="field"
                      value={service.name}
                      onChange={(e) =>
                        patch((p) => {
                          p.services = p.services.map((s) => (s.id === service.id ? { ...s, name: e.target.value } : s));
                          return p;
                        })
                      }
                    />
                  </Field>
                  <Field label="Summary">
                    <textarea
                      className="field min-h-[64px] resize-y"
                      value={service.summary}
                      onChange={(e) =>
                        patch((p) => {
                          p.services = p.services.map((s) =>
                            s.id === service.id ? { ...s, summary: e.target.value } : s,
                          );
                          return p;
                        })
                      }
                    />
                  </Field>
                  <LinesField
                    label="Outcomes"
                    hint="One per line. What changes for the client."
                    value={service.outcomes}
                    onChange={(next) =>
                      patch((p) => {
                        p.services = p.services.map((s) => (s.id === service.id ? { ...s, outcomes: next } : s));
                        return p;
                      })
                    }
                  />
                  <LinesField
                    label="Qualifiers"
                    hint="One per line. Phrases a prospect might use when this is their problem — these drive matching."
                    value={service.qualifiers}
                    onChange={(next) =>
                      patch((p) => {
                        p.services = p.services.map((s) => (s.id === service.id ? { ...s, qualifiers: next } : s));
                        return p;
                      })
                    }
                  />
                  <LinesField
                    label="Discovery questions"
                    hint="One per line. What you actually need to ask when this service is the subject. Leave blank and the composer uses a neutral set — never a set written for someone else's industry."
                    value={service.discoveryQuestions ?? []}
                    rows={4}
                    onChange={(next) =>
                      patch((p) => {
                        p.services = p.services.map((s) =>
                          s.id === service.id ? { ...s, discoveryQuestions: next } : s,
                        );
                        return p;
                      })
                    }
                  />
                  <Field label="Price anchor">
                    <input
                      className="field"
                      value={service.priceAnchor ?? ""}
                      onChange={(e) =>
                        patch((p) => {
                          p.services = p.services.map((s) =>
                            s.id === service.id ? { ...s, priceAnchor: e.target.value } : s,
                          );
                          return p;
                        })
                      }
                    />
                  </Field>
                </SubCard>
              ))}
            </div>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() =>
                patch((p) => {
                  p.services = [
                    ...p.services,
                    {
                      id: `svc_${Date.now()}`,
                      name: "",
                      summary: "",
                      outcomes: [],
                      qualifiers: [],
                      priceAnchor: "",
                    },
                  ];
                  return p;
                })
              }
            >
              Add service
            </Button>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Commercials"
              title="Pricing"
              subtitle="Give the engine real numbers. Vague pricing produces vague calls and stalled deals."
            />
            <div className="space-y-3.5">
              <div className="rounded-xl border border-line-soft bg-ink-900/55 p-4">
                <span className="label">How you talk about money</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { id: "budget_led", title: "Budget-led", body: "Never quote. Ask for their figure, scope to it honestly. Standard practice across much of the Nigerian SME market." },
                    { id: "quoted", title: "Quoted", body: "Publish an anchor. The assistant may state your price once, from the profile." },
                  ] as const).map((option) => {
                    const active = profile.pricing.disclosure === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() =>
                          patch((p) => ({ ...p, pricing: { ...p.pricing, disclosure: option.id } }))
                        }
                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          active ? "border-amber/45 bg-amber-soft" : "border-line bg-panel hover:border-mist-600/50"
                        }`}
                      >
                        <div className={`text-[13px] font-medium ${active ? "text-amber" : "text-mist-200"}`}>
                          {option.title}
                        </div>
                        <div className="mt-0.5 text-[11.5px] leading-4 text-mist-600">{option.body}</div>
                      </button>
                    );
                  })}
                </div>
                {profile.pricing.disclosure === "budget_led" ? (
                  <p className="mt-3 text-[12px] leading-5 text-signal">
                    The live call engine and the composer are locked against quoting. Your price bands below are
                    treated as internal scoping only — described as scope, never read aloud.
                  </p>
                ) : (
                  <p className="mt-3 text-[12px] leading-5 text-amber">
                    Quoted mode. The assistant will state your anchor and let the buyer respond.
                  </p>
                )}
              </div>

              <div className="grid gap-3.5 lg:grid-cols-2">
                <Field label="Currency symbol">
                  <input
                    className="field font-mono"
                    placeholder="₦"
                    value={profile.pricing.currency}
                    onChange={(e) => patch((p) => ({ ...p, pricing: { ...p.pricing, currency: e.target.value } }))}
                  />
                </Field>
                <Field label="Payment terms">
                  <input
                    className="field"
                    value={profile.pricing.paymentTerms}
                    onChange={(e) =>
                      patch((p) => ({ ...p, pricing: { ...p.pricing, paymentTerms: e.target.value } }))
                    }
                  />
                </Field>
              </div>

              <Field label="How to ask for their budget" hint="The exact line the assistant uses. Keep it honest and unapologetic.">
                <textarea
                  className="field min-h-[68px] resize-y"
                  value={profile.pricing.budgetPrompt}
                  onChange={(e) =>
                    patch((p) => ({ ...p, pricing: { ...p.pricing, budgetPrompt: e.target.value } }))
                  }
                />
              </Field>

              <Field label="When they will not name a figure">
                <textarea
                  className="field min-h-[68px] resize-y"
                  value={profile.pricing.noBudgetResponse}
                  onChange={(e) =>
                    patch((p) => ({ ...p, pricing: { ...p.pricing, noBudgetResponse: e.target.value } }))
                  }
                />
              </Field>

              <SectionLabel>Scoping bands — internal only</SectionLabel>
              <p className="-mt-1 text-[12px] leading-5 text-mist-500">
                These let the assistant answer usefully when a buyer names a budget: it describes the <em>scope</em>{" "}
                that fits, never the range. Nothing here is spoken aloud.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {profile.pricing.budgetBands.map((band, index) => (
                  <SubCard
                    key={band.id}
                    title={band.label || `Band ${index + 1}`}
                    onRemove={() =>
                      patch((p) => ({
                        ...p,
                        pricing: { ...p.pricing, budgetBands: p.pricing.budgetBands.filter((b) => b.id !== band.id) },
                      }))
                    }
                  >
                    <Field label="Label">
                      <input
                        className="field"
                        value={band.label}
                        onChange={(e) =>
                          patch((p) => {
                            p.pricing.budgetBands = p.pricing.budgetBands.map((b) =>
                              b.id === band.id ? { ...b, label: e.target.value } : b,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                    <Field label="Range (internal)" hint="e.g. 250,000 - 600,000">
                      <input
                        className="field font-mono"
                        value={band.range}
                        onChange={(e) =>
                          patch((p) => {
                            p.pricing.budgetBands = p.pricing.budgetBands.map((b) =>
                              b.id === band.id ? { ...b, range: e.target.value } : b,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                    <Field label="What it buys (sayable)" hint="Describe scope, not cost. This is what the assistant may say aloud.">
                      <textarea
                        className="field min-h-[64px] resize-y"
                        value={band.scope}
                        onChange={(e) =>
                          patch((p) => {
                            p.pricing.budgetBands = p.pricing.budgetBands.map((b) =>
                              b.id === band.id ? { ...b, scope: e.target.value } : b,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                  </SubCard>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  patch((p) => {
                    p.pricing.budgetBands = [
                      ...p.pricing.budgetBands,
                      { id: `band_${Date.now()}`, label: "", range: "", scope: "" },
                    ];
                    return p;
                  })
                }
              >
                Add scoping band
              </Button>

              <SectionLabel>Published tiers (optional)</SectionLabel>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Field label="Pricing model">
                  <input
                    className="field"
                    value={profile.pricing.model}
                    onChange={(e) => patch((p) => ({ ...p, pricing: { ...p.pricing, model: e.target.value } }))}
                  />
                </Field>
                <Field label="Anchor line" hint="Only used in quoted mode.">
                  <input
                    className="field"
                    value={profile.pricing.anchor}
                    onChange={(e) => patch((p) => ({ ...p, pricing: { ...p.pricing, anchor: e.target.value } }))}
                  />
                </Field>
              </div>
              <Field label="Commercial notes">
                <textarea
                  className="field min-h-[64px] resize-y"
                  value={profile.pricing.commercialNotes}
                  onChange={(e) =>
                    patch((p) => ({ ...p, pricing: { ...p.pricing, commercialNotes: e.target.value } }))
                  }
                />
              </Field>

              <SectionLabel>Tiers</SectionLabel>
              <div className="grid gap-3 lg:grid-cols-3">
                {profile.pricing.tiers.map((tier: PricingTier, index) => (
                  <SubCard
                    key={tier.id}
                    title={tier.name || `Tier ${index + 1}`}
                    onRemove={() =>
                      patch((p) => ({
                        ...p,
                        pricing: { ...p.pricing, tiers: p.pricing.tiers.filter((t) => t.id !== tier.id) },
                      }))
                    }
                  >
                    <Field label="Name">
                      <input
                        className="field"
                        value={tier.name}
                        onChange={(e) =>
                          patch((p) => {
                            p.pricing.tiers = p.pricing.tiers.map((t) =>
                              t.id === tier.id ? { ...t, name: e.target.value } : t,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Price">
                        <input
                          className="field"
                          value={tier.price}
                          onChange={(e) =>
                            patch((p) => {
                              p.pricing.tiers = p.pricing.tiers.map((t) =>
                                t.id === tier.id ? { ...t, price: e.target.value } : t,
                              );
                              return p;
                            })
                          }
                        />
                      </Field>
                      <Field label="Cadence">
                        <input
                          className="field"
                          value={tier.cadence}
                          onChange={(e) =>
                            patch((p) => {
                              p.pricing.tiers = p.pricing.tiers.map((t) =>
                                t.id === tier.id ? { ...t, cadence: e.target.value } : t,
                              );
                              return p;
                            })
                          }
                        />
                      </Field>
                    </div>
                    <LinesField
                      label="Includes"
                      value={tier.includes}
                      onChange={(next) =>
                        patch((p) => {
                          p.pricing.tiers = p.pricing.tiers.map((t) =>
                            t.id === tier.id ? { ...t, includes: next } : t,
                          );
                          return p;
                        })
                      }
                    />
                    <Field label="Best for">
                      <input
                        className="field"
                        value={tier.bestFor ?? ""}
                        onChange={(e) =>
                          patch((p) => {
                            p.pricing.tiers = p.pricing.tiers.map((t) =>
                              t.id === tier.id ? { ...t, bestFor: e.target.value } : t,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                  </SubCard>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  patch((p) => {
                    p.pricing.tiers = [
                      ...p.pricing.tiers,
                      { id: `tier_${Date.now()}`, name: "", price: "", cadence: "", includes: [], bestFor: "" },
                    ];
                    return p;
                  })
                }
              >
                Add tier
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "market" ? (
        <div className="space-y-5">
          <Card>
            <CardHeader
              eyebrow="Ideal customer"
              title="Segments"
              subtitle="Triggers are the difference between a list and a reason to call today."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {profile.icp.segments.map((segment: IcpSegment, index) => (
                <SubCard
                  key={segment.name || index}
                  title={segment.name || `Segment ${index + 1}`}
                  onRemove={() =>
                    patch((p) => ({
                      ...p,
                      icp: { ...p.icp, segments: p.icp.segments.filter((_, i) => i !== index) },
                    }))
                  }
                >
                  <Field label="Name">
                    <input
                      className="field"
                      value={segment.name}
                      onChange={(e) =>
                        patch((p) => {
                          p.icp.segments = p.icp.segments.map((s, i) =>
                            i === index ? { ...s, name: e.target.value } : s,
                          );
                          return p;
                        })
                      }
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      className="field min-h-[64px] resize-y"
                      value={segment.description}
                      onChange={(e) =>
                        patch((p) => {
                          p.icp.segments = p.icp.segments.map((s, i) =>
                            i === index ? { ...s, description: e.target.value } : s,
                          );
                          return p;
                        })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Size range">
                      <input
                        className="field"
                        value={segment.sizeRange ?? ""}
                        onChange={(e) =>
                          patch((p) => {
                            p.icp.segments = p.icp.segments.map((s, i) =>
                              i === index ? { ...s, sizeRange: e.target.value } : s,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                  </div>
                  <LinesField
                    label="Triggers"
                    hint="One per line. Observable events that make now the moment."
                    value={segment.triggers}
                    onChange={(next) =>
                      patch((p) => {
                        p.icp.segments = p.icp.segments.map((s, i) => (i === index ? { ...s, triggers: next } : s));
                        return p;
                      })
                    }
                  />
                </SubCard>
              ))}
            </div>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() =>
                patch((p) => {
                  p.icp.segments = [
                    ...p.icp.segments,
                    { name: "", description: "", sizeRange: "", triggers: [] },
                  ];
                  return p;
                })
              }
            >
              Add segment
            </Button>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader eyebrow="Qualification" title="Who to talk to, and who to refuse" />
              <div className="space-y-3.5">
                <LinesField
                  label="Decision makers"
                  value={profile.icp.decisionMakers}
                  onChange={(next) => patch((p) => ({ ...p, icp: { ...p.icp, decisionMakers: next } }))}
                />
                <LinesField
                  label="Disqualifiers"
                  hint="The engine tests for these out loud. Naming a bad fit builds credibility."
                  value={profile.icp.disqualifiers}
                  onChange={(next) => patch((p) => ({ ...p, icp: { ...p.icp, disqualifiers: next } }))}
                />
                <LinesField
                  label="Buying signals"
                  value={profile.icp.buyingSignals}
                  onChange={(next) => patch((p) => ({ ...p, icp: { ...p.icp, buyingSignals: next } }))}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                eyebrow="Rehearsal material"
                title="Objection plays"
                subtitle="Used verbatim by the live call engine when the objection is recognised."
              />
              <div className="space-y-3">
                {profile.objections.map((play: ObjectionPlay, index) => (
                  <SubCard
                    key={index}
                    title={play.objection || `Objection ${index + 1}`}
                    onRemove={() =>
                      patch((p) => ({ ...p, objections: p.objections.filter((_, i) => i !== index) }))
                    }
                  >
                    <Field label="Objection, in their words">
                      <input
                        className="field"
                        value={play.objection}
                        onChange={(e) =>
                          patch((p) => {
                            p.objections = p.objections.map((o, i) =>
                              i === index ? { ...o, objection: e.target.value } : o,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                    <Field label="Reframe">
                      <textarea
                        className="field min-h-[84px] resize-y"
                        value={play.reframe}
                        onChange={(e) =>
                          patch((p) => {
                            p.objections = p.objections.map((o, i) =>
                              i === index ? { ...o, reframe: e.target.value } : o,
                            );
                            return p;
                          })
                        }
                      />
                    </Field>
                  </SubCard>
                ))}
              </div>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() =>
                  patch((p) => {
                    p.objections = [...p.objections, { objection: "", reframe: "" }];
                    return p;
                  })
                }
              >
                Add objection play
              </Button>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "grounding" ? (
        <div className="space-y-5">
          <Notice tone="info" title="How the assistant knows your market">
            The console has no live web access, so this is the whole of what it knows about how business is
            done locally — written down and dated rather than silently assumed. Update it whenever the market
            moves. Everything here is yours to correct.
          </Notice>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader eyebrow="Context" title="Country and currency" />
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Country">
                    <input
                      className="field"
                      value={profile.market.country}
                      onChange={(e) => patch((p) => ({ ...p, market: { ...p.market, country: e.target.value } }))}
                    />
                  </Field>
                  <Field label="Currency">
                    <input
                      className="field"
                      value={profile.market.currency}
                      onChange={(e) => patch((p) => ({ ...p, market: { ...p.market, currency: e.target.value } }))}
                    />
                  </Field>
                </div>
                <Field label="Reviewed as of" hint="Stale market knowledge should be visible, not silent.">
                  <input
                    className="field"
                    value={profile.market.asOf}
                    onChange={(e) => patch((p) => ({ ...p, market: { ...p.market, asOf: e.target.value } }))}
                  />
                </Field>
                <LinesField
                  label="How business is done here"
                  rows={9}
                  hint="One per line. Buying behaviour, channels, payment habits, cultural norms."
                  value={profile.market.norms}
                  onChange={(next) => patch((p) => ({ ...p, market: { ...p.market, norms: next } }))}
                />
              </div>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader eyebrow="Empathy" title="What these buyers actually care about" />
                <LinesField
                  label="Buyer concerns"
                  rows={6}
                  value={profile.market.buyerConcerns}
                  onChange={(next) => patch((p) => ({ ...p, market: { ...p.market, buyerConcerns: next } }))}
                />
              </Card>

              <Card>
                <CardHeader
                  eyebrow="Discipline"
                  title="Never overpromise"
                  subtitle="Hard limits on what the assistant may claim. These protect you."
                />
                <LinesField
                  label="Cautions"
                  rows={5}
                  value={profile.market.cautions}
                  onChange={(next) => patch((p) => ({ ...p, market: { ...p.market, cautions: next } }))}
                />
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader
              eyebrow="Ear"
              title="Local vocabulary"
              subtitle="What the buyer says, and what they actually mean when they say it."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {profile.market.vocabulary.map((entry, index) => (
                <SubCard
                  key={index}
                  title={entry.term || `Phrase ${index + 1}`}
                  onRemove={() =>
                    patch((p) => ({
                      ...p,
                      market: { ...p.market, vocabulary: p.market.vocabulary.filter((_, i) => i !== index) },
                    }))
                  }
                >
                  <Field label="What they say">
                    <input
                      className="field"
                      value={entry.term}
                      onChange={(e) =>
                        patch((p) => {
                          p.market.vocabulary = p.market.vocabulary.map((v, i) =>
                            i === index ? { ...v, term: e.target.value } : v,
                          );
                          return p;
                        })
                      }
                    />
                  </Field>
                  <Field label="What they mean">
                    <textarea
                      className="field min-h-[64px] resize-y"
                      value={entry.meaning}
                      onChange={(e) =>
                        patch((p) => {
                          p.market.vocabulary = p.market.vocabulary.map((v, i) =>
                            i === index ? { ...v, meaning: e.target.value } : v,
                          );
                          return p;
                        })
                      }
                    />
                  </Field>
                </SubCard>
              ))}
            </div>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() =>
                patch((p) => {
                  p.market.vocabulary = [...p.market.vocabulary, { term: "", meaning: "" }];
                  return p;
                })
              }
            >
              Add phrase
            </Button>
          </Card>
        </div>
      ) : null}

      {tab === "voice" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              eyebrow="Register"
              title="Tone and vocabulary"
              subtitle="Tone guides composition. Banned words are stripped from every surface — including the live engine."
            />
            <div className="space-y-3.5">
              <LinesField
                label="Tone"
                value={profile.voice.tone}
                onChange={(next) => patch((p) => ({ ...p, voice: { ...p.voice, tone: next } }))}
              />
              <LinesField
                label="Banned words and phrases"
                rows={6}
                value={profile.voice.banned}
                onChange={(next) => patch((p) => ({ ...p, voice: { ...p.voice, banned: next } }))}
              />
              <Field label="Signature phrase" hint="The line that ends a close and hands the turn back.">
                <input
                  className="field"
                  value={profile.voice.signaturePhrase}
                  onChange={(e) => patch((p) => ({ ...p, voice: { ...p.voice, signaturePhrase: e.target.value } }))}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Targets" title="Goals" subtitle="The composer closes toward these, and the drill tests them." />
            <div className="space-y-3.5">
              <Field label="Primary goal">
                <textarea
                  className="field min-h-[64px] resize-y"
                  value={profile.goals.primary}
                  onChange={(e) => patch((p) => ({ ...p, goals: { ...p.goals, primary: e.target.value } }))}
                />
              </Field>
              <LinesField
                label="Secondary goals"
                value={profile.goals.secondary}
                onChange={(next) => patch((p) => ({ ...p, goals: { ...p.goals, secondary: next } }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Horizon">
                  <input
                    className="field"
                    value={profile.goals.horizon}
                    onChange={(e) => patch((p) => ({ ...p, goals: { ...p.goals, horizon: e.target.value } }))}
                  />
                </Field>
                <Field label="Success metric">
                  <input
                    className="field"
                    value={profile.goals.successMetric}
                    onChange={(e) => patch((p) => ({ ...p, goals: { ...p.goals, successMetric: e.target.value } }))}
                  />
                </Field>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "compliance" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              eyebrow="Non-negotiable"
              title="Disclosure and consent"
              subtitle="These lines are fenced off from language-model rewriting. Transparency must be verbatim and predictable."
            />
            <div className="space-y-3.5">
              <Field label="AI disclosure" hint="Read first, on every live call, before anything else.">
                <textarea
                  className="field min-h-[84px] resize-y"
                  value={profile.compliance.aiDisclosure}
                  onChange={(e) =>
                    patch((p) => ({ ...p, compliance: { ...p.compliance, aiDisclosure: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Opt-out line">
                <textarea
                  className="field min-h-[64px] resize-y"
                  value={profile.compliance.optOutLine}
                  onChange={(e) =>
                    patch((p) => ({ ...p, compliance: { ...p.compliance, optOutLine: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Recording notice" hint="Read whenever recording is enabled.">
                <textarea
                  className="field min-h-[64px] resize-y"
                  value={profile.compliance.recordingNotice}
                  onChange={(e) =>
                    patch((p) => ({ ...p, compliance: { ...p.compliance, recordingNotice: e.target.value } }))
                  }
                />
              </Field>
              <Field label="Consent policy">
                <textarea
                  className="field min-h-[72px] resize-y"
                  value={profile.compliance.consentPolicy}
                  onChange={(e) =>
                    patch((p) => ({ ...p, compliance: { ...p.compliance, consentPolicy: e.target.value } }))
                  }
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Limits"
              title="Hours, ceilings, suppression"
              subtitle="Enforced by the dispatch gate before any call reaches the carrier."
            />
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Calling starts (hour)">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="field font-mono"
                    value={profile.compliance.quietHours.start}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        compliance: {
                          ...p.compliance,
                          quietHours: { ...p.compliance.quietHours, start: Number(e.target.value) },
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Calling ends (hour)">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="field font-mono"
                    value={profile.compliance.quietHours.end}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        compliance: {
                          ...p.compliance,
                          quietHours: { ...p.compliance.quietHours, end: Number(e.target.value) },
                        },
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Daily cap" hint="Live calls per rolling 24 hours.">
                  <input
                    type="number"
                    min={1}
                    className="field font-mono"
                    value={profile.compliance.dailyCap}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        compliance: { ...p.compliance, dailyCap: Number(e.target.value) },
                      }))
                    }
                  />
                </Field>
                <Field label="Cooldown (hours)" hint="Minimum gap before redialling the same number.">
                  <input
                    type="number"
                    min={1}
                    className="field font-mono"
                    value={profile.compliance.cooldownHours}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        compliance: { ...p.compliance, cooldownHours: Number(e.target.value) },
                      }))
                    }
                  />
                </Field>
              </div>
              <LinesField
                label="Suppressed numbers"
                hint="One per line, E.164. Permanent. Runtime opt-outs are appended to a separate list on disk."
                value={profile.compliance.suppressedNumbers}
                onChange={(next) =>
                  patch((p) => ({ ...p, compliance: { ...p.compliance, suppressedNumbers: next } }))
                }
              />
              <Notice tone="info">
                The dialler refuses on: malformed numbers, suppression, cooldown breach, daily ceiling, local
                hour outside the window, missing credentials, missing authorisation phrase. Recording in an
                all-party-consent jurisdiction raises an explicit warning.
              </Notice>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null}
          Save profile
        </Button>
      </div>
    </div>
  );
}
