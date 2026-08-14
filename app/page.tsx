import { createReaderClient } from "@/lib/supabase/server";
import { getLiveCountByCategory } from "@/lib/products/queries";
import { visibleCategoryOrFilter } from "@/lib/categories/visibility";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import NewRibbon from "@/components/NewRibbon";
import HomeScrollRestore from "@/components/HomeScrollRestore";

export const revalidate = 3600;

const SITE_URL = "https://foodpharmer.health";

export const metadata = {
  // Title + description inherit the site defaults from app/layout.tsx
  // ("Better for You by Food Pharmer"). Brand framing only — never use
  // health-claim words ("healthier"/"cleaner") in user-visible copy.
  alternates: { canonical: SITE_URL },
};

// Compound categories: a parent card that nests sibling "<parent>-*" slugs as
// rows. `hasOwnProducts` controls whether a "Regular" row linking to the parent
// section is shown (paneer has plain paneer; bread is only a wrapper).
const COMPOUNDS: {
  slug: string;
  hasOwnProducts: boolean;
  regularLabel?: string;
}[] = [
  { slug: "paneer", hasOwnProducts: true },
  { slug: "bread", hasOwnProducts: false },
  { slug: "chips", hasOwnProducts: true },
  { slug: "popcorn", hasOwnProducts: false },
];

