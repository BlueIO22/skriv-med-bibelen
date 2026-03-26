"use client";

import {
  faArrowRight,
  faBars,
  faBookOpen,
  faCheck,
  faChevronDown,
  faChevronUp,
  faCopy,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLE_PROMPTS = [
  "Hva sier Bibelen om kjærlighet?",
  "Hva betyr det å ha tro?",
  "Hva sier Bibelen om tilgivelse?",
];

// ── Bible reference extraction & grouping ────────────────────────────────────

const BIBLE_PATTERN_SRC = String.raw`(?:(?:[123]\.?\s*)(?:Mos(?:ebok)?|Samuel(?:sbok)?|Kong(?:ebok)?|Krønike(?:bok)?|Korinter(?:brev)?|Tessaloniker(?:brev)?|Timoteus(?:brev)?|Johannes(?:brev)?|Peter(?:s\s*brev)?)|Josva|Dommerne|Rut|Esra|Nehemja|Ester|Job|Salmene|Salme|Sal|Ordspråkene|Forkynneren|Høysangen|Jesaja|Jeremia|Klagesangene|Esekiel|Daniel|Hosea|Joel|Amos|Obadja|Jona|Mika|Nahum|Habakkuk|Sefanja|Haggai|Sakarja|Malaki|Matteus|Matt\b|Markus|Mark\b|Lukas|Luk\b|Johannes|Joh\b|Apostlenes\s+gjerninger|Apg|Romerne|Rom\b|Galaterbrevet|Gal\b|Efeserbrevet|Ef\b|Filipperbrevet|Fil\b|Kolosserbrevet|Kol\b|Titus|Filemon|Hebreerne|Hebr|Jakobs?\s*brev|Jak\b|Åpenbaringen|Åp|Judas)\s+\d+(?:[,:.]\d+(?:\s*[-–]\s*\d+)?)?`;

// Parse "Book chapter" or "Book chapter:from[-to]" into parts.
// Returns null if the string doesn't look like a valid ref.
function parseRef(
  ref: string,
): { book: string; chapter: number; verses: number[] } | null {
  const m = ref.match(/^(.*?)\s+(\d+)(?:[,:](\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!m) return null;
  const book = m[1].trim();
  const chapter = parseInt(m[2], 10);
  const verses: number[] = [];
  if (m[3]) {
    const from = parseInt(m[3], 10);
    const to = m[4] ? parseInt(m[4], 10) : from;
    for (let v = from; v <= to; v++) verses.push(v);
  }
  return { book, chapter, verses };
}

// Compact a sorted, deduped list of verse numbers into "1-3.5.7-9" notation.
function mergeVerses(verses: number[]): string {
  if (verses.length === 0) return "";
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const segments: string[] = [];
  let start = sorted[0],
    end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      segments.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  segments.push(start === end ? `${start}` : `${start}-${end}`);
  return segments.join(".");
}

// Extract raw matches, then group by book+chapter, merging all verses.
function extractBibleRefs(text: string): string[] {
  const re = new RegExp(BIBLE_PATTERN_SRC, "gi");
  const raw = [...text.matchAll(re)].map((m) => m[0].trim());

  // Group by "Book chapter"
  const groups = new Map<
    string,
    { book: string; chapter: number; verses: number[]; hasChapterOnly: boolean }
  >();
  for (const ref of raw) {
    const p = parseRef(ref);
    if (!p) continue;
    const key = `${p.book} ${p.chapter}`;
    if (!groups.has(key)) {
      groups.set(key, {
        book: p.book,
        chapter: p.chapter,
        verses: [],
        hasChapterOnly: false,
      });
    }
    const g = groups.get(key)!;
    if (p.verses.length === 0) {
      g.hasChapterOnly = true;
    } else {
      g.verses.push(...p.verses);
    }
  }

  // Render each group into a display string
  return [...groups.values()].map(
    ({ book, chapter, verses, hasChapterOnly }) => {
      if (hasChapterOnly || verses.length === 0) return `${book} ${chapter}`;
      return `${book} ${chapter}:${mergeVerses(verses)}`;
    },
  );
}

// ── Ornament ─────────────────────────────────────────────────────────────────

function Ornament({ size = 14 }: { size?: number }) {
  return (
    <FontAwesomeIcon
      icon={faBookOpen}
      aria-hidden
      style={{
        color: "var(--gold)",
        fontSize: `${size}px`,
        flexShrink: 0,
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
        fontSize: "9px",
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--muted)",
      }}
    >
      {children}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div
      className="animate-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "0 24px",
      }}
    >
      {/* Masthead-style title block */}
      <div
        style={{ textAlign: "center", marginBottom: "52px", maxWidth: "560px" }}
      >
        <h1
          style={{
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            color: "var(--ink)",
            marginBottom: "14px",
          }}
        >
          Skriv med Bibelen
        </h1>
        <p
          style={{
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            fontSize: "15px",
            fontWeight: 300,
            lineHeight: 1.7,
            color: "var(--ink-soft)",
            letterSpacing: "0.01em",
          }}
        >
          Still et spørsmål og motta svar forankret i Norsk Bibel 88/07 —
          norsk-bibel.no
        </p>
      </div>

      {/* Example prompts */}
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ borderTop: "1px solid var(--rule)" }}>
          {EXAMPLE_PROMPTS.map((p, i) => (
            <button
              key={p}
              onClick={() => onPrompt(p)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "16px 0",
                borderBottom: "1px solid var(--rule)",
                background: "none",
                cursor: "pointer",
                textAlign: "left",
                animationDelay: `${0.08 + i * 0.06}s`,
                opacity: 0,
                animation: "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
              }}
              className="group"
            >
              <span
                style={{
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  fontSize: "9px",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  color: "var(--gold-dim)",
                  flexShrink: 0,
                  textTransform: "uppercase",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  fontSize: "14px",
                  fontWeight: 400,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {p}
              </span>
              <span
                style={{
                  color: "var(--gold)",
                  fontSize: "16px",
                  flexShrink: 0,
                  opacity: 0.6,
                }}
              >
                ›
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div
      className="animate-fade-up"
      style={{ display: "flex", justifyContent: "flex-end" }}
    >
      <div
        style={{
          maxWidth: "min(68%, 600px)",
          background: "var(--surface2)",
          border: "1px solid var(--rule-mid)",
          borderRadius: "4px 4px 0 4px",
          padding: "14px 18px",
          fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
          fontSize: "15px",
          fontWeight: 400,
          lineHeight: 1.7,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(inlineText(content)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div
      className="animate-fade-up assistant-msg"
      style={{ display: "flex", justifyContent: "flex-start" }}
    >
      <div style={{ maxWidth: "min(82%, 720px)", width: "100%" }}>
        {/* Label row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Ornament size={14} />
            <SectionLabel>Bibelens ord</SectionLabel>
          </div>

          {/* Copy button — visible on hover via CSS */}
          {!isStreaming && content && (
            <button
              onClick={handleCopy}
              title="Kopier svar"
              className="msg-copy-btn"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: copied ? "var(--gold)" : "var(--muted)",
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "2px 0",
              }}
            >
              {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
              {copied ? "Kopiert" : "Kopier"}
            </button>
          )}
        </div>

        {/* Rule */}
        <div
          style={{
            height: "1px",
            background: "var(--rule)",
            marginBottom: "18px",
          }}
        />

        {/* Content */}
        <p
          style={{
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            fontSize: "clamp(15px, 1.8vw, 17px)",
            fontWeight: 300,
            lineHeight: 1.9,
            color: "var(--ink-soft)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            letterSpacing: "0.01em",
          }}
        >
          {content}
          {isStreaming && (
            <span
              className="animate-cursor"
              style={{
                display: "inline-block",
                width: "1.5px",
                height: "1.05em",
                background: "var(--gold)",
                borderRadius: "1px",
                marginLeft: "2px",
                verticalAlign: "text-bottom",
              }}
            />
          )}
        </p>
      </div>
    </div>
  );
}

// ── Bible references panel ────────────────────────────────────────────────────

type VerseData = { versenumber: number; versecontent: string };
type RefTexts = Record<string, VerseData[] | "loading" | "error">;

function inlineText(text: string): string {
  return text
    .split(/\n{2,}/) // split on paragraph breaks
    .map((para) => para.replace(/\n/g, " ").trim()) // inline single newlines
    .filter(Boolean)
    .join("\n"); // one newline between paragraphs
}

function wordWrap(text: string, width = 80): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function buildCopyText(ref: string, verses: VerseData[]): string {
  if (verses.length === 0) return ref;
  const flat = verses
    .map((v) => `${v.versenumber} ${v.versecontent}`)
    .join(" ");
  return `${ref}\n${wordWrap(flat)}`;
}

function RefsPanel({ refs }: { refs: string[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [verseTexts, setVerseTexts] = useState<RefTexts>({});

  // Fetch verse text for each ref whenever the refs list changes
  useEffect(() => {
    for (const ref of refs) {
      if (verseTexts[ref]) continue; // already fetched or in flight
      setVerseTexts((prev) => ({ ...prev, [ref]: "loading" }));
      fetch(`/api/verses?ref=${encodeURIComponent(ref)}`)
        .then((r) => r.json())
        .then((data) => {
          setVerseTexts((prev) => ({
            ...prev,
            [ref]: Array.isArray(data.verses) ? data.verses : "error",
          }));
        })
        .catch(() => {
          setVerseTexts((prev) => ({ ...prev, [ref]: "error" }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.join("|")]);

  const doCopy = useCallback(
    (ref: string) => {
      const verses = verseTexts[ref];
      const text = Array.isArray(verses) ? buildCopyText(ref, verses) : ref;
      navigator.clipboard.writeText(text).then(() => {
        setCopied(ref);
        setTimeout(() => setCopied(null), 1800);
      });
    },
    [verseTexts],
  );

  const copyAll = useCallback(() => {
    const parts = refs.map((ref) => {
      const verses = verseTexts[ref];
      return Array.isArray(verses) ? buildCopyText(ref, verses) : ref;
    });
    navigator.clipboard.writeText(parts.join("\n\n")).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    });
  }, [refs, verseTexts]);

  if (refs.length === 0) return null;

  return (
    <div
      className="animate-slide-in"
      style={{
        borderTop: "1px solid var(--rule-mid)",
        background: "var(--surface)",
        flexShrink: 0,
      }}
    >
      {/* Header — clicking anywhere toggles collapse */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 20px",
          borderBottom: collapsed ? "none" : "1px solid var(--rule)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <SectionLabel>Bibelreferanser · {refs.length}</SectionLabel>
          <FontAwesomeIcon
            icon={collapsed ? faChevronDown : faChevronUp}
            aria-hidden
            style={{ fontSize: "9px", color: "var(--muted)" }}
          />
        </div>
        {!collapsed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyAll();
            }}
            style={{
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: copiedAll ? "var(--gold)" : "var(--muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "color 0.2s",
              padding: "2px 0",
            }}
          >
            {copiedAll ? (
              <>
                <CheckIcon /> Kopiert
              </>
            ) : (
              <>
                <CopyIcon /> Kopier alle
              </>
            )}
          </button>
        )}
      </div>

      {/* Chips — hidden when collapsed */}
      {!collapsed && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            padding: "10px 20px 12px",
            scrollbarWidth: "none",
          }}
        >
          {refs.map((ref) => {
            const state = verseTexts[ref];
            const isLoading = state === "loading";
            const isCopied = copied === ref;
            return (
              <button
                key={ref}
                onClick={() => doCopy(ref)}
                title={`Kopier vers: ${ref}`}
                disabled={isLoading}
                className="ref-chip"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexShrink: 0,
                  padding: "5px 12px",
                  background: isCopied
                    ? "var(--gold-faint)"
                    : "var(--surface2)",
                  border: `1px solid ${isCopied ? "var(--gold-dim)" : "var(--rule-mid)"}`,
                  borderRadius: "2px",
                  cursor: isLoading ? "default" : "pointer",
                  transition: "all 0.2s",
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "12px",
                    fontWeight: 400,
                    color: isCopied ? "var(--gold)" : "var(--ink-soft)",
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                    transition: "color 0.2s",
                  }}
                >
                  {ref}
                </span>
                <span
                  className={`ref-chip-icon${isCopied ? " ref-chip-icon--active" : ""}`}
                  style={{
                    color: isCopied ? "var(--gold)" : "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    transition:
                      "max-width 0.2s ease, opacity 0.2s ease, color 0.2s",
                  }}
                >
                  {isLoading ? (
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        border: "1.5px solid var(--muted)",
                        borderTopColor: "var(--gold)",
                        animation: "spin 0.8s linear infinite",
                        display: "block",
                      }}
                    />
                  ) : isCopied ? (
                    <CheckIcon size={11} />
                  ) : (
                    <CopyIcon size={11} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Icons (Font Awesome) ──────────────────────────────────────────────────────

function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <FontAwesomeIcon
      icon={faCopy}
      aria-hidden
      style={{ fontSize: `${size}px`, width: `${size}px`, height: `${size}px` }}
    />
  );
}

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <FontAwesomeIcon
      icon={faCheck}
      aria-hidden
      style={{ fontSize: `${size}px`, width: `${size}px`, height: `${size}px` }}
    />
  );
}

function SendIcon() {
  return (
    <FontAwesomeIcon
      icon={faArrowRight}
      aria-hidden
      style={{ fontSize: "13px", width: "13px", height: "13px" }}
    />
  );
}

// ── localStorage session helpers ──────────────────────────────────────────────

const LS_INDEX = "smb_sessions";
const lsKey = (id: string) => `smb_session_${id}`;

type Session = { id: string; title: string; updatedAt: string };

function lsLoadSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(LS_INDEX) ?? "[]");
  } catch {
    return [];
  }
}

function lsSaveSessionMeta(session: Session) {
  const rest = lsLoadSessions().filter((s) => s.id !== session.id);
  localStorage.setItem(LS_INDEX, JSON.stringify([session, ...rest]));
}

function lsLoadMessages(id: string): Message[] {
  try {
    return JSON.parse(localStorage.getItem(lsKey(id)) ?? "[]");
  } catch {
    return [];
  }
}

function lsSaveMessages(id: string, msgs: Message[]) {
  localStorage.setItem(lsKey(id), JSON.stringify(msgs));
}

function lsDeleteSession(id: string) {
  localStorage.removeItem(lsKey(id));
  const rest = lsLoadSessions().filter((s) => s.id !== id);
  localStorage.setItem(LS_INDEX, JSON.stringify(rest));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "I dag";
  if (days === 1) return "I går";
  if (days < 7) return `${days} dager siden`;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function PlusIcon() {
  return (
    <FontAwesomeIcon
      icon={faPlus}
      aria-hidden
      style={{ fontSize: "12px", width: "12px", height: "12px" }}
    />
  );
}

function MenuIcon() {
  return (
    <FontAwesomeIcon
      icon={faBars}
      aria-hidden
      style={{ fontSize: "15px", width: "15px", height: "15px" }}
    />
  );
}

function TrashIcon() {
  return (
    <FontAwesomeIcon
      icon={faTrash}
      aria-hidden
      style={{ fontSize: "11px", width: "11px", height: "11px" }}
    />
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  open,
  sessions,
  currentId,
  onSelect,
  onNew,
  onDelete,
}: {
  open: boolean;
  sessions: Session[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        width: open ? "256px" : "0",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        borderRight: open ? "1px solid var(--rule-mid)" : "none",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: "256px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 16px 14px",
            borderBottom: "1px solid var(--rule)",
            flexShrink: 0,
          }}
        >
          <div style={{ marginBottom: "14px" }}>
            <SectionLabel>Samtaler</SectionLabel>
          </div>
          <button
            onClick={onNew}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              padding: "8px 0",
              background: "var(--surface2)",
              border: "1px solid var(--rule-mid)",
              borderRadius: "2px",
              color: "var(--ink-soft)",
              cursor: "pointer",
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "12px",
              fontWeight: 500,
              letterSpacing: "0.04em",
              transition: "border-color 0.2s, color 0.2s",
            }}
          >
            <PlusIcon />
            Ny samtale
          </button>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {sessions.length === 0 ? (
            <div style={{ padding: "20px 16px" }}>
              <SectionLabel>Ingen samtaler ennå</SectionLabel>
            </div>
          ) : (
            sessions.map((s) => {
              const active = s.id === currentId;
              return (
                <div
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 16px",
                    cursor: "pointer",
                    borderLeft: `2px solid ${active ? "var(--gold)" : "transparent"}`,
                    background: active ? "var(--surface2)" : "transparent",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  className="sidebar-item"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "13px",
                        fontWeight: active ? 500 : 400,
                        color: active ? "var(--ink)" : "var(--ink-soft)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: 1.4,
                        marginBottom: "3px",
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "10px",
                        color: "var(--muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {formatDate(s.updatedAt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    title="Slett samtale"
                    style={{
                      flexShrink: 0,
                      marginTop: "2px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      padding: "2px",
                      opacity: 0,
                      transition: "opacity 0.15s, color 0.15s",
                      display: "flex",
                    }}
                    className="delete-btn"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            height: "3px",
            background:
              "linear-gradient(90deg, transparent, var(--gold-dim), transparent)",
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load session list on mount
  useEffect(() => {
    setSessions(lsLoadSessions());
  }, []);

  // Auto-save whenever messages change
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;
    lsSaveMessages(currentSessionId, messages);
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      const title =
        firstUser.content.length > 48
          ? firstUser.content.slice(0, 48) + "…"
          : firstUser.content;
      lsSaveSessionMeta({
        id: currentSessionId,
        title,
        updatedAt: new Date().toISOString(),
      });
      setSessions(lsLoadSessions());
    }
  }, [messages, currentSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openSession(id: string) {
    setMessages(lsLoadMessages(id));
    setCurrentSessionId(id);
    setInput("");
  }

  function startNew() {
    setMessages([]);
    setCurrentSessionId(null);
    setInput("");
  }

  function handleDelete(id: string) {
    lsDeleteSession(id);
    setSessions(lsLoadSessions());
    if (currentSessionId === id) startNew();
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = { role: "user", content: content.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok || !response.body) throw new Error("Request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const delta: string = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: updated[updated.length - 1].content + delta,
                };
                return updated;
              });
            }
          } catch {
            /* skip malformed chunk */
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Beklager, noe gikk galt. Vennligst prøv igjen.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const canSend = Boolean(input.trim()) && !isLoading;
  const allRefs = messages
    .filter((m) => m.role === "assistant" && m.content.length > 0)
    .flatMap((m) => extractBibleRefs(m.content));
  const uniqueRefs = [...new Set(allRefs)];

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Sidebar
        open={sidebarOpen}
        sessions={sessions}
        currentId={currentSessionId}
        onSelect={(id) => {
          openSession(id);
          setSidebarOpen(false);
        }}
        onNew={() => {
          startNew();
          setSidebarOpen(false);
        }}
        onDelete={handleDelete}
      />

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* ── Masthead ────────────────────────────────────────────────── */}
        <header
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--rule-mid)",
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              height: "3px",
              background:
                "linear-gradient(90deg, transparent, var(--gold), transparent)",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label="Vis samtaler"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: sidebarOpen ? "var(--gold)" : "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px",
                  transition: "color 0.2s",
                }}
              >
                <MenuIcon />
              </button>
              <Ornament size={16} />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "18px",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    color: "var(--ink)",
                    lineHeight: 1.1,
                  }}
                >
                  Skriv med Bibelen
                </div>
                <div>
                  <SectionLabel>Bibelhjelp · gpt-4.1-mini</SectionLabel>
                </div>
              </div>
            </div>
            <div
              style={{
                display: "inline-block",
                padding: "3px 8px",
                border: "1px solid var(--gold-dim)",
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                fontSize: "9px",
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--gold)",
              }}
            >
              <a
                href="https://norsk-bibel.no"
                style={{ color: "inherit", textDecoration: "none" }}
              >
                Norsk Bibel 88/07 — norsk-bibel.no
              </a>
            </div>
          </div>
        </header>

        {/* ── Chat area ───────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {messages.length === 0 ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EmptyState onPrompt={(p) => sendMessage(p)} />
            </div>
          ) : (
            <div
              style={{
                maxWidth: "900px",
                margin: "0 auto",
                padding: "40px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "36px",
              }}
            >
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <UserMessage key={i} content={msg.content} />
                ) : (
                  <AssistantMessage
                    key={i}
                    content={msg.content}
                    isStreaming={
                      isLoading &&
                      i === messages.length - 1 &&
                      msg.role === "assistant"
                    }
                  />
                ),
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* ── Bible references panel ──────────────────────────────────── */}
        <RefsPanel refs={uniqueRefs} />

        {/* ── Input footer ────────────────────────────────────────────── */}
        <footer
          style={{
            flexShrink: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--rule-mid)",
            padding: "16px 24px 20px",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ maxWidth: "900px", margin: "0 auto" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                borderBottom: `1px solid ${isFocused ? "var(--gold-dim)" : "var(--rule-mid)"}`,
                paddingBottom: "10px",
                transition: "border-color 0.25s",
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Still et spørsmål om Bibelens ord…"
                rows={1}
                disabled={isLoading}
                style={{
                  flex: 1,
                  resize: "none",
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  fontSize: "15px",
                  fontWeight: 400,
                  lineHeight: 1.6,
                  color: "var(--ink)",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  padding: "4px 0 0",
                  opacity: isLoading ? 0.45 : 1,
                  transition: "opacity 0.2s",
                }}
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send melding"
                style={{
                  flexShrink: 0,
                  width: "34px",
                  height: "34px",
                  borderRadius: "2px",
                  border: canSend
                    ? "1px solid var(--gold-dim)"
                    : "1px solid var(--rule-mid)",
                  background: canSend ? "var(--gold-faint)" : "transparent",
                  color: canSend ? "var(--gold)" : "var(--muted)",
                  cursor: canSend ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                {isLoading ? (
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      border: "1.5px solid var(--muted)",
                      borderTopColor: "var(--gold)",
                      animation: "spin 0.8s linear infinite",
                      display: "block",
                    }}
                  />
                ) : (
                  <SendIcon />
                )}
              </button>
            </div>
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <SectionLabel>
                Enter for å sende · Shift+Enter for ny linje
              </SectionLabel>
            </div>
          </form>
        </footer>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea::placeholder { color: var(--muted); }
        button:focus-visible { outline: 1px solid var(--gold-dim); outline-offset: 2px; }
        .sidebar-item:hover { background: var(--surface2) !important; }
        .sidebar-item:hover .delete-btn { opacity: 1 !important; }
        .delete-btn:hover { color: var(--ink-soft) !important; }
        .msg-copy-btn { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s, color 0.2s; }
        .assistant-msg:hover .msg-copy-btn { opacity: 1; visibility: visible; }
        .msg-copy-btn:hover { color: var(--ink-soft) !important; }
        .ref-chip-icon { max-width: 0; opacity: 0; }
        .ref-chip:hover .ref-chip-icon, .ref-chip-icon--active { max-width: 20px; opacity: 1; }
      `}</style>
    </div>
  );
}
