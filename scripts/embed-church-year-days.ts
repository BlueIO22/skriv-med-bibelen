import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const { data: rows, error } = await supabase
    .from("church_year_day")
    .select("id, sunday_name")
    .is("embedding", null);

  if (error) {
    console.error("Failed to fetch rows:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("Nothing to do — all rows already have embeddings.");
    return;
  }

  console.log(`Embedding ${rows.length} church year day names...`);

  // Embed all in one call — the list is small enough
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: rows.map((r) => r.sunday_name),
    dimensions: 512,
  });

  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    const { error: updateError } = await supabase
      .from("church_year_day")
      .update({ embedding: response.data[i].embedding })
      .eq("id", rows[i].id);

    if (updateError) {
      console.error(`Failed to update ${rows[i].sunday_name}:`, updateError.message);
    } else {
      ok++;
      console.log(`  ✓ ${rows[i].sunday_name}`);
    }
  }

  console.log(`\nDone. ${ok}/${rows.length} embeddings written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
