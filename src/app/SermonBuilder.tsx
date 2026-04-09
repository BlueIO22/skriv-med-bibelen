"use client";

import type { SermonTextsResponse, VerseRow } from "@/app/api/sermon/texts/route";
import {
  faArrowLeft,
  faArrowRight,
  faCalendarDay,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BibleReferenceAttrs, VerseEntry } from "@/lib/sermon/types";
import type { Message, SermonContext, SermonDraft, Step, StepData } from "@/lib/sermon/types";
import { emptyDraft, migrateDraft } from "@/lib/sermon/draft";
import { formatLong, formatShort, todayISO } from "@/lib/sermon/dateUtils";
import { markdownToHtml } from "@/lib/sermon/markdownUtils";
import { BibleTextsPanel } from "./sermon/BibleTextsPanel";
import { ChatPanel } from "./sermon/ChatPanel";
import { StepTabBar } from "./sermon/StepTabBar";
import { StepWorkspace } from "./sermon/StepWorkspace";

export function SermonBuilder() {
  const [date, setDate] = useState(() => todayISO());
  const [tekstrekke, setTekstrekke] = useState<number | null>(null);
  const [apiData, setApiData] = useState<SermonTextsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<Step>("tekststudie");
  const [draft, setDraft] = useState<SermonDraft | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const cursorExplicitlySet = useRef(false);

  const loadDate = useCallback(async (d: string, tr?: number | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: d });
      if (tr) params.set("tekstrekke", String(tr));
      const res = await fetch(`/api/sermon/texts?${params}`);
      if (!res.ok) {
        setApiData(null);
        return;
      }
      const json: SermonTextsResponse = await res.json();
      setApiData(json);
      setTekstrekke(json.day.tekstrekke);
      setDate(d);
      const key = `sermon_${json.day.dato}`;
      const saved = localStorage.getItem(key);
      setDraft(
        saved
          ? migrateDraft(JSON.parse(saved) as SermonDraft)
          : emptyDraft(json.day.dato),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDate(todayISO(), null);
  }, [loadDate]);

  useEffect(() => {
    if (!draft || !apiData) return;
    localStorage.setItem(
      `sermon_${apiData.day.dato}`,
      JSON.stringify({ ...draft, lastModified: new Date().toISOString() }),
    );
  }, [draft, apiData]);

  const updateStep = useCallback((step: Step, patch: Partial<StepData>) => {
    setDraft((d) =>
      d
        ? { ...d, steps: { ...d.steps, [step]: { ...d.steps[step], ...patch } } }
        : d,
    );
  }, []);

  const updateChat = useCallback((messages: Message[]) => {
    setDraft((d) => (d ? { ...d, chat: { messages } } : d));
  }, []);

  const insertIntoEditor = useCallback(
    (paragraphText: string, wrapInBlockquote: boolean) => {
      const editor = editorRef.current;
      if (!editor) return;
      const para = { type: "paragraph", content: [{ type: "text", text: paragraphText }] };
      editor
        .chain()
        .focus()
        .insertContent(wrapInBlockquote ? [{ type: "blockquote", content: [para] }] : [para])
        .run();
    },
    [],
  );

  const handlePasteVerse = useCallback((verseRow: VerseRow) => {
    const editor = editorRef.current;
    if (!editor) return;
    const raw = verseRow.newname_reference.replace(/:\d+(-\d+)?$/, "").trim();
    const chapterRef = raw.charAt(0).toUpperCase() + raw.slice(1);
    const newVerse: VerseEntry = { versenumber: verseRow.versenumber, versecontent: verseRow.versecontent };

    const sel = editor.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === "bibleReference") {
      const selAttrs = sel.node.attrs as BibleReferenceAttrs;
      if (selAttrs.reference === chapterRef) {
        const alreadyIn = selAttrs.verses.some((v) => v.versenumber === newVerse.versenumber);
        if (!alreadyIn) {
          const nextVerses = [...selAttrs.verses, newVerse].sort((a, b) => a.versenumber - b.versenumber);
          editor.commands.command(({ tr }) => {
            tr.setNodeMarkup(sel.from, undefined, { ...selAttrs, verses: nextVerses });
            return true;
          });
        }
        return;
      }
    }

    const newNodeContent = {
      type: "bibleReference",
      attrs: { reference: chapterRef, verses: [newVerse], comment: "" },
    };
    if (cursorExplicitlySet.current) {
      editor.chain().focus().insertContent(newNodeContent).run();
    } else {
      editor.chain().focus()
        .setTextSelection(editor.state.doc.content.size)
        .insertContent(newNodeContent)
        .run();
    }
  }, []);

  const handleInsertRef = useCallback(async (ref: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const res = await fetch(`/api/verses?ref=${encodeURIComponent(ref)}`);
      if (!res.ok) return;
      const data = await res.json();
      const verses = data.verses as VerseEntry[];
      if (!verses?.length) return;

      const chapterRef = ref.replace(/:\d+.*$/, "").trim();
      const capitalised = chapterRef.charAt(0).toUpperCase() + chapterRef.slice(1);

      const sel = editor.state.selection;
      if (sel instanceof NodeSelection && sel.node.type.name === "bibleReference") {
        const selAttrs = sel.node.attrs as BibleReferenceAttrs;
        if (selAttrs.reference === capitalised) {
          const existing = selAttrs.verses;
          const merged = [...existing];
          for (const v of verses) {
            if (!merged.some((ev) => ev.versenumber === v.versenumber)) merged.push(v);
          }
          merged.sort((a, b) => a.versenumber - b.versenumber);
          editor.commands.command(({ tr }) => {
            tr.setNodeMarkup(sel.from, undefined, { ...selAttrs, verses: merged });
            return true;
          });
          return;
        }
      }

      const newNodeContent = {
        type: "bibleReference",
        attrs: { reference: capitalised, verses, comment: "" },
      };
      if (cursorExplicitlySet.current) {
        editor.chain().focus().insertContent(newNodeContent).run();
      } else {
        editor.chain().focus()
          .setTextSelection(editor.state.doc.content.size)
          .insertContent(newNodeContent)
          .run();
      }
    } catch {
      // silently ignore fetch errors
    }
  }, []);

  const context: SermonContext | null = apiData
    ? {
        sunday_name: apiData.day.sunday_name,
        dato: apiData.day.dato,
        tekstrekke: apiData.day.tekstrekke,
        series: apiData.day.series,
        ot_reference: apiData.day.ot_reference,
        epistle_reference: apiData.day.epistle_reference,
        gospel_reference: apiData.day.gospel_reference,
        otText: apiData.ot?.fullText ?? "",
        epistleText: apiData.epistle?.fullText ?? "",
        gospelText: apiData.gospel?.fullText ?? "",
        tekststudieNotes: draft?.steps.tekststudie.notes,
        forbindelserNotes: draft?.steps.forbindelser.notes,
        disposisjonNotes: draft?.steps.disposisjon.notes,
        activeStep,
      }
    : null;

  const handleGenerateDraft = useCallback(async () => {
    if (!context || generatingDraft) return;
    setGeneratingDraft(true);
    setActiveStep("utkast");

    try {
      const res = await fetch("/api/sermon/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "generer-utkast",
          context,
          messages: [{ role: "user", content: "Generer et prekenuttkast." }],
        }),
      });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
      }

      const html = markdownToHtml(buf);
      if (editorRef.current) {
        editorRef.current.commands.setContent(html);
      }
    } catch {
      // silently fail — editor stays as-is
    } finally {
      setGeneratingDraft(false);
    }
  }, [context, generatingDraft]);

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
              onClick={() =>
                apiData?.prevSundayDate &&
                loadDate(apiData.prevSundayDate, tekstrekke)
              }
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: "10px",
                      color: "var(--sb-ink-meta)",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {formatLong(apiData.day.dato).replace(/^\w+,?\s*/, "")}
                  </p>
                  <span style={{ color: "var(--sb-border)", fontSize: "10px" }}>·</span>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        color: "var(--sb-ink-muted)",
                        letterSpacing: "0.1em",
                        marginRight: "2px",
                      }}
                    >
                      TR
                    </span>
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
                          background:
                            tekstrekke === tr
                              ? "var(--sb-gold)"
                              : "var(--sb-border-mid)",
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
              onClick={() =>
                apiData?.nextSundayDate &&
                loadDate(apiData.nextSundayDate, tekstrekke)
              }
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flexShrink: 0,
            }}
          >
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
          {/* Column 1: Bible texts */}
          <BibleTextsPanel
            apiData={apiData}
            tekstrekke={tekstrekke}
            onLoadDate={loadDate}
            onPasteVerse={handlePasteVerse}
          />

          {/* Column 2: Writing workspace */}
          <main
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <StepTabBar
              activeStep={activeStep}
              onStepChange={(step) => {
                setActiveStep(step);
                cursorExplicitlySet.current = false;
              }}
            />

            <div style={{ flex: 1, overflowY: "auto" }}>
              <div
                style={{
                  maxWidth: "680px",
                  margin: "0 auto",
                  padding: "48px 48px 80px",
                }}
              >
                <StepWorkspace
                  key={activeStep + (apiData?.day.dato ?? "")}
                  step={activeStep}
                  data={currentStep}
                  onChange={(patch) => updateStep(activeStep, patch)}
                  editorRef={editorRef}
                  onGenerateDraft={handleGenerateDraft}
                  generatingDraft={generatingDraft}
                  onCursorPlaced={() => { cursorExplicitlySet.current = true; }}
                />
              </div>
            </div>
          </main>

          {/* Column 3: Chat */}
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
