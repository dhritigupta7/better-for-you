import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getLiveProductBySlug,
  getAllVisibleProductParams,
} from "@/lib/products/queries";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import NutritionCard from "@/components/NutritionCard";
import WhatsAppShare from "@/components/WhatsAppShare";
import NewRibbon from "@/components/NewRibbon";
import ZoomableImage from "@/components/ZoomableImage";
import CrossCategoryNav from "@/components/CrossCategoryNav";
import IngredientText from "@/components/IngredientText";
import BuyLink from "@/components/BuyLink";

const SITE_URL = "https://foodpharmer.health";

export const revalidate = 3600;

// Prerender every visible product page to the edge cache. This route was the
// second biggest source of function invocations (mostly Link prefetches hitting
// a dynamic route). New products still render on demand and cache after the
// first hit (dynamicParams defaults to true).
export async function generateStaticParams() {
  return getAllVisibleProductParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const product = await getLiveProductBySlug(category, slug);
  if (!product) return {};
  const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand;
  const cat = product.category as { name?: string } | undefined;
  const brandName = (brand as { name?: string } | undefined)?.name;
  const title = brandName
    ? `${brandName} ${product.name}`
    : product.name;
  // Compact natural-language description: ingredient first 140 chars (giving
  // Google something substantive to surface), falling back to a generic
  // "approved by Food Pharmer" line.
  const ingredientHint = product.ingredients_raw
    ? product.ingredients_raw.replace(/\s+/g, " ").slice(0, 140).trim() + "…"
    : null;
  const description = ingredientHint
    ? `${brandName ?? ""} ${product.name} — approved by Food Pharmer's nutrition team. Ingredients: ${ingredientHint}`.trim()
    : `${brandName ?? ""} ${product.name} is on our Better for You list.`.trim();
  const photoUrl = product.product_photo_url
    ? (product.product_photo_url.startsWith("http")
        ? product.product_photo_url
        : `${SITE_URL}${product.product_photo_url}`)
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/c/${category}/${slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE_URL}/c/${category}/${slug}`,
      ...(photoUrl ? { images: [{ url: photoUrl, alt: product.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(photoUrl ? { images: [photoUrl] } : {}),
    },
    other: cat?.name ? { "article:section": cat.name } : undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const product = await getLiveProductBySlug(category, slug);
  if (!product) notFound();

  const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand;
  const cat = product.category;

  const isLab = product.certification_method === "lab_tested";

  // Nutrition display: every product shows its label IMAGE (the original
  // behaviour). The structured table is OFF by default everywhere — it only
  // renders for a product explicitly opted in with `nutrition.live === true`.
  // The OCR'd `nutrition` JSON stays in the DB untouched, so re-enabling a
  // product (or the whole feature) later is just a flag flip — nothing to redo.
  const nutritionData = product.nutrition as
    | { rows?: unknown[]; live?: boolean }
    | null;
  const hasNutritionRows =
    !!nutritionData &&
    Array.isArray(nutritionData.rows) &&
    nutritionData.rows.length > 0;
  const showNutritionTable = hasNutritionRows && nutritionData?.live === true;
  const verifiedDate = product.last_verified_at
    ? new Date(product.last_verified_at).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // schema.org/BreadcrumbList — renders the Home › Category › Product
  // breadcrumb trail under the title in Google search results.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Better for You",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: cat.name,
        item: `${SITE_URL}/c/${category}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: `${SITE_URL}/c/${category}/${slug}`,
      },
    ],
  };

  // schema.org/Product JSON-LD — gives Google enough structure to render
  // rich-snippet image cards in search results. Only fields we have are
  // emitted; brand / category / image fall through to nothing if absent.
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: `${SITE_URL}/c/${category}/${slug}`,
    ...(product.product_photo_url
      ? { image: product.product_photo_url.startsWith("http")
          ? product.product_photo_url
          : `${SITE_URL}${product.product_photo_url}` }
      : {}),
    ...(brand?.name ? { brand: { "@type": "Brand", name: brand.name } } : {}),
    ...(cat?.name ? { category: cat.name } : {}),
    ...(product.ingredients_raw
      ? { description: product.ingredients_raw.slice(0, 280) }
      : {}),
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Reviewed by",
        value: "Food Pharmer",
      },
      ...(isLab
        ? [{
            "@type": "PropertyValue",
            name: "Verification",
            value: "Lab tested",
          }]
        : []),
    ],
    // NOTE: no `offers` block. Google rejects an Offer without a `price`, which
    // is what made 100% of products "ineligible for rich results" in Search
    // Console. We don't store prices (they vary by retailer), so emitting a
    // price-less Offer is invalid — better to omit it and keep the Product
    // markup valid for image/name cards.
  };

  return (
    <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
    />
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
    />
    <SiteHeader />
    <main id="main" tabIndex={-1} className="outline-none w-full max-w-[1100px] mx-auto px-5 sm:px-10 py-10 sm:py-16 relative z-10">
      <nav className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink-mute)]">
        <Link href={`/c/${category}`} className="hover:text-[color:var(--accent-deep)] transition-colors">
          ← {cat.name}
        </Link>
      </nav>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-8">
        {product.product_photo_url ? (
          <div className="relative lg:col-span-5 overflow-hidden h-80 sm:h-[440px] flex items-center justify-center">
            {product.is_new && <NewRibbon />}
            <ZoomableImage
              src={product.product_photo_url}
              alt={product.name}
              priority
              className="w-full h-full object-contain p-4 sm:p-6"
            />
          </div>
        ) : (
          <div className="lg:col-span-5 bg-[color:var(--bg-elev)] border rule rounded-sm aspect-[4/3] sm:aspect-square max-h-[440px] flex items-center justify-center">
            <span className="font-display italic text-3xl sm:text-4xl text-[color:var(--ink-mute)]/50 text-center px-8">
              {brand?.name}
            </span>
          </div>
        )}

        <header className="lg:col-span-7 flex flex-col justify-center">
          {brand?.slug ? (
            <Link
              href={`/b/${brand.slug}`}
              className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-[-0.02em] leading-tight text-[color:var(--ink-soft)] hover:text-[color:var(--accent-deep)] transition-colors"
            >
              {brand?.name}
            </Link>
          ) : (
            <p className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-[-0.02em] leading-tight text-[color:var(--ink-soft)]">
              {brand?.name}
            </p>
          )}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-[-0.02em] leading-[0.95] mt-1 sm:mt-2 text-[color:var(--ink)]">
            {product.name}
          </h1>
          <div className="mt-6 inline-flex items-center gap-3">
            <span className="bg-[color:var(--ink)] text-[color:var(--bg)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em]">
              Better for You
            </span>
          </div>
          {product.primary_buy_url && (
            <BuyLink
              slug={product.slug}
              href={product.primary_buy_url}
              className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-[color:var(--ink)] text-[color:var(--bg)] px-6 py-4 sm:py-3 font-mono text-xs uppercase tracking-[0.22em] hover:bg-[color:var(--accent-deep)] transition-colors"
            >
              Product website →
            </BuyLink>
          )}
        </header>
      </div>

      <section className="mt-12 border-t rule pt-10">
        <h2 className="font-display text-3xl tracking-tight">Ingredients</h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mt-1">
          As printed on the pack · verbatim
        </p>
        {product.ingredients_raw ? (
          <IngredientText
            raw={product.ingredients_raw}
            i18n={
              (product.ingredients_i18n ?? null) as Record<
                string,
                string
              > | null
            }
          />
        ) : (
          <div className="mt-5 bg-[color:var(--bg-elev)] border rule rounded-sm p-6">
            <p className="text-[color:var(--ink-soft)] leading-relaxed">
              We are still capturing the verbatim ingredient list for this
              product. Until then, you can read the label on the brand&rsquo;s
              own page.
            </p>
            {product.primary_buy_url && (
              <BuyLink
                slug={product.slug}
                href={product.primary_buy_url}
                className="mt-3 inline-block font-mono text-xs uppercase tracking-[0.22em] underline hover:text-[color:var(--accent-deep)]"
              >
                Open the source page →
              </BuyLink>
            )}
          </div>
        )}
      </section>

      {showNutritionTable ? (
        <section className="mt-12 border-t rule pt-10">
          <h2 className="font-display text-3xl tracking-tight">Nutrition</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mt-1">
            As declared on the pack · re-verified every six months
          </p>
          <div className="mt-5">
            <NutritionCard
              data={product.nutrition as Parameters<typeof NutritionCard>[0]["data"]}
              brand={brand?.name}
            />
          </div>
        </section>
      ) : product.label_image_url ? (
        <section className="mt-12 border-t rule pt-10">
          <h2 className="font-display text-3xl tracking-tight">Nutrition label</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mt-1">
            Cropped from the source page · {brand?.name}
          </p>
          <div className="mt-5 p-3 inline-block max-w-full">
            <ZoomableImage
              src={product.label_image_url}
              alt={`${product.name} label`}
              className="max-w-full h-auto"
            />
          </div>
        </section>
      ) : null}

      <div className="mt-10">
        <WhatsAppShare
          productName={product.name}
          brand={brand?.name ?? ""}
          url={`${SITE_URL}/c/${category}/${slug}`}
        />
      </div>

      <section className="mt-12 border-t rule pt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mb-2">
            How we checked
          </div>
          {isLab && product.lab_report_url ? (
            <a
              href={product.lab_report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-2xl tracking-tight text-[color:var(--lab)] underline decoration-[color:var(--lab)]/40 underline-offset-4 hover:decoration-[color:var(--lab)]"
            >
              Lab tested ✓
            </a>
          ) : (
            <div
              className={`font-display text-2xl tracking-tight ${
                isLab ? "text-[color:var(--lab)]" : ""
              }`}
            >
              {isLab ? "Lab tested ✓" : "Label reviewed"}
            </div>
          )}
          {isLab && (
            <p className="text-base text-[color:var(--ink-soft)] mt-2 leading-snug">
              A NABL certified lab tested this product.
            </p>
          )}
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-mute)] mb-2">
            Last verified
          </div>
          <div className="font-display text-2xl tracking-tight">
            {verifiedDate ?? "Pending"}
          </div>
        </div>
      </section>

      <CrossCategoryNav currentSlug={category} />
    </main>
    <SiteFooter />
    </>
  );
}
