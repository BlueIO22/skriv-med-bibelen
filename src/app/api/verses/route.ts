import { ABBREV_TO_FULLNAME } from "@/lib/book-abbreviations";
import { supabase } from "@/lib/supabase";

// Display/abbreviation names that differ from the DB newname column
const DISPLAY_TO_NEWNAME: Record<string, string> = {
  Filipperne: "Filiperne",
  Filipperbrevet: "Filiperne",
};

// Parse our merged display format: "Book chapter" or "Book chapter:seg1.seg2..."
// where each segment is "N" or "N-M"
function parseDisplayRef(ref: string): { book: string; chapter: number; verses: number[] } | null {
  const m = ref.match(/^(.*?)\s+(\d+)(?::(.+))?$/);
  if (!m) return null;

  const book = m[1].trim();
  const chapter = parseInt(m[2], 10);

  if (!m[3]) return { book, chapter, verses: [] };

  const verses: number[] = [];
  for (const segment of m[3].split(".")) {
    const range = segment.match(/^(\d+)(?:-(\d+))?$/);
    if (!range) continue;
    const from = parseInt(range[1], 10);
    const to = range[2] ? parseInt(range[2], 10) : from;
    for (let v = from; v <= to; v++) verses.push(v);
  }
  return { book, chapter, verses };
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) return Response.json({ error: "Missing ref" }, { status: 400 });

  const parsed = parseDisplayRef(ref);
  if (!parsed) return Response.json({ error: "Could not parse ref" }, { status: 400 });

  const { chapter, verses } = parsed;
  // Build case-insensitive lookup for abbreviations
  const lowerAbbrevMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(ABBREV_TO_FULLNAME)) {
    lowerAbbrevMap[k.toLowerCase()] = v;
  }
  const lowerDisplayMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(DISPLAY_TO_NEWNAME)) {
    lowerDisplayMap[k.toLowerCase()] = v;
  }
  const bookKey = parsed.book.toLowerCase();
  const book =
    lowerAbbrevMap[bookKey] ??
    lowerDisplayMap[bookKey] ??
    parsed.book;

  let query = supabase
    .from("verse_chapter_book_references")
    .select("versenumber, versecontent")
    .eq("newname", book)
    .eq("chapternumber", chapter)
    .order("versenumber");

  if (verses.length > 0) {
    query = query.in("versenumber", verses);
  }

  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ref, verses: data ?? [] });
}
