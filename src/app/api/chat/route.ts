import { parseChurchYearRef } from "@/lib/book-abbreviations";
import { sanity } from "@/lib/sanity";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

type Message = { role: "user" | "assistant" | "system"; content: string };

type VerseRow = {
  newname: string;
  chapternumber: number;
  versenumber: number;
  versecontent: string;
  newname_reference: string;
};

type MatchedVerse = VerseRow & {
  id: string;
  similarity: number;
};

export type ForossPost = {
  title: string;
  slug: { current: string };
  mainImage: { asset: { url: string } } | null;
  section: { title: string; slug: { current: string } } | null;
  authors: { name: string }[];
};

export type ForossPodcast = {
  _id: string;
  title: string;
  rawUrl: string | null;
  section: { title: string; slug: { current: string } } | null;
  authors: { name: string }[];
  series: {
    slug: { current: string };
    title: string | null;
    imageUrl: string | null;
  } | null;
  kirkedag: { title: string }[] | null;
};

export type ChurchYearDay = {
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Maps Supabase newname → Sanity bibleBook slug.current
const BOOK_SLUG_MAP: Record<string, string> = {
  "1 Mosebok": "1-mosebok",
  "1. Mosebok": "1-mosebok",
  "2 Mosebok": "2-mosebok",
  "2. Mosebok": "2-mosebok",
  "3 Mosebok": "3-mosebok",
  "3. Mosebok": "3-mosebok",
  "4 Mosebok": "4-mosebok",
  "4. Mosebok": "4-mosebok",
  "5 Mosebok": "5-mosebok",
  "5. Mosebok": "5-mosebok",
  Josva: "josva",
  Dommerne: "dommerne",
  Rut: "rut",
  "1 Samuel": "1-samuel",
  "1. Samuel": "1-samuel",
  "2 Samuel": "2-samuel",
  "2. Samuel": "2-samuel",
  "1 Kongebok": "1-kongebok",
  "1. Kongebok": "1-kongebok",
  "2 Kongebok": "2-kongebok",
  "2. Kongebok": "2-kongebok",
  "1 Krønikebok": "1-kronikebok",
  "1. Krønikebok": "1-kronikebok",
  "2 Krønikebok": "2-kronikebok",
  "2. Krønikebok": "2-kronikebok",
  Esra: "esra",
  Nehemja: "nehemja",
  Ester: "ester",
  Job: "job",
  Salmene: "Salme",
  Salme: "Sal",
  Ordspråkene: "ordsprakene",
  Forkynneren: "forkynneren",
  Høysangen: "hoysangen",
  Jesaja: "jesaia", // Sanity spells it "Jesaia"
  Jeremia: "jeremia",
  Klagesangene: "klagesangene",
  Esekiel: "esekiel",
  Daniel: "daniel",
  Hosea: "hosea",
  Joel: "joel",
  Amos: "amos",
  Obadja: "obadja",
  Jona: "jonah", // Sanity spells it "Jonah"
  Mika: "mika",
  Nahum: "nahum",
  Habakkuk: "habakkuk",
  Sefanja: "sefanja",
  Haggai: "haggai",
  Sakarja: "sakaria", // Sanity spells it "Sakaria"
  Malaki: "makali", // Sanity slug is "makali" (their typo)
  Matteus: "matteus",
  Markus: "markus",
  Lukas: "lukas",
  Johannes: "johannes",
  "Apostlenes gjerninger": "apostlenes-gjerninger",
  Romerne: "romerne",
  "1 Korinter": "1-korinter",
  "1. Korinter": "1-korinter",
  "2 Korinter": "2-korinter",
  "2. Korinter": "2-korinter",
  Galaterne: "galaterne",
  Galaterbrevet: "galaterne",
  Efeserne: "efeserne",
  Efeserbrevet: "efeserne",
  Filiperne: "filiperne",
  Filipperne: "filiperne",
  Filipperbrevet: "filiperne",
  Kolosserne: "kolosserne",
  Kolosserbrevet: "kolosserne",
  "1 Tessaloniker": "1-tessaloniker",
  "1. Tessaloniker": "1-tessaloniker",
  "2 Tessaloniker": "2-tessaloniker",
  "2. Tessaloniker": "2-tessaloniker",
  "1 Timoteus": "1-timoteus",
  "1. Timoteus": "1-timoteus",
  "2 Timoteus": "2-timoteus",
  "2. Timoteus": "2-timoteus",
  Titus: "titus",
  Filemon: "filemon",
  Hebreerne: "hebreerne",
  Jakob: "jakob",
  "Jakobs brev": "jakob",
  "1 Peter": "1-peter",
  "1. Peter": "1-peter",
  "2 Peter": "2-peter",
  "2. Peter": "2-peter",
  "1 Johannes": "1-johannes",
  "1. Johannes": "1-johannes",
  "2 Johannes": "2-johannes",
  "2. Johannes": "2-johannes",
  "3 Johannes": "3-johannes",
  "3. Johannes": "3-johannes",
  Judas: "judas",
  Juda: "judas",
  Åpenbaringen: "apenbaringen",
};

async function resolveBibleChapterIds(
  matchedVerses: MatchedVerse[],
): Promise<string[]> {
  const pairs = [
    ...new Map(
      matchedVerses.map((v) => [`${v.newname}|${v.chapternumber}`, v]),
    ).values(),
  ];

  const chapterIds = await Promise.all(
    pairs.map(async (v) => {
      const slug = BOOK_SLUG_MAP[v.newname];
      if (!slug) return [];
      return sanity.fetch<string[]>(
        `*[_type == "bibleChapter" && chapter == $chapter && book->slug.current == $slug]._id`,
        { chapter: v.chapternumber, slug },
      );
    }),
  );

  return chapterIds.flat();
}

async function fetchForossPosts(flatIds: string[]): Promise<ForossPost[]> {
  if (flatIds.length === 0) return [];
  const posts = await sanity.fetch<ForossPost[]>(
    `*[_type == "post" && references($ids)] | order(publishedAt desc) {
      title,
      slug,
      mainImage { asset -> { url } },
      "section": section -> { title, slug },
      "authors": authors[] -> { name }
    }[0...5]`,
    { ids: flatIds },
  );
  return posts ?? [];
}

async function fetchForossPostsByChurchDay(
  dayName: string,
): Promise<ForossPost[]> {
  const posts = await sanity.fetch<ForossPost[]>(
    `*[_type == "post" && $dayName in kirkedagreference[]._ref] | order(publishedAt desc) {
      title,
      slug,
      mainImage { asset -> { url } },
      "section": section -> { title, slug },
      "authors": authors[] -> { name }
    }[0...5]`,
    { dayName },
  );
  return posts ?? [];
}

async function fetchForossPodcasts(
  flatIds: string[],
  userQuery: string,
): Promise<ForossPodcast[]> {
  const podcasts = await sanity.fetch<ForossPodcast[]>(
    `*[_type == "podcast" && (
      references($ids) ||
      title match text::query($q) ||
      categories[]->title match text::query($q)
    )] | order(publishedAt desc) {
      _id,
      title,
      rawUrl,
      "section": section -> { title, slug },
      "authors": authors[] -> { name },
      "series": series -> { slug, title, "imageUrl": image.asset->url },
      "kirkedag": kirkedag[] -> { title }
    }[0...5]`,
    { ids: flatIds, q: userQuery },
  );
  return podcasts ?? [];
}

async function fetchChurchYearVerses(day: ChurchYearDay): Promise<{
  otText: string;
  epistleText: string;
  gospelText: string;
}> {
  async function fetchRef(ref: string | null): Promise<string> {
    if (!ref) return "";
    const parsed = parseChurchYearRef(ref);
    if (!parsed) return `(Kunne ikke tolke referansen: ${ref})`;
    const { fullBookName, chapter, verses } = parsed;
    let q = supabase
      .from("verse_chapter_book_references")
      .select("versenumber, versecontent, newname_reference")
      .eq("newname", fullBookName)
      .eq("chapternumber", chapter)
      .order("versenumber");
    if (verses.length > 0) q = q.in("versenumber", verses);
    const { data } = await q;
    if (!data || data.length === 0) return `(Ingen vers funnet for ${ref})`;
    const header =
      (data[0] as { newname_reference: string }).newname_reference ?? ref;
    const body = (data as { versenumber: number; versecontent: string }[])
      .map((v) => `${v.versenumber} ${v.versecontent}`)
      .join(" ");
    return `${header}:\n${body}`;
  }

  const [otText, epistleText, gospelText] = await Promise.all([
    fetchRef(day.ot_reference),
    fetchRef(day.epistle_reference),
    fetchRef(day.gospel_reference),
  ]);
  return { otText, epistleText, gospelText };
}

const NO_MONTHS: Record<string, string> = {
  januar: "01",
  februar: "02",
  mars: "03",
  april: "04",
  mai: "05",
  juni: "06",
  juli: "07",
  august: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
};

const NO_ORDINALS: Record<string, number> = {
  første: 1,
  andre: 2,
  tredje: 3,
  fjerde: 4,
  femte: 5,
  sjette: 6,
  syvende: 7,
  sjuende: 7,
  åttende: 8,
  niende: 9,
  tiende: 10,
  ellevte: 11,
  tolvte: 12,
  trettende: 13,
  fjortende: 14,
  femtende: 15,
  sekstende: 16,
  syttende: 17,
  attende: 18,
  nittende: 19,
  tjuende: 20,
  tjueførste: 21,
  tjueandre: 22,
  tjuetredje: 23,
  tjuefjerde: 24,
  tjuefemte: 25,
  tjuesjette: 26,
  tjuesyvende: 27,
};

/**
 * Returns the first Sunday of Advent for a given calendar year.
 * Advent 1 = the Sunday that is exactly 3 weeks before the 4th Sunday of Advent,
 * where the 4th Sunday of Advent is the last Sunday on or before Dec 25.
 */
function firstSundayOfAdvent(year: number): Date {
  const christmas = new Date(year, 11, 25);
  const fourthAdvent = new Date(year, 11, 25 - christmas.getDay());
  return new Date(
    fourthAdvent.getFullYear(),
    fourthAdvent.getMonth(),
    fourthAdvent.getDate() - 21,
  );
}

/**
 * Computes the active tekstrekke (1, 2, or 3) for a given date.
 * The church year starts on the first Sunday of Advent.
 * 2026 church year = tekstrekke 1, cycling every 3 years.
 */
function computeCurrentTekstrekke(today: string): number {
  const todayDate = new Date(today);
  const calYear = todayDate.getFullYear();
  const churchYear =
    todayDate >= firstSundayOfAdvent(calYear) ? calYear + 1 : calYear;
  return ((((churchYear - 2026) % 3) + 3) % 3) + 1;
}

/** Returns the explicit tekstrekke (1–3) if the user mentioned it, otherwise null. */
function extractTekstrekkeFromMessage(message: string): number | null {
  // Match "tekstrekke 1" / "rekke 2" etc.
  const numericMatch = message.match(/\b(?:tekstrekke|rekke)\s*([123])\b/i);
  if (numericMatch) return parseInt(numericMatch[1], 10);

  // Match "første/andre/tredje tekstrekke" or "første/andre/tredje rekke"
  const ordinalMap: Record<string, number> = { første: 1, andre: 2, tredje: 3 };
  const ordinalMatch = message.match(
    /\b(første|andre|tredje)\s+(?:tekstrekke|rekke)\b/i,
  );
  if (ordinalMatch) return ordinalMap[ordinalMatch[1].toLowerCase()] ?? null;

  return null;
}

/** When a date has no year, pick current year; advance to next year if already past. */
function inferYear(day: string, month: string, todayStr: string): string {
  const todayDate = new Date(todayStr);
  const year = todayDate.getFullYear();
  const candidate = new Date(`${year}-${month}-${day}`);
  return `${candidate < todayDate ? year + 1 : year}-${month}-${day}`;
}

/**
 * Extract an ISO date (YYYY-MM-DD) from a Norwegian message, or return null.
 * Handles: ISO, "6. april 2026", "6. juni" (no year), "første mai", "syvende juni".
 */
function extractDateFromMessage(text: string, today: string): string | null {
  // 1. ISO: 2026-04-06
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // 2. "6. april 2026"
  const noWithYear = text.match(
    /\b(\d{1,2})\.?\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})\b/i,
  );
  if (noWithYear) {
    return `${noWithYear[3]}-${NO_MONTHS[noWithYear[2].toLowerCase()]}-${noWithYear[1].padStart(2, "0")}`;
  }

  // 3. Ordinal + month: "første mai", "syvende juni"
  const ordinalKeys = Object.keys(NO_ORDINALS).join("|");
  const ordinalMonthMatch = text.match(
    new RegExp(
      `\\b(${ordinalKeys})\\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\\b`,
      "i",
    ),
  );
  if (ordinalMonthMatch) {
    const day = String(
      NO_ORDINALS[ordinalMonthMatch[1].toLowerCase()],
    ).padStart(2, "0");
    const month = NO_MONTHS[ordinalMonthMatch[2].toLowerCase()];
    return inferYear(day, month, today);
  }

  // 4. "7. juni" or "7 juni" (no year)
  const numNoYear = text.match(
    /\b(\d{1,2})\.?\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\b/i,
  );
  if (numNoYear) {
    const day = numNoYear[1].padStart(2, "0");
    const month = NO_MONTHS[numNoYear[2].toLowerCase()];
    return inferYear(day, month, today);
  }

  return null;
}

