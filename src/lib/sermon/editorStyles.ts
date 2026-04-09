import type { CSSProperties } from "react";

export const saveButtonStyle: CSSProperties = {
  background: "var(--sb-gold)",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "3px 14px",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
};

export const cancelButtonStyle: CSSProperties = {
  background: "transparent",
  color: "var(--sb-ink-meta)",
  border: "1px solid var(--sb-border)",
  borderRadius: 4,
  padding: "3px 10px",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
};
