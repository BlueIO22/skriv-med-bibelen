"use client";

import type {
  ChurchYearDay,
  ForossPodcast,
  ForossPost,
} from "@/app/api/chat/route";
import { parseChurchYearRef } from "@/lib/book-abbreviations";
import {
  faArrowRight,
  faBars,
  faBookOpen,
  faCheck,
  faChevronDown,
  faChevronUp,
  faCog,
  faCopy,
  faExternalLink,
  faHeadphones,
  faPlus,
  faRotateRight,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLE_PROMPTS = [
  "Hva sier Bibelen om kjærlighet?",
  "Hva betyr det å ha tro?",
  "Hva sier Bibelen om tilgivelse?",
];

// ── Bible reference extraction & grouping ────────────────────────────────────

const BIBLE_PATTERN_SRC = String.raw`(?:(?:[123]\.?\s*)(?:Mos(?:ebok)?|Samuel(?:sbok)?|Kong(?:ebok)?|Krønike(?:bok)?|Korinter(?:ne|brev)?|Tessaloniker(?:ne|brev)?|Timoteus(?:brev)?|Johannes(?:brev)?|Peter(?:s\s*brev)?)|Josva|Dommerne|Rut|Esra|Nehemja|Ester|Job|Salmene|Salme|Sal|Ordspråkene|Forkynneren|Høysangen|Jesaja|Jeremia|Klagesangene|Esekiel|Daniel|Hosea|Joel|Amos|Obadja|Jona|Mika|Nahum|Habakkuk|Sefanja|Haggai|Sakarja|Malaki|Matteus|Matt\b|Markus|Mark\b|Lukas|Luk\b|Johannes|Joh\b|Apostlenes\s+gjerninger|Apg|Romerne|Rom\b|Galaterbrevet|Gal\b|Efeserbrevet|Efeserne|Ef\b|Filipperbrevet|Filipperne|Fil\b|Kolosserbrevet|Kolosserne|Kol\b|Titus|Filemon|Hebreerne|Hebr|Jakobs?\s*(?:brev)?|Jak\b|Åpenbaringen|Åp|Judas?)\s+\d+(?:[,:.]\d+(?:\s*[-–]\s*\d+)?)?`;

// Parse "Book chapter" or "Book chapter:seg1.seg2…" into parts.
// Each segment is "N" or "N-M". Returns null if the string doesn't look valid.
function parseRef(
  ref: string,
): { book: string; chapter: number; verses: number[] } | null {
  const m = ref.match(/^(.*?)\s+(\d+)(?:[,:](.+))?$/);
  if (!m) return null;
  const book = m[1].trim();
  const chapter = parseInt(m[2], 10);
  const verses: number[] = [];
  if (m[3]) {
    for (const seg of m[3].split(".")) {
      const r = seg.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
      if (!r) continue;
      const from = parseInt(r[1], 10);
      const to = r[2] ? parseInt(r[2], 10) : from;
      for (let v = from; v <= to; v++) verses.push(v);
    }
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

// ── Bible ref link pre-processor ─────────────────────────────────────────────

// Wraps every bare Bible reference in the markdown text as a clickable verse link.
// Skips matches that already appear inside an existing Markdown link [...](...).
function markBibleRefs(text: string): string {
  const re = new RegExp(BIBLE_PATTERN_SRC, "g");
  const mdLink = /\[([^\]]*)\]\(([^)]*)\)/g;

  // Split text into alternating [outside, link, outside, link, ...] segments.
  const result: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(text)) !== null) {
    // Process bare text before this link
    result.push(
      text
        .slice(last, m.index)
        .replace(
          re,
          (match) => `[${match}](#verse:${encodeURIComponent(match)})`,
        ),
    );
    // Keep the existing markdown link untouched
    result.push(m[0]);
    last = m.index + m[0].length;
  }
  // Process remaining text after last link
  result.push(
    text
      .slice(last)
      .replace(
        re,
        (match) => `[${match}](#verse:${encodeURIComponent(match)})`,
      ),
  );
  return result.join("");
}

