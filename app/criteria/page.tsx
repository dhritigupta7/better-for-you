import Link from "next/link";
import { createReaderClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const revalidate = 300;

const SITE_URL = "https://foodpharmer.health";

export const metadata = {
  // Bare page name only — the layout template appends
  // "| Better for You by Food Pharmer" (don't repeat it here).
  title: "Our Criteria: How Products Get Approved",
  description:
    "The rules every product must pass to make it onto the list, broken down by category.",
  alternates: { canonical: `${SITE_URL}/criteria` },
};

export default async function CriteriaPage() {
  const sb = createReaderClient();
  const { data: categories } = await sb
    .from("categories")
    .select("id, slug, name, blurb")
    .eq("active", true)
    .order("display_order");

  const { data: rules } = await sb
    .from("category_rules")
    .select("id, code, description, category_id, display_order")
    .eq("active", true)
    .order("display_order");

  const byCat = new Map<number, NonNullable<typeof rules>>();
  for (const r of rules ?? []) {
    if (r.category_id !== null) {
      if (!byCat.has(r.category_id)) byCat.set(r.category_id, []);
      byCat.get(r.category_id)!.push(r);
    }
  }

  // schema.org/BreadcrumbList — Home › Our Criteria. (Replaces a former
  // FAQPage block whose questions only ever existed in the JSON-LD and were
  // never rendered on the page — Google's FAQ policy requires the Q&A to be
  // visible, so that markup was a spam-policy risk and is removed.)
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Food Pharmer", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Our Criteria",
        item: `${SITE_URL}/criteria`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className="outline-none max-w-[1000px] mx-auto px-6 sm:px-10 py-16 relative z-10"
      >
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink-mute)] hover:text-[color:var(--accent-deep)]"
        >
          ← Home
        </Link>

        <section className="mt-14">
          <h1 className="font-display text-3xl tracking-tight">Rules by category</h1>
          <p className="mt-2 text-[color:var(--ink-soft)] max-w-2xl">
            Every category has its own rules. A product has to pass the rules
            for its category to make the list.
          </p>
          <div className="mt-6 space-y-8">
            {(categories ?? []).map((c) => {
              const catRules = byCat.get(c.id) ?? [];
              if (catRules.length === 0) return null;
              return (
                <div key={c.id} className="border-t rule pt-6">
                  <Link
                    href={`/c/${c.slug}`}
                    className="font-display text-2xl hover:text-[color:var(--accent-deep)] transition-colors"
                  >
                    {c.name}
                  </Link>
                  <ul className="mt-3 space-y-2">
                    {catRules.map((r) => (
                      <li key={r.id} className="flex gap-3">
                        <span aria-hidden className="text-[color:var(--lab)] font-mono shrink-0">✓</span>
                        <span className="text-[color:var(--ink-soft)] leading-relaxed">{r.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
