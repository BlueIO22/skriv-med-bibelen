import OpenAI from "openai";
import { NextRequest } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    max_tokens: 350,
    messages: [
      {
        role: "system",
        content:
          "Du er en teologisk assistent for norske prester i Den norske kirke. " +
          "Forklar den valgte teksten kortfattet og presist på norsk. " +
          "Gi teologisk kontekst og praktisk innsikt for forkynnelse. " +
          "Svar direkte uten innledende fraser som «Teksten handler om» – kom rett til saken. " +
          "Svar med maks 3 setninger.",
      },
      {
        role: "user",
        content: `Forklar denne teksten:\n\n${text}`,
      },
    ],
  });

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) controller.enqueue(new TextEncoder().encode(delta));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
