"use client";

import type {
  LectionaryText,
  SermonTextsResponse,
} from "@/app/api/sermon/texts/route";
import type { StepData } from "@/lib/sermon/types";
import {
  faCompress,
  faExpand,
  faEye,
  faPlus,
  faSpinner,
  faTimes,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  addEdge,
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ForbindelserFlowHandle = {
  addVerseNode: (reference: string, verses: VerseEntry[]) => void;
};

type VerseEntry = { versenumber: number; versecontent: string };

type VerseNodeData = {
  reference: string;
  verses: VerseEntry[];
  source: "ot" | "epistle" | "gospel" | "custom";
};

type ConnectionEdgeData = {
  label: string;
};

type FlowState = {
  nodes: Node[];
  edges: Edge[];
};

// ── Source meta ──────────────────────────────────────────────────────────────

const SOURCE_META = {
  ot: { border: "#c8a84b", bg: "#fdf8ed", badge: "GT", badgeBg: "#c8a84b" },
  epistle: {
    border: "#7a9ec8",
    bg: "#f0f4f9",
    badge: "Ep.",
    badgeBg: "#7a9ec8",
  },
  gospel: {
    border: "#a07060",
    bg: "#fdf2ee",
    badge: "Ev.",
    badgeBg: "#a07060",
  },
  custom: {
    border: "#a89880",
    bg: "#f9f6f1",
    badge: "Eget",
    badgeBg: "#a89880",
  },
};

// ── Dialog contexts ───────────────────────────────────────────────────────────

type DialogContextType = { openDialog: (data: VerseNodeData) => void };
const FlowDialogContext = createContext<DialogContextType>({
  openDialog: () => {},
});

type ConnectionDialogContextType = {
  openConnectionDialog: (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    currentLabel: string,
  ) => void;
  getNodeData: (nodeId: string) => VerseNodeData | undefined;
};
const FlowConnectionDialogContext = createContext<ConnectionDialogContextType>({
  openConnectionDialog: () => {},
  getNodeData: () => undefined,
});

// ── Utilities ────────────────────────────────────────────────────────────────

function isFlowState(obj: unknown): obj is FlowState {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "nodes" in obj &&
    Array.isArray((obj as FlowState).nodes)
  );
}

function generateNotes(nodes: Node[], edges: Edge[]): string {
  if ((nodes?.length ?? 0) === 0) return "";
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const lines: string[] = ["Bibelske forbindelser:"];

  if ((edges?.length ?? 0) > 0) {
    lines.push("");
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      const srcRef = (src.data as VerseNodeData).reference;
      const tgtRef = (tgt.data as VerseNodeData).reference;
      const label = (edge.data as ConnectionEdgeData | undefined)?.label;
      lines.push(
        label ? `• ${srcRef} → ${tgtRef}: ${label}` : `• ${srcRef} → ${tgtRef}`,
      );
    }
  }

  const connectedIds = new Set([
    ...edges.map((e) => e.source),
    ...edges.map((e) => e.target),
  ]);
  const isolated = nodes.filter((n) => !connectedIds.has(n.id));
  if (isolated.length > 0) {
    lines.push("");
    lines.push("Utforskede vers:");
    isolated.forEach((n) =>
      lines.push(`• ${(n.data as VerseNodeData).reference}`),
    );
  }

  return lines.join("\n");
}

/** Extract bibleReference nodes from a TipTap JSON document */
function extractBibleRefs(
  draftJson: object | undefined,
): Array<{ reference: string; verses: VerseEntry[] }> {
  if (!draftJson) return [];
  const refs: Array<{ reference: string; verses: VerseEntry[] }> = [];
  function traverse(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      attrs?: Record<string, unknown>;
      content?: unknown[];
    };
    if (n.type === "bibleReference" && n.attrs) {
      refs.push({
        reference: (n.attrs.reference as string) ?? "",
        verses: (n.attrs.verses as VerseEntry[]) ?? [],
      });
    }
    if (Array.isArray(n.content)) n.content.forEach(traverse);
  }
  traverse(draftJson);
  return refs;
}

function lectionaryNode(
  id: string,
  source: VerseNodeData["source"],
  reference: string,
  text: LectionaryText,
  position: { x: number; y: number },
): Node {
  return {
    id,
    type: "verseNode",
    position,
    data: {
      reference,
      verses: text.verses.map((v) => ({
        versenumber: v.versenumber,
        versecontent: v.versecontent,
      })),
      source,
    },
  };
}