export default async function HomePage() {
  const supabase = createReaderClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, slug, name, blurb, hero_image_url, display_order, is_new, active")
    .or(visibleCategoryOrFilter())
    .order("name", { ascending: true });

  if (error) {
    return (
      <main className="p-12">
        <p className="font-mono text-sm text-[color:var(--danger)]">
          Could not load: {error.message}
        </p>
      </main>
    );
  }

  const list = categories ?? [];
  const counts = await getLiveCountByCategory();

  type Cat = (typeof list)[number];
  const isVariantOf = (c: Cat, parent: string) =>
    c.slug !== parent && c.slug.startsWith(`${parent}-`);
  const compoundForParent = (slug: string) =>
    COMPOUNDS.find((cc) => cc.slug === slug);

  // Variants of any compound parent are nested inside the parent card, so they
  // are hidden from the top-level index.
  const indexEntries = list.filter(
    (c) => !COMPOUNDS.some((cc) => isVariantOf(c, cc.slug)),
  );

  // Per-parent: its variants (sorted by display order) and total pick count.
  const variantsForParent = (slug: string) =>
    list
      .filter((c) => isVariantOf(c, slug))
      .sort(
        (a, b) =>
          (a.display_order ?? 0) - (b.display_order ?? 0) ||
          a.name.localeCompare(b.name),
      );
  const compoundTotal = (parent: Cat, variants: Cat[]) =>
    (counts.get(parent.id) ?? 0) +
    variants.reduce((s, c) => s + (counts.get(c.id) ?? 0), 0);

  // Strip the "<Parent> · " prefix from a variant name → "Multigrain", etc.
  const variantLabel = (name: string) =>
    name.includes(" · ") ? name.split(" · ").slice(1).join(" · ") : name;

  // Preload the first visible category hero image so the LCP candidate is
  // already in flight before the JS chunk parses. The homepage's LCP is the
  // hero typography + the first card image; preloading the image shaves
  // ~300-500ms on slow Indian mobile (Clarity reports LCP 2.84s).
  const firstHero = indexEntries[0]?.hero_image_url;

  // Brand Organization + WebSite (+ SearchAction) JSON-LD is emitted site-wide
  // from the root layout (BRAND_LD), so the homepage no longer repeats it.

  return (
    <div className="relative z-10">
      {firstHero && (
        <link
          rel="preload"
          as="image"
          href={firstHero}
          // @ts-expect-error - non-standard React attr
          fetchpriority="high"
        />
      )}
      <HomeScrollRestore />
      <SiteHeader />

      <main id="main" tabIndex={-1} className="outline-none w-full">

      {/* HERO */}
      <section>
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 pt-10 sm:pt-20 pb-6 sm:pb-10">
          {/* Title + tagline */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-8 items-end">
            <div className="lg:col-span-8 rise rise-1">
              {/* select-none + cursor-default signals "not interactive" so
                  visitors stop tapping the giant title (top dead-click zone
                  on the homepage per Clarity). */}
              <h1 className="font-display font-medium leading-[0.9] tracking-[-0.025em] text-[11.5vw] sm:text-[9.5vw] lg:text-[5.6vw] text-[color:var(--ink)] cursor-default select-none">
                Better for You
                <br />
                <em className="italic font-light">by Food Pharmer</em>
              </h1>
            </div>

            <div className="lg:col-span-4 lg:pb-3 rise rise-2">
              <p className="text-sm text-[color:var(--ink-mute)] leading-relaxed max-w-md">
                Reviewed by{" "}
                <a
                  href="https://instagram.com/foodpharmer"
                  target="_blank"
                  rel="noopener"
                  className="text-[color:var(--ink-soft)] underline decoration-[color:var(--ink-mute)] underline-offset-2 hover:text-[color:var(--accent-deep)]"
                >
                  Food Pharmer
                </a>
                , with a team of nutrition experts and researchers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES — editorial index */}
      <section className="border-t rule">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 pt-8 sm:pt-10 pb-16 sm:pb-24">
          <div className="flex items-end justify-between mb-8 sm:mb-12 rise rise-3">
            <h2 className="font-display text-3xl sm:text-5xl tracking-[-0.02em] leading-none">
              Categories
            </h2>
            <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-[color:var(--ink-mute)]">
              {indexEntries.length} sections
            </span>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {indexEntries.map((c, i) => {
              const compound = compoundForParent(c.slug);
              const variants = compound ? variantsForParent(c.slug) : [];
              const isCompound = Boolean(compound) && variants.length > 0;
              const picks = isCompound
                ? compoundTotal(c, variants)
                : counts.get(c.id) ?? 0;

              // Card image + name block (shared by both compound and non-
              // compound cards). Rendered as visual content; whether it's
              // wrapped in a Link or sits inside one is decided below.
              const cardHeader = (
                <>
                  <div className="relative aspect-[16/10] sm:aspect-[16/11] bg-[color:var(--photo-bg)] overflow-hidden">
                    {c.is_new && <NewRibbon />}
                    {c.hero_image_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.hero_image_url}
                        alt={c.name}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={i === 0 ? "high" : "auto"}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:group-hover:scale-[1.08]"
                      />
                    )}
                  </div>
                  <div className="p-5 sm:p-7 pb-0 sm:pb-0">
                    <h3 className="font-display text-3xl sm:text-4xl tracking-[-0.02em] leading-[0.95] text-[color:var(--ink)] group-hover:text-[color:var(--accent-deep)] transition-colors">
                      {c.name}
                    </h3>
                  </div>
                </>
              );

              return (
                <li
                  key={c.id}
                  className={`group rise rise-${Math.min(i + 1, 5)} transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:hover:scale-[1.03] sm:hover:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]`}
                >
                  {/* Non-compound cards: the WHOLE card surface is one link
                      so tapping anywhere navigates — kills the 47% homepage
                      dead-click rate Clarity flagged. The CTA chip stays a
                      styled <span> (HTML forbids nested anchors). */}
                  {isCompound ? (
                    <article className="bg-[color:var(--bg-elev)] overflow-hidden h-full flex flex-col">
                      <Link href={`/c/${c.slug}`} className="block">
                        {cardHeader}
                      </Link>
                      <div className="px-5 sm:px-7 pb-5 sm:pb-7 flex-1 flex flex-col">
                        <ul className="mt-6 border-t rule">
                          {compound!.hasOwnProducts && (
                            <li className="border-b rule">
                              <Link
                                href={`/c/${c.slug}`}
                                className="flex items-center justify-between gap-3 min-h-[52px] py-3 group/v"
                              >
                                <span className="font-display text-lg sm:text-xl tracking-tight text-[color:var(--ink)] group-hover/v:text-[color:var(--accent-deep)] transition-colors whitespace-nowrap min-w-0">
                                  {compound!.regularLabel ?? "Regular"}
                                </span>
                                <span className="inline-flex items-center justify-center bg-[color:var(--ink)] text-[color:var(--bg)] font-mono text-[11px] uppercase tracking-[0.22em] px-3 py-1.5 group-hover/v:bg-[color:var(--accent-deep)] transition-colors shrink-0 whitespace-nowrap">
                                  View section →
                                </span>
                              </Link>
                            </li>
                          )}
                          {variants.map((v) => (
                            <li
                              key={v.id}
                              className="border-b rule last:border-b-0"
                            >
                              <Link
                                href={`/c/${v.slug}`}
                                className="flex items-center justify-between gap-3 min-h-[52px] py-3 group/v"
                              >
                                <span className="font-display text-lg sm:text-xl tracking-tight text-[color:var(--ink)] group-hover/v:text-[color:var(--accent-deep)] transition-colors whitespace-nowrap min-w-0">
                                  {variantLabel(v.name)}
                                </span>
                                <span className="inline-flex items-center justify-center bg-[color:var(--ink)] text-[color:var(--bg)] font-mono text-[11px] uppercase tracking-[0.22em] px-3 py-1.5 group-hover/v:bg-[color:var(--accent-deep)] transition-colors shrink-0 whitespace-nowrap">
                                  View section →
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ) : (
                    <Link
                      href={`/c/${c.slug}`}
                      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--ink)]"
                    >
                      <article className="bg-[color:var(--bg-elev)] overflow-hidden h-full flex flex-col">
                        {cardHeader}
                        <div className="px-5 sm:px-7 pb-5 sm:pb-7 flex-1 flex flex-col">
                          <div className="mt-6 pt-5 border-t rule flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-[color:var(--ink-mute)] sm:order-first text-center sm:text-left">
                              {picks} {picks === 1 ? "pick" : "picks"}
                            </span>
                            <span className="inline-flex items-center justify-center gap-2 bg-[color:var(--ink)] text-[color:var(--bg)] font-mono text-[13px] uppercase tracking-[0.22em] px-4 py-2.5 sm:py-2 w-full sm:w-auto group-hover:bg-[color:var(--accent-deep)] transition-colors">
                              View section <span aria-hidden>→</span>
                            </span>
                          </div>
                        </div>
                      </article>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      </main>

      <SiteFooter />
    </div>
  );
}
