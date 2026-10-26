import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { storageMode, saveLocal, safeName, ALLOWED_TYPES } from '@/lib/storage';

// Local development upload (no Blob store configured): saves to .data/uploads.
export const POST = route(async (req, user) => {
  if (storageMode() !== 'local') return fail('Uploads go straight to Blob storage here');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file');
  if (!ALLOWED_TYPES.includes(file.type)) return fail('That file type isn’t allowed');
  const folder = String(form.get('folder') || 'group');
  const { url, pathname } = await saveLocal(folder, safeName(file.name), Buffer.from(await file.arrayBuffer()));
  const dealershipId = form.get('dealershipId') ? Number(form.get('dealershipId')) : null;
  const [row] = await sql`
    insert into media (url, pathname, filename, content_type, size, width, height, alt, dealership_id, uploaded_by)
    values (${url}, ${pathname}, ${file.name}, ${file.type}, ${file.size}, ${Number(form.get('width')) || null},
            ${Number(form.get('height')) || null}, ${String(form.get('alt') || '') || null}, ${dealershipId}, ${user.id})
    returning *`;
  return json(row);
});
