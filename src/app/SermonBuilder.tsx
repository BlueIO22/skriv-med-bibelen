"use client";

import type {
  LectionaryText,
  SermonTextsResponse,
} from "@/app/api/sermon/texts/route";
import {
  faArrowLeft,
  faArrowRight,
  faCalendarDay,
  faChevronDown,
  faChevronUp,
  faPaperPlane,
  faPaste,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

// ── Types ────────────────────────────────────────────────────────────────────

type Step = "tekststudie" | "forbindelser" | "disposisjon" | "utkast";
type Message = { role: "user" | "assistant"; content: string };

type StepData = {
  notes: string;
  draftJson?: object;
};

type SermonDraft = {
  dato: string;
  steps: Record<Step, StepData>;
  chat: { messages: Message[] };
  lastModified: string;
};

type SermonContext = {
  sunday_name: string;
  dato: string;
  tekstrekke: number;
  series: string;
  ot_reference: string | null;
  epistle_reference: string | null;
  gospel_reference: string | null;
  otText: string;
  epistleText: string;
  gospelText: string;
  tekststudieNotes?: string;
  forbindelserNotes?: string;
  disposisjonNotes?: string;
  activeStep?: string;
};

const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: "tekststudie",  label: "Tekststudie",  sub: "Eksegese" },
  { id: "forbindelser", label: "Forbindelser", sub: "Paralleller" },
  { id: "disposisjon",  label: "Disposisjon",  sub: "Struktur" },
  { id: "utkast",       label: "Utkast",       sub: "Teksten" },
];

const STEP_INTRO: Record<Step, string> = {
  tekststudie:
    "Hva ser du? Hva overrasker deg? Hva er krevende? Skriv dine egne observasjoner og tolkninger.",
  forbindelser:
    "Hvilke andre tekster assosierer du med disse? Noter paralleller og bibelske ekkokammer.",
  disposisjon:
    "Hva er det ene du vil si? Skriv ut din disposisjon – åpning, hoveddeler, avslutning.",
  utkast: "Du skriver. Teksten er din.",
};

const NOTES_PLACEHOLDER: Record<Step, string> = {
  tekststudie: "Egne observasjoner, spørsmål og tolkninger…",
  forbindelser: "Paralleller, typologi, bibelske forbindelser…",
  disposisjon: "Tema · Åpning · Hoveddeler · Avslutning…",
  utkast: "",
};

function emptyDraft(dato: string): SermonDraft {
  return {
    dato,
    steps: {
      tekststudie: { notes: "" },
      forbindelser: { notes: "" },
      disposisjon: { notes: "" },
      utkast: { notes: "" },
    },
    chat: { messages: [] },
    lastModified: new Date().toISOString(),
  };
}

function migrateDraft(raw: SermonDraft): SermonDraft {
  if (!raw.chat) raw.chat = { messages: [] };
  return raw;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const formatLong = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const formatShort = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
  });

const shiftDate = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Expandable Bible text card ────────────────────────────────────────────────

