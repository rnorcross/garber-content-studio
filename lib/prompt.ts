import type { Dealership } from './db';
import type { Template } from './templates';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const DESIGN_SYSTEM = `
GARBER AUTOMOTIVE DESIGN SYSTEM
Company: Garber Automotive Group — third-generation, family-owned, founded 1907 by Guy S. Garber in Saginaw, Michigan; the oldest family-owned Buick dealership in the U.S. 25+ new-car dealerships, six states, 17 brands, 2,400+ employees, $2.5B organization. HQ 999 S. Washington Ave., Saginaw, MI. Tagline: "You'll Do Better at Garber."
Owner: always "Richard J. Garber Jr." — never "Dick Garber".
Mission: "We are only doing our job properly when we create an experience for which the customer returns to do business with us again."
Vision: "To be the BEST automotive sales and repair operation in every market we serve."
Core values: Honesty, Respect, Empathy, Integrity, Pride, Work Ethic. Owner's line: "Tall buildings are built on strong foundations." Philosophy: "Doing the right thing."
Group accolades: #1 in America for Customer Service (Widewail study of all U.S. dealership Google profiles, Q4 2025–Q1 2026; 4.9-star average); Automotive News Best Dealerships To Work For (11 Garber stores have won — present as a group honor); Crain's Cool Places to Work (4 years, Gateway Financial).
Copy numbers: 75% of leaders promoted from within · $1.5M+ given to community organizations every year · 10,000+ employee volunteer hours annually · 200+ local organizations served.
Group community partners: Leukemia & Lymphoma Society, Habitat for Humanity, American Cancer Society, American Heart Association, Junior Achievement, Special Olympics, Boys & Girls Clubs of America, American Red Cross.

Colors: navy #072a60 (headlines, dark sections), navy-deep #04173a, bright blue #0d6eff (links, CTAs, accents), blue-bright #2f6bff (hover), field blue #2340e0, cream #f7f2e9 (warm light section), ink #0a1a33 (body text), slate #5a6b83 (muted text, passes contrast on white), line #d9e0ea / #e6eaf0, soft section grey #f4f6f9, gold #f5b400 (stars only), lime #8cc63e (CTA/checkmarks), green #5cb531.
Gradients: navy hero radial-gradient(120% 120% at 80% 15%, #123a8f 0%, #072a60 45%, #04173a 100%); field radial-gradient(120% 110% at 50% 8%, #3358ff 0%, #2340e0 45%, #16249e 100%).
Type: Work Sans only (Google Fonts, weights 400–900). Headlines weight 900, letter-spacing -0.02em to -0.03em, tight line-height (1.02–1.1). Eyebrows: 12px, weight 600, UPPERCASE, letter-spacing 0.22em. Body 16–17px / 1.6.
Layout: clean card-based UX — grey (#f4f6f9) sections holding white rounded cards (radius 22–28px, 1px #e6eaf0 border, no heavy shadows), round arrow badges (34px circles) on linked cards, photo feature cards with a dark bottom gradient and white text, pill chips. Container max-width 1200–1296px with generous section padding (96–104px desktop). Motion: subtle only.
Motifs used sparingly: oversized faded "1907" watermark on navy, concentric rings on blue fields, big quotation marks on testimonials, gold ★ for ratings.
Voice: warm, proud, community-first; "we/Garber" speaking to "you". Heritage stated plainly. Headlines sentence case; eyebrows uppercase. No emoji.
About-page convention: hero headline "You'll Do Better at Garber" on every store page, store-specific line as the subheading.
Assets: dealership logos/storefronts on https://assets.garberauto.com/assets/… (paths given below when known). Manufacturer logos: https://assets.garberauto.com/assets/branding/brand-logos/brand-<make>.png (lowercase make, e.g. brand-chevrolet.png). Open Graph images: https://assets.garberauto.com/assets/open-graph/open-graph-<store-slug>.jpg.
`;

const FRAGMENT_RULES = (scope: string) => `
OUTPUT RULES — the HTML is pasted straight into a content area of a live Dealer.com page, which already has its own header, navigation and footer.
1. Output ONLY the HTML fragment. No markdown fences, no commentary before or after.
2. No <!doctype>, <html>, <head> or <body>. No site header, nav bar or footer.
3. Start with <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800;900&display=swap">, then ONE <style> block, then ONE root element: <div class="${scope}">…</div>. Do NOT write <meta> tags, <title> or canonical links — the CMS adds the page's SEO and social tags itself.
4. Every CSS selector must start with .${scope} so nothing leaks into the dealer site's styles. Put design tokens as custom properties on .${scope} itself. Use box-sizing:border-box inside the scope, reset margins on headings/paragraphs inside the scope, and set font-family on .${scope}.
5. Fully responsive: desktop first, with @media breakpoints at 1023px and 640px. Grids collapse to 2-up then 1-up, type scales down (H1 ≈ 56px → 44px → 34px), section padding shrinks, no horizontal scroll at 375px width.
6. Plain HTML/CSS. Only add a <script> when the request needs real interaction (accordion, video modal); keep it small, vanilla, wrapped in an IIFE, and scoped to elements inside .${scope}.
7. Real <a href>, <button>, alt text on every image, heading order h1 → h2 → h3 (one h1 at most). Text contrast 4.5:1.
8. Never invent facts, prices, names, phone numbers, reviews or statistics. Use what the request, the dealership record and the design system supply; anything missing becomes a clearly bracketed placeholder like [PHONE NUMBER] or [PHOTO: service drive].
`;

