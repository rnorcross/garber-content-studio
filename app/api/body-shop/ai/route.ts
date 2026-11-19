import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { MODEL } from '@/lib/prompt';
import { getPage, getSite, renderPage, type BsSite } from '@/lib/bodyshop';
import { pageBlocks, shopFacts, rewritePrompt, altPrompt, draftPrompt, readDraft, cleanText } from '@/lib/bodyshop-ai';

export const maxDuration = 300;

const text = (m: Anthropic.Message) => m.content.map((c) => (c.type === 'text' ? c.text : '')).join('');

// Claude in the body shop editor. action: rewrite | alt | draft (all return suggestions; nothing is saved here).
export const POST = route(async (req) => {
  if (!process.env.ANTHROPIC_API_KEY) return fail('ANTHROPIC_API_KEY is not set on the server', 500);
  const b = await req.json();
  const page = await getPage(Number(b.pageId));
  if (!page) return fail('Page not found', 404);
  const [row] = await sql<BsSite[]>`select * from bs_sites where id = ${page.site_id}`;
  const site = (await getSite(row.slug))!;
  const facts = shopFacts(site.name, site.info);
  const client = new Anthropic();

  if (b.action === 'rewrite') {
    const p = rewritePrompt({ text: String(b.text || ''), instruction: String(b.instruction || ''), tag: String(b.tag || 'p'), page: page.title, facts });
    const m = await client.messages.create({ model: MODEL, max_tokens: 800, system: p.system, messages: [{ role: 'user', content: p.user }] });
    return json({ text: cleanText(text(m)) });
  }

  if (b.action === 'alt') {
    let src = String(b.src || '');
    if (src.startsWith('/')) {
      // Claude fetches the image itself, so it needs a full public address.
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
      src = `${req.headers.get('x-forwarded-proto') || 'https'}://${host}${src}`;
    }
    const p = altPrompt({ page: page.title, facts });
    const m = await client.messages.create({
      model: MODEL, max_tokens: 200, system: p.system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: src } }, { type: 'text', text: p.user }] }],
    });
    return json({ alt: cleanText(text(m)).slice(0, 160) });
  }

  if (b.action === 'draft') {
    const brief = String(b.brief || '').trim();
    if (brief.length < 4) return fail('Describe the new page, e.g. “State Farm claims: how we work with State Farm in Saginaw”');
    const blocks = pageBlocks(renderPage(site, page, 'draft'));
    const p = draftPrompt({ brief, page: page.title, blocks, facts });
    const m = await client.messages.create({ model: MODEL, max_tokens: 8000, system: p.system, messages: [{ role: 'user', content: p.user }] });
    const d = readDraft(text(m), blocks);
    if (!d) return fail('Claude didn’t return a usable draft. Try again or shorten the brief.');
    return json(d);
  }
  return fail('Unknown action');
});
