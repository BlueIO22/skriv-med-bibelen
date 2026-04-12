"use client";

import type { SermonTextsResponse, VerseRow } from "@/app/api/sermon/texts/route";
import {
  faArrowLeft,
  faArrowRight,
  faCalendarDay,
  faChevronDown,
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
import { ForbindelserFlow, type ForbindelserFlowHandle } from "./sermon/ForbindelserFlow";
import { StepTabBar } from "./sermon/StepTabBar";
import { StepWorkspace } from "./sermon/StepWorkspace";
import { TextSelectionDialog } from "./sermon/TextSelectionDialog";

export function SermonBuilder() {
  const [date, setDate] = useState(() => todayISO());
  const [tekstrekke, setTekstrekke] = useState<number | null>(null);
  const [apiData, setApiData] = useState<SermonTextsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<Step>("tekststudie");
  const [draft, setDraft] = useState<SermonDraft | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [teksterCollapsed, setTeksterCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [textSelectionOpen, setTextSelectionOpen] = useState(false);
  const [sundayDropdownOpen, setSundayDropdownOpen] = useState(false);
  const [sundayQuery, setSundayQuery] = useState("");
  const [allDays, setAllDays] = useState<Array<{ dato: string; sunday_name: string }>>([]);
  const sundayDropdownRef = useRef<HTMLDivElement>(null);
  const sundayInputRef = useRef<HTMLInputElement>(null);
  const sundayListRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const flowRef = useRef<ForbindelserFlowHandle | null>(null);
  const cursorExplicitlySet = useRef(false);
  const pendingVerses = useRef<{ step: Step; verses: VerseRow[] } | null>(null);

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

  // Fetch all church year days once on mount
  useEffect(() => {
    fetch("/api/sermon/days?series=dnk")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setAllDays(data.days); })
      .catch(() => {});
  }, []);

  // Sunday dropdown: close on outside click
  useEffect(() => {
    if (!sundayDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sundayDropdownRef.current && !sundayDropdownRef.current.contains(e.target as Node)) {
        setSundayDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sundayDropdownOpen]);

  const filteredDays = sundayQuery.trim()
    ? allDays.filter((d) =>
        d.sunday_name.toLowerCase().includes(sundayQuery.toLowerCase())
      )
    : allDays;

  // Scroll active day into center when dropdown opens
  useEffect(() => {
    if (!sundayDropdownOpen || !apiData) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`sunday-day-${apiData.day.dato}`);
      const container = sundayListRef.current;
      if (el && container) {
        container.scrollTop =
          el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [sundayDropdownOpen, apiData]);

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

  const insertVersesIntoFlow = useCallback((verses: VerseRow[]) => {
    const flow = flowRef.current;
    if (!flow || !verses.length) return;
    // Group by chapter reference
    const groups = new Map<string, VerseRow[]>();
    for (const v of verses) {
      const raw = v.newname_reference.replace(/:\d+(-\d+)?$/, "").trim();
      const chapterRef = raw.charAt(0).toUpperCase() + raw.slice(1);
      if (!groups.has(chapterRef)) groups.set(chapterRef, []);
      groups.get(chapterRef)!.push(v);
    }
    for (const [chapterRef, groupVerses] of groups) {
      flow.addVerseNode(
        chapterRef,
        groupVerses
          .map((v) => ({ versenumber: v.versenumber, versecontent: v.versecontent }))
          .sort((a, b) => a.versenumber - b.versenumber),
      );
    }
  }, []);

  const insertVersesIntoEditor = useCallback((verses: VerseRow[]) => {
    const editor = editorRef.current;
    if (!editor || !verses.length) return;
    const groups = new Map<string, VerseRow[]>();
    for (const v of verses) {
      const raw = v.newname_reference.replace(/:\d+(-\d+)?$/, "").trim();
      const chapterRef = raw.charAt(0).toUpperCase() + raw.slice(1);
      if (!groups.has(chapterRef)) groups.set(chapterRef, []);
      groups.get(chapterRef)!.push(v);
    }
    for (const [chapterRef, groupVerses] of groups) {
      const verseEntries: VerseEntry[] = groupVerses
        .map((v) => ({ versenumber: v.versenumber, versecontent: v.versecontent }))
        .sort((a, b) => a.versenumber - b.versenumber);
      editor
        .chain()
        .focus()
        .setTextSelection(editor.state.doc.content.size)
        .insertContent({
          type: "bibleReference",
          attrs: { reference: chapterRef, verses: verseEntries, comment: "" },
        })
        .run();
    }
  }, []);

  const handlePasteVerses = useCallback((step: Step, verses: VerseRow[]) => {
    if (step !== activeStep) {
      pendingVerses.current = { step, verses };
      setActiveStep(step);
      cursorExplicitlySet.current = false;
      return;
    }
    if (step === "forbindelser") {
      insertVersesIntoFlow(verses);
    } else {
      insertVersesIntoEditor(verses);
    }
  }, [activeStep, insertVersesIntoFlow, insertVersesIntoEditor]);

  // Insert pending verses once the target step is active
  useEffect(() => {
    if (!pendingVerses.current) return;
    const { step, verses } = pendingVerses.current;
    if (step !== activeStep) return;
    pendingVerses.current = null;
    if (step === "forbindelser") {
      // Flow mounts synchronously, give it a tick
      setTimeout(() => insertVersesIntoFlow(verses), 50);
    } else {
      const editor = editorRef.current;
      if (!editor) return;
      insertVersesIntoEditor(verses);
    }
  }, [activeStep, insertVersesIntoFlow, insertVersesIntoEditor]);

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
              gap: "20px",
            }}
          >
            {/* Prev button */}
            <button
              onClick={() =>
                apiData?.prevSundayDate &&
                loadDate(apiData.prevSundayDate, tekstrekke)
              }
              disabled={!apiData?.prevSundayDate}
              title="Forrige"
              style={{
                width: "36px",
                height: "36px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: apiData?.prevSundayDate ? "var(--sb-ink-soft)" : "var(--sb-ink-faint)",
                background: "#fff",
                border: "1px solid var(--sb-border)",
                borderRadius: "8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                cursor: apiData?.prevSundayDate ? "pointer" : "default",
                transition: "background 0.12s, box-shadow 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (apiData?.prevSundayDate) {
                  e.currentTarget.style.background = "var(--sb-panel)";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.10)";
                  e.currentTarget.style.color = "var(--sb-ink)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                e.currentTarget.style.color = apiData?.prevSundayDate ? "var(--sb-ink-soft)" : "var(--sb-ink-faint)";
              }}
            >
              <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: "12px" }} />
            </button>

            {/* Sunday name combobox */}
            <div ref={sundayDropdownRef} style={{ textAlign: "center", position: "relative", minWidth: "200px" }}>
              {/* Dropdown trigger */}
              <button
                onClick={() => {
                  setSundayDropdownOpen((v) => !v);
                  setSundayQuery("");
                  setTimeout(() => sundayInputRef.current?.focus(), 50);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: "19px",
                  fontStyle: "italic",
                  color: "var(--sb-ink)",
                  background: sundayDropdownOpen ? "var(--sb-surface)" : "transparent",
                  border: "1px solid",
                  borderColor: sundayDropdownOpen ? "var(--sb-border)" : "transparent",
                  cursor: "pointer",
                  lineHeight: 1.25,
                  padding: "5px 12px",
                  borderRadius: "8px",
                  transition: "background 0.12s, border-color 0.12s",
                  marginBottom: "6px",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!sundayDropdownOpen) {
                    e.currentTarget.style.background = "var(--sb-surface)";
                    e.currentTarget.style.borderColor = "var(--sb-border)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!sundayDropdownOpen) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "transparent";
                  }
                }}
              >
                {apiData ? apiData.day.sunday_name : loading ? "…" : "—"}
                <FontAwesomeIcon
                  icon={faChevronDown}
                  style={{
                    fontSize: "10px",
                    color: "var(--sb-gold)",
                    fontStyle: "normal",
                    transition: "transform 0.15s",
                    transform: sundayDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}
                />
              </button>

              {/* Date + Tekstrekke row */}
              {apiData && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--sb-ink-soft)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {formatLong(apiData.day.dato)}
                  </span>
                  <span style={{ color: "var(--sb-border)", fontSize: "11px" }}>·</span>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <span style={{ fontSize: "10px", color: "var(--sb-ink-muted)", marginRight: "1px" }}>
                      Tekstrekke
                    </span>
                    {[1, 2, 3].map((tr) => {
                      const available = apiData.availableTekstrekker.includes(tr);
                      const active = tekstrekke === tr;
                      return (
                        <button
                          key={tr}
                          onClick={() => available && loadDate(apiData.day.dato, tr)}
                          disabled={!available}
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "5px",
                            border: active ? "none" : "1px solid",
                            borderColor: available ? "var(--sb-border)" : "transparent",
                            cursor: available ? "pointer" : "default",
                            fontSize: "10px",
                            fontWeight: 600,
                            transition: "background 0.12s, color 0.12s, box-shadow 0.12s",
                            background: active ? "var(--sb-gold)" : available ? "#fff" : "transparent",
                            color: active ? "#fff" : available ? "var(--sb-ink-meta)" : "var(--sb-ink-faint)",
                            boxShadow: active ? "0 1px 4px rgba(200,168,75,0.35)" : available ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                            opacity: available ? 1 : 0.35,
                          }}
                        >
                          {tr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dropdown panel */}
              {sundayDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "300px",
                    background: "#fff",
                    border: "1px solid var(--sb-border)",
                    borderRadius: "10px",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                    zIndex: 100,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "10px 10px 6px" }}>
                    <input
                      ref={sundayInputRef}
                      value={sundayQuery}
                      onChange={(e) => setSundayQuery(e.target.value)}
                      placeholder="Søk kirkeårdag…"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "13px",
                        border: "1px solid var(--sb-border)",
                        borderRadius: "6px",
                        background: "var(--sb-panel)",
                        color: "var(--sb-ink)",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div ref={sundayListRef} style={{ maxHeight: "260px", overflowY: "auto", paddingBottom: "6px" }}>
                    {filteredDays.length === 0 ? (
                      <div style={{ padding: "14px 16px", fontSize: "12px", color: "var(--sb-ink-muted)", textAlign: "center" }}>
                        Ingen treff
                      </div>
                    ) : (
                      filteredDays.filter((day) => day.dato).map((day) => {
                        const isActive = apiData?.day.dato === day.dato;
                        const year = day.dato.slice(0, 4);
                        return (
                          <button
                            key={day.dato}
                            id={`sunday-day-${day.dato}`}
                            onClick={() => {
                              loadDate(day.dato, tekstrekke);
                              setSundayDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              width: "100%",
                              padding: "9px 14px",
                              background: isActive ? "var(--sb-gold-light)" : "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--sb-ink)",
                              textAlign: "left",
                              gap: "12px",
                            }}
                            onMouseEnter={(e) => {
                              if (!isActive) e.currentTarget.style.background = "var(--sb-panel)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isActive) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <span style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "italic", fontSize: "13px" }}>
                              {day.sunday_name}
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--sb-ink-muted)", flexShrink: 0, display: "flex", gap: "5px", alignItems: "center" }}>
                              <span>{formatShort(day.dato)}</span>
                              <span style={{ color: "var(--sb-ink-faint)", fontSize: "10px" }}>{year}</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Next button */}
            <button
              onClick={() =>
                apiData?.nextSundayDate &&
                loadDate(apiData.nextSundayDate, tekstrekke)
              }
              disabled={!apiData?.nextSundayDate}
              title="Neste"
              style={{
                width: "36px",
                height: "36px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: apiData?.nextSundayDate ? "var(--sb-ink-soft)" : "var(--sb-ink-faint)",
                background: "#fff",
                border: "1px solid var(--sb-border)",
                borderRadius: "8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                cursor: apiData?.nextSundayDate ? "pointer" : "default",
                transition: "background 0.12s, box-shadow 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (apiData?.nextSundayDate) {
                  e.currentTarget.style.background = "var(--sb-panel)";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.10)";
                  e.currentTarget.style.color = "var(--sb-ink)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                e.currentTarget.style.color = apiData?.nextSundayDate ? "var(--sb-ink-soft)" : "var(--sb-ink-faint)";
              }}
            >
              <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: "12px" }} />
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
          <div
            style={{
              width: teksterCollapsed ? "0px" : "240px",
              flexShrink: 0,
              overflow: "hidden",
              transition: "width 0.2s ease",
            }}
          >
            <BibleTextsPanel
              apiData={apiData}
              tekstrekke={tekstrekke}
              activeStep={activeStep}
              onLoadDate={loadDate}
              onOpenTextSelection={() => setTextSelectionOpen(true)}
            />
          </div>

          {/* Toggle strip: tekster */}
          <button
            onClick={() => setTeksterCollapsed((v) => !v)}
            title={teksterCollapsed ? "Vis tekster" : "Skjul tekster"}
            style={{
              flexShrink: 0,
              width: "18px",
              border: "none",
              borderRight: "1px solid var(--sb-border)",
              background: "var(--sb-panel)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--sb-ink-meta)",
              padding: 0,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--sb-surface)";
              e.currentTarget.style.color = "var(--sb-ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--sb-panel)";
              e.currentTarget.style.color = "var(--sb-ink-meta)";
            }}
          >
            <FontAwesomeIcon
              icon={teksterCollapsed ? faArrowRight : faArrowLeft}
              style={{ fontSize: "10px" }}
            />
          </button>

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

            {activeStep === "forbindelser" ? (
              <ForbindelserFlow
                key={"forbindelser" + (apiData?.day.dato ?? "")}
                ref={flowRef}
                data={currentStep}
                onChange={(patch) => updateStep("forbindelser", patch)}
                apiData={apiData}
                tekststudieData={draft?.steps.tekststudie}
              />
            ) : (
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
            )}
          </main>

          {/* Toggle strip: chat */}
          <button
            onClick={() => setChatCollapsed((v) => !v)}
            title={chatCollapsed ? "Vis chat" : "Skjul chat"}
            style={{
              flexShrink: 0,
              width: "18px",
              border: "none",
              borderLeft: "1px solid var(--sb-border)",
              background: "var(--sb-panel)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--sb-ink-meta)",
              padding: 0,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--sb-surface)";
              e.currentTarget.style.color = "var(--sb-ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--sb-panel)";
              e.currentTarget.style.color = "var(--sb-ink-meta)";
            }}
          >
            <FontAwesomeIcon
              icon={chatCollapsed ? faArrowLeft : faArrowRight}
              style={{ fontSize: "10px" }}
            />
          </button>

          {/* Column 3: Chat */}
          <div
            style={{
              width: chatCollapsed ? "0px" : "300px",
              flexShrink: 0,
              overflow: "hidden",
              transition: "width 0.2s ease",
            }}
          >
            <div style={{ width: "300px", height: "100%", display: "flex", flexDirection: "column" }}>
              <ChatPanel
                context={context}
                messages={chatMessages}
                onMessages={updateChat}
                onClear={() => updateChat([])}
                activeStep={activeStep}
                onInsertRef={handleInsertRef}
              />
            </div>
          </div>
        </div>
      )}

      {/* Text selection dialog */}
      {textSelectionOpen && apiData && (
        <TextSelectionDialog
          apiData={apiData}
          activeStep={activeStep}
          onAddVerses={handlePasteVerses}
          onClose={() => setTextSelectionOpen(false)}
        />
      )}
    </div>
  );
}

export default SermonBuilder;