function makeInitialNodes(
  apiData: SermonTextsResponse | null,
  editorRefs: Array<{ reference: string; verses: VerseEntry[] }>,
): Node[] {
  const nodes: Node[] = [];

  if (apiData?.ot && apiData.day.ot_reference)
    nodes.push(
      lectionaryNode("ot", "ot", apiData.day.ot_reference, apiData.ot, {
        x: 40,
        y: 100,
      }),
    );

  if (apiData?.epistle && apiData.day.epistle_reference)
    nodes.push(
      lectionaryNode(
        "epistle",
        "epistle",
        apiData.day.epistle_reference,
        apiData.epistle,
        { x: 310, y: 20 },
      ),
    );

  if (apiData?.gospel && apiData.day.gospel_reference)
    nodes.push(
      lectionaryNode(
        "gospel",
        "gospel",
        apiData.day.gospel_reference,
        apiData.gospel,
        { x: 580, y: 100 },
      ),
    );

  // Add any verses already placed in the tekststudie editor
  editorRefs.forEach((ref, i) => {
    const x = 40 + (i % 3) * 270;
    const y = 340 + Math.floor(i / 3) * 220;
    nodes.push({
      id: `editor-${i}`,
      type: "verseNode",
      position: { x, y },
      data: {
        reference: ref?.reference,
        verses: ref?.verses,
        source: "custom",
      },
    });
  });

  return nodes;
}

// ── VerseNode ────────────────────────────────────────────────────────────────

const HANDLE_STYLE: React.CSSProperties = {
  width: 10,
  height: 10,
  border: "2px solid #fff",
};

const TOOLBAR_BTN: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  borderRadius: 5,
  border: "none",
  background: "none",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
  transition: "background 0.1s, color 0.1s",
  color: "#5a5048",
};

const PREVIEW_COUNT = 3;

