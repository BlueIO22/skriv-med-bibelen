"use client";

import type { LectionaryText, VerseRow, SermonTextsResponse } from "@/app/api/sermon/texts/route";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Step } from "@/lib/sermon/types";
import { STEPS } from "@/lib/sermon/types";

type TabId = "gospel" | "ot" | "epistle";

interface TextSelectionDialogProps {
  apiData: SermonTextsResponse;
  activeStep: Step;
  onAddVerses: (step: Step, verses: VerseRow[]) => void;
  onClose: () => void;
}

export function TextSelectionDialog({
  apiData,
  activeStep,
  onAddVerses,
  onClose,
}: TextSelectionDialogProps) {
  const tabs: { id: TabId; label: string; text: LectionaryText }[] = [];
  if (apiData.gospel)
    tabs.push({
      id: "gospel",
      label: `Evangelium · ${apiData.day.gospel_reference}`,
      text: apiData.gospel,
    });
  if (apiData.ot)
    tabs.push({
      id: "ot",
      label: `GT · ${apiData.day.ot_reference}`,
      text: apiData.ot,
    });
  if (apiData.epistle)
    tabs.push({
      id: "epistle",
      label: `NT · ${apiData.day.epistle_reference}`,
      text: apiData.epistle,
    });

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]?.id ?? "gospel");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetStep, setTargetStep] = useState<Step>(activeStep);
  const lastClickedIndex = useRef<number>(-1);

  const currentText = tabs.find((t) => t.id === activeTab)?.text;
  const currentVerses = currentText?.verses ?? [];

  const verseKey = (tabId: TabId, versenumber: number) => `${tabId}:${versenumber}`;

  const toggleVerse = useCallback(
    (tabId: TabId, index: number, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const verses = tabs.find((t) => t.id === tabId)?.text.verses ?? [];
        const key = verseKey(tabId, verses[index].versenumber);

        if (shiftKey && lastClickedIndex.current >= 0) {
          const start = Math.min(lastClickedIndex.current, index);
          const end = Math.max(lastClickedIndex.current, index);
          const adding = !prev.has(key);
          for (let i = start; i <= end; i++) {
            const k = verseKey(tabId, verses[i].versenumber);
            if (adding) next.add(k);
            else next.delete(k);
          }
        } else {
          if (next.has(key)) next.delete(key);
          else next.add(key);
        }
        return next;
      });
      lastClickedIndex.current = index;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab],
  );

  const totalSelected = selected.size;

  const getSelectedVerseRows = (): VerseRow[] => {
    const result: VerseRow[] = [];
    for (const tab of tabs) {
      for (const verse of tab.text.verses) {
        if (selected.has(verseKey(tab.id, verse.versenumber))) {
          result.push(verse);
        }
      }
    }
    return result;
  };

  const handleAdd = () => {
    const verses = getSelectedVerseRows();
    if (verses.length === 0) return;
    onAddVerses(targetStep, verses);
    onClose();
  };

  const selectAllCurrent = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const v of currentVerses) {
        next.add(verseKey(activeTab, v.versenumber));
      }
      return next;
    });
  };

  const clearAllCurrent = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const v of currentVerses) {
        next.delete(verseKey(activeTab, v.versenumber));
      }
      return next;
    });
  };

  const currentSelectedCount = currentVerses.filter((v) =>
    selected.has(verseKey(activeTab, v.versenumber)),
  ).length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 1000,
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(740px, 92vw)",
          height: "min(84vh, 860px)",
          background: "var(--sb-bg)",
          borderRadius: "10px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--sb-border)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px 0",
            flexShrink: 0,
            borderBottom: "1px solid var(--sb-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  color: "var(--sb-gold)",
                  marginBottom: "5px",
                }}
              >
                {apiData.day.sunday_name}
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "var(--sb-ink)",
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                Velg tekststykker
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--sb-ink-muted)",
                padding: "4px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <FontAwesomeIcon icon={faXmark} style={{ fontSize: "16px" }} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex" }}>
            {tabs.map((tab) => {
              const count = tab.text.verses.filter((v) =>
                selected.has(verseKey(tab.id, v.versenumber)),
              ).length;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    lastClickedIndex.current = -1;
                  }}
                  style={{
                    padding: "8px 18px 10px",
                    background: "none",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid var(--sb-gold)"
                      : "2px solid transparent",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--sb-ink)" : "var(--sb-ink-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    transition: "color 0.12s",
                    marginBottom: "-1px",
                  }}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      style={{
                        background: "var(--sb-gold)",
                        color: "#fff",
                        borderRadius: "10px",
                        padding: "1px 6px",
                        fontSize: "9.5px",
                        fontWeight: 700,
                        lineHeight: "16px",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick actions bar */}
        <div
          style={{
            padding: "10px 28px 8px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
            borderBottom: "1px solid var(--sb-border-mid)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={selectAllCurrent}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              color: "var(--sb-gold)",
              padding: 0,
            }}
          >
            Velg alle
          </button>
          {currentSelectedCount > 0 && (
            <>
              <span style={{ color: "var(--sb-border)", fontSize: "11px" }}>
                ·
              </span>
              <button
                onClick={clearAllCurrent}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: "var(--sb-ink-muted)",
                  padding: 0,
                }}
              >
                Fjern alle
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: "10px",
              color: "var(--sb-ink-faint)",
              fontStyle: "italic",
            }}
          >
            Skift+klikk for å velge rekke
          </span>
        </div>

        {/* Verse list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {currentVerses.map((verse, i) => {
            const key = verseKey(activeTab, verse.versenumber);
            const isSelected = selected.has(key);
            return (
              <div
                key={verse.versenumber}
                onClick={(e) => toggleVerse(activeTab, i, e.shiftKey)}
                style={{
                  display: "flex",
                  gap: "18px",
                  padding: "12px 28px",
                  cursor: "pointer",
                  background: isSelected ? "var(--sb-surface)" : "transparent",
                  borderLeft: `3px solid ${isSelected ? "var(--sb-gold)" : "transparent"}`,
                  transition: "background 0.1s, border-color 0.1s",
                  alignItems: "flex-start",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--sb-panel)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                }}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "3px",
                    border: `1.5px solid ${isSelected ? "var(--sb-gold)" : "var(--sb-border)"}`,
                    background: isSelected ? "var(--sb-gold)" : "transparent",
                    flexShrink: 0,
                    marginTop: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.1s",
                  }}
                >
                  {isSelected && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      style={{ fontSize: "9px", color: "#fff" }}
                    />
                  )}
                </div>

                {/* Verse number */}
                <span
                  style={{
                    color: isSelected ? "var(--sb-gold)" : "var(--sb-ink-faint)",
                    fontSize: "11px",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 700,
                    userSelect: "none",
                    flexShrink: 0,
                    minWidth: "20px",
                    textAlign: "right",
                    paddingTop: "4px",
                    transition: "color 0.1s",
                  }}
                >
                  {verse.versenumber}
                </span>

                {/* Verse text */}
                <p
                  style={{
                    fontSize: "15.5px",
                    color: isSelected ? "var(--sb-ink)" : "var(--sb-ink-soft)",
                    lineHeight: 1.75,
                    margin: 0,
                    transition: "color 0.1s",
                    fontFamily: "var(--font-playfair), Georgia, serif",
                  }}
                >
                  {verse.versecontent}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid var(--sb-border)",
            padding: "14px 28px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "var(--sb-panel)",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color:
                totalSelected > 0 ? "var(--sb-ink-soft)" : "var(--sb-ink-faint)",
              flex: 1,
            }}
          >
            {totalSelected === 0
              ? "Ingen vers valgt"
              : `${totalSelected} vers valgt`}
          </span>

          {/* Step selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span
              style={{ fontSize: "11px", color: "var(--sb-ink-muted)" }}
            >
              Legg til i
            </span>
            <select
              value={targetStep}
              onChange={(e) => setTargetStep(e.target.value as Step)}
              style={{
                background: "var(--sb-surface)",
                border: "1px solid var(--sb-border)",
                borderRadius: "5px",
                color: "var(--sb-ink)",
                fontSize: "11px",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              {STEPS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleAdd}
            disabled={totalSelected === 0}
            style={{
              background:
                totalSelected > 0 ? "var(--sb-gold)" : "var(--sb-border-mid)",
              color: totalSelected > 0 ? "#fff" : "var(--sb-ink-faint)",
              border: "none",
              borderRadius: "6px",
              padding: "8px 20px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: totalSelected > 0 ? "pointer" : "default",
              transition: "background 0.15s, color 0.15s",
              letterSpacing: "0.02em",
            }}
          >
            Legg til
          </button>
        </div>
      </div>
    </>
  );
}
