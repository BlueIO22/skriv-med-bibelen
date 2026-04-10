"use client";

import { faQuoteLeft, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { BubbleMenu } from "@tiptap/react/menus";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { BibleReference } from "./BibleReferenceView";

function ToolBtn({
  label,
  active,
  action,
  title,
}: {
  label: React.ReactNode;
  active?: boolean;
  action: () => void;
  title?: string;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        action();
      }}
      title={title}
      style={{
        padding: "3px 10px",
        fontSize: "11px",
        borderRadius: "4px",
        color: active ? "var(--sb-gold)" : "var(--sb-ink-meta)",
        background: active ? "rgba(200,168,75,0.14)" : "transparent",
        fontWeight: active ? 600 : 400,
        border: active
          ? "1px solid rgba(200,168,75,0.45)"
          : "1px solid transparent",
        cursor: "pointer",
        transition: "color 0.12s, background 0.12s, border-color 0.12s",
        outline: "none",
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      {label}
    </button>
  );
}

const Divider = () => (
  <div
    style={{
      width: "1px",
      height: "14px",
      background: "var(--sb-border)",
      margin: "0 4px",
    }}
  />
);

export function ProseEditor({
  initialJson,
  onChange,
  editorRef,
  placeholder,
  onCursorPlaced,
}: {
  initialJson: object | undefined;
  onChange: (json: object, text: string) => void;
  editorRef?: MutableRefObject<Editor | null>;
  placeholder?: string;
  onCursorPlaced?: () => void;
}) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  const [, forceUpdate] = useState(0);

  // Selection explain popover
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const isExplainingRef = useRef(false);
  const savedEndPosRef = useRef<number | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({
        placeholder: placeholder ?? "Begynn å skrive her…",
      }),
      BibleReference,
    ],
    content: initialJson ?? "",
    onUpdate: ({ editor }) =>
      cbRef.current(
        editor.getJSON(),
        editor.getText({ blockSeparator: "\n\n" }),
      ),
    onSelectionUpdate: () => forceUpdate((n) => n + 1),
    onTransaction: () => forceUpdate((n) => n + 1),
    editorProps: {
      attributes: {
        class: "outline-none min-h-[400px] leading-[1.85] text-[16px]",
        style: "color: var(--sb-ink);",
      },
    },
  });

  useEffect(() => {
    if (editorRef && editor) editorRef.current = editor;
  }, [editor, editorRef]);

  function getWordCount() {
    if (!editor) return 0;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  async function handleExplain() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText) return;

    savedEndPosRef.current = to;
    isExplainingRef.current = true;
    setExplainLoading(true);
    setExplainText("");

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText }),
      });
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setExplainText(full);
      }

      // Insert explanation as blockquote below the selection
      const endPos = savedEndPosRef.current ?? to;
      const $end = editor.state.doc.resolve(endPos);
      const blockEnd = $end.end($end.depth);
      editor.chain()
        .insertContentAt(blockEnd + 1, {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: full }] }],
        })
        .focus()
        .run();
    } finally {
      isExplainingRef.current = false;
      setExplainLoading(false);
      setExplainText(null);
    }
  }

  if (!editor) return null;

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
        <ToolBtn
          label="Normal"
          active={editor.isActive("paragraph")}
          action={() => editor.chain().focus().setParagraph().run()}
        />
        <ToolBtn
          label="H2"
          active={editor.isActive("heading", { level: 2 })}
          action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolBtn
          label="H3"
          active={editor.isActive("heading", { level: 3 })}
          action={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <Divider />
        <ToolBtn
          label="Fet"
          active={editor.isActive("bold")}
          action={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolBtn
          label="Kursiv"
          active={editor.isActive("italic")}
          action={() => editor.chain().focus().toggleItalic().run()}
        />
        <Divider />
        <ToolBtn
          label="Liste"
          active={editor.isActive("bulletList")}
          action={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolBtn
          label={<FontAwesomeIcon icon={faQuoteLeft} style={{ fontSize: "10px" }} />}
          active={editor.isActive("blockquote")}
          action={() => editor.chain().focus().toggleBlockquote().run()}
          title="Sitat"
        />
      </div>
      <BubbleMenu
        editor={editor}
        shouldShow={({ state }) => {
          if (isExplainingRef.current) return true;
          const { from, to } = state.selection;
          if (from === to) return false;
          if (editor.isActive("bibleReference")) return false;
          const text = state.doc.textBetween(from, to, " ");
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          return words >= 10;
        }}
        options={{ placement: "top-end" }}
      >
        <div
          style={{
            display: "flex",
            background: "var(--sb-bg)",
            border: "1px solid var(--sb-border)",
            borderRadius: 20,
            padding: explainText !== null ? "8px 12px" : "2px 4px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
            gap: 4,
            maxWidth: explainText !== null ? 380 : undefined,
            flexDirection: explainText !== null ? "column" : "row",
            alignItems: explainText !== null ? "flex-start" : "center",
          } as React.CSSProperties}
        >
          {explainText !== null ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <FontAwesomeIcon
                  icon={faWandMagicSparkles}
                  style={{ fontSize: 10, color: "var(--sb-gold)" }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sb-ink-meta)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Forklaring
                </span>
                {explainLoading && (
                  <span style={{ fontSize: 10, color: "var(--sb-ink-muted)", fontStyle: "italic" }}>
                    …
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--sb-ink-soft)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {explainText}
              </p>
            </>
          ) : (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleExplain}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "3px 9px",
                color: "var(--sb-ink-meta)",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 5,
                borderRadius: 16,
                fontFamily: "inherit",
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--sb-surface)";
                e.currentTarget.style.color = "var(--sb-ink)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--sb-ink-meta)";
              }}
            >
              <FontAwesomeIcon icon={faWandMagicSparkles} style={{ fontSize: 10 }} />
              Forklar
            </button>
          )}
        </div>
      </BubbleMenu>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={onCursorPlaced}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
