import { createReaderClient } from '@/lib/supabase/server';

// Prod shows only Live restaurants; staging/preview also shows Draft (the
// service-role client bypasses RLS there). Mirrors lib/products/visibility.
export function visibleRestaurantStatuses(): readonly string[] {
  return process.env.VERCEL_ENV === 'production' ? ['Live'] : ['Live', 'Draft'];
}

export type RestaurantCard = {
  id: number;
  slug: string;
  name: string;
  city: string;
  area: string | null;
  cuisine: string | null;
  price_band: string | null;
  hero_image_url: string | null;
  card_image_url: string | null;
  tagline: string | null;
  tags: string[];
  is_new: boolean;
  is_pure_veg: boolean;
  google_rating: number | null;
  approvedCount: number;
};

export type DishRow = {
  id: number;
  slug: string;
  name: string;
  blurb: string | null;
  our_take: string | null;
  image_url: string | null;
  tags: string[];
  price: number | null;
  display_order: number | null;
};

export type Outlet = {
  label: string;
  address: string;
  // "dine-in" | "delivery" (delivery/pickup only), from Google service options.
  service?: string;
};

export type RestaurantDetail = {
  id: number;
  slug: string;
  name: string;
  city: string;
  area: string | null;
  cuisine: string | null;
  price_band: string | null;
  address: string | null;
  outlets: Outlet[];
  google_maps_url: string | null;
  menu_url: string | null;
  zomato_url: string | null;
  swiggy_url: string | null;
  instagram_handle: string | null;
  phone: string | null;
  hero_image_url: string | null;
  card_image_url: string | null;
  tagline: string | null;
  editorial_note: string | null;
  tags: string[];
  is_new: boolean;
  is_pure_veg: boolean;
  google_rating: number | null;
  status: string;
  dishes: DishRow[];
};

const RESTAURANT_LIST_FIELDS =
  'id, slug, name, city, area, cuisine, price_band, hero_image_url, card_image_url, tagline, tags, is_new, is_pure_veg, google_rating, display_order, status';

const RESTAURANT_DETAIL_FIELDS =
  'id, slug, name, city, area, cuisine, price_band, address, outlets, google_maps_url, menu_url, zomato_url, swiggy_url, instagram_handle, phone, hero_image_url, card_image_url, tagline, editorial_note, tags, is_new, is_pure_veg, google_rating, status';

// Visible restaurants that have at least one approved dish, with their approved
// dish count. Ordered by display_order; grouping/filtering by city happens client-side.
export async function getVisibleRestaurants(): Promise<RestaurantCard[]> {
  const sb = createReaderClient();
  const { data: rs } = await sb
    .from('restaurants')
    .select(RESTAURANT_LIST_FIELDS)
    .in('status', visibleRestaurantStatuses() as string[])
    .order('display_order', { ascending: true });
  const restaurants = rs ?? [];
  if (restaurants.length === 0) return [];

  const ids = restaurants.map((r) => r.id);
  const { data: ds } = await sb
    .from('dishes')
    .select('restaurant_id')
    .eq('approved', true)
    .in('restaurant_id', ids);
  const counts = new Map<number, number>();
  for (const d of ds ?? []) counts.set(d.restaurant_id, (counts.get(d.restaurant_id) ?? 0) + 1);

  return restaurants
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      area: r.area,
      cuisine: r.cuisine ?? null,
      price_band: r.price_band ?? null,
      hero_image_url: r.hero_image_url,
      card_image_url: r.card_image_url ?? null,
      tagline: r.tagline ?? null,
      tags: (r.tags as string[] | null) ?? [],
      is_new: r.is_new,
      is_pure_veg: r.is_pure_veg,
      // PostgREST returns numeric columns as strings — coerce.
      google_rating: r.google_rating == null ? null : Number(r.google_rating),
      approvedCount: counts.get(r.id) ?? 0,
    }))
    .filter((r) => r.approvedCount > 0);
}

export async function getRestaurantBySlug(slug: string): Promise<RestaurantDetail | null> {
  const sb = createReaderClient();
  const { data: r } = await sb
    .from('restaurants')
    .select(RESTAURANT_DETAIL_FIELDS)
    .eq('slug', slug)
    .in('status', visibleRestaurantStatuses() as string[])
    .single();
  if (!r) return null;

  const { data: dishes } = await sb
    .from('dishes')
    .select('id, name, slug, blurb, our_take, image_url, tags, price, display_order')
    .eq('restaurant_id', r.id)
    .eq('approved', true)
    .order('display_order', { ascending: true });

  return {
    ...r,
    tags: (r.tags as string[] | null) ?? [],
    outlets: (r.outlets as Outlet[] | null) ?? [],
    google_rating: r.google_rating == null ? null : Number(r.google_rating),
    dishes: (dishes ?? []).map((d) => ({
      ...d,
      tags: (d.tags as string[] | null) ?? [],
    })),
  } as RestaurantDetail;
}
