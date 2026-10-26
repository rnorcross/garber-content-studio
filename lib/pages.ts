import { sql, addVersion, type Version } from './db';
import { extractSocialMeta, toFragment, GROUP_OG_IMAGE, defaultOgImage, type HeadInput } from './fragment';

/**
 * Saves HTML as a new version. Social meta tags and canonical links are pulled out of the
 * HTML (the CMS writes them at copy time); if the page has no meta title/description yet,
 * the ones found are kept as its starting values.
 */
export async function saveHtml(pageId: number, raw: string, source: Version['source'], userId: number | null,
  opts: { prompt?: string | null; note?: string | null } = {}) {
  const meta = extractSocialMeta(toFragment(raw));
  if (!meta.html.trim()) throw new Error('Nothing to save');
  await sql`
    update pages set
      meta_title = coalesce(meta_title, ${meta.title}),
      meta_description = coalesce(meta_description, ${meta.description}),
      canonical_url = coalesce(canonical_url, ${meta.canonical})
    where id = ${pageId}`;
  return addVersion(pageId, meta.html, source, userId, opts);
}

/** Head tags for a page: its meta fields plus its dealership's Open Graph image. */
export async function headFor(pageId: number): Promise<HeadInput> {
  const [p] = await sql<{ meta_title: string | null; meta_description: string | null; canonical_url: string | null;
    live_url: string | null; name: string | null; slug: string | null; og_image: string | null }[]>`
    select p.meta_title, p.meta_description, p.canonical_url, p.live_url, d.name, d.slug, d.og_image
    from pages p left join dealerships d on d.id = p.dealership_id where p.id = ${pageId}`;
  return {
    siteName: p?.name ?? 'Garber Automotive Group',
    title: p?.meta_title, description: p?.meta_description, canonical: p?.canonical_url, url: p?.live_url,
    image: p?.og_image || (p?.slug ? defaultOgImage(p.slug) : GROUP_OG_IMAGE),
  };
}
