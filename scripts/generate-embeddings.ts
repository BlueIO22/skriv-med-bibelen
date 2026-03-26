import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const BATCH_SIZE = 50;
const DELAY_MS = 200; // delay between batches to avoid rate limits

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTextForRow(row: Record<string, unknown>): string {
  // e.g. "1. Mosebok 1:1 – I begynnelsen skapte Gud himmelen og jorden."
  return `${row.newname} ${row.chapternumber}:${row.versenumber} – ${row.versecontent}`;
}

async function main() {
  // Count total rows needing embeddings
  const { count, error: countError } = await supabase
    .from("verse_chapter_book_references")
    .select("*", { count: "exact", head: true })
    .is("embedding", null);

  if (countError) {
    console.error("Failed to count rows:", countError.message);
    process.exit(1);
  }

  const total = count ?? 0;
  console.log(`Found ${total} rows without embeddings.`);
  if (total === 0) {
    console.log("Nothing to do.");
    return;
  }

  let processed = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("verse_chapter_book_references")
      .select("*")
      .is("embedding", null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Failed to fetch rows:", error.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    const texts = rows.map(buildTextForRow);

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
      dimensions: 512,
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const embedding = embeddingResponse.data[i].embedding;

      const { error: updateError } = await supabase
        .from("verse_chapter_book_references")
        .update({ embedding })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Failed to update row ${row.id}:`, updateError.message);
      } else {
        processed++;
        process.stdout.write(`\r${processed}/${total} embeddings generated`);
      }
    }

    if (rows.length < BATCH_SIZE) break;
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${processed} embeddings written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
