import { supabase } from "@/lib/supabase";

export type DayResult = {
  dato: string;
  sunday_name: string;
  tekstrekke: number;
};

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const series = searchParams.get("series") ?? "dnk";

  let query = supabase
    .from("church_year_day")
    .select("dato, sunday_name, tekstrekke")
    .eq("series", series)
    .not("dato", "is", null)
    .not("sunday_name", "is", null)
    .order("dato", { ascending: true })
    .order("tekstrekke", { ascending: true })
    .limit(1000);

  if (q) {
    query = query.ilike("sunday_name", `%${q}%`);
  }

  const { data } = await query;

  // Deduplicate: one entry per dato (keep first tekstrekke)
  const seen = new Set<string>();
  const days: DayResult[] = [];
  for (const row of data ?? []) {
    if (!seen.has(row.dato)) {
      seen.add(row.dato);
      days.push(row as DayResult);
    }
  }

  return Response.json({ days });
}
