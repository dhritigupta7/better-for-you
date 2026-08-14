import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createReaderClient } from "@/lib/supabase/server";
import {
  getLiveProductsForCategory,
  getAllVisibleCategorySlugs,
} from "@/lib/products/queries";
import {
  previewCategoriesEnabled,
  STAGING_CATEGORY_ORDER_MIN,
} from "@/lib/categories/visibility";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CriteriaBlock from "@/components/CriteriaBlock";
import CrossCategoryNav from "@/components/CrossCategoryNav";
import NewRibbon from "@/components/NewRibbon";

export const revalidate = 3600;

// Prerender every visible category so /c/[category] is served from the edge
// cache, not rendered on demand (this route was the single biggest source of
// function invocations). New/unlisted categories still render on demand
// (dynamicParams defaults to true) and cache after the first hit.
export async function generateStaticParams() {
  const slugs = await getAllVisibleCategorySlugs();
  return slugs.map((category) => ({ category }));
}

const SITE_URL = "https://foodpharmer.health";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const sb = createReaderClient();
  const { data: cat } = await sb
    .from("categories")
    .select("name, blurb, active")
    .eq("slug", slug)
    .single();
  if (!cat || !cat.active) return {};
  // Title is just the category name; the layout template appends
  // "| Better for You by Food Pharmer". No per-category description, and never
  // any health-claim words ("healthier"/"cleaner") in user-visible copy.
  const title = cat.name;
  return {
    title,
    alternates: { canonical: `${SITE_URL}/c/${slug}` },
    openGraph: {
      title,
      type: "website",
      url: `${SITE_URL}/c/${slug}`,
    },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;

  // "bread" is a wrapper parent with no products of its own — send visitors to
  // the first variant section.
  if (slug === "bread") redirect("/c/bread-multigrain");
  // "popcorn" is a wrapper parent with no products of its own.
  if (slug === "popcorn") redirect("/c/popcorn-whole-kernels");

  const sb = createReaderClient();
  const { data: cat } = await sb
    .from("categories")
    .select("id, slug, name, blurb, active, display_order, curator_note")
    .eq("slug", slug)
    .single();
  // Env-aware visibility: prod shows only active categories; staging also shows
  // sentinel (display_order >= STAGING_CATEGORY_ORDER_MIN) preview categories.
  const catVisible =
    cat &&
    (cat.active ||
      (previewCategoriesEnabled() &&
        (cat.display_order ?? 0) >= STAGING_CATEGORY_ORDER_MIN));
  if (!cat || !catVisible) notFound();

  const rawProducts = await getLiveProductsForCategory(slug);

  // Explicit per-category display order. Everything else sorts alphabetically
  // by brand (default from getLiveProductsForCategory). Peanut butter keeps a
  // curated order per Food Pharmer's video.
  const orderBySlug: Record<string, string[]> = {
    "peanut-butter": [
      "alpino-natural-pb-crunch",
      "muscleblaze-high-protein-pb-crunchy",
      "myfitness-unsweetened-crunchy-pb",
      "the-whole-truth-unsweetened-pb-crunchy",
      "pintola-all-natural-crunchy-pb",
      "pintola-high-protein-pb",
      "butternutco-natural-creamy-pb",
    ],
    // Regular rolled oats — alphabetical by brand, Kellogg's pinned last.
    oats: [
      "pintola-rolled-oats",
      "quaker-rolled-oats",
      "saffola-rolled-oats",
      "true-elements-rolled-oats",
      "yoga-bar-rolled-oats",
      "kelloggs-rolled-oats",
    ],
  };
  const order = orderBySlug[slug];
  const products = order
    ? [...rawProducts].sort((a, b) => {
        const ai = order.indexOf(a.slug);
        const bi = order.indexOf(b.slug);
        // Unknown slugs sink to the bottom, preserving relative order
        return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
      })
    : rawProducts;

  // Subcategory groupings — currently none
  const subgroupsBySlug: Record<string, { label: string; productSlugs: string[] }[]> = {};
  const subgroups = subgroupsBySlug[slug];
  const groupedSlugs = new Set(subgroups?.flatMap((g) => g.productSlugs));
  const ungrouped = subgroups
    ? products.filter((p) => !groupedSlugs.has(p.slug))
    : [];

  // schema.org/ItemList JSON-LD — Google can render image carousels and
  // "Top results" cards from this. Items reference the product detail
  // pages (which carry their own Product schema).
  const categoryLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cat.name} — Better for You`,
    url: `${SITE_URL}/c/${slug}`,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map((p, i) => {
      const b = Array.isArray(p.brand) ? p.brand[0] : p.brand;
      const brandName = b?.name as string | undefined;
      return {
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/c/${slug}/${p.slug}`,
        item: {
          "@type": "Product",
          name: p.name,
          ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(categoryLd) }}
    />
    <SiteHeader />
    <main id="main" tabIndex={-1} className="outline-none w-full max-w-[1280px] mx-auto px-5 sm:px-10 py-10 sm:py-16 relative z-10">
      <Link
        href="/"
        className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink-mute)] hover:text-[color:var(--accent-deep)] transition-colors"
      >
        ← All categories
      </Link>

      <header className="mt-6 sm:mt-8 pb-8 sm:pb-10 border-b rule">
        <h1 className="font-display text-5xl sm:text-7xl tracking-[-0.02em] leading-[0.95]">
          {cat.name}
        </h1>
        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)]">
          {products.length} {products.length === 1 ? "pick" : "picks"}
        </div>
      </header>

      <div className="mt-8 sm:mt-10">
        <CriteriaBlock
          categoryId={cat.id}
          variant="compact"
          heading="Our criteria"
          note={cat.curator_note}
        />
      </div>

      {(() => {
        const renderCard = (p: typeof products[number]) => {
          const brand = Array.isArray(p.brand) ? p.brand[0] : p.brand;
          const isLab = p.certification_method === "lab_tested";
          return (
            <Link
              key={p.id}
              href={`/c/${slug}/${p.slug}`}
              className="bg-[color:var(--bg-elev)] overflow-hidden block group transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:hover:scale-[1.03] sm:hover:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]"
            >
              <div className="relative h-72 sm:h-80 flex items-center justify-center overflow-hidden">
                {p.is_new && <NewRibbon />}
                {p.product_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.product_photo_url}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain p-3 sm:group-hover:scale-[1.05] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  />
                ) : (
                  <span className="font-display italic text-3xl text-[color:var(--ink-mute)]/50">
                    {brand?.name}
                  </span>
                )}
              </div>
              <div className="p-5">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-2xl sm:text-[28px] tracking-[-0.02em] leading-tight text-[color:var(--ink-soft)]">
                    {brand?.name}
                  </p>
                  <h3 className="font-display text-2xl sm:text-[28px] tracking-[-0.02em] leading-tight text-[color:var(--ink)]">
                    {p.name}
                  </h3>
                </div>
                <div className="mt-4 pt-3 border-t rule flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.22em]">
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      isLab
                        ? "text-[color:var(--lab)]"
                        : "text-[color:var(--ink-mute)]"
                    }`}
                  >
                    {isLab ? (
                      <>
                        <span aria-hidden>🧪</span> Lab tested
                      </>
                    ) : (
                      <>Label reviewed</>
                    )}
                  </span>
                  <span className="text-[color:var(--ink-mute)] group-hover:text-[color:var(--accent-deep)] transition-colors">
                    View →
                  </span>
                </div>
              </div>
            </Link>
          );
        };

        if (subgroups) {
          const bySlug = new Map(products.map((p) => [p.slug, p]));
          return (
            <div className="mt-10 space-y-12 sm:space-y-16">
              {subgroups.map((g) => {
                const items = g.productSlugs
                  .map((s) => bySlug.get(s))
                  .filter((p): p is typeof products[number] => Boolean(p))
                  .sort((a, b) => {
                    const ba = Array.isArray(a.brand) ? a.brand[0] : a.brand;
                    const bb = Array.isArray(b.brand) ? b.brand[0] : b.brand;
                    return (
                      (ba?.name ?? "").localeCompare(bb?.name ?? "") ||
                      a.name.localeCompare(b.name)
                    );
                  });
                if (items.length === 0) return null;
                return (
                  <section key={g.label}>
                    <h2 className="font-display text-3xl sm:text-4xl tracking-[-0.02em] leading-tight mb-1">
                      {g.label}
                    </h2>
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mb-5">
                      {items.length} {items.length === 1 ? "pick" : "picks"}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {items.map(renderCard)}
                    </div>
                  </section>
                );
              })}
              {ungrouped.length > 0 && (
                <section>
                  <h2 className="font-display text-3xl sm:text-4xl tracking-[-0.02em] leading-tight mb-1">
                    Other
                  </h2>
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mb-5">
                    {ungrouped.length} {ungrouped.length === 1 ? "pick" : "picks"}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {ungrouped.map(renderCard)}
                  </div>
                </section>
              )}
            </div>
          );
        }

        return (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map(renderCard)}
          </div>
        );
      })()}

      {products.length === 0 && (
        <p className="mt-12 text-[color:var(--ink-soft)]">No products in this category yet.</p>
      )}

      {slug.startsWith("paneer") && (
        <a
          href="https://youtu.be/zJu117xcs9Y"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 sm:mt-16 pt-10 border-t rule inline-flex items-center gap-2 font-display italic text-lg text-[color:var(--accent-deep)] underline decoration-[color:var(--accent)]/60 underline-offset-4 hover:decoration-[color:var(--accent-deep)]"
        >
          Watch Food Pharmer&rsquo;s full breakdown on common paneer brands.
          <span aria-hidden>→</span>
        </a>
      )}
      {slug === "peanut-butter" && (
        <a
          href="https://youtu.be/5lyGl1X6smk"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 sm:mt-16 pt-10 border-t rule inline-flex items-center gap-2 font-display italic text-lg text-[color:var(--accent-deep)] underline decoration-[color:var(--accent)]/60 underline-offset-4 hover:decoration-[color:var(--accent-deep)]"
        >
          Watch Food Pharmer&rsquo;s full breakdown on common peanut butter brands.
          <span aria-hidden>→</span>
        </a>
      )}
      {slug === "noodles" && (
        <a
          href="https://youtu.be/b_JZuowrBHQ"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 sm:mt-16 pt-10 border-t rule inline-flex items-center gap-2 font-display italic text-lg text-[color:var(--accent-deep)] underline decoration-[color:var(--accent)]/60 underline-offset-4 hover:decoration-[color:var(--accent-deep)]"
        >
          Watch Food Pharmer&rsquo;s full breakdown on common noodle brands.
          <span aria-hidden>→</span>
        </a>
      )}
      {slug.startsWith("bread") && (
        <a
          href="https://youtu.be/z6V_8xJRQWk"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 sm:mt-16 pt-10 border-t rule inline-flex items-center gap-2 font-display italic text-lg text-[color:var(--accent-deep)] underline decoration-[color:var(--accent)]/60 underline-offset-4 hover:decoration-[color:var(--accent-deep)]"
        >
          Watch Food Pharmer&rsquo;s full breakdown on common bread brands.
          <span aria-hidden>→</span>
        </a>
      )}
      {slug === "biscuits" && (
        <a
          href="https://youtu.be/ym4qROz_TtI"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 sm:mt-16 pt-10 border-t rule inline-flex items-center gap-2 font-display italic text-lg text-[color:var(--accent-deep)] underline decoration-[color:var(--accent)]/60 underline-offset-4 hover:decoration-[color:var(--accent-deep)]"
        >
          Watch Food Pharmer&rsquo;s full breakdown on common biscuit brands.
          <span aria-hidden>→</span>
        </a>
      )}
      {slug.startsWith("popcorn") && (
        <a
          href="https://youtu.be/1YqG6QczG9Y"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 sm:mt-16 pt-10 border-t rule inline-flex items-center gap-2 font-display italic text-lg text-[color:var(--accent-deep)] underline decoration-[color:var(--accent)]/60 underline-offset-4 hover:decoration-[color:var(--accent-deep)]"
        >
          Watch Food Pharmer&rsquo;s full breakdown on common popcorn brands.
          <span aria-hidden>→</span>
        </a>
      )}

      <CrossCategoryNav currentSlug={slug} />
    </main>
    <SiteFooter />
    </>
  );
}
