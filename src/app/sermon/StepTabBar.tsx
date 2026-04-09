"use client";

import { STEPS, type Step } from "@/lib/sermon/types";

export function StepTabBar({
  activeStep,
  onStepChange,
}: {
  activeStep: Step;
  onStepChange: (step: Step) => void;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid var(--sb-border)",
        background: "var(--sb-bg)",
        paddingLeft: "40px",
      }}
    >
      {STEPS.map((s, idx) => {
        const active = activeStep === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onStepChange(s.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "14px 20px 12px",
              marginBottom: "-1px",
              background: "none",
              border: "none",
              borderBottom: active
                ? "2px solid var(--sb-gold)"
                : "2px solid transparent",
              cursor: "pointer",
              transition: "border-color 0.15s",
              gap: "2px",
            }}
          >
            <span
              style={{
                fontSize: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: active ? "var(--sb-gold)" : "var(--sb-ink-faint)",
                lineHeight: 1,
                transition: "color 0.15s",
              }}
            >
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span
              style={{
                fontSize: "12.5px",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--sb-ink)" : "var(--sb-ink-muted)",
                letterSpacing: "0.01em",
                lineHeight: 1.2,
                transition: "color 0.15s, font-weight 0.1s",
              }}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
