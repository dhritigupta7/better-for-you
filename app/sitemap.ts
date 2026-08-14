import { MetadataRoute } from "next";
import { createReaderClient } from "@/lib/supabase/server";

const BASE_URL = "https://foodpharmer.health";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = createReaderClient();

  const [{ data: cats }, { data: prods }, { data: brandsWithLive }] = await Promise.all([
    sb.from("categories").select("slug, created_at").eq("active", true),
    sb
      .from("products")
      .select("slug, updated_at, brand_id, category:categories(slug)")
      .eq("status", "Live"),
    sb
      .from("brands")
      .select("slug, id, created_at")
      .eq("is_excluded", false),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/criteria",
    "/v/restaurants",
    "/search",
    "/b",
    "/oil-board",
  ].map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  const catPages: MetadataRoute.Sitemap = (cats ?? []).map((c) => ({
    url: `${BASE_URL}/c/${c.slug}`,
    lastModified: new Date(c.created_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const prodPages: MetadataRoute.Sitemap = (prods ?? [])
    .map((p) => {
      const cat = p.category as { slug: string } | { slug: string }[] | null;
      const catSlug = Array.isArray(cat) ? cat[0]?.slug : cat?.slug;
      if (!catSlug) return null;
      return {
        url: `${BASE_URL}/c/${catSlug}/${p.slug}`,
        lastModified: new Date(p.updated_at),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Only include brands that have at least one Live product — empty brand
  // pages 404 anyway, no point indexing them.
  const liveBrandIds = new Set((prods ?? []).map((p) => p.brand_id).filter(Boolean));
  const brandPages: MetadataRoute.Sitemap = (brandsWithLive ?? [])
    .filter((b) => liveBrandIds.has(b.id))
    .map((b) => ({
      url: `${BASE_URL}/b/${b.slug}`,
      lastModified: new Date(b.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

  return [...staticPages, ...catPages, ...prodPages, ...brandPages];
}
