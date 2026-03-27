import { supabase } from "@/lib/supabase";
import { sanity } from "@/lib/sanity";
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

export async function POST(req: Request): Promise<Response> {
  try {
    const { messages }: { messages: Message[] } = await req.json();

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

    // 1b. Check semantic cache — skip LLM entirely if we have a close match
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

    // 6. System prompt
    const systemPrompt = `Du er en bibelveileder som hjelper mennesker å utforske Bibelen på norsk.
Du har tilgang til følgende bibelvers som er relevante for spørsmålet:

${contextString}
${forossPostsString ? `\nRelevante artikler fra foross.no:\n${forossPostsString}\n` : ""}${forossPodcastsString ? `\nRelevante episoder fra foross.no:\n${forossPodcastsString}\n` : ""}
REGLER DU MÅ FØLGE:
1. Ta utgangspunkt i versene som er gitt ovenfor, men du kan fritt trekke inn andre relevante vers fra hele Bibelen – både Gamle og Nye testamente – når det beriker svaret.
2. Sitér alltid referansen (bok, kapittel og vers) når du bruker et vers, f.eks. "Johannes 3:16".
3. Vær respektfull, omsorgsfull og tydelig i alle svar.
4. Svar alltid på norsk.
5. Ikke gjør tolkninger. Fortel gjerne om kontekst, historie etc. men aldri tolkning eller utlegging.
6. Du skal ikke tolke, mene eller fortelle dine synspunkt.
${hasForossContent ? `7. Hvis en foross.no-artikkel eller episode er relevant, nevn den gjerne kort og naturlig i svaret. Formater lenken alltid som en Markdown-hyperlenke: [tittel](url).` : ""}

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
      model: "gpt-4.1-mini",
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
    });

    return new Response(stream, { headers });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
