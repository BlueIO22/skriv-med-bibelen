"use client";

import {
  faNoteSticky,
  faPencil,
  faSliders,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BibleReferenceAttrs, VerseEntry } from "@/lib/sermon/types";
import { saveButtonStyle, cancelButtonStyle } from "@/lib/sermon/editorStyles";

// ── Toolbar button ────────────────────────────────────────────────────────────

export function BibleRefToolBtn({
  icon,
  label,
  onClick,
}: {
  icon: typeof faNoteSticky;
  label: string;
  onClick: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      style={{
        background: over ? "var(--sb-surface)" : "none",
        border: "none",
        cursor: "pointer",
        padding: "3px 9px",
        color: over ? "var(--sb-ink)" : "var(--sb-ink-meta)",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 16,
        fontFamily: "inherit",
        transition: "background 0.12s, color 0.12s",
      }}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 10 }} />
      {label}
    </button>
  );
}

// ── Node view ─────────────────────────────────────────────────────────────────

export function BibleReferenceView({ node, updateAttributes, selected, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as BibleReferenceAttrs;
  const sorted = [...(attrs.verses ?? [])].sort((a, b) => a.versenumber - b.versenumber);

  const [hovered, setHovered] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [commentDraft, setCommentDraft] = useState(attrs.comment ?? "");
  const [editVerses, setEditVerses] = useState<VerseEntry[]>(sorted);
  const [chapterVerses, setChapterVerses] = useState<VerseEntry[]>([]);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const adjustScrollRef = useRef<HTMLDivElement>(null);
  const adjustPopoverRef = useRef<HTMLDivElement>(null);

  const showToolbar = (hovered || selected) && !commenting && !editing && !adjusting;

  useEffect(() => {
    if (!adjusting) return;
    const handler = (e: MouseEvent) => {
      if (adjustPopoverRef.current && !adjustPopoverRef.current.contains(e.target as globalThis.Node)) {
        setAdjusting(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [adjusting]);

  useEffect(() => {
    if (!adjusting || loadingChapter || chapterVerses.length === 0) return;
    const container = adjustScrollRef.current;
    if (!container) return;
    const selectedVerseNumbers = new Set((attrs.verses ?? []).map((v) => v.versenumber));
    const firstSelected = chapterVerses.find((v) => selectedVerseNumbers.has(v.versenumber));
    if (!firstSelected) return;
    const idx = chapterVerses.indexOf(firstSelected);
    const btn = container.querySelectorAll<HTMLButtonElement>("button")[idx];
    if (btn) btn.scrollIntoView({ block: "center" });
  }, [adjusting, loadingChapter, chapterVerses, attrs.verses]);

  const openAdjust = useCallback(async () => {
    setAdjusting(true);
    setLoadingChapter(true);
    try {
      const res = await fetch(`/api/verses?ref=${encodeURIComponent(attrs.reference)}`);
      if (res.ok) {
        const data = await res.json();
        setChapterVerses((data.verses as VerseEntry[]) ?? []);
      }
    } finally {
      setLoadingChapter(false);
    }
  }, [attrs.reference]);

  const toggleVerse = (v: VerseEntry) => {
    const current = attrs.verses ?? [];
    const exists = current.some((cv) => cv.versenumber === v.versenumber);
    const next = exists
      ? current.filter((cv) => cv.versenumber !== v.versenumber)
      : [...current, v].sort((a, b) => a.versenumber - b.versenumber);
    updateAttributes({ verses: next });
  };

  return (
    <NodeViewWrapper contentEditable={false}>
      <div
        style={{ position: "relative", margin: "30px 0 12px" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Toolbar */}
        {showToolbar && (
          <div
            style={{
              position: "absolute", top: -26, right: 0,
              display: "flex", alignItems: "center",
              background: "var(--sb-bg)", border: "1px solid var(--sb-border)",
              borderRadius: 20, padding: "2px 4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)", zIndex: 10,
            }}
          >
            <BibleRefToolBtn icon={faNoteSticky} label="Notat" onClick={() => setCommenting(true)} />
            <div style={{ width: 1, background: "var(--sb-border)", margin: "3px 2px" }} />
            <BibleRefToolBtn icon={faPencil} label="Rediger" onClick={() => setEditing(true)} />
            <div style={{ width: 1, background: "var(--sb-border)", margin: "3px 2px" }} />
            <BibleRefToolBtn icon={faSliders} label="Juster" onClick={openAdjust} />
            <div style={{ width: 1, background: "var(--sb-border)", margin: "3px 2px" }} />
            <BibleRefToolBtn icon={faTrash} label="Fjern" onClick={() => deleteNode()} />
          </div>
        )}

        {/* Verse block */}
        <div
          style={{
            borderLeft: "3px solid var(--sb-gold)",
            background: selected ? "var(--sb-gold-light)" : "transparent",
            cursor: hovered ? "pointer" : "text",
            padding: "10px 14px 10px 16px",
            borderRadius: "0 5px 5px 0",
            boxShadow: selected ? "0 0 0 2px var(--sb-gold)" : "none",
            transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
          }}
        >
          {editing ? (
            <div>
              {editVerses.map((v, i) => (
                <div key={v.versenumber} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sb-ink-meta)", paddingTop: 7, minWidth: 18, textAlign: "right", flexShrink: 0 }}>
                    {v.versenumber}
                  </span>
                  <textarea
                    value={v.versecontent}
                    onChange={(e) => {
                      const next = [...editVerses];
                      next[i] = { ...v, versecontent: e.target.value };
                      setEditVerses(next);
                    }}
                    rows={2}
                    style={{
                      flex: 1, background: "var(--sb-bg)", border: "1px solid var(--sb-border)",
                      borderRadius: 4, padding: "4px 8px", fontSize: 14, color: "var(--sb-ink)",
                      resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { updateAttributes({ verses: editVerses }); setEditing(false); }} style={saveButtonStyle}>Lagre</button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditVerses(sorted); setEditing(false); }} style={cancelButtonStyle}>Avbryt</button>
              </div>
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ margin: 0, color: "var(--sb-ink-muted)", fontStyle: "italic", fontSize: 13 }}>
                Ingen vers valgt, du kan velge i listen, eller fjerne.
              </p>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => deleteNode()}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--sb-ink-muted)", fontSize: 12, display: "flex",
                  alignItems: "center", gap: 4, padding: "2px 6px",
                  borderRadius: 4, fontFamily: "inherit", flexShrink: 0,
                }}
              >
                <FontAwesomeIcon icon={faTrash} style={{ fontSize: 10 }} />
                Fjern
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--sb-ink-soft)", fontStyle: "italic", lineHeight: 1.85 }}>
              {sorted.map((v, i) => (
                <span key={v.versenumber}>
                  <sup style={{ fontSize: "0.63em", fontWeight: 700, color: "var(--sb-ink-meta)", marginRight: 1 }}>
                    {v.versenumber}
                  </sup>
                  {v.versecontent}
                  {i < sorted.length - 1
                    ? sorted[i + 1].versenumber - v.versenumber > 1
                      ? <br />
                      : " "
                    : ""}
                </span>
              ))}
              {sorted.length > 0 && (
                <span style={{ fontStyle: "normal", fontWeight: 500, color: "var(--sb-ink-meta)" }}>
                  {" "}— {attrs.reference}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Juster popover */}
        {adjusting && (
          <div
            ref={adjustPopoverRef}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
              background: "var(--sb-bg)", border: "1px solid var(--sb-border)",
              borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.14)",
              zIndex: 100, overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px 8px", borderBottom: "1px solid var(--sb-border-mid)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--sb-ink-meta)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                {attrs.reference}
              </span>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setAdjusting(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--sb-ink-muted)", fontSize: 18, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>
            <div ref={adjustScrollRef} style={{ maxHeight: 300, overflowY: "auto", padding: "6px 8px 8px" }}>
              {loadingChapter ? (
                <div style={{ textAlign: "center", padding: "18px 0", color: "var(--sb-ink-muted)", fontSize: 13 }}>Laster…</div>
              ) : chapterVerses.map((v) => {
                const on = (attrs.verses ?? []).some((cv) => cv.versenumber === v.versenumber);
                return (
                  <button
                    key={v.versenumber}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleVerse(v)}
                    style={{
                      display: "flex", alignItems: "baseline", gap: 8, width: "100%",
                      background: on ? "var(--sb-gold-light)" : "transparent",
                      border: on ? "1px solid rgba(200,168,75,0.45)" : "1px solid transparent",
                      borderRadius: 6, padding: "5px 8px", marginBottom: 2,
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      transition: "background 0.1s, border-color 0.1s",
                    }}
                  >
                    <sup style={{ fontSize: 10, fontWeight: 700, color: on ? "var(--sb-gold)" : "var(--sb-ink-muted)", minWidth: 16, flexShrink: 0 }}>
                      {v.versenumber}
                    </sup>
                    <span style={{ fontSize: 13, color: on ? "var(--sb-ink)" : "var(--sb-ink-soft)", lineHeight: 1.55, fontStyle: "italic" }}>
                      {v.versecontent}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notat input */}
        {commenting && (
          <div
            style={{
              marginTop: 4, padding: "8px 12px",
              background: "var(--sb-bg-alt, #f8f6f1)", border: "1px solid var(--sb-border)",
              borderRadius: "0 5px 5px 0", borderLeft: "3px solid var(--sb-ink-meta)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sb-ink-meta)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
              Notat
            </div>
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Skriv ditt notat her…"
              rows={3}
              autoFocus
              style={{
                width: "100%", background: "transparent", border: "none", outline: "none",
                resize: "vertical", fontFamily: "inherit", fontSize: 14,
                color: "var(--sb-ink)", lineHeight: 1.65, boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { updateAttributes({ comment: commentDraft }); setCommenting(false); }} style={saveButtonStyle}>Lagre</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setCommentDraft(attrs.comment ?? ""); setCommenting(false); }} style={cancelButtonStyle}>Avbryt</button>
            </div>
          </div>
        )}

        {/* Saved notat */}
        {attrs.comment && !commenting && (
          <div
            onClick={() => setCommenting(true)}
            title="Klikk for å redigere notat"
            style={selected ? {
              marginTop: 3, padding: "5px 12px 5px 16px",
              background: "var(--sb-bg-alt, #f8f6f1)", borderLeft: "3px solid var(--sb-ink-meta)",
              borderRadius: "0 4px 4px 0", fontSize: 13, color: "var(--sb-ink-soft)",
              lineHeight: 1.55, cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            } : {
              marginTop: 4, padding: "0 0 0 19px",
              fontSize: 13, color: "var(--sb-ink-soft)",
              fontStyle: "italic", lineHeight: 1.55, cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <FontAwesomeIcon icon={faNoteSticky} style={{ fontSize: 10, opacity: 0.5, marginRight: 5 }} />
            {attrs.comment}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ── Tiptap node definition ────────────────────────────────────────────────────

export const BibleReference = Node.create({
  name: "bibleReference",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      reference: { default: "" },
      verses: { default: [] },
      comment: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-type=\"bibleReference\"]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const { reference, verses } = HTMLAttributes;
    const sorted = [...((verses as VerseEntry[]) ?? [])].sort((a, b) => a.versenumber - b.versenumber);
    const text = sorted.map((v) => `${v.versenumber} ${v.versecontent}`).join(" ");
    return [
      "div",
      mergeAttributes({ "data-type": "bibleReference" }, HTMLAttributes),
      `${text} — ${reference}`,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BibleReferenceView);
  },
});
