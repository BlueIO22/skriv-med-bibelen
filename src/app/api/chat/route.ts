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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      const chunk = JSON.stringify({ choices: [{ delta: { content: cached }, index: 0 }] });
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

    // 3. Fetch all surrounding verses in a single query (±3 verses per match)
    const orFilter = (matchedVerses as MatchedVerse[])
      .map(
        (v) =>
          `and(newname.eq.${v.newname},chapternumber.eq.${v.chapternumber},versenumber.gte.${v.versenumber - 3},versenumber.lte.${v.versenumber + 3})`,
      )
      .join(",");

    const { data: surrounding } = await supabase
      .from("verse_chapter_book_references")
      .select(
        "newname, chapternumber, versenumber, versecontent, newname_reference",
      )
      .or(orFilter)
      .order("chapternumber")
      .order("versenumber");

    const surroundingRows = (surrounding ?? []) as VerseRow[];

    // 4. Build context string: group surrounding rows by each matched verse
    const contextString = (matchedVerses as MatchedVerse[])
      .map((match) => {
        const passage = surroundingRows.filter(
          (row) =>
            row.newname === match.newname &&
            row.chapternumber === match.chapternumber &&
            row.versenumber >= match.versenumber - 3 &&
            row.versenumber <= match.versenumber + 3,
        );
        const lines = passage.map(
          (row) => `[${row.newname_reference}] ${row.versecontent}`,
        );
        return lines.join("\n");
      })
      .join("\n\n");

    // 5. System prompt in Norwegian
    const systemPrompt = `Du er en bibelveileder som hjelper mennesker å utforske Bibelen på norsk.
Du har tilgang til følgende bibelvers som er relevante for spørsmålet:

${contextString}

REGLER DU MÅ FØLGE:
1. Svar KUN basert på versene som er gitt ovenfor. Bruk ikke kunnskap utenfor disse versene.
2. Sitér alltid referansen (bok, kapittel og vers) når du bruker et vers, f.eks. "Johannes 3:16".
3. Hvis versene ikke gir nok grunnlag til å svare, si det ærlig på norsk.
4. Vær respektfull, omsorgsfull og tydelig i alle svar.
5. Svar alltid på norsk.
6. Ikke gjør tolkninger. Fortel gjerne om kontekst, historie etc. men aldri tolkning eller utlegging.
7. Du skal ikke tolke, mene eller fortelle dine synspunkt.
`;
 

    // 6. Stream chat completion (keep last 6 messages for context)
    const HISTORY_LIMIT = 10;
    const recentMessages = messages.slice(-HISTORY_LIMIT);
    const chatStream = openai.chat.completions.stream({
      model: "gpt-4.1-mini",
      messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
    });

    // Save response to cache after streaming completes (fire and forget)
    let fullResponse = "";
    chatStream.on("content", (delta: string) => { fullResponse += delta; });
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

    return new Response(chatStream.toReadableStream(), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
