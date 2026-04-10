"use client";

import type { SermonTextsResponse, VerseRow } from "@/app/api/sermon/texts/route";
import { formatShort } from "@/lib/sermon/dateUtils";
import { TextCard } from "./TextCard";

export function BibleTextsPanel({
  apiData,
  tekstrekke,
  onLoadDate,
  onPasteVerse,
}: {
  apiData: SermonTextsResponse | null;
  tekstrekke: number | null;
  onLoadDate: (date: string, tr?: number | null) => void;
  onPasteVerse: (verseRow: VerseRow) => void;
}) {
  return (
    <aside
      style={{
        width: "240px",
        minWidth: "240px",
        height: "100%",
        overflowY: "auto",
        background: "var(--sb-panel)",
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
              <TextCard
                text={apiData.ot}
                label={`GT · ${apiData.day.ot_reference}`}
                onPasteVerse={onPasteVerse}
              />
            )}
            {apiData.epistle && (
              <TextCard
                text={apiData.epistle}
                label={`Epistel · ${apiData.day.epistle_reference}`}
                onPasteVerse={onPasteVerse}
              />
            )}
            {apiData.gospel && (
              <TextCard
                text={apiData.gospel}
                label={`Evangelium · ${apiData.day.gospel_reference}`}
                onPasteVerse={onPasteVerse}
              />
            )}
            {!apiData.ot && !apiData.epistle && !apiData.gospel && (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--sb-ink-muted)",
                  fontStyle: "italic",
                }}
              >
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
                onClick={() => onLoadDate(apiData.prevSundayDate!, tekstrekke)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "inherit",
                  color: "inherit",
                  padding: 0,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--sb-ink)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--sb-ink-muted)")
                }
              >
                ← {formatShort(apiData.prevSundayDate)}
              </button>
            ) : (
              <span />
            )}
            {apiData.nextSundayDate ? (
              <button
                onClick={() => onLoadDate(apiData.nextSundayDate!, tekstrekke)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "inherit",
                  color: "inherit",
                  padding: 0,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--sb-ink)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--sb-ink-muted)")
                }
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
  );
}