function VerseNode({ id, data, selected }: NodeProps) {
  const d = data as VerseNodeData;
  const meta =
    SOURCE_META[d.source as keyof typeof SOURCE_META] ?? SOURCE_META.custom;
  const { deleteElements } = useReactFlow();
  const { openDialog } = useContext(FlowDialogContext);

  const previewVerses = d.verses?.slice(0, PREVIEW_COUNT) ?? [];
  const hasMore = (d.verses?.length ?? 0) > PREVIEW_COUNT;

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={6}>
        <div
          className="nodrag"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: "#fff",
            border: "1px solid #e0d8cf",
            borderRadius: 8,
            padding: "3px 4px",
            boxShadow: "0 3px 12px rgba(0,0,0,0.14)",
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
          }}
        >
          <button
            style={TOOLBAR_BTN}
            onClick={() => openDialog(d)}
            title="Åpne vers"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f0f4f9";
              e.currentTarget.style.color = "#1c1814";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "#5a5048";
            }}
          >
            <FontAwesomeIcon icon={faEye} style={{ fontSize: 10 }} />
            Åpne
          </button>
          <div
            style={{ width: 1, background: "#e0d8cf", alignSelf: "stretch", margin: "2px 0" }}
          />
          <button
            style={{ ...TOOLBAR_BTN, color: "#c4b0a0" }}
            onClick={() => deleteElements({ nodes: [{ id }] })}
            title="Slett node"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139,58,58,0.07)";
              e.currentTarget.style.color = "#8b3a3a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "#c4b0a0";
            }}
          >
            <FontAwesomeIcon icon={faTimes} style={{ fontSize: 10 }} />
            Slett
          </button>
        </div>
      </NodeToolbar>

      <div
        style={{
          width: 230,
          borderRadius: 8,
          border: `2px solid ${selected ? "#1c1814" : meta.border}`,
          background: meta.bg,
          boxShadow: selected
            ? "0 0 0 3px rgba(28,24,20,0.15), 0 4px 16px rgba(0,0,0,0.12)"
            : "0 2px 10px rgba(0,0,0,0.08)",
          overflow: "hidden",
          transition: "border-color 0.15s, box-shadow 0.15s",
          fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
        }}
      >
        <Handle
          type="source"
          position={Position.Top}
          style={{ ...HANDLE_STYLE, background: meta.border }}
        />
        <Handle
          type="source"
          position={Position.Right}
          style={{ ...HANDLE_STYLE, background: meta.border }}
          id="r"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ ...HANDLE_STYLE, background: meta.border }}
          id="b"
        />
        <Handle
          type="source"
          position={Position.Left}
          style={{ ...HANDLE_STYLE, background: meta.border }}
          id="l"
        />

        {/* Color bar */}
        <div style={{ height: 4, background: meta.border }} />

        <div style={{ padding: "8px 10px 10px" }}>
          {/* Header row: badge */}
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 3,
                background: meta.badgeBg,
                color: "#fff",
              }}
            >
              {meta.badge}
            </span>
          </div>

          {/* Reference */}
          <div
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: 14,
              fontWeight: 700,
              color: "#1c1814",
              marginBottom: 7,
              lineHeight: 1.25,
            }}
          >
            {d.reference}
          </div>

          {/* Verse preview — no scroll */}
          {previewVerses.length > 0 && (
            <div>
              {previewVerses.map((v) => (
                <div
                  key={v.versenumber}
                  style={{
                    fontSize: 11,
                    color: "#5a5048",
                    lineHeight: 1.55,
                    marginBottom: 3,
                    display: "flex",
                    gap: 4,
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      color: "#c4b0a0",
                      fontSize: 9,
                      flexShrink: 0,
                      fontWeight: 600,
                      minWidth: 14,
                      textAlign: "right",
                    }}
                  >
                    {v.versenumber}
                  </span>
                  <span style={{ fontStyle: "italic" }}>{v.versecontent}</span>
                </div>
              ))}
              {hasMore && (
                <button
                  className="nodrag"
                  onClick={() => openDialog(d)}
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: meta.border,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontStyle: "italic",
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  +{d.verses.length - PREVIEW_COUNT} vers til…
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── VerseDialog ───────────────────────────────────────────────────────────────

function VerseDialog({
  data,
  onClose,
}: {
  data: VerseNodeData;
  onClose: () => void;
}) {
  const meta =
    SOURCE_META[data.source as keyof typeof SOURCE_META] ?? SOURCE_META.custom;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          background: "rgba(28,24,20,0.5)",
          backdropFilter: "blur(2px)",
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2001,
          width: 480,
          maxWidth: "90vw",
          maxHeight: "75vh",
          borderRadius: 12,
          background: meta.bg,
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
        }}
      >
        {/* Color bar */}
        <div style={{ height: 4, background: meta.border, flexShrink: 0 }} />

        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: "14px 18px 12px",
            borderBottom: "1px solid rgba(0,0,0,0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: 3,
                background: meta.badgeBg,
                color: "#fff",
              }}
            >
              {meta.badge}
            </span>
            <span
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontSize: 18,
                fontWeight: 700,
                fontStyle: "italic",
                color: "#1c1814",
                lineHeight: 1.2,
              }}
            >
              {data.reference}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#a89880",
              padding: "4px 6px",
              borderRadius: 4,
              lineHeight: 1,
              fontSize: 14,
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#1c1814";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#a89880";
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Scrollable verse content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px 20px",
          }}
        >
          {data.verses?.map((v) => (
            <div
              key={v.versenumber}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  color: meta.border,
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                  minWidth: 18,
                  textAlign: "right",
                  lineHeight: 1.6,
                }}
              >
                {v.versenumber}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "#2a2420",
                  lineHeight: 1.65,
                  fontStyle: "italic",
                }}
              >
                {v.versecontent}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── ConnectionDialog ──────────────────────────────────────────────────────────