/**
 * True when the message is clearly about a Sunday service / sermon preparation.
 * Only used to decide whether the date fallback fires — the name-based path
 * (e.g. "palmesøndag") is always tried regardless.
 */
function hasChurchContext(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "preke",
    "preken",
    "preike",
    "tale ",
    "talen",
    "taler",
    "søndag",
    "tekstene",
    "søndagens tekst",
    "kirkeåret",
    "kirkeår",
    "gudstjeneste",
    "epistel",
    "evangelium",
    "gt-tekst",
  ].some((w) => lower.includes(w));
}

/** Add N days to a YYYY-MM-DD string, returns a new YYYY-MM-DD string. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Words too generic to use as church-year-day name lookup terms.
 * Anything that appears in almost every sunday_name or is a common question word.
 */
const LOOKUP_GENERIC = new Set([
  "tekstene",
  "tekstrekke",
  "søndagen",
  "søndagens",
  "søndag",
  "kirkeåret",
  "gudstjeneste",
  "evangelium",
  "epistel",
  "fortelle",
  "beskriv",
  "tekster",
  "preken",
  "preike",
  "preke",
]);

/**
 * Run a named-day query, preferring the nearest upcoming occurrence.
 * `pattern` is the ILIKE pattern for sunday_name.
 */
async function queryByNamePattern(
  pattern: string,
  series: string,
  tekstrekke: number,
  today: string,
): Promise<ChurchYearDay | null> {
  const { data: upcoming } = await supabase
    .from("church_year_day")
    .select("*")
    .eq("series", series)
    .eq("tekstrekke", tekstrekke)
    .ilike("sunday_name", pattern)
    .gte("dato", today)
    .order("dato", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (upcoming) return upcoming as ChurchYearDay;

  // No upcoming match in this tekstrekke — find the nearest future occurrence across any tekstrekke
  const { data: anyTekstrekke } = await supabase
    .from("church_year_day")
    .select("*")
    .eq("series", series)
    .ilike("sunday_name", pattern)
    .gte("dato", today)
    .order("dato", { ascending: true })
    .limit(1)
    .maybeSingle();
  return anyTekstrekke ? (anyTekstrekke as ChurchYearDay) : null;
}

/**
 * Try a direct ILIKE lookup against sunday_name using content words extracted
 * from the message. Longest words are tried first (most specific).
 * For ordinal queries ("3. søndag i treenighetstiden") the ordinal is anchored
 * so "3." only matches rows that start with "3.".
 * Always returns the nearest upcoming occurrence of the matched day name.
 */
async function lookupByText(
  message: string,
  series: string,
  tekstrekke: number,
  today: string,
): Promise<ChurchYearDay | null> {
  const lower = message.toLowerCase();

  const words = (lower.match(/[a-zA-ZæøåÆØÅ]+/g) ?? [])
    .filter((w) => w.length >= 5 && !LOOKUP_GENERIC.has(w))
    .sort((a, b) => b.length - a.length); // longest = most specific first

  if (words.length === 0) return null;

  // Ordinal-anchored search: "3. søndag i treenighetstiden" → "3. %treenighetstiden%"
  // Also handles Norwegian ordinal words: "andre søndag i adventstiden" → "2. %adventstiden%"
  const NO_ORDINAL_WORDS: Record<string, number> = {
    første: 1,
    andre: 2,
    tredje: 3,
    fjerde: 4,
    femte: 5,
    sjette: 6,
    syvende: 7,
    sjuende: 7,
    åttende: 8,
    niende: 9,
    tiende: 10,
  };
  const wordOrdinalMatch = lower.match(
    new RegExp(`\\b(${Object.keys(NO_ORDINAL_WORDS).join("|")})\\b`),
  );
  const numericOrdinal = lower.match(/\b(\d+)\.\s/);
  const ordinalMatch =
    numericOrdinal ??
    (wordOrdinalMatch
      ? ([
          null,
          String(NO_ORDINAL_WORDS[wordOrdinalMatch[1]]),
        ] as unknown as RegExpMatchArray)
      : null);
  if (ordinalMatch) {
    for (const word of words) {
      const result = await queryByNamePattern(
        `${ordinalMatch[1]}. %${word}%`,
        series,
        tekstrekke,
        today,
      );
      if (result) return result;
    }
  }

  // Substring match on the longest content word
  for (const word of words) {
    const result = await queryByNamePattern(
      `%${word}%`,
      series,
      tekstrekke,
      today,
    );
    if (result) return result;
  }

  return null;
}

/**
 * Look up the relevant church year day for a given user message.
 *
 * Priority:
 *  1a. Direct text match (ILIKE with content words from message — most reliable for named days)
 *  1b. Embedding similarity fallback (handles typos, synonyms, alternate phrasings)
 *  2.  Explicit date in message ("7. juni", "første mai", …)
 *  3.  Default fallback — nearest upcoming day (always active)
 */
async function lookupChurchYearDay(
  message: string,
  queryEmbedding: number[],
  series: string,
  tekstrekke: number,
  today: string,
): Promise<ChurchYearDay | null> {
  // 1a. Direct text match — fast and precise for exact/near-exact name mentions
  // Returns the nearest upcoming occurrence of the matched named day.
  const textMatch = await lookupByText(message, series, tekstrekke, today);
  if (textMatch) return textMatch;

  // 1b. Embedding fallback — catches typos, synonyms, alternate phrasings.
  // From the similarity-ranked results, prefer the nearest upcoming occurrence.
  const { data: embeddingMatches, error: rpcLookupError } = await supabase.rpc(
    "match_church_year_day",
    {
      query_embedding: queryEmbedding,
      series_filter: series,
      tekstrekke_filter: tekstrekke,
    },
  );
  if (rpcLookupError) {
    console.error("[match_church_year_day] RPC error:", rpcLookupError.message);
  }
  if (embeddingMatches && embeddingMatches.length > 0) {
    // Among top similarity matches, pick the best-ranked one that is upcoming;
    // fall back to the top match if all are in the past.
    const topName = (embeddingMatches[0] as ChurchYearDay).sunday_name;
    const upcoming = (embeddingMatches as ChurchYearDay[]).find(
      (d) => d.sunday_name === topName && d.dato >= today,
    );
    return upcoming ?? (embeddingMatches[0] as ChurchYearDay);
  }

  // 2. Explicit date extracted from message
  const explicitDate = extractDateFromMessage(message, today);
  if (explicitDate) {
    const { data } = await supabase
      .from("church_year_day")
      .select("*")
      .eq("series", series)
      .eq("tekstrekke", tekstrekke)
      .lte("dato", explicitDate)
      .order("dato", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ChurchYearDay;
  }

  // 3. Default fallback — always return the nearest upcoming church year day
  const { data: upcoming } = await supabase
    .from("church_year_day")
    .select("*")
    .eq("series", series)
    .eq("tekstrekke", tekstrekke)
    .gte("dato", today)
    .order("dato", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (upcoming) return upcoming as ChurchYearDay;

  // Last resort: most recent past day (end of church year edge case)
  const { data: past } = await supabase
    .from("church_year_day")
    .select("*")
    .eq("series", series)
    .eq("tekstrekke", tekstrekke)
    .lte("dato", today)
    .order("dato", { ascending: false })
    .limit(1)
    .maybeSingle();
  return past ? (past as ChurchYearDay) : null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const {
      messages,
      series,
      bypassCache,
      tekstrekkeOverride,
      churchYearEnabled = true,
      responseMode = "grounded",
    }: {
      messages: Message[];
      series?: string;
      bypassCache?: boolean;
      tekstrekkeOverride?: number | null;
      churchYearEnabled?: boolean;
      responseMode?: "verses" | "grounded" | "full";
    } = await req.json();

    const lastUserMessage = messages.findLast((m) => m.role === "user");
    if (!lastUserMessage) {
      return Response.json({ error: "No user message" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. Generate embedding (512 dims to match stored vectors)
    // Use the last 3 messages for context-aware semantic search — follow-up
    // questions ("hva sier Paulus om dette?") get grounded in the conversation.
    const queryInput = messages
      .slice(-3)
      .map((m) => m.content)
      .join("\n\n");
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: queryInput,
      dimensions: 512,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 1b. Determine tekstrekke — UI override takes priority, then the most recent explicit
    //     mention anywhere in the conversation history, then auto-compute from date.
    const tekstrekkeFromHistory = messages
      .filter((m) => m.role === "user")
      .reduceRight(
        (found: number | null, m) =>
          found ?? extractTekstrekkeFromMessage(m.content),
        null,
      );
    const tekstrekke =
      (tekstrekkeOverride != null ? tekstrekkeOverride : null) ??
      tekstrekkeFromHistory ??
      computeCurrentTekstrekke(today);

    // 1c. Look up church year day (when enabled — by name, date, or today)
    const churchYearDay = churchYearEnabled
      ? await lookupChurchYearDay(
          lastUserMessage.content,
          queryEmbedding,
          series ?? "dnk",
          tekstrekke,
          today,
        )
      : null;

    // 1d. Build cache embedding:
    //   - No church year day  → use queryEmbedding as-is (free)
    //   - Church year day found → embed (query + sunday_name + tekstrekke + series) so two
    //     users asking the same thing on the same Sunday in the same series share a cache hit,
    //     but different Sundays, tekstrekker, or series never collide.
    let cacheEmbedding = queryEmbedding;
    if (churchYearDay) {
      const cacheKeyText = `${lastUserMessage.content}\n[${churchYearDay.sunday_name} T${churchYearDay.tekstrekke} ${series ?? "dnk"}]`;
      const cacheKeyRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: cacheKeyText,
        dimensions: 512,
      });
      cacheEmbedding = cacheKeyRes.data[0].embedding;
    }

    // 1e. Run cache check and semantic search in parallel so foross content is
    //     always available — even on a cache hit.
    const [cacheResult, verseResult] = await Promise.all([
      bypassCache
        ? Promise.resolve({ data: null, error: null })
        : supabase.rpc("match_cache", {
            query_embedding: cacheEmbedding,
            ...(churchYearDay && {
              p_sunday_name: churchYearDay.sunday_name,
              p_tekstrekke: churchYearDay.tekstrekke,
              p_series: series ?? "dnk",
            }),
          }),
      supabase.rpc("match_verses", {
        query_embedding: queryEmbedding,
        match_count: 5,
      }),
    ]);

    const { data: matchedVerses, error: rpcError } = verseResult;

    if (rpcError || !matchedVerses || matchedVerses.length === 0) {
      return Response.json({ error: "Verse lookup failed" }, { status: 500 });
    }

    // 1f. Fetch verse texts for the resolved church year day
    const churchYearVerses = churchYearDay
      ? await fetchChurchYearVerses(churchYearDay)
      : null;

    // 2. Resolve bible chapter IDs needed for foross lookups
    const orFilter = (matchedVerses as MatchedVerse[])
      .map(
        (v) =>
          `and(newname.eq.${v.newname},chapternumber.eq.${v.chapternumber},versenumber.gte.${v.versenumber - 3},versenumber.lte.${v.versenumber + 3})`,
      )
      .join(",");

    const flatIds = await resolveBibleChapterIds(
      matchedVerses as MatchedVerse[],
    );

    // 3. Fetch surrounding verses + foross.no posts + podcasts in parallel
    const [
      { data: surrounding },
      bibleRefPosts,
      churchDayPosts,
      forossPodcasts,
    ] = await Promise.all([
      supabase
        .from("verse_chapter_book_references")
        .select(
          "newname, chapternumber, versenumber, versecontent, newname_reference",
        )
        .or(orFilter)
        .order("chapternumber")
        .order("versenumber"),
      fetchForossPosts(flatIds),
      churchYearDay
        ? fetchForossPostsByChurchDay(churchYearDay.id)
        : Promise.resolve<ForossPost[]>([]),
      fetchForossPodcasts(flatIds, lastUserMessage.content),
    ]);

    // Merge posts, deduplicate by slug, church day posts first
    const seenSlugs = new Set<string>();
    const forossPosts: ForossPost[] = [];
    for (const p of [...churchDayPosts, ...bibleRefPosts]) {
      if (!seenSlugs.has(p.slug.current)) {
        seenSlugs.add(p.slug.current);
        forossPosts.push(p);
      }
    }

    // 3b. If there was a cache hit, return the cached response now — with foross headers attached
    const cacheHit = cacheResult.data;
    if (cacheHit && cacheHit.length > 0) {
      const cached = (cacheHit[0] as { response: string }).response;
      const chunk = JSON.stringify({
        choices: [{ delta: { content: cached }, index: 0 }],
      });
      return new Response(chunk + "\n", {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Foross-Posts": Buffer.from(JSON.stringify(forossPosts)).toString(
            "base64",
          ),
          "X-Foross-Podcasts": Buffer.from(
            JSON.stringify(forossPodcasts),
          ).toString("base64"),
          ...(churchYearDay
            ? {
                "X-Church-Year-Day": Buffer.from(
                  JSON.stringify(churchYearDay),
                ).toString("base64"),
              }
            : {}),
        },
      });
    }

    const surroundingRows = (surrounding ?? []) as VerseRow[];

    // 4. Build Bible verse context string
    const contextString = (matchedVerses as MatchedVerse[])
      .map((match) => {
        const passage = surroundingRows.filter(
          (row) =>
            row.newname === match.newname &&
            row.chapternumber === match.chapternumber &&
            row.versenumber >= match.versenumber - 3 &&
            row.versenumber <= match.versenumber + 3,
        );
        return passage
          .map((row) => `[${row.newname_reference}] ${row.versecontent}`)
          .join("\n");
      })
      .join("\n\n");

    // 5. Build foross.no context strings
    const forossPostsString =
      forossPosts.length > 0
        ? forossPosts
            .map((p) => {
              const author = p.authors?.[0]?.name ?? "Ukjent";
              const section = p.section?.title ?? "";
              const url = `https://foross.no/innlegg/${p.slug.current}`;
              return `- ${p.title} (${section}, av ${author}) — ${url}`;
            })
            .join("\n")
        : null;

    const forossPodcastsString =
      forossPodcasts.length > 0
        ? forossPodcasts
            .map((p) => {
              const author = p.authors?.[0]?.name ?? "Ukjent";
              const seriesSlug = p.series?.slug?.current ?? "episode";
              const url = `https://www.foross.no/podkast/${seriesSlug}/${p._id}`;
              return `- ${p.title} (av ${author}) — ${url}`;
            })
            .join("\n")
        : null;

    const hasForossContent = forossPostsString || forossPodcastsString;

    const churchYearSection =
      churchYearDay && churchYearVerses
        ? `\n## Søndagens tekster — ${churchYearDay.sunday_name}\nTekstrekke ${churchYearDay.tekstrekke}\n\n**Gammeltestamentlig tekst (${churchYearDay.ot_reference}):**\n${churchYearVerses.otText}\n\n**Epistel (${churchYearDay.epistle_reference}):**\n${churchYearVerses.epistleText}\n\n**Evangelium (${churchYearDay.gospel_reference}):**\n${churchYearVerses.gospelText}\n`
        : "";

    const forossRuleNumber = hasForossContent ? (churchYearDay ? 8 : 7) : null;
    const churchYearRuleNumber = churchYearDay
      ? hasForossContent
        ? 9
        : 7
      : null;

    // 6. System prompt
    const modeRules =
      responseMode === "verses"
        ? `5. Presenter versene og gi kun kort faktainformasjon om kontekst eller historisk bakgrunn. Ingen tolkninger, ingen utlegging, ingen personlige perspektiver.
6. Hold svaret kort og faktabasert.`
        : responseMode === "full"
          ? `5. Du kan gi utdypende forklaringer, tolkninger og teologisk utlegging av versene. Gå gjerne i dybden.
6. Gi gjerne ditt perspektiv og del relevant teologisk innsikt, men hold deg til det Bibelen faktisk sier.`
          : /* grounded */
            `5. Du kan tolke og forklare versene så lenge tolkningen er klart forankret i selve bibelteksten. Pek på hva teksten sier, ikke hva du mener om den.
6. Unngå spekulasjon utover det teksten faktisk uttrykker.`;

    const systemPrompt = `Du er en bibelveileder som hjelper mennesker å utforske Bibelen på norsk.
Følgende bibelvers fra Bibelen (88/07) er hentet frem som relevante for spørsmålet:

${contextString}
${churchYearSection}${forossPostsString ? `\nRelevante artikler fra foross.no:\n${forossPostsString}\n` : ""}${forossPodcastsString ? `\nRelevante episoder fra foross.no:\n${forossPodcastsString}\n` : ""}
REGLER DU MÅ FØLGE:
1. Ta utgangspunkt i versene ovenfor fra Bibelen (88/07). Du kan nevne referanser til andre vers ved navn (f.eks. «Johannes 3:16»), men gjengi aldri verstekst som ikke er inkludert i konteksten ovenfor — be heller leseren om å slå opp verset selv.
2. Sitér alltid referansen (bok, kapittel og vers) når du bruker et vers, f.eks. "Johannes 3:16". Når du siterer eller omtaler innholdet i et vers, gjengi det alltid nøyaktig og korrekt – aldri parafraser eller oppsummer versteksten med egne ord.
3. Vær respektfull, omsorgsfull og tydelig i alle svar.
4. Svar alltid på norsk.
${modeRules}
7. Ikke bruk fraser som «i versene jeg har funnet», «i de versene du har gitt», «det står i din bibel», «basert på versene jeg har tilgang til» eller lignende. Si bare hva Bibelen sier og henvis til den konkrete referansen.
${forossRuleNumber ? `${forossRuleNumber}. Hvis en foross.no-artikkel eller episode er relevant, vev lenken naturlig inn i den løpende teksten der den hører hjemme. Ikke legg den i en egen avsluttende seksjon eller liste. Formater lenken alltid som en Markdown-hyperlenke: [tittel](url).` : ""}
${churchYearRuleNumber ? `${churchYearRuleNumber}. Du har fått søndagens tre tekster fra kirkeåret. Beskriv gjerne tematiske forbindelser mellom GT-teksten, epistelen og evangeliet — hva slags tekster det er, hvem som taler, og hva de sier til hverandre. ${responseMode === "verses" ? "Ikke tolk eller utlegg." : ""}` : ""}

FORMATERING:
- Bruk Markdown i alle svar.
- Når du siterer et bibelvers direkte, legg det i en blokksitering (>) og kursiver selve versteksten, slik: > *«Teksten her.»* — Referanse
- Bruk **fet tekst** for å fremheve nøkkelord eller temaer.
- Del opp svaret med tydelige avsnitt. Bruk gjerne en kort ##-overskrift hvis svaret dekker flere temaer.
- Hold setningene korte og luftige. Unngå lange, tette avsnitt.
`;

    // 7. Stream chat completion
    const HISTORY_LIMIT = churchYearEnabled ? 8 : 15;
    const recentMessages = messages.slice(-HISTORY_LIMIT);
    const chatStream = openai.chat.completions.stream({
      model: "gpt-5.4-mini",
      messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
    });

    // Save response to cache (fire and forget)
    let fullResponse = "";
    chatStream.on("content", (delta: string) => {
      fullResponse += delta;
    });
    chatStream.on("finalMessage", () => {
      if (fullResponse.length > 0) {
        void (async () => {
          // On bypass, evict the stale entry first so the fresh one wins
          if (bypassCache) {
            await supabase
              .from("query_cache")
              .delete()
              .eq("query_text", lastUserMessage.content);
          }
          await supabase.from("query_cache").insert({
            query_text: lastUserMessage.content,
            embedding: cacheEmbedding,
            response: fullResponse,
            ...(churchYearDay && {
              sunday_name: churchYearDay.sunday_name,
              tekstrekke: churchYearDay.tekstrekke,
              series: series ?? "dnk",
            }),
          });
          await supabase.rpc("cleanup_query_cache");
        })();
      }
    });

    // Return posts and podcasts alongside the stream so the UI can render them
    const stream = chatStream.toReadableStream();
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Foross-Posts": Buffer.from(JSON.stringify(forossPosts)).toString(
        "base64",
      ),
      "X-Foross-Podcasts": Buffer.from(JSON.stringify(forossPodcasts)).toString(
        "base64",
      ),
      ...(churchYearDay
        ? {
            "X-Church-Year-Day": Buffer.from(
              JSON.stringify(churchYearDay),
            ).toString("base64"),
          }
        : {}),
    });

    return new Response(stream, { headers });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
