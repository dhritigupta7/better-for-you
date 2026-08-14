import { notFound } from "next/navigation";
import Link from "next/link";
import { createReaderClient } from "@/lib/supabase/server";
import { visibleProductStatuses } from "@/lib/products/visibility";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import NewRibbon from "@/components/NewRibbon";

const SITE_URL = "https://foodpharmer.health";

export const revalidate = 3600;

// Prerender every non-excluded brand page to the edge cache instead of
// rendering on demand. New brands still render on demand and cache after the
// first hit (dynamicParams defaults to true).
export async function generateStaticParams() {
  const sb = createReaderClient();
  const { data } = await sb.from("brands").select("slug, is_excluded");
  return ((data ?? []) as { slug: string; is_excluded: boolean }[])
    .filter((b) => !b.is_excluded)
    .map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = createReaderClient();
  const { data: brand } = await sb
    .from("brands")
    .select("name, website_url, is_excluded")
    .eq("slug", slug)
    .single();
  if (!brand || brand.is_excluded) return {};
  return {
    title: `${brand.name} — Better for You picks`,
    description: `Every ${brand.name} product currently on our better-for-you list, with the criteria we used to pick them.`,
    alternates: {
      canonical: `${SITE_URL}/b/${slug}`,
    },
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = createReaderClient();

  const { data: brand } = await sb
    .from("brands")
    .select("id, slug, name, website_url, is_excluded")
    .eq("slug", slug)
    .single();
  if (!brand || brand.is_excluded) notFound();

  const { data: products } = await sb
    .from("products")
    .select(
      "id, slug, name, product_photo_url, is_new, certification_method, category:categories(slug,name)"
    )
    .eq("brand_id", brand.id)
    .in("status", visibleProductStatuses() as string[])
    .order("name", { ascending: true });

  type Prod = {
    id: number;
    slug: string;
    name: string;
    product_photo_url: string | null;
    is_new: boolean;
    certification_method: string;
    category: { slug: string; name: string } | { slug: string; name: string }[] | null;
  };
  const live = (products ?? []) as unknown as Prod[];

  // Group by category so the brand page reads as "X has these biscuits, these
  // peanut butters, …" — much more useful than a flat list.
  const byCategory = new Map<string, { catSlug: string; catName: string; items: Prod[] }>();
  for (const p of live) {
    const cat = Array.isArray(p.category) ? p.category[0] : p.category;
    if (!cat?.slug || !cat?.name) continue;
    const bucket = byCategory.get(cat.slug) ?? { catSlug: cat.slug, catName: cat.name, items: [] };
    bucket.items.push(p);
    byCategory.set(cat.slug, bucket);
  }
  const groups = [...byCategory.values()].sort((a, b) => a.catName.localeCompare(b.catName));

  // schema.org/Brand JSON-LD + ItemList of all approved products.
  const brandLd = {
    "@context": "https://schema.org",
    "@type": "Brand",
    "@id": `${SITE_URL}/b/${slug}#brand`,
    name: brand.name,
    ...(brand.website_url ? { url: brand.website_url } : {}),
  };
  const listLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${brand.name} — Better for You picks`,
    url: `${SITE_URL}/b/${slug}`,
    numberOfItems: live.length,
    itemListElement: live.slice(0, 30).map((p, i) => {
      const cat = Array.isArray(p.category) ? p.category[0] : p.category;
      return {
        "@type": "ListItem",
        position: i + 1,
        url: cat?.slug
          ? `${SITE_URL}/c/${cat.slug}/${p.slug}`
          : `${SITE_URL}/c/_/${p.slug}`,
        item: {
          "@type": "Product",
          name: p.name,
          brand: { "@id": `${SITE_URL}/b/${slug}#brand` },
          ...(p.product_photo_url
            ? { image: p.product_photo_url.startsWith("http")
                ? p.product_photo_url
                : `${SITE_URL}${p.product_photo_url}` }
            : {}),
        },
      };
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(brandLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listLd) }}
      />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none w-full max-w-[1100px] mx-auto px-5 sm:px-10 py-10 sm:py-16 relative z-10">
        <nav className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink-mute)]">
          <Link
            href="/"
            className="hover:text-[color:var(--accent-deep)] transition-colors"
          >
            ← All categories
          </Link>
        </nav>

        <header className="mt-8 pb-8 border-b rule">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)]">
            Brand
          </p>
          <h1 className="mt-3 font-display text-5xl sm:text-7xl tracking-[-0.02em] leading-[0.95]">
            {brand.name}
          </h1>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)]">
            {live.length} {live.length === 1 ? "pick" : "picks"} across {groups.length}{" "}
            {groups.length === 1 ? "category" : "categories"}
          </p>
          {brand.website_url && (
            <a
              href={brand.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] underline hover:text-[color:var(--accent-deep)]"
            >
              Visit {brand.name} →
            </a>
          )}
        </header>

        {live.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="font-display text-2xl text-[color:var(--ink-soft)]">
              No {brand.name} products are currently on our list.
            </p>
            <p className="mt-4 text-[color:var(--ink-soft)]">
              That can mean they don&rsquo;t yet meet our criteria, or that we
              haven&rsquo;t reviewed them yet.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.catSlug} className="mt-12">
              <div className="flex items-end justify-between border-b rule pb-3 mb-6">
                <h2 className="font-display text-3xl tracking-[-0.02em]">
                  {g.catName}
                </h2>
                <Link
                  href={`/c/${g.catSlug}`}
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] hover:text-[color:var(--accent-deep)] transition-colors"
                >
                  All {g.catName.toLowerCase()} →
                </Link>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/c/${g.catSlug}/${p.slug}`}
                      className="relative block bg-[color:var(--bg-elev)] overflow-hidden group transition-all duration-300 hover:shadow-[0_22px_60px_-30px_rgba(0,0,0,0.32)]"
                    >
                      <div className="relative h-56 flex items-center justify-center overflow-hidden">
                        {p.is_new && <NewRibbon />}
                        {p.product_photo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={p.product_photo_url}
                            alt={p.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-contain p-3"
                          />
                        ) : (
                          <span className="font-display italic text-2xl text-[color:var(--ink-mute)]/50">
                            {brand.name}
                          </span>
                        )}
                      </div>
                      <div className="p-4 border-t rule">
                        <h3 className="font-display text-xl tracking-[-0.02em] leading-tight text-[color:var(--ink)] group-hover:text-[color:var(--accent-deep)] transition-colors">
                          {p.name}
                        </h3>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      <SiteFooter />
    </>
  );
}
