import Anthropic from '@anthropic-ai/sdk';
import { sql, type Dealership } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { MODEL, createSystem, createUser, editSystem, editUser, detectScope, type EditReference, type MediaHint } from '@/lib/prompt';
import { stashInline, slugify } from '@/lib/fragment';
import { getTemplate } from '@/lib/templates';

export const maxDuration = 300;

/**
 * Streams HTML from Claude.
 *  mode "create": { dealershipId, templateSlug, title, prompt, fields, referencePageId }
 *  mode "edit":   { html, instruction, references?: [{ id, title, html }] }  — html may contain inline-image://N tokens; the client restores them.
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
    // other pages the person pointed at (the client fetches and stashes them so image tokens line up)
    const refs: EditReference[] = (Array.isArray(b.references) ? b.references : []).slice(0, 3).map((r: any) => ({
      id: Number(r.id), title: String(r.title || ''), html: String(r.html || '').slice(0, 120_000),
    })).filter((r: EditReference) => r.id && r.html);
    userMsg = editUser(html, instruction, refs);
  } else {
    const dealershipId = b.dealershipId ? Number(b.dealershipId) : null;
    const [d] = dealershipId ? await sql<Dealership[]>`select * from dealerships where id = ${dealershipId}` : [];
    const title = String(b.title || '').trim() || 'Untitled page';
    const template = await getTemplate(String(b.templateSlug || 'custom'));
    const scope = `gcs-${slugify(`${d?.slug ?? 'group'}-${template?.slug ?? 'page'}`)}`;
    // the template's reference page unless the person picked another (or "none" = 0)
    const refId = b.referencePageId === undefined || b.referencePageId === null || b.referencePageId === ''
      ? template?.reference_page_id : Number(b.referencePageId);
    let reference: string | undefined;
    if (refId) {
      const [ref] = await sql<{ html: string }[]>`
        select v.html from pages p join page_versions v on v.page_id = p.id and v.number = p.current_version
        where p.id = ${refId}`;
      if (ref) reference = stashInline(ref.html).html.slice(0, 80_000);
    }
    const media = await sql<MediaHint[]>`
      select url, alt, width, height, filename from media
      where (dealership_id = ${dealershipId} or (${dealershipId}::int is null and dealership_id is null))
        and content_type like 'image/%'
      order by created_at desc limit 40`;
    system = createSystem(scope);
    userMsg = createUser({
      dealership: d ?? null, template, title, prompt: String(b.prompt || ''),
      fields: (b.fields && typeof b.fields === 'object' ? b.fields : {}) as Record<string, string>,
      media: [...media], reference,
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
