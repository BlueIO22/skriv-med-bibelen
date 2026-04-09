"use client";

import type { LectionaryText, VerseRow } from "@/app/api/sermon/texts/route";
import {
  faChevronDown,
  faChevronUp,
  faPaste,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

export function TextCard({
  text,
  label,
  onPasteVerse,
}: {
  text: LectionaryText;
  label: string;
  onPasteVerse?: (verseRow: VerseRow) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--sb-border-mid)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0",
          gap: "10px",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontSize: "11.5px",
            fontWeight: 500,
            color: open ? "var(--sb-ink)" : "var(--sb-ink-soft)",
            transition: "color 0.15s",
            lineHeight: 1.4,
          }}
        >
          {label}
        </span>
        <FontAwesomeIcon
          icon={open ? faChevronUp : faChevronDown}
          style={{
            color: "var(--sb-ink-faint)",
            fontSize: "9px",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div style={{ paddingBottom: "20px", paddingTop: "4px" }}>
          {text.verses.map((v) => (
            <div
              key={v.versenumber}
              className="verse-row"
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "6px",
                lineHeight: 1.75,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  color: "var(--sb-ink-faint)",
                  fontSize: "10px",
                  fontVariantNumeric: "tabular-nums",
                  userSelect: "none",
                  flexShrink: 0,
                  marginTop: "2px",
                  minWidth: "16px",
                  textAlign: "right",
                }}
              >
                {v.versenumber}
              </span>
              <span
                style={{
                  fontSize: "12.5px",
                  color: "var(--sb-ink-soft)",
                  flex: 1,
                }}
              >
                {v.versecontent}
              </span>
              {onPasteVerse && (
                <button
                  className="verse-paste-btn"
                  onClick={() => onPasteVerse(v)}
                  title="Lim inn i editor"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0 0",
                    flexShrink: 0,
                    color: "var(--sb-gold)",
                    height: "12px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <FontAwesomeIcon
                    icon={faPaste}
                    style={{ fontSize: "12px" }}
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
