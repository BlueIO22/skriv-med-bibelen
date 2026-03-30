import { supabase } from "@/lib/supabase";
import { sanity } from "@/lib/sanity";
import { parseChurchYearRef } from "@/lib/book-abbreviations";
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
  section: { title: string; slug: { current: string } } | null;
  authors: { name: string }[];
  series: { slug: { current: string } } | null;
};

export type ChurchYearDay = {
  id: string;
  name: string;
  series: string;
  sunday_name: string;
  tekstrekke: number;
  dato: string;
  ot_reference: string;
  epistle_reference: string;
  gospel_reference: string;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Maps Supabase newname → Sanity bibleBook slug.current
const BOOK_SLUG_MAP: Record<string, string> = {
  "1 Mosebok": "1-mosebok", "1. Mosebok": "1-mosebok",
  "2 Mosebok": "2-mosebok", "2. Mosebok": "2-mosebok",
  "3 Mosebok": "3-mosebok", "3. Mosebok": "3-mosebok",
  "4 Mosebok": "4-mosebok", "4. Mosebok": "4-mosebok",
  "5 Mosebok": "5-mosebok", "5. Mosebok": "5-mosebok",
  "Josva": "josva", "Dommerne": "dommerne", "Rut": "rut",
  "1 Samuel": "1-samuel", "1. Samuel": "1-samuel",
  "2 Samuel": "2-samuel", "2. Samuel": "2-samuel",
  "1 Kongebok": "1-kongebok", "1. Kongebok": "1-kongebok",
  "2 Kongebok": "2-kongebok", "2. Kongebok": "2-kongebok",
  "1 Krønikebok": "1-kronikebok", "1. Krønikebok": "1-kronikebok",
  "2 Krønikebok": "2-kronikebok", "2. Krønikebok": "2-kronikebok",
  "Esra": "esra", "Nehemja": "nehemja", "Ester": "ester", "Job": "job",
  "Salmene": "salmene", "Salme": "salmene",
  "Ordspråkene": "ordsprakene", "Forkynneren": "forkynneren", "Høysangen": "hoysangen",
  "Jesaja": "jesaia",   // Sanity spells it "Jesaia"
  "Jeremia": "jeremia", "Klagesangene": "klagesangene", "Esekiel": "esekiel",
  "Daniel": "daniel", "Hosea": "hosea", "Joel": "joel", "Amos": "amos",
  "Obadja": "obadja",
  "Jona": "jonah",      // Sanity spells it "Jonah"
  "Mika": "mika", "Nahum": "nahum", "Habakkuk": "habakkuk",
  "Sefanja": "sefanja", "Haggai": "haggai",
  "Sakarja": "sakaria", // Sanity spells it "Sakaria"
  "Malaki": "makali",   // Sanity slug is "makali" (their typo)
  "Matteus": "matteus", "Markus": "markus", "Lukas": "lukas", "Johannes": "johannes",
  "Apostlenes gjerninger": "apostlenes-gjerninger",
  "Romerne": "romerne",
  "1 Korinter": "1-korinter", "1. Korinter": "1-korinter",
  "2 Korinter": "2-korinter", "2. Korinter": "2-korinter",
  "Galaterne": "galaterne", "Galaterbrevet": "galaterne",
  "Efeserne": "efeserne", "Efeserbrevet": "efeserne",
  "Filipperne": "filiperne", "Filipperbrevet": "filiperne",
  "Kolosserne": "kolosserne", "Kolosserbrevet": "kolosserne",
  "1 Tessaloniker": "1-tessaloniker", "1. Tessaloniker": "1-tessaloniker",
  "2 Tessaloniker": "2-tessaloniker", "2. Tessaloniker": "2-tessaloniker",
  "1 Timoteus": "1-timoteus", "1. Timoteus": "1-timoteus",
  "2 Timoteus": "2-timoteus", "2. Timoteus": "2-timoteus",
  "Titus": "titus", "Filemon": "filemon", "Hebreerne": "hebreerne",
  "Jakob": "jakob", "Jakobs brev": "jakob",
  "1 Peter": "1-peter", "1. Peter": "1-peter",
  "2 Peter": "2-peter", "2. Peter": "2-peter",
  "1 Johannes": "1-johannes", "1. Johannes": "1-johannes",
  "2 Johannes": "2-johannes", "2. Johannes": "2-johannes",
  "3 Johannes": "3-johannes", "3. Johannes": "3-johannes",
  "Judas": "judas", "Juda": "judas",
  "Åpenbaringen": "apenbaringen",
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

async function fetchForossPodcasts(flatIds: string[], userQuery: string): Promise<ForossPodcast[]> {
  const podcasts = await sanity.fetch<ForossPodcast[]>(
    `*[_type == "podcast" && (
      references($ids) ||
      title match text::query($q) ||
      categories[]->title match text::query($q)
    )] | order(publishedAt desc) {
      _id,
      title,
      "section": section -> { title, slug },
      "authors": authors[] -> { name },
      "series": series -> { slug }
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
  async function fetchRef(ref: string): Promise<string> {
    const parsed = parseChurchYearRef(ref);
    if (!parsed) return `(Kunne ikke tolke referansen: ${ref})`;
    const { fullBookName, chapter, fromVerse, toVerse } = parsed;
    const { data } = await supabase
      .from("verse_chapter_book_references")
      .select("versenumber, versecontent, newname_reference")
      .eq("newname", fullBookName)
      .eq("chapternumber", chapter)
      .gte("versenumber", fromVerse)
      .lte("versenumber", toVerse)
      .order("versenumber");
    if (!data || data.length === 0) return `(Ingen vers funnet for ${ref})`;
    const header = (data[0] as { newname_reference: string }).newname_reference ?? ref;
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
  januar: "01", februar: "02", mars: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", desember: "12",
};

/** Extract an ISO date (YYYY-MM-DD) from a Norwegian message, or return null. */
function extractDateFromMessage(text: string): string | null {
  // ISO format: 2026-04-06
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Norwegian: "6. april 2026" or "6 april 2026"
  const noMatch = text.match(
    /\b(\d{1,2})\.?\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})\b/i,
  );
  if (noMatch) {
    const day = noMatch[1].padStart(2, "0");
    const month = NO_MONTHS[noMatch[2].toLowerCase()];
    return `${noMatch[3]}-${month}-${day}`;
  }

  return null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const {
      messages,
      series,
      churchYearMode,
    }: { messages: Message[]; series?: string; churchYearMode?: boolean } =
      await req.json();

    const lastUserMessage = messages.findLast((m) => m.role === "user");
    if (!lastUserMessage) {
      return Response.json({ error: "No user message" }, { status: 400 });
    }

    // 1. Generate embedding (512 dims to match stored vectors)
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: lastUserMessage.content,
      dimensions: 512,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 1b. Check semantic cache — skip when churchYearMode is active (context differs per Sunday)
    if (!churchYearMode) {
      const { data: cacheHit } = await supabase.rpc("match_cache", {
        query_embedding: queryEmbedding,
      });
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
          },
        });
      }
    }

    // 1c. Fetch church year texts if mode is active
    let churchYearDay: ChurchYearDay | null = null;
    let churchYearVerses: { otText: string; epistleText: string; gospelText: string } | null = null;
    if (churchYearMode) {
      const today = extractDateFromMessage(lastUserMessage.content) ?? new Date().toISOString().slice(0, 10);
      const { data: cyDay } = await supabase
        .from("church_year_day")
        .select("*")
        .eq("series", series ?? "dnk")
        .lte("dato", today)
        .order("dato", { ascending: false })
        .limit(1)
        .single();
      if (cyDay) {
        churchYearDay = cyDay as ChurchYearDay;
        churchYearVerses = await fetchChurchYearVerses(churchYearDay);
      }
    }

    // 2. Semantic search: top 5 matching verses
    const { data: matchedVerses, error: rpcError } = await supabase.rpc(
      "match_verses",
      { query_embedding: queryEmbedding, match_count: 5 },
    );

    if (rpcError || !matchedVerses || matchedVerses.length === 0) {
      return Response.json({ error: "Verse lookup failed" }, { status: 500 });
    }

    // 3. Fetch surrounding verses + foross.no posts + podcasts in parallel
    const orFilter = (matchedVerses as MatchedVerse[])
      .map(
        (v) =>
          `and(newname.eq.${v.newname},chapternumber.eq.${v.chapternumber},versenumber.gte.${v.versenumber - 3},versenumber.lte.${v.versenumber + 3})`,
      )
      .join(",");

    const flatIds = await resolveBibleChapterIds(matchedVerses as MatchedVerse[]);

    const [{ data: surrounding }, forossPosts, forossPodcasts] = await Promise.all([
      supabase
        .from("verse_chapter_book_references")
        .select(
          "newname, chapternumber, versenumber, versecontent, newname_reference",
        )
        .or(orFilter)
        .order("chapternumber")
        .order("versenumber"),
      fetchForossPosts(flatIds),
      fetchForossPodcasts(flatIds, lastUserMessage.content),
    ]);

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
    const churchYearRuleNumber = churchYearDay ? (hasForossContent ? 9 : 7) : null;

    // 6. System prompt
    const systemPrompt = `Du er en bibelveileder som hjelper mennesker å utforske Bibelen på norsk.
Du har tilgang til følgende bibelvers som er relevante for spørsmålet:

${contextString}
${churchYearSection}${forossPostsString ? `\nRelevante artikler fra foross.no:\n${forossPostsString}\n` : ""}${forossPodcastsString ? `\nRelevante episoder fra foross.no:\n${forossPodcastsString}\n` : ""}
REGLER DU MÅ FØLGE:
1. Ta utgangspunkt i versene som er gitt ovenfor, men du kan fritt trekke inn andre relevante vers fra hele Bibelen – både Gamle og Nye testamente – når det beriker svaret.
2. Sitér alltid referansen (bok, kapittel og vers) når du bruker et vers, f.eks. "Johannes 3:16". Når du siterer eller omtaler innholdet i et vers, gjengi det alltid nøyaktig og korrekt – aldri parafraser eller oppsummer versteksten med egne ord.
3. Vær respektfull, omsorgsfull og tydelig i alle svar.
4. Svar alltid på norsk.
5. Ikke gjør tolkninger. Fortel gjerne om kontekst, historie etc. men aldri tolkning eller utlegging.
6. Du skal ikke tolke, mene eller fortelle dine synspunkt.
${forossRuleNumber ? `${forossRuleNumber}. Hvis en foross.no-artikkel eller episode er relevant, vev lenken naturlig inn i den løpende teksten der den hører hjemme. Ikke legg den i en egen avsluttende seksjon eller liste. Formater lenken alltid som en Markdown-hyperlenke: [tittel](url).` : ""}
${churchYearRuleNumber ? `${churchYearRuleNumber}. Du har fått søndagens tre tekster fra kirkeåret. Beskriv gjerne tematiske forbindelser mellom GT-teksten, epistelen og evangeliet — hva slags tekster det er, hvem som taler, og hva de sier til hverandre. Ikke tolk eller utlegg.` : ""}

FORMATERING:
- Bruk Markdown i alle svar.
- Når du siterer et bibelvers direkte, legg det i en blokksitering (>) og kursiver selve versteksten, slik: > *«Teksten her.»* — Referanse
- Bruk **fet tekst** for å fremheve nøkkelord eller temaer.
- Del opp svaret med tydelige avsnitt. Bruk gjerne en kort ##-overskrift hvis svaret dekker flere temaer.
- Hold setningene korte og luftige. Unngå lange, tette avsnitt.
`;

    // 7. Stream chat completion
    const HISTORY_LIMIT = 15;
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
          await supabase.from("query_cache").insert({
            query_text: lastUserMessage.content,
            embedding: queryEmbedding,
            response: fullResponse,
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
      "X-Foross-Posts": Buffer.from(JSON.stringify(forossPosts)).toString("base64"),
      "X-Foross-Podcasts": Buffer.from(JSON.stringify(forossPodcasts)).toString("base64"),
      ...(churchYearDay
        ? { "X-Church-Year-Day": Buffer.from(JSON.stringify(churchYearDay)).toString("base64") }
        : {}),
    });

    return new Response(stream, { headers });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
