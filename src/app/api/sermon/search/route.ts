import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type BibleSearchResult = {
  reference: string;
  versenumber: number;
  versecontent: string;
  similarity: number;
};

export type BibleSearchResponse = {
  results: BibleSearchResult[];
};

export async function POST(req: Request): Promise<Response> {
  const { query } = await req.json();
  if (!query?.trim()) {
    return Response.json({ results: [] });
  }

  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query.trim(),
    dimensions: 512,
  });

  const embedding = embeddingRes.data[0].embedding;

  const { data, error } = await supabase.rpc("match_verses", {
    query_embedding: embedding,
    match_count: 6,
  });

  if (error || !data) {
    return Response.json({ results: [] }, { status: 500 });
  }

  const results: BibleSearchResult[] = (data as Array<{
    newname_reference: string;
    versenumber: number;
    versecontent: string;
    similarity: number;
  }>).map((r) => ({
    reference: r.newname_reference,
    versenumber: r.versenumber,
    versecontent: r.versecontent,
    similarity: r.similarity,
  }));

  return Response.json({ results });
}
