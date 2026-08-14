import Link from "next/link";
import { createReaderClient } from "@/lib/supabase/server";
import { visibleCategoryOrFilter } from "@/lib/categories/visibility";

/**
 * A horizontal strip of *other* categories, shown at the foot of category and
 * product pages. Most visitors land deep from a search/IG link and only see one
 * category before leaving — this gives them an obvious path to the rest of the
 * site instead of hitting back.
 *
 * Top-level categories are derived from the data: a category is a nested
 * variant (hidden here) when another visible category's slug is its prefix
 * (e.g. "oats-high-protein" sits under "oats"). Visibility honours the same
 * env gating as the homepage, so staging-only categories never leak to prod.
 */
export default async function CrossCategoryNav({
  currentSlug,
}: {
  currentSlug: string;
}) {
  const sb = createReaderClient();
  const { data } = await sb
    .from("categories")
    .select("id, slug, name, is_new")
    .or(visibleCategoryOrFilter())
    .order("name", { ascending: true });

  const list = data ?? [];
  const tops = list.filter(
    (c) => !list.some((p) => p.slug !== c.slug && c.slug.startsWith(`${p.slug}-`)),
  );
  // the top-level category the current page belongs to (itself or its parent)
  const currentTop = tops.find(
    (t) => currentSlug === t.slug || currentSlug.startsWith(`${t.slug}-`),
  )?.slug;
  // New categories first (so a freshly-added one always surfaces at the
  // front), then the rest alphabetically.
  const others = tops
    .filter((t) => t.slug !== currentTop)
    .sort(
      (a, b) =>
        Number(Boolean(b.is_new)) - Number(Boolean(a.is_new)) ||
        a.name.localeCompare(b.name),
    );
  if (others.length === 0) return null;

  return (
    <section className="mt-16 sm:mt-20 border-t rule pt-10">
      <h2 className="font-display text-3xl tracking-tight">Explore other categories</h2>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mt-1">
        {others.length} more
      </p>
      <div className="mt-5 flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {others.map((c) => (
          <Link
            key={c.id}
            href={`/c/${c.slug}`}
            // Cross-nav renders on every category + product page and links to
            // every other category. Left on, each page view prefetches ~a dozen
            // category routes (a top source of Edge Requests). These are
            // secondary nav, so fetch on click instead.
            prefetch={false}
            className="group shrink-0 inline-flex items-center gap-2 border rule bg-[color:var(--bg-elev)] px-5 py-3 font-display text-xl tracking-tight text-[color:var(--ink)] hover:border-[color:var(--accent-deep)] hover:text-[color:var(--accent-deep)] transition-colors whitespace-nowrap"
          >
            {c.name}
            {c.is_new && (
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--accent-deep)]">
                New
              </span>
            )}
            <span aria-hidden className="text-[color:var(--ink-mute)] group-hover:text-[color:var(--accent-deep)]">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
