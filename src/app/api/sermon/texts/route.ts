import { parseChurchYearRef } from "@/lib/book-abbreviations";
import { supabase } from "@/lib/supabase";

export type VerseRow = {
  versenumber: number;
  versecontent: string;
  newname_reference: string;
};

export type LectionaryText = {
  reference: string;
  verses: VerseRow[];
  fullText: string;
};

export type SermonTextsResponse = {
  day: {
    id: string;
    name: string;
    series: string;
    sunday_name: string;
    tekstrekke: number;
    dato: string;
    ot_reference: string | null;
    epistle_reference: string | null;
    gospel_reference: string | null;
  };
  ot: LectionaryText | null;
  epistle: LectionaryText | null;
  gospel: LectionaryText | null;
  availableTekstrekker: number[];
  prevSundayDate: string | null;
  nextSundayDate: string | null;
};

async function fetchLectionaryText(
  ref: string | null,
): Promise<LectionaryText | null> {
  if (!ref) return null;
  const parsed = parseChurchYearRef(ref);
  if (!parsed) return null;
  const { fullBookName, chapter, verses } = parsed;

  let q = supabase
    .from("verse_chapter_book_references")
    .select("versenumber, versecontent, newname_reference")
    .eq("newname", fullBookName)
    .eq("chapternumber", chapter)
    .order("versenumber");

  if (verses.length > 0) q = q.in("versenumber", verses);

  const { data } = await q;
  if (!data || data.length === 0) return null;

  const fullText = (data as VerseRow[])
    .map((v) => `${v.versenumber} ${v.versecontent}`)
    .join(" ");

  return {
    reference: ref,
    verses: data as VerseRow[],
    fullText: `${(data[0] as VerseRow).newname_reference}:\n${fullText}`,
  };
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const series = searchParams.get("series") ?? "dnk";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const tekstrekkeParam = searchParams.get("tekstrekke");
  const tekstrekkeNum = tekstrekkeParam ? parseInt(tekstrekkeParam) : null;

  // Fetch the church year day — filter by series + optional tekstrekke
  let dayQuery = supabase
    .from("church_year_day")
    .select("*")
    .eq("series", series)
    .lte("dato", date)
    .order("dato", { ascending: false })
    .order("tekstrekke", { ascending: true })
    .limit(1);

  if (tekstrekkeNum) {
    dayQuery = dayQuery.eq("tekstrekke", tekstrekkeNum);
  }

  const { data: day, error } = await dayQuery.single();

  if (error || !day) {
    return Response.json({ error: "Ingen kirkeårdag funnet" }, { status: 404 });
  }

  // All tekstrekker available for this exact Sunday (same dato + series)
  const { data: allRows } = await supabase
    .from("church_year_day")
    .select("tekstrekke")
    .eq("series", series)
    .eq("dato", day.dato)
    .order("tekstrekke", { ascending: true });

  const availableTekstrekker = allRows?.map((r) => r.tekstrekke as number) ?? [];

  // Prev church day — same series, any tekstrekke (navigate by date, not by tekstrekke)
  const { data: prevDay } = await supabase
    .from("church_year_day")
    .select("dato")
    .eq("series", series)
    .lt("dato", day.dato)
    .order("dato", { ascending: false })
    .limit(1)
    .single();

  // Next church day — same series, any tekstrekke
  const { data: nextDay } = await supabase
    .from("church_year_day")
    .select("dato")
    .eq("series", series)
    .gt("dato", day.dato)
    .order("dato", { ascending: true })
    .limit(1)
    .single();

  const [ot, epistle, gospel] = await Promise.all([
    fetchLectionaryText(day.ot_reference),
    fetchLectionaryText(day.epistle_reference),
    fetchLectionaryText(day.gospel_reference),
  ]);

  const response: SermonTextsResponse = {
    day,
    ot,
    epistle,
    gospel,
    availableTekstrekker,
    prevSundayDate: prevDay?.dato ?? null,
    nextSundayDate: nextDay?.dato ?? null,
  };

  return Response.json(response);
}