function MiniVersePanel({ data }: { data: VerseNodeData }) {
  const meta =
    SOURCE_META[data.source as keyof typeof SOURCE_META] ?? SOURCE_META.custom;
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 8,
        border: `1.5px solid ${meta.border}`,
        background: meta.bg,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div style={{ height: 3, background: meta.border }} />
      <div style={{ padding: "10px 12px 12px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "2px 5px",
              borderRadius: 3,
              background: meta.badgeBg,
              color: "#fff",
            }}
          >
            {meta.badge}
          </span>
          <span
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: 13,
              fontWeight: 700,
              color: "#1c1814",
            }}
          >
            {data.reference}
          </span>
        </div>
        {data.verses?.map((v) => (
          <div
            key={v.versenumber}
            style={{ display: "flex", gap: 7, alignItems: "baseline", marginBottom: 5 }}
          >
            <span style={{ color: meta.border, fontSize: 9, fontWeight: 700, flexShrink: 0, minWidth: 14, textAlign: "right" }}>
              {v.versenumber}
            </span>
            <span style={{ fontSize: 11, color: "#3a3028", lineHeight: 1.6, fontStyle: "italic" }}>
              {v.versecontent}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionDialog({
  edgeId,
  sourceData,
  targetData,
  initialLabel,
  onSave,
  onClose,
}: {
  edgeId: string;
  sourceData: VerseNodeData;
  targetData: VerseNodeData;
  initialLabel: string;
  onSave: (edgeId: string, label: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generateWithAI = useCallback(async () => {
    setIsGenerating(true);
    try {
      const sourceVerses = sourceData.verses
        ?.map((v) => `${v.versenumber} ${v.versecontent}`)
        .join("\n");
      const targetVerses = targetData.verses
        ?.map((v) => `${v.versenumber} ${v.versecontent}`)
        .join("\n");

      const res = await fetch("/api/sermon/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "forbindelser",
          messages: [
            {
              role: "user",
              content: `Forklar kort og presist hva som forbinder disse to bibelversene teologisk og motivmessig. Svar med maksimalt tre setninger på norsk bokmål. Ingen innledning, bare selve forklaringen.\n\n${sourceData.reference}:\n${sourceVerses}\n\n${targetData.reference}:\n${targetVerses}`,
            },
          ],
          context: {
            sunday_name: "",
            dato: "",
            tekstrekke: 1,
            series: "",
            ot_reference: null,
            epistle_reference: null,
            gospel_reference: null,
            otText: "",
            epistleText: "",
            gospelText: "",
          },
        }),
      });

      if (res.ok) {
        const text = await res.text();
        if (text.trim()) setLabel(text.trim());
      }
    } catch {
      // silently fail — user can try again
    } finally {
      setIsGenerating(false);
    }
  }, [sourceData, targetData]);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = useCallback(() => {
    onSave(edgeId, label);
    onClose();
  }, [edgeId, label, onSave, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          background: "rgba(28,24,20,0.5)",
          backdropFilter: "blur(2px)",
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2001,
          width: 680,
          maxWidth: "92vw",
          maxHeight: "88vh",
          borderRadius: 12,
          background: "#fdf9f5",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
        }}
      >
        {/* Gold top bar */}
        <div style={{ height: 4, background: "#c8a84b", flexShrink: 0 }} />

        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: "14px 18px 12px",
            borderBottom: "1px solid #e8dfd4",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: 17,
              fontWeight: 700,
              fontStyle: "italic",
              color: "#1c1814",
            }}
          >
            Beskriv forbindelsen
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#a89880",
              padding: "4px 6px",
              borderRadius: 4,
              lineHeight: 1,
              fontSize: 14,
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#1c1814"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#a89880"; }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 0" }}>
          {/* Two verse panels */}
          <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginBottom: 16 }}>
            <MiniVersePanel data={sourceData} />
            {/* Arrow */}
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                color: "#c8a84b",
                fontSize: 18,
                padding: "0 2px",
              }}
            >
              →
            </div>
            <MiniVersePanel data={targetData} />
          </div>

          {/* Connection editor */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 7,
              }}
            >
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#8a7a6a",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Forbindelsen mellom {sourceData.reference} og {targetData.reference}
              </label>
              <button
                onClick={generateWithAI}
                disabled={isGenerating}
                title="Generer forbindelse med AI"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #c8a84b",
                  background: isGenerating ? "#f5edd8" : "#fffbf0",
                  color: "#a8882b",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: isGenerating ? "default" : "pointer",
                  fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                  transition: "background 0.12s, color 0.12s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isGenerating) {
                    e.currentTarget.style.background = "#f5edd8";
                    e.currentTarget.style.color = "#7a6018";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isGenerating) {
                    e.currentTarget.style.background = "#fffbf0";
                    e.currentTarget.style.color = "#a8882b";
                  }
                }}
              >
                <FontAwesomeIcon
                  icon={isGenerating ? faSpinner : faWandMagicSparkles}
                  spin={isGenerating}
                  style={{ fontSize: 10 }}
                />
                {isGenerating ? "Genererer…" : "Generer med AI"}
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              rows={4}
              placeholder="Forklar hva som knytter disse versene sammen — tema, bilde, teologi, kontrast…"
              style={{
                width: "100%",
                fontSize: 13,
                lineHeight: 1.65,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1.5px solid #d8cfc4",
                background: "#fff",
                color: "#1c1814",
                outline: "none",
                resize: "vertical",
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                transition: "border-color 0.12s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#c8a84b"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#d8cfc4"; }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            padding: "12px 18px",
            borderTop: "1px solid #e8dfd4",
            background: "#fff",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: "1px solid #d8cfc4",
              background: "none",
              color: "#8a7a6a",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            }}
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "7px 20px",
              borderRadius: 7,
              border: "none",
              background: "#c8a84b",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            }}
          >
            Lagre
          </button>
        </div>
      </div>
    </>
  );
}