function TextCard({
  text,
  label,
  onPasteVerse,
}: {
  text: LectionaryText;
  label: string;
  onPasteVerse?: (verseText: string) => void;
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
          style={{ color: "var(--sb-ink-faint)", fontSize: "9px", flexShrink: 0 }}
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
              <span style={{ fontSize: "12.5px", color: "var(--sb-ink-soft)", flex: 1 }}>
                {v.versecontent}
              </span>
              {onPasteVerse && (
                <button
                  className="verse-paste-btn"
                  onClick={() => onPasteVerse(v.versecontent)}
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
                  <FontAwesomeIcon icon={faPaste} style={{ fontSize: "12px" }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TipTap prose editor ───────────────────────────────────────────────────────

function ProseEditor({
  initialJson,
  onChange,
  editorRef,
}: {
  initialJson: object | undefined;
  onChange: (json: object) => void;
  editorRef?: React.MutableRefObject<Editor | null>;
}) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: "Begynn å skrive din preken her…" }),
    ],
    content: initialJson ?? "",
    onUpdate: ({ editor }) => cbRef.current(editor.getJSON()),
    editorProps: {
      attributes: {
        class: "outline-none min-h-[500px] leading-[1.85] text-[16px]",
        style: "color: var(--sb-ink);",
      },
    },
  });

  useEffect(() => {
    if (editorRef && editor) editorRef.current = editor;
  }, [editor, editorRef]);

  if (!editor) return null;

  const ToolBtn = ({
    label,
    active,
    action,
    title,
  }: {
    label: string;
    active?: boolean;
    action: () => void;
    title?: string;
  }) => (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        action();
      }}
      title={title}
      style={{
        padding: "3px 10px",
        fontSize: "11px",
        borderRadius: "3px",
        color: active ? "var(--sb-gold)" : "var(--sb-ink-meta)",
        background: active ? "var(--sb-gold-light)" : "transparent",
        fontWeight: active ? 600 : 400,
        border: "none",
        cursor: "pointer",
        transition: "color 0.12s, background 0.12s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "2px",
          paddingBottom: "12px",
          marginBottom: "20px",
          borderBottom: "1px solid var(--sb-border)",
          flexWrap: "wrap",
        }}
      >
        <ToolBtn label="Normal" active={editor.isActive("paragraph")} action={() => editor.chain().focus().setParagraph().run()} />
        <ToolBtn label="H2" active={editor.isActive("heading", { level: 2 })} action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolBtn label="H3" active={editor.isActive("heading", { level: 3 })} action={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <div style={{ width: "1px", height: "14px", background: "var(--sb-border)", margin: "0 4px" }} />
        <ToolBtn label="Fet" active={editor.isActive("bold")} action={() => editor.chain().focus().toggleBold().run()} />
        <ToolBtn label="Kursiv" active={editor.isActive("italic")} action={() => editor.chain().focus().toggleItalic().run()} />
        <div style={{ width: "1px", height: "14px", background: "var(--sb-border)", margin: "0 4px" }} />
        <ToolBtn label="Liste" active={editor.isActive("bulletList")} action={() => editor.chain().focus().toggleBulletList().run()} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

// ── Bible reference auto-detection ───────────────────────────────────────────
// Detects standard Norwegian Bible refs like "Joh 3:16", "1 Kor 15:3-4", "Sal 23:1"

// Matches both abbreviations (Joh, Kor) and full names (Johannes, Korinterbrevet)
// Handles numbered books: "1 Mos", "1. Mos", "1. Mosebok", "1 Johannes"
const BIBLE_REF_RE =
  /\b(?:[1-3]\.?\s+)?(?:Mos(?:ebok)?|Jos(?:ua)?|Dom(?:merne)?|Rut|Sam(?:uel)?|Kong(?:ene)?|Krøn(?:ikene)?|Esra|Neh(?:emia)?|Est(?:er)?|Job|Sal(?:menes?)?|Ord(?:språkene)?|Fork(?:ynnerens?)?|Høys(?:angen)?|Jes(?:aja)?|Jer(?:emia)?|Klag(?:esangene)?|Esek(?:iel)?|Dan(?:iel)?|Hos(?:ea)?|Joel|Am(?:os)?|Ob(?:adja)?|Jon(?:a)?|Mik(?:a)?|Nah(?:um)?|Hab(?:akkuk)?|Sef(?:anja)?|Hag(?:gai)?|Sak(?:arja)?|Mal(?:aki)?|Matt(?:eus)?|Mark(?:us)?|Luk(?:as)?|Joh(?:annes)?|Apg|Rom(?:erne)?|Kor(?:inter(?:brevet)?)?|Gal(?:aterne)?|Ef(?:eserne)?|Fil(?:ipperne)?|Kol(?:osserne)?|Tess(?:alonikerne)?|Tim(?:oteus)?|Tit(?:us)?|Filem(?:on)?|Hebr(?:eerne)?|Jak(?:ob)?|Pet(?:er)?|Jud(?:as)?|Åp(?:enbaring(?:en)?)?)\b\.?\s+\d+:\d+(?:[–\-]\d+)?/g;

function extractBibleRefs(text: string): string[] {
  // Reset lastIndex since the regex is defined with /g at module level
  BIBLE_REF_RE.lastIndex = 0;
  const matches = text.match(BIBLE_REF_RE);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.trim()))];
}

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

