import Anthropic from '@anthropic-ai/sdk';
import { sql, type Dealership } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { MODEL, createSystem, createUser, editSystem, detectScope } from '@/lib/prompt';
import { stashInline, slugify } from '@/lib/fragment';

export const maxDuration = 300;

/**
 * Streams HTML from Claude.
 *  mode "create": { dealershipId, pageType, title, prompt, content, referencePageId }
 *  mode "edit":   { html, instruction }  — html may contain inline-image://N tokens; the client restores them.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('ANTHROPIC_API_KEY is not set on the server', { status: 500 });

  const b = await req.json();
  const client = new Anthropic();
  let system: string;
  let userMsg: string;

  if (b.mode === 'edit') {
    const html = String(b.html || '');
    const instruction = String(b.instruction || '').trim();
    if (!html || !instruction) return new Response('Need the page HTML and an instruction', { status: 400 });
    system = editSystem(detectScope(html));
    userMsg = `CURRENT FRAGMENT:\n${html}\n\nINSTRUCTION:\n${instruction}\n\nReturn the complete revised fragment.`;
  } else {
    const dealershipId = b.dealershipId ? Number(b.dealershipId) : null;
    const [d] = dealershipId ? await sql<Dealership[]>`select * from dealerships where id = ${dealershipId}` : [];
    const title = String(b.title || '').trim() || 'Untitled page';
    const scope = `gcs-${slugify(`${d?.slug ?? 'group'}-${b.pageType || 'page'}`)}`;
    let reference: string | undefined;
    if (b.referencePageId) {
      const [ref] = await sql<{ html: string }[]>`
        select v.html from pages p join page_versions v on v.page_id = p.id and v.number = p.current_version
        where p.id = ${Number(b.referencePageId)}`;
      if (ref) reference = stashInline(ref.html).html.slice(0, 80_000);
    }
    system = createSystem(scope);
    userMsg = createUser({
      dealership: d ?? null, pageType: String(b.pageType || 'custom'), title,
      prompt: String(b.prompt || ''), content: String(b.content || ''), reference,
    });
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      stream.on('text', (t) => controller.enqueue(encoder.encode(t)));
      stream.on('error', (e) => {
        controller.enqueue(encoder.encode(`\n<!--GCS_ERROR:${(e as Error).message}-->`));
        controller.close();
      });
      stream.on('finalMessage', (m) => {
        if (m.stop_reason === 'max_tokens') {
          controller.enqueue(encoder.encode('\n<!--GCS_ERROR:The page was too long for one response, so the result was cut off and not used. Try a narrower instruction, or move embedded images to hosted URLs first.-->'));
        }
      });
      stream.on('end', () => {
        try { controller.close(); } catch {}
      });
    },
    cancel() { stream.abort(); },
  });

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
