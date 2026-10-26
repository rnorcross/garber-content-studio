import Anthropic from '@anthropic-ai/sdk';
import { sql, type Dealership } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { MODEL } from '@/lib/prompt';

export const maxDuration = 60;

/** Visible text of a fragment, trimmed for the prompt. */
function pageText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

// Writes an SEO meta title (≤60 chars) and description (≤155 chars) for a page.
export const POST = route(async (req) => {
  if (!process.env.ANTHROPIC_API_KEY) return fail('ANTHROPIC_API_KEY is not set on the server', 500);
  const b = await req.json();
  const text = pageText(String(b.html || ''));
  if (!text) return fail('The page has no text yet');
  const [d] = b.dealershipId ? await sql<Dealership[]>`select * from dealerships where id = ${Number(b.dealershipId)}` : [];

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: 'You write SEO metadata for Garber Automotive Group dealership web pages. Reply with JSON only: {"title": "...", "description": "..."}.',
    messages: [{
      role: 'user',
      content: `Dealership: ${d ? `${d.name}${d.city ? `, ${d.city}` : ''}` : 'Garber Automotive Group (group page)'}
Page: ${String(b.title || '')} (${String(b.template || 'page')})

Rules:
- title: 50–60 characters, includes the dealership name and city when it fits, front-loads what the page is about. No ALL CAPS, no pipes stacked with keywords.
- description: 140–155 characters, plain and specific, written for a person scanning search results, ends with a reason to click. Only facts from the page text.

PAGE TEXT:
${text}`,
    }],
  });
  const out = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return fail('Claude didn’t return metadata — try again');
  const parsed = JSON.parse(m[0]);
  return json({ title: String(parsed.title || '').trim(), description: String(parsed.description || '').trim() });
});
