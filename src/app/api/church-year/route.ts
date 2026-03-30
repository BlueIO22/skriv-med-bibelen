import { supabase } from "@/lib/supabase";
import { sanity } from "@/lib/sanity";
import type { ForossPost, ForossPodcast } from "@/app/api/chat/route";

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

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const series = searchParams.get("series") ?? "dnk";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const { data: day, error } = await supabase
    .from("church_year_day")
    .select("*")
    .eq("series", series)
    .lte("dato", date)
    .order("dato", { ascending: false })
    .limit(1)
    .single();

  if (error || !day) {
    return Response.json({ error: "No church year day found" }, { status: 404 });
  }

  const churchYearDay = day as ChurchYearDay;

  const [posts, podcasts] = await Promise.all([
    sanity.fetch<ForossPost[]>(
      `*[_type == "post" && references($id)] | order(publishedAt desc) {
        title,
        slug,
        mainImage { asset -> { url } },
        "section": section -> { title, slug },
        "authors": authors[] -> { name }
      }[0...5]`,
      { id: churchYearDay.id },
    ),
    sanity.fetch<ForossPodcast[]>(
      `*[_type == "podcast" && references($id)] | order(publishedAt desc) {
        _id,
        title,
        "section": section -> { title, slug },
        "authors": authors[] -> { name },
        "series": series -> { slug }
      }[0...5]`,
      { id: churchYearDay.id },
    ),
  ]);

  return Response.json({
    day: churchYearDay,
    posts: posts ?? [],
    podcasts: podcasts ?? [],
  });
}
