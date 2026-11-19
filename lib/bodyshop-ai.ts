// Claude helpers for the body shop editor: rewrite a piece of text, suggest alt text from the
// image, and draft a new page from an existing one. Prompts and parsing live here so they can
// be tested without calling the API.
import * as cheerio from 'cheerio';
import { norm } from './bodyshop';
import { hoursFormats, type SiteInfo } from './bodyshop-info';

export type Block = { i: number; tag: string; text: string };

/** The page's own copy (headings, paragraphs, list items), not the header, footer or menus. */
export function pageBlocks(html: string, max = 90): Block[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: Block[] = [];
  $('#app').find('h1,h2,h3,h4,p,li').each((_, el) => {
    const $el = $(el);
    if ($el.closest('header,footer,nav,[data-ws-hidden]').length) return;
    if ($el.find('h1,h2,h3,h4,p,li').length) return; // only the innermost blocks
    const text = norm($el.text());
    const key = `${el.tagName}|${text}`;
    if (text.length < 2 || text.length > 700 || seen.has(key)) return;
    seen.add(key);
    if (out.length < max) out.push({ i: out.length, tag: el.tagName.toLowerCase(), text });
  });
  return out;
}

export function shopFacts(name: string, info: SiteInfo) {
  return [
    `Shop: ${info.name || name}`,
    info.city && `Location: ${[info.street, info.city, info.region].filter(Boolean).join(', ')}`,
    info.phone && `Phone: ${info.phone}`,
    info.hours && `Hours: ${hoursFormats(info.hours).short}`,
  ].filter(Boolean).join('\n');
}

const VOICE = `Voice: plain, confident and specific, like a trusted local body shop. Short sentences. No hype words
("premier", "unparalleled", "state-of-the-art"), no exclamation marks, no made-up facts, numbers, awards,
warranties or certifications. Only claim what the existing copy or the shop facts say.`;

export const rewritePrompt = (o: { text: string; instruction: string; tag: string; page: string; facts: string }) => ({
  system: `You edit copy on a collision repair shop's website. ${VOICE}
Reply with the rewritten text only: no quotes, no notes, no HTML.`,
  user: `${o.facts}
Page: ${o.page}
Element: <${o.tag}>${o.tag.startsWith('h') ? ' (a heading: keep it short)' : ''}

Current text:
${o.text}

Change requested: ${o.instruction || 'Make it clearer and tighter, same meaning.'}`,
});

export const altPrompt = (o: { page: string; facts: string }) => ({
  system: `You write alt text for images on a collision repair shop's website. Describe what the image shows in
one plain sentence of at most 125 characters, useful to someone who can't see it. Don't start with "Image of" or
"Photo of". Include the shop or location only if it's visibly part of the image. Reply with the alt text only.`,
  user: `${o.facts}\nPage: ${o.page}\n\nWrite alt text for this image.`,
});

export const draftPrompt = (o: { brief: string; page: string; blocks: Block[]; facts: string }) => ({
  system: `You write new pages for a collision repair shop's website by rewriting an existing page's copy for a
new topic. The design stays the same, so you only replace text, block by block. ${VOICE}
Reply with JSON only:
{"title": "...", "description": "...", "headline": "...", "rewrites": [{"i": 0, "text": "..."}]}
- title: 50–60 characters, ends with " | " and the shop name if it fits.
- description: 140–155 characters, specific, ends with a reason to click.
- headline: the new page's main heading (the page's h1).
- rewrites: every block whose text should change for the new topic, by its "i". Keep roughly the same length
  as the original block so the layout holds. Leave out blocks that already fit (contact details, generic steps).
  Plain text only, no HTML.`,
  user: `${o.facts}

New page: ${o.brief}
Starting from the page "${o.page}". Its blocks:
${JSON.stringify(o.blocks)}`,
});

/** Pulls the first JSON object out of a reply. */
export function parseJson<T>(out: string): T | null {
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

export type Draft = { title: string; description: string; headline: string; rewrites: { tag: string; from: string; to: string }[] };

/** Validates Claude's draft against the page's blocks (unknown or unchanged blocks are dropped). */
export function readDraft(out: string, blocks: Block[]): Draft | null {
  const j = parseJson<{ title?: string; description?: string; headline?: string; rewrites?: { i: number; text: string }[] }>(out);
  if (!j) return null;
  const rewrites = (j.rewrites ?? []).flatMap((r) => {
    const b = blocks[Number(r.i)];
    const to = norm(String(r.text ?? '').replace(/<[^>]+>/g, ''));
    return b && to && to !== b.text && b.tag !== 'h1' ? [{ tag: b.tag, from: b.text, to }] : [];
  });
  return { title: String(j.title ?? '').trim(), description: String(j.description ?? '').trim(), headline: String(j.headline ?? '').trim(), rewrites };
}

/** Plain text from a reply: no wrapping quotes or markup. */
export const cleanText = (out: string) => norm(out.replace(/<[^>]+>/g, '')).replace(/^["“'](.*)["”']$/, '$1');