// ── Messages ──────────────────────────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div
      className="animate-fade-up"
      style={{ display: "flex", justifyContent: "flex-end" }}
    >
      <div
        className="user-bubble"
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
  onRefClick,
  onRetry,
}: {
  content: string;
  isStreaming: boolean;
  onRefClick: (ref: string) => void;
  onRetry?: () => void;
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
      <div
        className="assistant-bubble"
        style={{ maxWidth: "min(82%, 720px)", width: "100%" }}
      >
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

          {/* Action buttons — visible on hover via CSS */}
          {!isStreaming && content && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {onRetry && (
                <button
                  onClick={onRetry}
                  title="Prøv på nytt (tøm cache)"
                  className="msg-copy-btn"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    color: "var(--muted)",
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "10px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "2px 0",
                  }}
                >
                  <FontAwesomeIcon
                    icon={faRotateRight}
                    aria-hidden
                    style={{ fontSize: "11px", width: "11px", height: "11px" }}
                  />
                  Prøv igjen
                </button>
              )}
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
            </div>
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
        <div className="assistant-markdown">
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "clamp(15px, 1.8vw, 17px)",
                    fontWeight: 300,
                    lineHeight: 1.9,
                    color: "var(--ink-soft)",
                    wordBreak: "break-word",
                    letterSpacing: "0.01em",
                    marginBottom: "1em",
                  }}
                >
                  {children}
                </p>
              ),
              h1: ({ children }) => (
                <h1
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "clamp(18px, 2.2vw, 22px)",
                    fontWeight: 700,
                    color: "var(--ink)",
                    marginBottom: "0.5em",
                    marginTop: "1em",
                  }}
                >
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "clamp(16px, 2vw, 19px)",
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginBottom: "0.5em",
                    marginTop: "1em",
                  }}
                >
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "clamp(15px, 1.8vw, 17px)",
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginBottom: "0.4em",
                    marginTop: "0.8em",
                  }}
                >
                  {children}
                </h3>
              ),
              ul: ({ children }) => (
                <ul
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "clamp(15px, 1.8vw, 17px)",
                    fontWeight: 300,
                    lineHeight: 1.9,
                    color: "var(--ink-soft)",
                    paddingLeft: "1.4em",
                    marginBottom: "1em",
                  }}
                >
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "clamp(15px, 1.8vw, 17px)",
                    fontWeight: 300,
                    lineHeight: 1.9,
                    color: "var(--ink-soft)",
                    paddingLeft: "1.4em",
                    marginBottom: "1em",
                  }}
                >
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li style={{ marginBottom: "0.2em" }}>{children}</li>
              ),
              strong: ({ children }) => (
                <strong style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em style={{ fontStyle: "italic" }}>{children}</em>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  style={{
                    borderLeft: "3px solid var(--gold)",
                    paddingLeft: "1em",
                    margin: "1em 0",
                    color: "var(--ink-soft)",
                    fontStyle: "italic",
                  }}
                >
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.9em",
                    background: "var(--surface2)",
                    borderRadius: "3px",
                    padding: "0.1em 0.3em",
                  }}
                >
                  {children}
                </code>
              ),
              a: ({ href, children }) => {
                if (href?.startsWith("#verse:")) {
                  const ref = decodeURIComponent(href.slice(7));
                  return (
                    <button
                      onClick={() => onRefClick(ref)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 2px",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                        fontWeight: "inherit",
                        color: "inherit",
                        textDecoration: "underline",
                        textDecorationStyle: "dotted",
                        textDecorationColor: "var(--muted)",
                        textUnderlineOffset: "3px",
                      }}
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--gold)",
                      textDecoration: "underline",
                      textDecorationStyle: "solid",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {markBibleRefs(content)}
          </ReactMarkdown>
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
        </div>
      </div>
    </div>
  );
}

// ── Settings popover ──────────────────────────────────────────────────────────

