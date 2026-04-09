import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Message = { role: "user" | "assistant"; content: string };

type SermonContext = {
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
};

type Step =
  | "tekststudie"
  | "forbindelser"
  | "disposisjon"
  | "utkast"
  | "samtale"
  | "generer-utkast";

// ── Shared instructions ────────────────────────────────────────────────────────

const BIBLE_REF_INSTRUCTION = `Når du nevner bibelreferanser, bruk alltid standard norsk format: Bok kapittel:vers (f.eks. Joh 3:16, Rom 8:1-4, 1. Kor 15:3, 1. Joh 1:1, 1. Johannes 1:1). Bøker med nummer skrives alltid med punktum etter nummeret: «1. Kor», «1. Pet», «1. Joh», «2. Sam», «1. Johannes» osv. Skriv ALDRI «1 Johannes» (uten punktum) – alltid «1. Johannes». Ta alltid med vers der det er mulig, dvs. «1. Johannes 1:1» ikke bare «1. Johannes 1».`;

const DNK_IDENTITY =
  "Du er en teologisk samtalepartner for en prest i Den norske kirke (DNK) eller i en annen forsamling.";

// ── Step prompts ───────────────────────────────────────────────────────────────

const STEP_PROMPTS: Record<Step, string> = {
  tekststudie: `${DNK_IDENTITY}
Presten er i ferd med å forberede en preken og jobber med eksegese av søndagens tekster.
Din rolle er å hjelpe presten tenke – ikke å overta tenkearbeidet.

Slik arbeider du:
- Svar på det presten spør om, presist og konkret
- Still gjerne oppfølgingsspørsmål som hjelper presten komme dypere inn i teksten
- Pek på ting presten kanskje ikke har lagt merke til: tekstkritiske poenger, ordvalg i grunnteksten, historisk kontekst, litterær struktur
- Dersom presten deler egne tolkninger, engasjer deg med dem – hverken avvis eller bekreft ureflektert
- Vær ærlig om usikkerhet og tolkningsuenighet i tradisjonen
- ${BIBLE_REF_INSTRUCTION}

Du er en faglig ressurs, ikke en forfatter. Svar alltid på norsk.`,

  forbindelser: `${DNK_IDENTITY}
Presten utforsker bibelske forbindelser og tematiske paralleller for søndagens tekster.
Din rolle er å hjelpe presten oppdage – ikke å presentere en ferdig liste.

Slik arbeider du:
- Svar på konkrete spørsmål om paralleller, typologi eller bibelske ekkokammer
- Forklar den teologiske sammenhengen dersom presten ber om det
- Spør gjerne: "Hva tenker du om denne forbindelsen?" eller "Passer dette inn i det du vil formidle?"
- Gjør presten oppmerksom på forbindelser som kan overraske eller utfordre
- Frelseshistorisk perspektiv (skapelse – fall – forløsning – fornyelse) er relevant, men ikke det eneste
- ${BIBLE_REF_INSTRUCTION}

Du er en guide, ikke en katalog. Svar alltid på norsk.`,

  disposisjon: `Du er en homiletisk samtalepartner for en prest i Den norske kirke (DNK).
Presten er i ferd med å forme en predikensdisposisjon og trenger hjelp til å tenke strukturelt.
Din rolle er å stille gode spørsmål og utfordre svake valg – ikke å levere en ferdig disposisjon.

Slik arbeider du:
- Hjelp presten avklare: Hva er det ene budskapet i denne prekenen?
- Still spørsmål som: "Hva vil du at menigheten skal sitte igjen med?" eller "Hva er spenningen du vil løse opp?"
- Pek på strukturelle svakheter dersom presten deler noe og ber om tilbakemelding
- Foreslå illustrasjoner eller bilder kun dersom presten spør eksplisitt
- Presten bestemmer form og struktur
- ${BIBLE_REF_INSTRUCTION}

Du er en homiletisk veileder, ikke en forfatter. Svar alltid på norsk.`,

  utkast: `Du er en homiletisk samtalepartner for en prest i Den norske kirke (DNK).
Presten skriver sin preken. Du hjelper – du skriver ikke.

Din rolle:
- Når presten deler tekst: gi konkret, ærlig tilbakemelding. Si hva som fungerer og hva som ikke fungerer, og forklar hvorfor.
- Når presten er fast: still spørsmål som hjelper dem løsne, ikke skriv løsningen for dem
- Når presten ber om forslag til et konkret ord, bilde eller formulering: gi to–tre alternativer kort, og la presten velge
- Aldri generer et helt avsnitt eller en hel preken med mindre presten eksplisitt ber om det og du advarer om at dette er et utkast de selv må omforme
- Vær ærlig: om noe høres ut som en klisjé, si det. Om setningen er for lang, si det. Om teologien henger feil, si det.
- ${BIBLE_REF_INSTRUCTION}

Du er en kritisk venn, ikke en ghostwriter. Svar alltid på norsk.`,

  samtale: `${DNK_IDENTITY}
Presten er i gang med å forberede en preken og kan komme med alle slags spørsmål underveis.

Din rolle er å være en god samtalepartner:
- Svar direkte og presist på det presten spør om
- Still spørsmål tilbake dersom du ikke forstår hva presten trenger
- Vær faglig konkret: historisk kontekst, teologiske perspektiver, bibelske paralleller, homiletiske råd
- Utfordre premisser dersom det trengs – vær ærlig, ikke bare bekreftende
- Hjelp presten tenke, ikke tenk for dem
- ${BIBLE_REF_INSTRUCTION}

Du har tilgang til søndagens tekster, relevante bibelvers funnet via søk, og prestens arbeid i de ulike stegene av forberedelsen (se under).
Svar alltid på norsk.`,

  "generer-utkast": `Du er en homiletisk assistent for en prest i Den norske kirke (DNK).
Presten har gjort forberedelsesarbeid og ber nå om et komplett første utkast til en preken.

Din oppgave:
- Skriv et komplett prekenuttkast på norsk, basert på prestens notater fra tekststudie, forbindelser og disposisjon
- Skriv i en naturlig, talt norsk stil – teksten skal fremføres, ikke leses
- Følg disposisjonen der den er tydelig – og fyll den ut med teologisk substans og konkrete bilder
- En god preken har: en åpning som setter inn i teksten, en klar teologisk bevegelse, og en avslutning som sender menigheten ut med noe å bære med seg
- Lengde: ca. 1000–1500 ord
- Bruk overskrifter (## for hoveddeler) for å strukturere teksten
- ${BIBLE_REF_INSTRUCTION}

Bruk prestens eget materiale aktivt. Respekter de teologiske valgene presten har gjort.
Dette er et arbeidsutkast – presten vil selv omforme og eie teksten. Svar alltid på norsk.`,
};

