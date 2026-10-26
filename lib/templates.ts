import { sql } from './db';
import { slugify } from './fragment';

export type TemplateField = { key: string; label: string; type: 'text' | 'textarea'; placeholder?: string };
export type Template = {
  id: number; slug: string; name: string; description: string | null; brief: string; fields: TemplateField[];
  reference_page_id: number | null; default_canonical: string | null; is_custom: boolean; active: boolean; sort: number;
};

export const listTemplates = (includeInactive = false) => sql<Template[]>`
  select * from templates where ${includeInactive} or active order by sort, name`;

export async function getTemplate(slug: string) {
  const [t] = await sql<Template[]>`select * from templates where slug = ${slug}`;
  return t ?? null;
}

/** Validates template input from the admin form. */
export function cleanTemplate(b: Record<string, any>) {
  const fields = Array.isArray(b.fields) ? b.fields : [];
  return {
    name: String(b.name || '').trim(),
    description: b.description ? String(b.description).trim() : null,
    brief: String(b.brief || '').trim(),
    fields: fields
      .map((f: any) => ({
        key: slugify(String(f.key || f.label || '')).replace(/-/g, '_'),
        label: String(f.label || '').trim(),
        type: f.type === 'text' ? 'text' : 'textarea',
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
      }))
      .filter((f: any) => f.key && f.label),
    reference_page_id: b.referencePageId ? Number(b.referencePageId) : null,
    default_canonical: b.defaultCanonical ? String(b.defaultCanonical).trim() : null,
    active: b.active !== false,
    sort: Number.isFinite(Number(b.sort)) ? Number(b.sort) : 100,
  };
}