function SettingsPopover({
  series,
  onSeriesChange,
  tekstrekkeOverride,
  onTekstrekkeChange,
}: {
  series: string;
  onSeriesChange: (s: string) => void;
  tekstrekkeOverride: number | null;
  onTekstrekkeChange: (t: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Innstillinger"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: open ? "var(--gold)" : "var(--muted)",
          display: "flex",
          alignItems: "center",
          padding: "4px",
          transition: "color 0.2s",
        }}
      >
        <FontAwesomeIcon
          icon={faCog}
          style={{ fontSize: "13px", width: "13px", height: "13px" }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "232px",
            background: "var(--surface)",
            border: "1px solid var(--rule-mid)",
            borderRadius: "4px",
            padding: "14px 16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            zIndex: 100,
          }}
        >
          {/* Series / calendar */}
          <div style={{ marginBottom: "14px" }}>
            <SectionLabel>Kalender</SectionLabel>
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {[
                { value: "dnk", label: "Den norske kirke" },
                { value: "soendagstekst", label: "Søndagens tekst" },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "13px",
                    fontWeight: series === value ? 500 : 400,
                    color: series === value ? "var(--ink)" : "var(--ink-soft)",
                  }}
                >
                  <input
                    type="radio"
                    name="smb-series"
                    value={value}
                    checked={series === value}
                    onChange={() => onSeriesChange(value)}
                    style={{ accentColor: "var(--gold)", cursor: "pointer" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: "1px",
              background: "var(--rule)",
              marginBottom: "14px",
            }}
          />

          {/* Lectionary year override */}
          <div>
            <SectionLabel>Kirkeår</SectionLabel>
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                gap: "6px",
              }}
            >
              {([null, 1, 2, 3] as (number | null)[]).map((val) => {
                const label = val === null ? "Auto" : String(val);
                const active = tekstrekkeOverride === val;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onTekstrekkeChange(val)}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      background: active ? "var(--gold-dim)" : "var(--surface2)",
                      border: `1px solid ${active ? "var(--gold)" : "var(--rule-mid)"}`,
                      borderRadius: "2px",
                      cursor: "pointer",
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "11px",
                      fontWeight: active ? 600 : 400,
                      color: active ? "var(--gold)" : "var(--ink-soft)",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {tekstrekkeOverride !== null && (
              <p
                style={{
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  fontSize: "10px",
                  color: "var(--muted)",
                  marginTop: "6px",
                  fontStyle: "italic",
                }}
              >
                Tekstrekke {tekstrekkeOverride} er valgt manuelt.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Church year panel ─────────────────────────────────────────────────────────

function ChurchYearPanel({ day }: { day: ChurchYearDay }) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--rule-mid)",
        background: "var(--surface)",
        flexShrink: 0,
        padding: "6px 20px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <SectionLabel>{day.sunday_name}</SectionLabel>
      <span
        style={{
          fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
          fontSize: "9px",
          color: "var(--muted)",
          fontStyle: "italic",
        }}
      >
        Tekstrekke {day.tekstrekke} · {day.dato.split("-").reverse().join(".")}
      </span>
    </div>
  );
}

// ── Foross posts panel ────────────────────────────────────────────────────────

function ForossPanel({
  posts,
  podcasts,
}: {
  posts: ForossPost[];
  podcasts: ForossPodcast[];
}) {
  const [collapsed, setCollapsed] = useState(true);
  const total = posts.length + podcasts.length;

  if (total === 0) return null;

  return (
    <div
      className="foross-bottom-panel animate-slide-in"
      style={{
        borderTop: "1px solid var(--rule-mid)",
        background: "var(--surface)",
        flexShrink: 0,
      }}
    >
      {/* Header */}
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
          <SectionLabel>Les mer på foross.no · {total}</SectionLabel>
          <FontAwesomeIcon
            icon={collapsed ? faChevronUp : faChevronDown}
            aria-hidden
            style={{ fontSize: "9px", color: "var(--muted)" }}
          />
        </div>
      </div>

      {/* Cards — horizontal scroll strip */}
      {!collapsed && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            padding: "10px 20px 14px",
            scrollbarWidth: "none",
          }}
        >
          {posts.map((post) => (
            <a
              key={`post-${post.slug.current}`}
              href={`https://foross.no/innlegg/${post.slug.current}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", flexShrink: 0 }}
            >
              <div
                className="foross-card"
                style={{
                  width: "160px",
                  height: "168px",
                  border: "1px solid var(--rule-mid)",
                  borderRadius: "3px",
                  overflow: "hidden",
                  background: "var(--surface2)",
                  transition: "border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {post.mainImage?.asset?.url ? (
                  <div
                    style={{
                      width: "100%",
                      height: "72px",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={`${post.mainImage.asset.url}?w=240&h=135&fit=crop&auto=format`}
                      alt={post.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "72px",
                      background: "var(--surface)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div
                  style={{
                    padding: "7px 9px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {post.section && (
                    <span
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "8px",
                        fontWeight: 500,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--gold-dim)",
                      }}
                    >
                      {post.section.title}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "var(--ink)",
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {post.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "9px",
                      color: "var(--muted)",
                      marginTop: "auto",
                    }}
                  >
                    foross.no
                  </span>
                </div>
              </div>
            </a>
          ))}

          {podcasts.map((podcast) => (
            <a
              key={`podcast-${podcast._id}`}
              href={`https://www.foross.no/podkast/${podcast.series?.slug?.current ?? "episode"}/${podcast._id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", flexShrink: 0 }}
            >
              <div
                className="foross-card"
                style={{
                  width: "160px",
                  height: "168px",
                  border: "1px solid var(--rule-mid)",
                  borderRadius: "3px",
                  overflow: "hidden",
                  background: "var(--surface2)",
                  transition: "border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Podcast placeholder header */}
                <div
                  style={{
                    width: "100%",
                    height: "72px",
                    background: "var(--surface)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FontAwesomeIcon
                    icon={faHeadphones}
                    aria-hidden
                    style={{ fontSize: "22px", color: "var(--gold-dim)" }}
                  />
                </div>
                <div
                  style={{
                    padding: "7px 9px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {podcast.section && (
                    <span
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "8px",
                        fontWeight: 500,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--gold-dim)",
                      }}
                    >
                      {podcast.section.title}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "var(--ink)",
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {podcast.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "9px",
                      color: "var(--muted)",
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faHeadphones}
                      aria-hidden
                      style={{ fontSize: "8px" }}
                    />
                    episode
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Foross right sidebar (desktop) ───────────────────────────────────────────

function ForossRightSidebar({
  posts,
  podcasts,
}: {
  posts: ForossPost[];
  podcasts: ForossPodcast[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const EXPANDED_WIDTH = "260px";

  if (posts.length === 0 && podcasts.length === 0) return null;

  return (
    <div
      className="foross-sidebar"
      style={{
        width: collapsed ? "36px" : EXPANDED_WIDTH,
        flexShrink: 0,
        borderLeft: "1px solid var(--rule-mid)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          width: EXPANDED_WIDTH,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 8px",
          borderBottom: "1px solid var(--rule)",
          flexShrink: 0,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        {!collapsed && <SectionLabel>Les mer på foross.no</SectionLabel>}
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--muted)",
            padding: 0,
            display: "flex",
            alignItems: "center",
            marginLeft: collapsed ? 0 : "auto",
          }}
          title={collapsed ? "Vis artikler" : "Skjul artikler"}
        >
          <FontAwesomeIcon
            icon={collapsed ? faBars : faXmark}
            aria-hidden
            style={{ fontSize: "12px", width: "12px", height: "12px" }}
          />
        </button>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div
          style={{
            width: EXPANDED_WIDTH,
            flex: 1,
            overflowY: "auto",
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            scrollbarWidth: "none",
          }}
        >
          {posts.map((post) => (
            <a
              key={post.slug.current}
              href={`https://foross.no/innlegg/${post.slug.current}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <div
                className="foross-card"
                style={{
                  border: "1px solid var(--rule-mid)",
                  borderRadius: "3px",
                  overflow: "hidden",
                  background: "var(--surface2)",
                  transition: "border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {post.mainImage?.asset?.url ? (
                  <div
                    style={{
                      width: "100%",
                      height: "80px",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={`${post.mainImage.asset.url}?w=360&h=160&fit=crop&auto=format`}
                      alt={post.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "80px",
                      background: "var(--surface)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div
                  style={{
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {post.section && (
                    <span
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "8px",
                        fontWeight: 500,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--gold-dim)",
                      }}
                    >
                      {post.section.title}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--ink)",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {post.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "9px",
                      color: "var(--muted)",
                      marginTop: "2px",
                    }}
                  >
                    foross.no
                  </span>
                </div>
              </div>
            </a>
          ))}

          {podcasts.map((podcast) => (
            <a
              key={`podcast-${podcast._id}`}
              href={`https://www.foross.no/podkast/${podcast.series?.slug?.current ?? "episode"}/${podcast._id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <div
                className="foross-card"
                style={{
                  border: "1px solid var(--rule-mid)",
                  borderRadius: "3px",
                  overflow: "hidden",
                  background: "var(--surface2)",
                  transition: "border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "80px",
                    background: "var(--surface)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FontAwesomeIcon
                    icon={faHeadphones}
                    aria-hidden
                    style={{ fontSize: "26px", color: "var(--gold-dim)" }}
                  />
                </div>
                <div
                  style={{
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {podcast.section && (
                    <span
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "8px",
                        fontWeight: 500,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--gold-dim)",
                      }}
                    >
                      {podcast.section.title}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--ink)",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {podcast.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      fontSize: "9px",
                      color: "var(--muted)",
                      marginTop: "2px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faHeadphones}
                      aria-hidden
                      style={{ fontSize: "8px" }}
                    />
                    episode
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bible references panel ────────────────────────────────────────────────────

function churchYearRefToApiRef(ref: string | null): string | null {
  if (!ref) return null;
  const parsed = parseChurchYearRef(ref);
  if (!parsed) return null;
  const { fullBookName, chapter, fromVerse, toVerse } = parsed;
  if (toVerse === 999) return `${fullBookName} ${chapter}`;
  if (fromVerse === toVerse) return `${fullBookName} ${chapter}:${fromVerse}`;
  return `${fullBookName} ${chapter}:${fromVerse}-${toVerse}`;
}

type ChurchYearRef = { label: string; originalRef: string; apiRef: string };

function getChurchYearRefs(day: ChurchYearDay): ChurchYearRef[] {
  return (
    [
      { label: "GT", ref: day.ot_reference },
      { label: "Epistel", ref: day.epistle_reference },
      { label: "Evangelium", ref: day.gospel_reference },
    ] as { label: string; ref: string | null }[]
  )
    .filter((e): e is { label: string; ref: string } => Boolean(e.ref))
    .map(({ label, ref }) => ({
      label,
      originalRef: ref,
      apiRef: churchYearRefToApiRef(ref) ?? ref,
    }));
}

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

const SOURCE_LINE = "Norsk Bibel 88/07 — norsk-bibel.no";

function buildCopyText(ref: string, verses: VerseData[]): string {
  if (verses.length === 0) return `${ref}:`;
  // Split into consecutive runs, separate non-consecutive runs with a blank line
  const runs: VerseData[][] = [];
  for (const v of verses) {
    const last = runs[runs.length - 1];
    if (last && v.versenumber === last[last.length - 1].versenumber + 1) {
      last.push(v);
    } else {
      runs.push([v]);
    }
  }
  const body = runs
    .map((run) =>
      wordWrap(run.map((v) => `${v.versenumber} ${v.versecontent}`).join(" ")),
    )
    .join("\n\n");
  return `${ref}:\n${body}`;
}

// ── Verse modal ───────────────────────────────────────────────────────────────

function VerseModal({
  ref: refStr,
  verses,
  onClose,
}: {
  ref: string;
  verses: VerseData[] | "loading" | "error";
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleCopy() {
    const body = Array.isArray(verses) ? buildCopyText(refStr, verses) : refStr;
    const text = `${body}\n\n${SOURCE_LINE}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule-mid)",
          borderRadius: "4px",
          width: "100%",
          maxWidth: "540px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.28)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--rule)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--ink)",
              letterSpacing: "0.01em",
              margin: 0,
            }}
          >
            {refStr}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Copy button */}
            <button
              onClick={handleCopy}
              title="Kopier"
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
                padding: "4px 6px",
                transition: "color 0.2s",
              }}
            >
              {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
              {copied ? "Kopiert" : "Kopier"}
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              title="Lukk"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted)",
                padding: "4px 6px",
                display: "flex",
                alignItems: "center",
                transition: "color 0.2s",
              }}
            >
              <FontAwesomeIcon
                icon={faXmark}
                aria-hidden
                style={{ fontSize: "16px", width: "16px", height: "16px" }}
              />
            </button>
          </div>
        </div>

        {/* Verses */}
        <div
          style={{
            overflowY: "auto",
            padding: "20px 24px",
            flex: 1,
          }}
        >
          {verses === "loading" && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "24px 0",
              }}
            >
              <span
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "2px solid var(--rule-mid)",
                  borderTopColor: "var(--gold)",
                  animation: "spin 0.8s linear infinite",
                  display: "block",
                }}
              />
            </div>
          )}
          {verses === "error" && (
            <p
              style={{
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                fontSize: "14px",
                color: "var(--muted)",
                fontStyle: "italic",
              }}
            >
              Kunne ikke hente vers.
            </p>
          )}
          {Array.isArray(verses) && verses.length === 0 && (
            <p
              style={{
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                fontSize: "14px",
                color: "var(--muted)",
                fontStyle: "italic",
              }}
            >
              Ingen vers funnet.
            </p>
          )}
          {Array.isArray(verses) && verses.length > 0 && (
            <p
              style={{
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                fontSize: "16px",
                fontWeight: 300,
                lineHeight: 2,
                color: "var(--ink-soft)",
                letterSpacing: "0.01em",
                margin: 0,
              }}
            >
              {verses.map((v, i) => {
                const prev = verses[i - 1];
                const isGap = prev && v.versenumber !== prev.versenumber + 1;
                return (
                  <span key={v.versenumber}>
                    {isGap && (
                      <>
                        <br />
                        <br />
                      </>
                    )}
                    <sup
                      style={{
                        fontSize: "9px",
                        fontWeight: 500,
                        color: "var(--gold)",
                        verticalAlign: "super",
                        lineHeight: 0,
                        marginRight: "2px",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {v.versenumber}
                    </sup>
                    {v.versecontent}{" "}
                  </span>
                );
              })}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid var(--rule)",
            padding: "10px 24px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <a
            href="https://norsk-bibel.no"
            target="_blank"
            style={{
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "10px",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: "var(--muted)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            Norsk Bibel 88/07 — norsk-bibel.no
            <FontAwesomeIcon
              icon={faExternalLink}
              aria-hidden
              className="h-4"
              style={{ fontSize: "9px", width: "9px", height: "9px" }}
            />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RefsPanel({
  refs,
  churchYearDay,
}: {
  refs: string[];
  churchYearDay?: ChurchYearDay | null;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [verseTexts, setVerseTexts] = useState<RefTexts>({});
  const [modalRef, setModalRef] = useState<string | null>(null);

  const churchYearRefs = churchYearDay ? getChurchYearRefs(churchYearDay) : [];
  const allApiRefs = [...churchYearRefs.map((r) => r.apiRef), ...refs];

  // Fetch verse text for each ref whenever the refs list changes
  useEffect(() => {
    for (const ref of allApiRefs) {
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
  }, [allApiRefs.join("|")]);

  const copyAll = useCallback(() => {
    const churchYearParts = churchYearRefs.map(({ label, originalRef, apiRef }) => {
      const verses = verseTexts[apiRef];
      const body = Array.isArray(verses) ? buildCopyText(originalRef, verses) : originalRef;
      return `[${label}] ${body}`;
    });
    const regularParts = refs.map((ref) => {
      const verses = verseTexts[ref];
      return Array.isArray(verses) ? buildCopyText(ref, verses) : ref;
    });
    const parts = [...churchYearParts, ...regularParts];
    const text = `${parts.join("\n\n")}\n\n${SOURCE_LINE}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    });
  }, [refs, churchYearRefs, verseTexts]);

  const totalCount = refs.length + churchYearRefs.length;

  if (totalCount === 0) return null;

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
          <SectionLabel>Referanser · {totalCount}</SectionLabel>
          <FontAwesomeIcon
            icon={collapsed ? faChevronUp : faChevronDown}
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

      {/* Chips grouped by book — hidden when collapsed */}
      {!collapsed && (
        <div
          className="refs-chips"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            overflowY: "auto",
            padding: "10px 20px 12px",
            scrollbarWidth: "none",
            maxHeight: "240px",
          }}
        >
          {/* Church year refs section */}
          {churchYearRefs.length > 0 && (
            <div
              style={{
                borderLeft: "2px solid var(--gold-dim)",
                paddingLeft: "10px",
                marginBottom: refs.length > 0 ? "8px" : "0",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  fontSize: "9px",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--gold-dim)",
                  marginBottom: "2px",
                }}
              >
                Kirkeåret
              </span>
              {churchYearRefs.map(({ label, originalRef, apiRef }) => {
                const state = verseTexts[apiRef];
                const isLoading = state === "loading";
                return (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        fontSize: "9px",
                        fontWeight: 500,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                        minWidth: "80px",
                      }}
                    >
                      {label}
                    </span>
                    <button
                      onClick={() => setModalRef(apiRef)}
                      title={originalRef}
                      disabled={isLoading}
                      className="ref-chip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        flexShrink: 0,
                        padding: "3px 10px",
                        background: "var(--surface2)",
                        border: "1px solid var(--gold-dim)",
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
                          color: "var(--ink-soft)",
                          letterSpacing: "0.01em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {originalRef}
                      </span>
                      <span
                        className="ref-chip-icon"
                        style={{
                          color: "var(--gold-dim)",
                          display: "flex",
                          alignItems: "center",
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
                        ) : (
                          <FontAwesomeIcon
                            icon={faExternalLink}
                            aria-hidden
                            style={{
                              fontSize: "9px",
                              width: "9px",
                              height: "9px",
                            }}
                          />
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Separator between church year and regular refs */}
          {churchYearRefs.length > 0 && refs.length > 0 && (
            <div
              style={{
                height: "1px",
                background: "var(--rule)",
                margin: "2px 0 4px",
              }}
            />
          )}

          {(() => {
            // Group refs by book
            const groups = new Map<string, string[]>();
            for (const ref of refs) {
              const p = parseRef(ref);
              const book = p?.book ?? ref;
              if (!groups.has(book)) groups.set(book, []);
              groups.get(book)!.push(ref);
            }
            return [...groups.entries()].map(([book, bookRefs]) => (
              <div
                key={book}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "9px",
                    fontWeight: 500,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                    minWidth: "80px",
                  }}
                >
                  {book}
                </span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {bookRefs.map((ref) => {
                    const state = verseTexts[ref];
                    const isLoading = state === "loading";
                    const p = parseRef(ref);
                    const label = p
                      ? p.verses.length > 0
                        ? `${p.chapter}:${mergeVerses(p.verses)}`
                        : `${p.chapter}`
                      : ref;
                    return (
                      <button
                        key={ref}
                        onClick={() => setModalRef(ref)}
                        title={ref}
                        disabled={isLoading}
                        className="ref-chip"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          flexShrink: 0,
                          padding: "3px 10px",
                          background: "var(--surface2)",
                          border: "1px solid var(--rule-mid)",
                          borderRadius: "2px",
                          cursor: isLoading ? "default" : "pointer",
                          transition: "all 0.2s",
                          opacity: isLoading ? 0.6 : 1,
                        }}
                      >
                        <span
                          style={{
                            fontFamily:
                              "var(--font-ubuntu), Ubuntu, sans-serif",
                            fontSize: "12px",
                            fontWeight: 400,
                            color: "var(--ink-soft)",
                            letterSpacing: "0.01em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </span>
                        <span
                          className="ref-chip-icon"
                          style={{
                            color: "var(--muted)",
                            display: "flex",
                            alignItems: "center",
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
                          ) : (
                            <FontAwesomeIcon
                              icon={faExternalLink}
                              aria-hidden
                              style={{
                                fontSize: "9px",
                                width: "9px",
                                height: "9px",
                              }}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Verse modal */}
      {modalRef && (
        <VerseModal
          ref={modalRef}
          verses={verseTexts[modalRef] ?? "loading"}
          onClose={() => setModalRef(null)}
        />
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

function ContextInfoButton() {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0",
          display: "flex",
          alignItems: "center",
          color: "var(--muted)",
          lineHeight: 1,
        }}
        title="Om kontekst"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-.75 3.5h1.5v4.5h-1.5V7.5z" />
        </svg>
      </button>
      {visible && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: "220px",
            background: "var(--surface)",
            border: "1px solid var(--rule-mid)",
            borderRadius: "4px",
            padding: "10px 12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            zIndex: 50,
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            fontSize: "11px",
            fontWeight: 400,
            lineHeight: 1.6,
            color: "var(--ink-soft)",
            pointerEvents: "none",
          }}
        >
          De siste{" "}
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
            15 meldingene
          </strong>{" "}
          i samtalen sendes med til AI-en hver gang du spør. Eldre meldinger
          faller utenfor konteksten og huskes ikke.
        </span>
      )}
    </span>
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

// ── localStorage series preference ────────────────────────────────────────────

const LS_SERIES = "smb_series";

function lsLoadSeries(): string {
  try {
    return localStorage.getItem(LS_SERIES) ?? "dnk";
  } catch {
    return "dnk";
  }
}

function lsSaveSeries(s: string) {
  try {
    localStorage.setItem(LS_SERIES, s);
  } catch {
    /* ignore */
  }
}

// ── localStorage tekstrekke override ──────────────────────────────────────────

const LS_TEKSTREKKE = "smb_tekstrekke";

function lsLoadTekstrekke(): number | null {
  try {
    const v = localStorage.getItem(LS_TEKSTREKKE);
    const n = v ? parseInt(v, 10) : NaN;
    return [1, 2, 3].includes(n) ? n : null;
  } catch {
    return null;
  }
}

function lsSaveTekstrekke(t: number | null) {
  try {
    if (t === null) localStorage.removeItem(LS_TEKSTREKKE);
    else localStorage.setItem(LS_TEKSTREKKE, String(t));
  } catch {
    /* ignore */
  }
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
  const [forossPosts, setForossPosts] = useState<ForossPost[]>([]);
  const [forossPodcasts, setForossPodcasts] = useState<ForossPodcast[]>([]);
  const [inlineModalRef, setInlineModalRef] = useState<string | null>(null);
  const [inlineVerseTexts, setInlineVerseTexts] = useState<RefTexts>({});
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [series, setSeries] = useState<string>("dnk");
  const [tekstrekkeOverride, setTekstrekkeOverride] = useState<number | null>(null);
  const [churchYearDay, setChurchYearDay] = useState<ChurchYearDay | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleInlineRefClick(ref: string) {
    setInlineModalRef(ref);
    if (!inlineVerseTexts[ref]) {
      setInlineVerseTexts((prev) => ({ ...prev, [ref]: "loading" }));
      fetch(`/api/verses?ref=${encodeURIComponent(ref)}`)
        .then((r) => r.json())
        .then((data) =>
          setInlineVerseTexts((prev) => ({
            ...prev,
            [ref]: Array.isArray(data.verses) ? data.verses : "error",
          })),
        )
        .catch(() =>
          setInlineVerseTexts((prev) => ({ ...prev, [ref]: "error" })),
        );
    }
  }

  // Auto-resize textarea to fit content, capped at ~6 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Load session list and series preference on mount
  useEffect(() => {
    setSessions(lsLoadSessions());
    setSeries(lsLoadSeries());
    setTekstrekkeOverride(lsLoadTekstrekke());
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

  function retryLastMessage() {
    // Find the index of the last user message
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUserContent = messages[lastUserIdx].content;
    const baseMessages = messages.slice(0, lastUserIdx);
    sendMessage(lastUserContent, { bypassCache: true, baseMessages });
  }

  async function sendMessage(
    content: string,
    opts: { bypassCache?: boolean; baseMessages?: Message[] } = {},
  ) {
    const { bypassCache = false, baseMessages } = opts;
    if (!content.trim() || isLoading) return;

    // Skip duplicate guard when explicit base messages are supplied (e.g. retry)
    if (!baseMessages) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg && lastUserMsg.content.trim() === content.trim()) return;
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId =
        crypto.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36);
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = { role: "user", content: content.trim() };
    const newMessages = [...(baseMessages ?? messages), userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, series, bypassCache, tekstrekkeOverride }),
      });

      if (!response.ok || !response.body) throw new Error("Request failed");

      // Parse foross.no posts and podcasts from response headers
      try {
        const rawPosts = response.headers.get("X-Foross-Posts");
        if (rawPosts) {
          const bytes = Uint8Array.from(atob(rawPosts), (c) => c.charCodeAt(0));
          setForossPosts(JSON.parse(new TextDecoder().decode(bytes)));
        } else setForossPosts([]);
      } catch {
        setForossPosts([]);
      }
      try {
        const rawPodcasts = response.headers.get("X-Foross-Podcasts");
        if (rawPodcasts) {
          const bytes = Uint8Array.from(atob(rawPodcasts), (c) =>
            c.charCodeAt(0),
          );
          setForossPodcasts(JSON.parse(new TextDecoder().decode(bytes)));
        } else setForossPodcasts([]);
      } catch {
        setForossPodcasts([]);
      }
      try {
        const rawCY = response.headers.get("X-Church-Year-Day");
        if (rawCY) {
          const bytes = Uint8Array.from(atob(rawCY), (c) => c.charCodeAt(0));
          setChurchYearDay(JSON.parse(new TextDecoder().decode(bytes)));
        }
      } catch {
        /* keep existing churchYearDay */
      }

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
            className="header-bar"
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
                  <SectionLabel>Bibelhjelp · gpt-5.4-mini</SectionLabel>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <SettingsPopover
                series={series}
                onSeriesChange={(s) => {
                  setSeries(s);
                  lsSaveSeries(s);
                }}
                tekstrekkeOverride={tekstrekkeOverride}
                onTekstrekkeChange={(t) => {
                  setTekstrekkeOverride(t);
                  lsSaveTekstrekke(t);
                }}
              />
              <div
                className="nb-badge"
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
                  className="flex gap-1 items-center justify-center flex-row"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <span>Norsk Bibel 88/07 — norsk-bibel.no</span>
                  <FontAwesomeIcon icon={faExternalLink} />
                </a>
              </div>
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
              className="msgs-wrap"
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
                    onRefClick={handleInlineRefClick}
                    onRetry={
                      !isLoading && i === messages.length - 1
                        ? retryLastMessage
                        : undefined
                    }
                  />
                ),
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* ── Foross posts panel (mobile only) ────────────────────────── */}
        {churchYearDay && <ChurchYearPanel day={churchYearDay} />}
        <ForossPanel posts={forossPosts} podcasts={forossPodcasts} />

        {/* ── Bible references panel ──────────────────────────────────── */}
        <RefsPanel refs={uniqueRefs} churchYearDay={churchYearDay} />

        {/* ── Inline verse modal (from clicking refs in response text) ── */}
        {inlineModalRef && (
          <VerseModal
            ref={inlineModalRef}
            verses={inlineVerseTexts[inlineModalRef] ?? "loading"}
            onClose={() => setInlineModalRef(null)}
          />
        )}

        {/* ── Input footer ────────────────────────────────────────────── */}
        <footer
          className="footer-bar"
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
            {messages.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    fontSize: "9px",
                    fontWeight: 500,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color:
                      messages.length >= 12 ? "var(--gold)" : "var(--muted)",
                  }}
                >
                  {messages.length}/15 meldinger i kontekst
                </span>
                <ContextInfoButton />
              </div>
            )}
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
                ref={textareaRef}
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
                  overflowY: "auto",
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  fontSize: "16px",
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
              className="input-hint"
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

      {/* ── Foross right sidebar (desktop only) ─────────────────────────── */}
      <ForossRightSidebar posts={forossPosts} podcasts={forossPodcasts} />

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
        .foross-bottom-panel { display: none !important; }
        @media (max-width: 640px) {
          .header-bar { padding: 10px 14px !important; }
          .nb-badge { display: none !important; }
          .msgs-wrap { padding: 20px 14px !important; gap: 24px !important; }
          .user-bubble { max-width: min(88%, 600px) !important; }
          .assistant-bubble { max-width: 100% !important; }
          .footer-bar { padding: 12px 14px 14px !important; }
          .input-hint { display: none !important; }
          .refs-chips { overflow-x: hidden !important; overflow-y: auto !important; max-height: 200px !important; }
          .foross-sidebar { display: none !important; }
          .foross-bottom-panel { display: block !important; }
        }
      `}</style>
    </div>
  );
}
