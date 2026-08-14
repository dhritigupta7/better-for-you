import Link from "next/link";
import { createReaderClient } from "@/lib/supabase/server";
import { visibleProductStatuses } from "@/lib/products/visibility";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://foodpharmer.health";

export const revalidate = 3600;

export const metadata = {
  title: "Brands on the Better for You list",
  description:
    "Every brand currently on Food Pharmer's Better for You list — an alphabetical index.",
  alternates: { canonical: `${SITE_URL}/b` },
};

type Row = {
  id: number;
  slug: string;
  name: string;
  pickCount: number;
};

export default async function BrandsIndexPage() {
  const sb = createReaderClient();

  // Pull only brands that have at least one visible product, with the count
  // alongside so the index reads like a magazine contents page.
  const { data: brands } = await sb
    .from("brands")
    .select("id, slug, name")
    .eq("is_excluded", false)
    .order("name", { ascending: true });

  const { data: prods } = await sb
    .from("products")
    .select("brand_id, status")
    .in("status", visibleProductStatuses() as string[]);

  const counts = new Map<number, number>();
  for (const p of prods ?? []) {
    counts.set(p.brand_id, (counts.get(p.brand_id) ?? 0) + 1);
  }

  const rows: Row[] = (brands ?? [])
    .map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      pickCount: counts.get(b.id) ?? 0,
    }))
    .filter((r) => r.pickCount > 0);

  // Group alphabetically — heading per first letter so 50+ brands stay
  // scannable.
  const byLetter = new Map<string, Row[]>();
  for (const r of rows) {
    const letter = r.name.charAt(0).toUpperCase().match(/[A-Z]/)
      ? r.name.charAt(0).toUpperCase()
      : "#";
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter)!.push(r);
  }
  const letters = [...byLetter.keys()].sort();

  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Brands on the Better for You list",
    url: `${SITE_URL}/b`,
    hasPart: rows.slice(0, 50).map((r) => ({
      "@type": "Brand",
      name: r.name,
      url: `${SITE_URL}/b/${r.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className="outline-none w-full max-w-[1100px] mx-auto px-5 sm:px-10 py-10 sm:py-16 relative z-10"
      >
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
            Brand index
          </p>
          <h1 className="mt-3 font-display text-5xl sm:text-7xl tracking-[-0.02em] leading-[0.95]">
            Brands on the list
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-[color:var(--ink-soft)] leading-relaxed">
            {rows.length} brand{rows.length === 1 ? "" : "s"} currently meet
            our criteria across {[...new Set(prods?.map((p) => p.brand_id))].length}{" "}
            products.
          </p>
        </header>

        {/* Quick jump-to-letter rail */}
        <div className="mt-8 sm:mt-10 flex flex-wrap gap-2">
          {letters.map((l) => (
            <a
              key={l}
              href={`#${l}`}
              className="inline-flex items-center justify-center w-9 h-9 border rule font-mono text-xs uppercase tracking-[0.12em] hover:bg-[color:var(--ink)] hover:text-[color:var(--bg)] transition-colors"
            >
              {l}
            </a>
          ))}
        </div>

        {letters.map((l) => (
          <section
            key={l}
            id={l}
            className="mt-12 sm:mt-16 scroll-mt-24"
          >
            <h2 className="font-display text-4xl sm:text-5xl tracking-[-0.02em] leading-none border-b rule pb-3 mb-5">
              {l}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
              {byLetter.get(l)!.map((r) => (
                <li key={r.id} className="border-b rule">
                  <Link
                    href={`/b/${r.slug}`}
                    className="flex items-baseline justify-between py-3 group/r"
                  >
                    <span className="font-display text-2xl tracking-[-0.015em] text-[color:var(--ink)] group-hover/r:text-[color:var(--accent-deep)] transition-colors">
                      {r.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)]">
                      {r.pickCount}{" "}
                      {r.pickCount === 1 ? "pick" : "picks"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
