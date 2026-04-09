"use client";

import { faSpinner, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Editor } from "@tiptap/core";
import type { MutableRefObject } from "react";
import { NOTES_PLACEHOLDER, STEP_INTRO, STEPS, type Step, type StepData } from "@/lib/sermon/types";
import { ProseEditor } from "./ProseEditor";

export function StepWorkspace({
  step,
  data,
  onChange,
  editorRef,
  onGenerateDraft,
  generatingDraft,
  onCursorPlaced,
}: {
  step: Step;
  data: StepData;
  onChange: (patch: Partial<StepData>) => void;
  editorRef: MutableRefObject<Editor | null>;
  onGenerateDraft?: () => void;
  generatingDraft?: boolean;
  onCursorPlaced?: () => void;
}) {
  const stepMeta = STEPS.find((s) => s.id === step)!;

  return (
    <div>
      {/* Step heading */}
      <div style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            marginBottom: "10px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: "26px",
              fontWeight: 700,
              fontStyle: "italic",
              color: "var(--sb-ink)",
              lineHeight: 1.2,
            }}
          >
            {stepMeta.label}
          </h2>

          {step === "utkast" && onGenerateDraft && (
            <button
              onClick={onGenerateDraft}
              disabled={generatingDraft}
              title="Generer prekenuttkast fra dine notater"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--sb-gold)",
                background: generatingDraft
                  ? "var(--sb-gold-light)"
                  : "var(--sb-gold)",
                color: generatingDraft ? "var(--sb-ink-meta)" : "#fff",
                cursor: generatingDraft ? "default" : "pointer",
                flexShrink: 0,
                transition: "background 0.15s, color 0.15s",
                opacity: generatingDraft ? 0.7 : 1,
              }}
            >
              {generatingDraft ? (
                <FontAwesomeIcon
                  icon={faSpinner}
                  className="animate-spin"
                  style={{ fontSize: "10px" }}
                />
              ) : (
                <FontAwesomeIcon
                  icon={faWandMagicSparkles}
                  style={{ fontSize: "10px" }}
                />
              )}
              {generatingDraft ? "Genererer…" : "Generer utkast"}
            </button>
          )}
        </div>

        <p
          style={{
            fontSize: "13px",
            color: "var(--sb-ink-meta)",
            lineHeight: 1.6,
            paddingLeft: "16px",
            borderLeft: "2px solid var(--sb-gold)",
            fontStyle: "italic",
          }}
        >
          {STEP_INTRO[step]}
        </p>
      </div>

      {/* Editor with optional generating overlay */}
      <div style={{ position: "relative" }}>
        {generatingDraft && step === "utkast" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--sb-bg)",
              opacity: 0.85,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
              zIndex: 10,
              borderRadius: "4px",
              minHeight: "300px",
            }}
          >
            <FontAwesomeIcon
              icon={faSpinner}
              className="animate-spin"
              style={{ fontSize: "20px", color: "var(--sb-gold)" }}
            />
            <p
              style={{
                fontSize: "13px",
                fontStyle: "italic",
                color: "var(--sb-ink-meta)",
                fontFamily: "var(--font-playfair), Georgia, serif",
              }}
            >
              Genererer prekenuttkast…
            </p>
          </div>
        )}
        <ProseEditor
          key={step}
          initialJson={data.draftJson}
          onChange={(draftJson, notes) => onChange({ draftJson, notes })}
          editorRef={editorRef}
          placeholder={NOTES_PLACEHOLDER[step]}
          onCursorPlaced={onCursorPlaced}
        />
      </div>
    </div>
  );
}