// ── Static registration ───────────────────────────────────────────────────────

const nodeTypes = { verseNode: VerseNode };
const edgeTypes = { connectionEdge: ConnectionEdge };

// ── ConnectionEdge ───────────────────────────────────────────────────────────

function ConnectionEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const d = data as ConnectionEdgeData | undefined;
  const { openConnectionDialog } = useContext(FlowConnectionDialogContext);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: "#c8a84b", strokeWidth: 2 }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() =>
              openConnectionDialog(id, source, target, d?.label ?? "")
            }
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 12,
              border: `1px solid ${d?.label ? "#c8a84b" : "#ddd5c8"}`,
              background: d?.label ? "#fdf8ed" : "rgba(255,255,255,0.9)",
              color: d?.label ? "#7a6e62" : "#a89880",
              cursor: "pointer",
              fontStyle: d?.label ? "italic" : "normal",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              maxWidth: 200,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              transition: "background 0.12s, border-color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fdf8ed";
              e.currentTarget.style.borderColor = "#c8a84b";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = d?.label
                ? "#fdf8ed"
                : "rgba(255,255,255,0.9)";
              e.currentTarget.style.borderColor = d?.label
                ? "#c8a84b"
                : "#ddd5c8";
            }}
          >
            {d?.label || "+ beskriv forbindelsen"}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// ── ForbindelserFlow ──────────────────────────────────────────────────────────

