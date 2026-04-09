"use client";

import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, SermonContext, Step } from "@/lib/sermon/types";
import { STEPS } from "@/lib/sermon/types";
import { AssistantMessage } from "./AssistantMessage";

export function ChatPanel({
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
        onMessages([
          ...updated,
          { role: "assistant", content: "Noe gikk galt. Prøv igjen." },
        ]);
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--sb-ink-meta)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--sb-ink-faint)")
            }
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
            <span
              style={{
                fontSize: "22px",
                color: "var(--sb-border)",
                lineHeight: 1,
              }}
            >
              ✦
            </span>
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
                <AssistantMessage
                  content={m.content}
                  onInsertRef={onInsertRef}
                />
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px",
            }}
          >
            <span
              style={{
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--sb-ink-faint)",
              }}
            >
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
