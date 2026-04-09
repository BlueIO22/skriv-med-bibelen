// ── Domain types ─────────────────────────────────────────────────────────────

export type VerseEntry = { versenumber: number; versecontent: string };

export type BibleReferenceAttrs = {
  reference: string;
  verses: VerseEntry[];
  comment: string;
};

export type Step = "tekststudie" | "forbindelser" | "disposisjon" | "utkast";
export type Message = { role: "user" | "assistant"; content: string };

export type StepData = {
  notes: string; // plain text for API context
  draftJson?: object; // TipTap JSON for editor
};

export type SermonDraft = {
  dato: string;
  steps: Record<Step, StepData>;
  chat: { messages: Message[] };
  lastModified: string;
};

export type SermonContext = {
  sunday_name: string;
  dato: string;
  tekstrekke: number;
  series: string;
  ot_reference: string | null;
  epistle_reference: string | null;
  gospel_reference: string | null;
  otText: string;
  epistleText: string;
  gospelText: string;
  tekststudieNotes?: string;
  forbindelserNotes?: string;
  disposisjonNotes?: string;
  activeStep?: string;
};

// ── Step metadata ─────────────────────────────────────────────────────────────

export const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: "tekststudie", label: "Tekststudie", sub: "Eksegese" },
  { id: "forbindelser", label: "Forbindelser", sub: "Paralleller" },
  { id: "disposisjon", label: "Disposisjon", sub: "Struktur" },
  { id: "utkast", label: "Utkast", sub: "Teksten" },
];

export const STEP_INTRO: Record<Step, string> = {
  tekststudie:
    "Hva ser du? Hva overrasker deg? Hva er krevende? Skriv dine egne observasjoner og tolkninger.",
  forbindelser:
    "Hvilke andre tekster assosierer du med disse? Noter paralleller og bibelske ekkokammer.",
  disposisjon:
    "Hva er det ene du vil si? Skriv ut din disposisjon – åpning, hoveddeler, avslutning.",
  utkast: "Du skriver. Teksten er din.",
};

export const NOTES_PLACEHOLDER: Record<Step, string> = {
  tekststudie: "Egne observasjoner, spørsmål og tolkninger…",
  forbindelser: "Paralleller, typologi, bibelske forbindelser…",
  disposisjon: "Tema · Åpning · Hoveddeler · Avslutning…",
  utkast: "Begynn å skrive din preken her…",
};