export function ForbindelserFlow({
  data,
  onChange,
  apiData,
  tekststudieData,
  ref,
}: {
  data: StepData;
  onChange: (patch: Partial<StepData>) => void;
  apiData: SermonTextsResponse | null;
  tekststudieData?: StepData;
  ref?: React.Ref<ForbindelserFlowHandle>;
}) {
  const savedState = isFlowState(data.draftJson) ? data.draftJson : undefined;
  // hasSavedState = user has explicitly interacted and saved state (even if empty)
  // vs undefined = first open, should seed with Sunday texts
  const hasSavedState = savedState !== undefined;

  const editorRefs = hasSavedState
    ? []
    : extractBibleRefs(tekststudieData?.draftJson as object | undefined);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    hasSavedState ? savedState!.nodes : makeInitialNodes(apiData, editorRefs),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    hasSavedState ? (savedState!.edges ?? []) : [],
  );

  // Keep a ref to nodes so connection dialog can look up verse data by node ID
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const [expanded, setExpanded] = useState(false);
  const [dialogData, setDialogData] = useState<VerseNodeData | null>(null);

  type ConnDialogState = {
    edgeId: string;
    sourceData: VerseNodeData;
    targetData: VerseNodeData;
    currentLabel: string;
  };
  const [connDialog, setConnDialog] = useState<ConnDialogState | null>(null);

  // Add-verse panel state
  const [addOpen, setAddOpen] = useState(false);
  const [addRef, setAddRef] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const nodeCountRef = useRef(0);

  // Sync to parent without re-capturing onChange on every render
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const notes = generateNotes(nodes, edges);
    onChangeRef.current({ notes, draftJson: { nodes, edges } });
  }, [nodes, edges]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "connectionEdge",
            data: { label: "" },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#c8a84b",
              width: 14,
              height: 14,
            },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const handleAddVerse = useCallback(async () => {
    const trimmed = addRef.trim();
    if (!trimmed || addLoading) return;
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch(`/api/verses?ref=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (!res.ok || !json.verses?.length) {
        setAddError("Fant ikke verset. Prøv f.eks. «Joh 3:16»");
        return;
      }
      const verses = json.verses as VerseEntry[];
      const count = nodeCountRef.current++;
      const newNode: Node = {
        id: `custom-${Date.now()}`,
        type: "verseNode",
        position: {
          x: 150 + (count % 3) * 270,
          y: 440 + Math.floor(count / 3) * 230,
        },
        data: { reference: trimmed, verses, source: "custom" },
      };
      setNodes((nds) => [...nds, newNode]);
      setAddRef("");
      setAddOpen(false);
    } catch {
      setAddError("Nettverksfeil. Prøv igjen.");
    } finally {
      setAddLoading(false);
    }
  }, [addRef, addLoading, setNodes]);

  useEffect(() => {
    if (addOpen) {
      const t = setTimeout(() => addInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [addOpen]);

  // Close expanded on Escape (when no dialog is open)
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dialogData && !connDialog) setExpanded(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded, dialogData, connDialog]);

  useImperativeHandle(ref, () => ({
    addVerseNode(reference: string, verses: VerseEntry[]) {
      const count = nodeCountRef.current++;
      const newNode: Node = {
        id: `custom-${Date.now()}`,
        type: "verseNode",
        position: {
          x: 150 + (count % 3) * 270,
          y: 440 + Math.floor(count / 3) * 230,
        },
        data: { reference, verses, source: "custom" },
      };
      setNodes((nds) => [...nds, newNode]);
    },
  }));

  const openDialog = useCallback((d: VerseNodeData) => setDialogData(d), []);
  const closeDialog = useCallback(() => setDialogData(null), []);

  const getNodeData = useCallback(
    (nodeId: string): VerseNodeData | undefined =>
      nodesRef.current.find((n) => n.id === nodeId)?.data as
        | VerseNodeData
        | undefined,
    [],
  );

  const openConnectionDialog = useCallback(
    (
      edgeId: string,
      sourceNodeId: string,
      targetNodeId: string,
      currentLabel: string,
    ) => {
      const sourceData = getNodeData(sourceNodeId);
      const targetData = getNodeData(targetNodeId);
      if (!sourceData || !targetData) return;
      setConnDialog({ edgeId, sourceData, targetData, currentLabel });
    },
    [getNodeData],
  );

  const saveConnectionLabel = useCallback(
    (edgeId: string, label: string) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...(e.data ?? {}), label } } : e,
        ),
      );
    },
    [setEdges],
  );

  const canvas = (
    <FlowConnectionDialogContext.Provider
      value={{ openConnectionDialog, getNodeData }}
    >
    <FlowDialogContext.Provider value={{ openDialog }}>
      <div style={{ width: "100%", height: "100%" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Delete", "Backspace"]}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: "#f7f3ed" }}
        >
          <Background color="#ddd5c8" gap={24} size={1} />
          <Controls />

          {/* Expand / collapse */}
          <Panel position="top-left">
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Minimer" : "Utvid til fullskjerm"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 7,
                border: "1px solid var(--sb-border)",
                background: "#fff",
                color: "var(--sb-ink-meta)",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.07)",
                fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                transition: "background 0.12s, border-color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--sb-panel)";
                e.currentTarget.style.borderColor = "var(--sb-gold)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.borderColor = "var(--sb-border)";
              }}
            >
              <FontAwesomeIcon
                icon={expanded ? faCompress : faExpand}
                style={{ fontSize: 10 }}
              />
              {expanded ? "Minimer" : "Fullskjerm"}
            </button>
          </Panel>

          {/* Add verse */}
          <Panel position="top-right">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              {addOpen ? (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid var(--sb-border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.13)",
                    minWidth: 270,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--sb-ink-soft)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Legg til vers
                    </span>
                    <button
                      onClick={() => {
                        setAddOpen(false);
                        setAddError("");
                        setAddRef("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--sb-ink-muted)",
                        padding: 2,
                        lineHeight: 1,
                      }}
                    >
                      <FontAwesomeIcon icon={faTimes} style={{ fontSize: 11 }} />
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      ref={addInputRef}
                      value={addRef}
                      onChange={(e) => {
                        setAddRef(e.target.value);
                        setAddError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleAddVerse()}
                      placeholder="f.eks. Joh 3:16"
                      style={{
                        flex: 1,
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: `1px solid ${addError ? "#c87060" : "var(--sb-border)"}`,
                        background: "var(--sb-surface)",
                        color: "var(--sb-ink)",
                        outline: "none",
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                        transition: "border-color 0.12s",
                      }}
                    />
                    <button
                      onClick={handleAddVerse}
                      disabled={!addRef.trim() || addLoading}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "var(--sb-gold)",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor:
                          addRef.trim() && !addLoading ? "pointer" : "default",
                        opacity: addRef.trim() && !addLoading ? 1 : 0.5,
                        transition: "opacity 0.12s",
                        fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                      }}
                    >
                      {addLoading ? "…" : "Legg til"}
                    </button>
                  </div>
                  {addError && (
                    <p
                      style={{
                        fontSize: 10,
                        color: "#a05040",
                        marginTop: 6,
                        fontStyle: "italic",
                      }}
                    >
                      {addError}
                    </p>
                  )}
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--sb-ink-muted)",
                      marginTop: 7,
                      fontStyle: "italic",
                    }}
                  >
                    Støtter forkortelser: «Joh», «Rom», «1. Kor» osv.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setAddOpen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--sb-border)",
                    background: "#fff",
                    color: "var(--sb-ink-soft)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sb-panel)";
                    e.currentTarget.style.borderColor = "var(--sb-gold)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "var(--sb-border)";
                  }}
                >
                  <FontAwesomeIcon
                    icon={faPlus}
                    style={{ fontSize: 10, color: "var(--sb-gold)" }}
                  />
                  Legg til vers
                </button>
              )}
            </div>
          </Panel>

          {/* Empty-state hint */}
          {(edges?.length ?? 0) === 0 && (nodes?.length ?? 0) > 0 && (
            <Panel position="bottom-center">
              <p
                style={{
                  fontSize: 11,
                  color: "var(--sb-ink-muted)",
                  fontStyle: "italic",
                  background: "rgba(255,255,255,0.85)",
                  padding: "5px 14px",
                  borderRadius: 20,
                  border: "1px solid var(--sb-border)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                Dra fra et håndtak (·) til et annet vers for å lage en
                forbindelse
              </p>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </FlowDialogContext.Provider>
    </FlowConnectionDialogContext.Provider>
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--sb-bg)",
      }}
    >
      {/* Step header */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 24px",
          borderBottom: "1px solid var(--sb-border)",
          background: "var(--sb-bg)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: 22,
            fontWeight: 700,
            fontStyle: "italic",
            color: "var(--sb-ink)",
            lineHeight: 1.2,
            marginBottom: 5,
          }}
        >
          Forbindelser
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--sb-ink-meta)",
            fontStyle: "italic",
            borderLeft: "2px solid var(--sb-gold)",
            paddingLeft: 10,
          }}
        >
          Dra mellom vers-kortene for å skape forbindelser · Klikk på en kobling
          for å beskrive den · Klikk på et kort for alternativer
        </p>
      </div>

      {/* Inline canvas */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          visibility: expanded ? "hidden" : "visible",
        }}
      >
        {canvas}
      </div>

      {/* Full-screen overlay */}
      {expanded && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setExpanded(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(28,24,20,0.55)",
              backdropFilter: "blur(2px)",
            }}
          />
          {/* Dialog */}
          <div
            style={{
              position: "fixed",
              inset: "24px",
              zIndex: 1001,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
              display: "flex",
              flexDirection: "column",
              background: "#f7f3ed",
            }}
          >
            {/* Dialog header */}
            <div
              style={{
                flexShrink: 0,
                padding: "10px 16px",
                borderBottom: "1px solid var(--sb-border)",
                background: "var(--sb-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: 16,
                  fontWeight: 700,
                  fontStyle: "italic",
                  color: "var(--sb-ink)",
                }}
              >
                Forbindelser
              </span>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--sb-ink-meta)",
                  padding: 4,
                  borderRadius: 4,
                  lineHeight: 1,
                  fontSize: 14,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--sb-ink)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--sb-ink-meta)";
                }}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            {/* Shared canvas in expanded view */}
            <div style={{ flex: 1, minHeight: 0 }}>{canvas}</div>
          </div>
        </>
      )}

      {/* Verse dialog */}
      {dialogData && <VerseDialog data={dialogData} onClose={closeDialog} />}

      {/* Connection dialog */}
      {connDialog && (
        <ConnectionDialog
          edgeId={connDialog.edgeId}
          sourceData={connDialog.sourceData}
          targetData={connDialog.targetData}
          initialLabel={connDialog.currentLabel}
          onSave={saveConnectionLabel}
          onClose={() => setConnDialog(null)}
        />
      )}
    </div>
  );
}