async function findRelatedVerses(query: string): Promise<string> {
  try {
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 512,
    });
    const embedding = embeddingRes.data[0].embedding;

    const { data, error } = await supabase.rpc("match_verses", {
      query_embedding: embedding,
      match_count: 5,
    });

    if (error) {
      console.error("[sermon/chat] match_verses error:", error);
      return "";
    }
    if (!data || data.length === 0) return "";

    const rows = data as Array<{
      newname_reference: string;
      versenumber: number;
      versecontent: string;
    }>;

    const lines = rows
      .map(
        (r) => `${r.newname_reference} v.${r.versenumber}: ${r.versecontent}`,
      )
      .join("\n");

    return `\n---\nRELEVANTE BIBELVERS FRA DATABASEN\n${lines}\n---`;
  } catch (e) {
    console.error("[sermon/chat] findRelatedVerses failed:", e);
    return "";
  }
}

function buildSystemPrompt(
  step: Step,
  ctx: SermonContext,
  relatedVerses: string,
): string {
  const stepInstruction = STEP_PROMPTS[step];

  const contextBlock = `
---
SØNDAGENS KONTEKST
Dato: ${ctx.dato}
Kirkeårdag: ${ctx.sunday_name}
Tekstrekke: ${ctx.tekstrekke} | Serie: ${ctx.series}

DAGENS TEKSTER

Gammeltestamentlig tekst – ${ctx.ot_reference ?? "ikke angitt"}:
${ctx.otText || "(Ingen tekst funnet)"}

Episteltekst – ${ctx.epistle_reference ?? "ikke angitt"}:
${ctx.epistleText || "(Ingen tekst funnet)"}

Evangelietekst – ${ctx.gospel_reference ?? "ikke angitt"}:
${ctx.gospelText || "(Ingen tekst funnet)"}
---`;

  const prevNotes: string[] = [];

  if (step === "generer-utkast") {
    // Include all preparatory notes for draft generation
    if (ctx.tekststudieNotes?.trim())
      prevNotes.push(`TEKSTSTUDIENOTATER:\n${ctx.tekststudieNotes}`);
    if (ctx.forbindelserNotes?.trim())
      prevNotes.push(`FORBINDELSESNOTATER:\n${ctx.forbindelserNotes}`);
    if (ctx.disposisjonNotes?.trim())
      prevNotes.push(`DISPOSISJON:\n${ctx.disposisjonNotes}`);
  } else {
    if (ctx.tekststudieNotes?.trim() && step !== "tekststudie") {
      prevNotes.push(`TEKSTSTUDIENOTATER:\n${ctx.tekststudieNotes}`);
    }
    if (
      ctx.forbindelserNotes?.trim() &&
      (step === "disposisjon" || step === "utkast" || step === "samtale")
    ) {
      prevNotes.push(`FORBINDELSESNOTATER:\n${ctx.forbindelserNotes}`);
    }
    if (
      ctx.disposisjonNotes?.trim() &&
      (step === "utkast" || step === "samtale")
    ) {
      prevNotes.push(`DISPOSISJON:\n${ctx.disposisjonNotes}`);
    }
  }

  const notesBlock =
    prevNotes.length > 0
      ? `\n---\nARBEID FRA TIDLIGERE STEG\n${prevNotes.join("\n\n")}\n---`
      : "";

  return `${stepInstruction}\n${contextBlock}${relatedVerses}${notesBlock}`;
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const {
    step,
    context,
    messages,
  }: { step: Step; context: SermonContext; messages: Message[] } = body;

  if (!step || !context || !messages) {
    return Response.json({ error: "Manglende felt" }, { status: 400 });
  }

  // Use the last user message as the search query for related verses
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const relatedVerses = lastUserMessage
    ? await findRelatedVerses(lastUserMessage)
    : "";

  const systemPrompt = buildSystemPrompt(step, context, relatedVerses);

  const stream = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    stream: true,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: step === "generer-utkast" ? 4000 : 2000,
    temperature: 0.7,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
