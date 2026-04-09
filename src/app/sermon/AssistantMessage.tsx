"use client";

import { extractBibleRefs } from "@/lib/sermon/bibleRefUtils";
import ReactMarkdown from "react-markdown";

function RefChip({
  ref: refText,
  onInsert,
}: {
  ref: string;
  onInsert: (ref: string) => void;
}) {
  return (
    <button
      onClick={() => onInsert(refText)}
      title={`Sett inn ${refText} i arbeidsteksten`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "10.5px",
        fontWeight: 500,
        padding: "3px 9px",
        borderRadius: "4px",
        border: "1px solid var(--sb-gold)",
        background: "var(--sb-gold-light)",
        color: "var(--sb-ink-soft)",
        cursor: "pointer",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--sb-gold)";
        e.currentTarget.style.color = "#fff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--sb-gold-light)";
        e.currentTarget.style.color = "var(--sb-ink-soft)";
      }}
    >
      ↓ {refText}
    </button>
  );
}

export function AssistantMessage({
  content,
  onInsertRef,
}: {
  content: string;
  onInsertRef: (ref: string) => void;
}) {
  const detectedRefs = extractBibleRefs(content);
  return (
    <div style={{ fontSize: "12.5px", lineHeight: 1.7 }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p style={{ marginBottom: "6px" }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul style={{ paddingLeft: "16px", margin: "4px 0" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ paddingLeft: "16px", margin: "4px 0" }}>{children}</ol>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600 }}>{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {detectedRefs.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "5px",
            marginTop: "10px",
            paddingTop: "8px",
            borderTop: "1px solid var(--sb-border-mid)",
          }}
        >
          {detectedRefs.map((r) => (
            <RefChip key={r} ref={r} onInsert={onInsertRef} />
          ))}
        </div>
      )}
    </div>
  );
}