function AssistantMessage({
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
          p: ({ children }) => <p style={{ marginBottom: "6px" }}>{children}</p>,
          ul: ({ children }) => <ul style={{ paddingLeft: "16px", margin: "4px 0" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: "16px", margin: "4px 0" }}>{children}</ol>,
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
      {detectedRefs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--sb-border-mid)" }}>
          {detectedRefs.map((r) => (
            <RefChip key={r} ref={r} onInsert={onInsertRef} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────

function ChatPanel({
  context,
  messages,
  onMessages,
  onClear,
  activeStep,
  onInsertRef,
}: {
  context: SermonContext | null;
  messages: Message[];
  onMessages: (msgs: Message[]) => void;
  onClear: () => void;
  activeStep: Step;
  onInsertRef: (ref: string) => void;
}) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || !context || streaming) return;
      const userMsg: Message = { role: "user", content: text.trim() };
      const updated = [...messages, userMsg];
      onMessages(updated);
      setInput("");
      setStreaming(true);
      try {
        const res = await fetch("/api/sermon/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "samtale",
            context: { ...context, activeStep },
            messages: updated,
          }),
        });
        if (!res.body) throw new Error();
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        onMessages([...updated, { role: "assistant", content: "" }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          onMessages([...updated, { role: "assistant", content: buf }]);
        }
      } catch {
        onMessages([...updated, { role: "assistant", content: "Noe gikk galt. Prøv igjen." }]);
      } finally {
        setStreaming(false);
      }
    },
    [messages, onMessages, context, activeStep, streaming],
  );

  const stepLabel = STEPS.find((s) => s.id === activeStep)?.label ?? "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--sb-panel)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--sb-border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sb-gold)",
              marginBottom: "3px",
            }}
          >
            Samtale
          </p>
          {context && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--sb-ink-meta)",
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontStyle: "italic",
              }}
            >
              {stepLabel}
            </p>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            title="Tøm samtale"
            style={{
              fontSize: "10px",
              color: "var(--sb-ink-faint)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              marginTop: "2px",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--sb-ink-meta)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--sb-ink-faint)")}
          >
            Tøm
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          minHeight: 0,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "40px 20px",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "22px", color: "var(--sb-border)", lineHeight: 1 }}>✦</span>
            <p
              style={{
                fontSize: "12.5px",
                lineHeight: 1.75,
                color: "var(--sb-ink-muted)",
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontStyle: "italic",
                maxWidth: "200px",
              }}
            >
              Still spørsmål om tekstene, teologien eller strukturen.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <span
              style={{
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--sb-ink-faint)",
                paddingInline: "4px",
              }}
            >
              {m.role === "user" ? "Du" : "AI"}
            </span>
            <div
              style={{
                borderRadius: "12px",
                padding: "10px 14px",
                maxWidth: "92%",
                ...(m.role === "user"
                  ? {
                      fontSize: "12.5px",
                      lineHeight: 1.7,
                      background: "var(--sb-ink)",
                      color: "var(--sb-bg)",
                      borderTopRightRadius: "4px",
                    }
                  : {
                      background: "var(--sb-bg)",
                      color: "var(--sb-ink)",
                      borderTopLeftRadius: "4px",
                      border: "1px solid var(--sb-border-mid)",
                    }),
              }}
            >
              {m.role === "assistant" ? (
                <AssistantMessage content={m.content} onInsertRef={onInsertRef} />
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px" }}>
            <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--sb-ink-faint)" }}>
              AI
            </span>
            <div style={{ display: "flex", gap: "4px" }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "var(--sb-gold)",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid var(--sb-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Skriv her…"
            rows={2}
            disabled={streaming || !context}
            style={{
              flex: 1,
              resize: "none",
              fontSize: "12.5px",
              lineHeight: 1.6,
              borderRadius: "8px",
              padding: "9px 12px",
              border: "1px solid var(--sb-border)",
              background: "var(--sb-bg)",
              color: "var(--sb-ink)",
              outline: "none",
              opacity: streaming || !context ? 0.4 : 1,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming || !context}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              border: "none",
              background: "var(--sb-ink)",
              color: "var(--sb-bg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              opacity: !input.trim() || streaming || !context ? 0.3 : 1,
              transition: "background 0.15s, opacity 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!(!input.trim() || streaming || !context))
                e.currentTarget.style.background = "var(--sb-gold)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--sb-ink)";
            }}
          >
            <FontAwesomeIcon icon={faPaperPlane} style={{ fontSize: "11px" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step workspace ────────────────────────────────────────────────────────────

function StepWorkspace({
  step,
  data,
  onChange,
  editorRef,
  textareaRef,
}: {
  step: Step;
  data: StepData;
  onChange: (patch: Partial<StepData>) => void;
  editorRef: React.MutableRefObject<Editor | null>;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const stepMeta = STEPS.find((s) => s.id === step)!;
  return (
    <div>
      {/* Step heading */}
      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: "26px",
            fontWeight: 700,
            fontStyle: "italic",
            color: "var(--sb-ink)",
            lineHeight: 1.2,
            marginBottom: "10px",
          }}
        >
          {stepMeta.label}
        </h2>
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

      {step === "utkast" ? (
        <ProseEditor
          initialJson={data.draftJson}
          onChange={(draftJson) => onChange({ draftJson })}
          editorRef={editorRef}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={data.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder={NOTES_PLACEHOLDER[step]}
          rows={20}
          style={{
            width: "100%",
            resize: "none",
            background: "transparent",
            fontSize: "16px",
            lineHeight: 1.9,
            color: "var(--sb-ink)",
            border: "none",
            outline: "none",
            fontFamily: "inherit",
            paddingBottom: "40px",
          }}
        />
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function SermonBuilder() {
  const [date, setDate] = useState(() => todayISO());
  const [tekstrekke, setTekstrekke] = useState<number | null>(null);
  const [apiData, setApiData] = useState<SermonTextsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<Step>("tekststudie");
  const [draft, setDraft] = useState<SermonDraft | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadDate = useCallback(async (d: string, tr?: number | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: d });
      if (tr) params.set("tekstrekke", String(tr));
      const res = await fetch(`/api/sermon/texts?${params}`);
      if (!res.ok) { setApiData(null); return; }
      const json: SermonTextsResponse = await res.json();
      setApiData(json);
      setTekstrekke(json.day.tekstrekke);
      setDate(d);
      const key = `sermon_${json.day.dato}`;
      const saved = localStorage.getItem(key);
      setDraft(
        saved ? migrateDraft(JSON.parse(saved) as SermonDraft) : emptyDraft(json.day.dato),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDate(todayISO(), null); }, [loadDate]);

  useEffect(() => {
    if (!draft || !apiData) return;
    localStorage.setItem(
      `sermon_${apiData.day.dato}`,
      JSON.stringify({ ...draft, lastModified: new Date().toISOString() }),
    );
  }, [draft, apiData]);

  const updateStep = useCallback((step: Step, patch: Partial<StepData>) => {
    setDraft((d) =>
      d ? { ...d, steps: { ...d.steps, [step]: { ...d.steps[step], ...patch } } } : d,
    );
  }, []);

  const updateChat = useCallback((messages: Message[]) => {
    setDraft((d) => (d ? { ...d, chat: { messages } } : d));
  }, []);

  const handlePasteVerse = useCallback((verseText: string) => {
    if (activeStep === "utkast" && editorRef.current) {
      editorRef.current.chain().focus().insertContent(verseText).run();
    } else {
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? -1;
      const end = ta?.selectionEnd ?? -1;
      setDraft((d) => {
        if (!d) return d;
        const prev = d.steps[activeStep].notes;
        const insertAt = start >= 0 ? start : prev.length;
        const replaceEnd = end >= 0 ? end : prev.length;
        const newNotes = prev.slice(0, insertAt) + verseText + prev.slice(replaceEnd);
        return {
          ...d,
          steps: { ...d.steps, [activeStep]: { ...d.steps[activeStep], notes: newNotes } },
        };
      });
      if (ta && start >= 0) {
        const newPos = start + verseText.length;
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = newPos;
          ta.focus();
        }, 0);
      }
    }
  }, [activeStep]);

  const handleInsertRef = useCallback(async (ref: string) => {
    try {
      const res = await fetch(`/api/verses?ref=${encodeURIComponent(ref)}`);
      if (!res.ok) return;
      const data = await res.json();
      const verses = data.verses as Array<{ versenumber: number; versecontent: string }>;
      if (!verses?.length) return;

      const text =
        `\n\n${ref}:\n` +
        verses.map((v) => `${v.versenumber} ${v.versecontent}`).join(" ") +
        "\n";

      if (activeStep === "utkast" && editorRef.current) {
        editorRef.current.chain().focus().insertContent(text).run();
      } else {
        setDraft((d) => {
          if (!d) return d;
          const prev = d.steps[activeStep].notes;
          return {
            ...d,
            steps: {
              ...d.steps,
              [activeStep]: { ...d.steps[activeStep], notes: prev + text },
            },
          };
        });
        // Move textarea cursor to end
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
          }
        }, 50);
      }
    } catch {
      // silently ignore fetch errors
    }
  }, [activeStep]);

  const context: SermonContext | null = apiData
    ? {
        sunday_name:       apiData.day.sunday_name,
        dato:              apiData.day.dato,
        tekstrekke:        apiData.day.tekstrekke,
        series:            apiData.day.series,
        ot_reference:      apiData.day.ot_reference,
        epistle_reference: apiData.day.epistle_reference,
        gospel_reference:  apiData.day.gospel_reference,
        otText:            apiData.ot?.fullText ?? "",
        epistleText:       apiData.epistle?.fullText ?? "",
        gospelText:        apiData.gospel?.fullText ?? "",
        tekststudieNotes:  draft?.steps.tekststudie.notes,
        forbindelserNotes: draft?.steps.forbindelser.notes,
        disposisjonNotes:  draft?.steps.disposisjon.notes,
        activeStep,
      }
    : null;

  const currentStep = draft?.steps[activeStep] ?? { notes: "" };
  const chatMessages = draft?.chat?.messages ?? [];

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--sb-bg)",
        color: "var(--sb-ink)",
        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
      }}
    >
      {/* ══ Masthead ══════════════════════════════════════════════════════════ */}
      <header
        style={{
          flexShrink: 0,
          background: "var(--sb-bg)",
          borderBottom: "1px solid var(--sb-ink)",
        }}
      >
        {/* Gold rule */}
        <div style={{ height: "4px", background: "var(--sb-gold)" }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 28px",
            gap: "20px",
          }}
        >
          {/* Brand */}
          <div style={{ flexShrink: 0 }}>
            <h1
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontSize: "24px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: "var(--sb-ink)",
                marginBottom: "3px",
              }}
            >
              Skriv med Bibelen
            </h1>
            <p
              style={{
                fontSize: "8.5px",
                textTransform: "uppercase",
                letterSpacing: "0.28em",
                color: "var(--sb-ink-muted)",
                lineHeight: 1,
              }}
            >
              Prekenutforming
            </p>
          </div>

          {/* Date navigation */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
            }}
          >
            <button
              onClick={() => apiData?.prevSundayDate && loadDate(apiData.prevSundayDate, tekstrekke)}
              disabled={!apiData?.prevSundayDate}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--sb-ink-meta)",
                background: "none",
                border: "none",
                cursor: apiData?.prevSundayDate ? "pointer" : "default",
                borderRadius: "4px",
                opacity: apiData?.prevSundayDate ? 1 : 0.3,
              }}
            >
              <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: "11px" }} />
            </button>

            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: "17px",
                  fontStyle: "italic",
                  color: "var(--sb-ink)",
                  lineHeight: 1.2,
                  marginBottom: "3px",
                }}
              >
                {apiData ? apiData.day.sunday_name : loading ? "…" : "—"}
              </p>
              {apiData && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                  <p style={{ fontSize: "10px", color: "var(--sb-ink-meta)", letterSpacing: "0.03em" }}>
                    {formatLong(apiData.day.dato).replace(/^\w+,?\s*/, "")}
                  </p>
                  <span style={{ color: "var(--sb-border)", fontSize: "10px" }}>·</span>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                    <span style={{ fontSize: "9px", color: "var(--sb-ink-muted)", letterSpacing: "0.1em", marginRight: "2px" }}>TR</span>
                    {apiData.availableTekstrekker.map((tr) => (
                      <button
                        key={tr}
                        onClick={() => loadDate(apiData.day.dato, tr)}
                        style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "3px",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "9px",
                          fontWeight: 600,
                          transition: "background 0.12s, color 0.12s",
                          background: tekstrekke === tr ? "var(--sb-gold)" : "var(--sb-border-mid)",
                          color: tekstrekke === tr ? "#fff" : "var(--sb-ink-meta)",
                        }}
                      >
                        {tr}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => apiData?.nextSundayDate && loadDate(apiData.nextSundayDate, tekstrekke)}
              disabled={!apiData?.nextSundayDate}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--sb-ink-meta)",
                background: "none",
                border: "none",
                cursor: apiData?.nextSundayDate ? "pointer" : "default",
                borderRadius: "4px",
                opacity: apiData?.nextSundayDate ? 1 : 0.3,
              }}
            >
              <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: "11px" }} />
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
            {apiData && date !== apiData.day.dato && (
              <button
                onClick={() => loadDate(apiData.day.dato, tekstrekke)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--sb-ink-meta)",
                  border: "1px solid var(--sb-border)",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                <FontAwesomeIcon icon={faCalendarDay} style={{ fontSize: "10px" }} />
                Nærmeste søndag
              </button>
            )}
            {loading && (
              <FontAwesomeIcon
                icon={faSpinner}
                className="animate-spin"
                style={{ fontSize: "13px", color: "var(--sb-ink-faint)" }}
              />
            )}
            {draft && (
              <span style={{ fontSize: "10px", color: "var(--sb-ink-faint)" }}>
                Lagret{" "}
                {new Date(draft.lastModified).toLocaleTimeString("nb-NO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ══ Body ══════════════════════════════════════════════════════════════ */}
      {!apiData && !loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              fontStyle: "italic",
              color: "var(--sb-ink-muted)",
              fontFamily: "var(--font-playfair), Georgia, serif",
            }}
          >
            Ingen kirkeårdag funnet.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* ── Column 1: Bible texts ── */}
          <aside
            style={{
              width: "240px",
              flexShrink: 0,
              overflowY: "auto",
              background: "var(--sb-panel)",
              borderRight: "1px solid var(--sb-border)",
            }}
          >
            <div style={{ padding: "24px 20px" }}>
              {/* Section label */}
              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.22em",
                    color: "var(--sb-gold)",
                    marginBottom: "8px",
                  }}
                >
                  Tekster
                </p>
                <div style={{ height: "1px", background: "var(--sb-border)" }} />
              </div>

              {apiData ? (
                <div>
                  {apiData.ot && (
                    <TextCard text={apiData.ot} label={`GT · ${apiData.day.ot_reference}`} onPasteVerse={handlePasteVerse} />
                  )}
                  {apiData.epistle && (
                    <TextCard text={apiData.epistle} label={`Epistel · ${apiData.day.epistle_reference}`} onPasteVerse={handlePasteVerse} />
                  )}
                  {apiData.gospel && (
                    <TextCard text={apiData.gospel} label={`Evangelium · ${apiData.day.gospel_reference}`} onPasteVerse={handlePasteVerse} />
                  )}
                  {!apiData.ot && !apiData.epistle && !apiData.gospel && (
                    <p style={{ fontSize: "12px", color: "var(--sb-ink-muted)", fontStyle: "italic" }}>
                      Ingen tekster registrert.
                    </p>
                  )}
                  <div style={{ borderTop: "1px solid var(--sb-border-mid)" }} />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[80, 70, 75].map((w, i) => (
                    <div
                      key={i}
                      className="animate-pulse"
                      style={{
                        height: "14px",
                        borderRadius: "3px",
                        background: "var(--sb-border-mid)",
                        width: `${w}%`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Prev / next Sunday */}
              {apiData && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "20px",
                    paddingTop: "16px",
                    borderTop: "1px solid var(--sb-border-mid)",
                    fontSize: "10.5px",
                    color: "var(--sb-ink-muted)",
                  }}
                >
                  {apiData.prevSundayDate ? (
                    <button
                      onClick={() => loadDate(apiData.prevSundayDate!, tekstrekke)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "inherit",
                        color: "inherit",
                        padding: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--sb-ink)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--sb-ink-muted)")}
                    >
                      ← {formatShort(apiData.prevSundayDate)}
                    </button>
                  ) : (
                    <span />
                  )}
                  {apiData.nextSundayDate ? (
                    <button
                      onClick={() => loadDate(apiData.nextSundayDate!, tekstrekke)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "inherit",
                        color: "inherit",
                        padding: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--sb-ink)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--sb-ink-muted)")}
                    >
                      {formatShort(apiData.nextSundayDate)} →
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ── Column 2: Writing workspace ── */}
          <main
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {/* Step tab bar */}
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
                    onClick={() => setActiveStep(s.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "14px 20px 12px",
                      marginBottom: "-1px",
                      background: "none",
                      border: "none",
                      borderBottom: active ? "2px solid var(--sb-gold)" : "2px solid transparent",
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

            {/* Writing area */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ maxWidth: "680px", margin: "0 auto", padding: "48px 48px 80px" }}>
                <StepWorkspace
                  key={activeStep + (apiData?.day.dato ?? "")}
                  step={activeStep}
                  data={currentStep}
                  onChange={(patch) => updateStep(activeStep, patch)}
                  editorRef={editorRef}
                  textareaRef={textareaRef}
                />
              </div>
            </div>
          </main>

          {/* ── Column 3: Chat ── */}
          <aside
            style={{
              width: "300px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              borderLeft: "1px solid var(--sb-border)",
            }}
          >
            <ChatPanel
              context={context}
              messages={chatMessages}
              onMessages={updateChat}
              onClear={() => updateChat([])}
              activeStep={activeStep}
              onInsertRef={handleInsertRef}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

export default SermonBuilder;
