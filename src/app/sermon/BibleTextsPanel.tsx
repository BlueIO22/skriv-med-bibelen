"use client";

import type { SermonTextsResponse, VerseRow } from "@/app/api/sermon/texts/route";
import { formatShort } from "@/lib/sermon/dateUtils";
import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Step } from "@/lib/sermon/types";

export function BibleTextsPanel({
  apiData,
  tekstrekke,
  activeStep,
  onLoadDate,
  onOpenTextSelection,
}: {
  apiData: SermonTextsResponse | null;
  tekstrekke: number | null;
  activeStep: Step;
  onLoadDate: (date: string, tr?: number | null) => void;
  onOpenTextSelection: () => void;
}) {
  const refs = apiData
    ? [
        apiData.gospel && {
          type: "Evangelium",
          ref: apiData.day.gospel_reference,
        },
        apiData.ot && { type: "GT", ref: apiData.day.ot_reference },
        apiData.epistle && { type: "NT", ref: apiData.day.epistle_reference },
      ].filter(Boolean)
    : [];

  return (
    <aside
      style={{
        width: "240px",
        minWidth: "240px",
        height: "100%",
        overflowY: "auto",
        background: "var(--sb-panel)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "24px 20px", flex: 1 }}>
        {/* Section label */}
        <div style={{ marginBottom: "20px" }}>
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
            {/* Text references */}
            {refs.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginBottom: "20px",
                }}
              >
                {refs.map((r) => (
                  <div key={r!.type}>
                    <p
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        color: "var(--sb-ink-faint)",
                        marginBottom: "2px",
                      }}
                    >
                      {r!.type}
                    </p>
                    <p
                      style={{
                        fontSize: "12.5px",
                        color: "var(--sb-ink-soft)",
                        lineHeight: 1.4,
                      }}
                    >
                      {r!.ref}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {!apiData.ot && !apiData.epistle && !apiData.gospel && (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--sb-ink-muted)",
                  fontStyle: "italic",
                  marginBottom: "20px",
                }}
              >
                Ingen tekster registrert.
              </p>
            )}

            {/* Open dialog button */}
            {(apiData.gospel || apiData.ot || apiData.epistle) && (
              <button
                onClick={onOpenTextSelection}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  background: "var(--sb-surface)",
                  border: "1px solid var(--sb-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--sb-ink-soft)",
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                  marginBottom: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--sb-bg)";
                  e.currentTarget.style.color = "var(--sb-ink)";
                  e.currentTarget.style.borderColor = "var(--sb-gold)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--sb-surface)";
                  e.currentTarget.style.color = "var(--sb-ink-soft)";
                  e.currentTarget.style.borderColor = "var(--sb-border)";
                }}
              >
                <FontAwesomeIcon
                  icon={faBookOpen}
                  style={{ fontSize: "12px", color: "var(--sb-gold)" }}
                />
                Velg tekststykker
              </button>
            )}
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {[80, 60, 70].map((w, i) => (
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
      </div>

      {/* Prev / next Sunday */}
      {apiData && (
        <div
          style={{
            padding: "16px 20px",
            borderTop: "1px solid var(--sb-border-mid)",
            display: "flex",
            justifyContent: "space-between",
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
    </aside>
  );
}