export function dealershipBlock(d: Dealership | null) {
  if (!d) return 'DEALERSHIP: Garber Automotive Group (group-level page for garberauto.com).';
  return `DEALERSHIP RECORD
Name: ${d.name}
City: ${d.city ?? '[CITY]'}
Brands sold: ${d.makes.join(', ') || '[BRANDS]'}
Website: ${d.website ?? '[WEBSITE]'}
Logo (color): ${d.logo ?? 'none on file'}
Logo (white, for dark backgrounds): ${d.logo_white ?? 'none on file'}
Storefront photo (horizontal): ${d.image_h ?? 'none on file'}
Storefront photo (vertical): ${d.image_v ?? 'none on file'}
Open Graph image: https://assets.garberauto.com/assets/open-graph/open-graph-${d.slug}.jpg
${d.notes ? `Notes: ${d.notes}` : ''}`;
}

export function createSystem(scope: string) {
  return `You are the web designer and copywriter for Garber Automotive Group's marketing team. You build polished, on-brand content pages that are pasted into dealership websites.
${DESIGN_SYSTEM}
${FRAGMENT_RULES(scope)}`;
}

export type MediaHint = { url: string; alt: string | null; width: number | null; height: number | null; filename: string };

export function createUser(opts: {
  dealership: Dealership | null; template: Template | null; title: string; prompt: string;
  fields: Record<string, string>; media: MediaHint[]; reference?: string;
}) {
  const t = opts.template;
  const answers = (t?.fields ?? [])
    .map((f) => [f.label, (opts.fields[f.key] ?? '').trim()] as const)
    .filter(([, v]) => v)
    .map(([l, v]) => `${l}:\n${v}`)
    .join('\n\n');
  const media = opts.media.length
    ? `IMAGES IN THE MEDIA LIBRARY FOR THIS DEALERSHIP — prefer these over placeholders, and use their exact URLs:\n${opts.media
        .map((m) => `- ${m.url}${m.alt ? ` — ${m.alt}` : ` — ${m.filename}`}${m.width && m.height ? ` (${m.width}×${m.height})` : ''}`)
        .join('\n')}\n`
    : '';
  return `${dealershipBlock(opts.dealership)}

TEMPLATE: ${t?.name ?? 'Custom page'}
${t?.brief ? `TEMPLATE BRIEF — follow this structure:\n${t.brief}\n` : ''}
PAGE TITLE: ${opts.title}

${answers ? `DETAILS FROM THE TEAM (use faithfully, edit only for flow):\n${answers}\n` : ''}
${opts.prompt ? `${t?.is_custom ? 'WHAT TO BUILD' : 'EXTRA DIRECTION'}:\n${opts.prompt}\n` : ''}
${media}
${opts.reference ? `STYLE REFERENCE — an existing page from this CMS. Match its layout language, components and polish (inline images there appear as inline-image://N tokens; do not reuse those tokens):\n${opts.reference}\n` : ''}
Build the complete page now.`;
}

export function editSystem(scope: string | null) {
  return `You are editing an existing Garber Automotive Group content fragment that gets pasted into a Dealer.com page.
${DESIGN_SYSTEM}
EDITING RULES
1. Return the COMPLETE revised fragment — every line, not a diff, no markdown fences, no commentary.
2. Change only what the instruction asks. Keep all other markup, copy, class names, CSS and scripts exactly as they are.
3. Tokens of the form inline-image://N stand for embedded images. Keep each one exactly where it is unless the instruction says to replace that image.
4. Keep the fragment paste-ready: no <html>/<head>/<body>, no site header or footer.${scope ? ` New CSS selectors must start with .${scope}.` : ''}
5. Never invent facts, prices, names, reviews or statistics; missing information becomes a bracketed placeholder.`;
}

/** Finds the wrapper class a fragment is scoped to, if any. */
export function detectScope(html: string) {
  return html.match(/class="(gcs-[a-z0-9-]+)/)?.[1] ?? null;
}
