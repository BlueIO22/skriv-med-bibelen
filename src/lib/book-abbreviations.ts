// Maps Norwegian church year abbreviations → exact newname values in verse_chapter_book_references
export const ABBREV_TO_FULLNAME: Record<string, string> = {
  // Pentateuch
  "1 Mos": "1. Mosebok",
  "2 Mos": "2. Mosebok",
  "3 Mos": "3. Mosebok",
  "4 Mos": "4. Mosebok",
  "5 Mos": "5. Mosebok",
  // Historical books
  "Jos": "Josva",
  "Dom": "Dommerne",
  "Rut": "Rut",
  "1 Sam": "1. Samuel",
  "2 Sam": "2. Samuel",
  "1 Kong": "1. Kongebok",
  "2 Kong": "2. Kongebok",
  "1 Krøn": "1. Krønikebok",
  "2 Krøn": "2. Krønikebok",
  "Esra": "Esra",
  "Neh": "Nehemja",
  "Est": "Ester",
  // Wisdom / Poetry
  "Job": "Job",
  "Sal": "Salmene",
  "Ordsp": "Ordspråkene",
  "Fork": "Forkynneren",
  "Høys": "Høysangen",
  // Major prophets
  "Jes": "Jesaja",
  "Jer": "Jeremia",
  "Klag": "Klagesangene",
  "Esek": "Esekiel",
  "Dan": "Daniel",
  // Minor prophets
  "Hos": "Hosea",
  "Joel": "Joel",
  "Am": "Amos",
  "Ob": "Obadja",
  "Jon": "Jona",
  "Mi": "Mika",
  "Nah": "Nahum",
  "Hab": "Habakkuk",
  "Sef": "Sefanja",
  "Hag": "Haggai",
  "Sak": "Sakarja",
  "Mal": "Malaki",
  // Gospels / Acts
  "Matt": "Matteus",
  "Mark": "Markus",
  "Luk": "Lukas",
  "Joh": "Johannes",
  "Apg": "Apostlenes gjerninger",
  // Pauline letters
  "Rom": "Romerne",
  "1 Kor": "1. Korinter",
  "2 Kor": "2. Korinter",
  "Gal": "Galaterne",
  "Ef": "Efeserne",
  "Fil": "Filipperne",
  "Kol": "Kolosserne",
  "1 Tess": "1. Tessaloniker",
  "2 Tess": "2. Tessaloniker",
  "1 Tim": "1. Timoteus",
  "2 Tim": "2. Timoteus",
  "Tit": "Titus",
  "Filem": "Filemon",
  // General letters
  "Hebr": "Hebreerne",
  "Jak": "Jakob",
  "1 Pet": "1. Peter",
  "2 Pet": "2. Peter",
  "1 Joh": "1. Johannes",
  "2 Joh": "2. Johannes",
  "3 Joh": "3. Johannes",
  "Jud": "Judas",
  // Revelation
  "Åp": "Åpenbaringen",
};

/**
 * Parses a church year reference like "Jes 61:1-3" or "Luk 4:16-22a".
 * Returns null if the abbreviation is unknown or the format is unrecognised.
 */
export function parseChurchYearRef(ref: string): {
  fullBookName: string;
  chapter: number;
  fromVerse: number;
  toVerse: number;
} | null {
  // Match: "<abbrev> <chapter>" or "<abbrev> <chapter>:<verse>" or "<abbrev> <chapter>:<v1>-<v2>"
  // Also tolerates trailing letters like "22a"
  const m = ref
    .trim()
    .match(/^(.*?)\s+(\d+)(?::(\d+[a-z]?)(?:\s*[-–]\s*(\d+)[a-z]?)?)?$/);
  if (!m) return null;
  const abbrev = m[1].trim();
  const fullBookName = ABBREV_TO_FULLNAME[abbrev];
  if (!fullBookName) return null;
  const chapter = parseInt(m[2], 10);
  const fromVerse = m[3] ? parseInt(m[3], 10) : 1;
  const toVerse = m[4] ? parseInt(m[4], 10) : m[3] ? fromVerse : 999;
  return { fullBookName, chapter, fromVerse, toVerse };
}
