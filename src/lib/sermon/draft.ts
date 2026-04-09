import type { SermonDraft, Step } from "./types";

export function emptyDraft(dato: string): SermonDraft {
  return {
    dato,
    steps: {
      tekststudie: { notes: "" },
      forbindelser: { notes: "" },
      disposisjon: { notes: "" },
      utkast: { notes: "" },
    } as Record<Step, { notes: string }>,
    chat: { messages: [] },
    lastModified: new Date().toISOString(),
  };
}

export function migrateDraft(raw: SermonDraft): SermonDraft {
  if (!raw.chat) raw.chat = { messages: [] };
  return raw;
}
