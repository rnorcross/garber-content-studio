// Site Info: one place for a shop's name, phone, address, hours, map and social links.
//
// The approved pages hold these as plain text in many spots and formats (header, footer,
// contact blocks, the hours list, the search markup, the page script's templates). We read
// the values the pages were built with ("base") from the business markup on the home page,
// and when someone changes a field, we turn the change into exact find-and-replace pairs
// for every format that value appears in. Unchanged fields produce nothing.

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
const LONG: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const SHORT: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** Opening hours per day, 24-hour "HH:MM". null = closed. */
export type Hours = Record<Day, { open: string; close: string } | null>;
export const SOCIALS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin'] as const;
export type Social = (typeof SOCIALS)[number];

export type SiteInfo = {
  name?: string;
  phone?: string;          // any format; 10 US digits are used
  street?: string;
  city?: string;
  region?: string;         // state, e.g. MI
  zip?: string;
  mapUrl?: string;
  hours?: Hours;
  social?: Partial<Record<Social, string>>;
  leadEmails?: string[];   // contact form recipients (used once the forms are connected)
  estimateEmails?: string[]; // estimate form recipients
};

const digits = (s = '') => s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

/** Reads the shop's details from the AutoBodyShop / LocalBusiness markup in a page. */
export function detectInfo(html: string): SiteInfo {
  const out: SiteInfo = {};
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let biz: any = null;
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      const list = Array.isArray(j) ? j : j['@graph'] ?? [j];
      biz = list.find((x: any) => /AutoBodyShop|AutoRepair|LocalBusiness|AutomotiveBusiness/.test(String(x['@type'])));
      if (biz) break;
    } catch {}
  }
  if (!biz) return out;
  if (biz.name) out.name = biz.name;
  if (biz.telephone) out.phone = fmtPhone(digits(biz.telephone));
  const a = biz.address || {};
  if (a.streetAddress) out.street = a.streetAddress;
  if (a.addressLocality) out.city = a.addressLocality;
  if (a.addressRegion) out.region = a.addressRegion;
  if (a.postalCode) out.zip = a.postalCode;
  if (biz.hasMap) out.mapUrl = biz.hasMap;
  const social: SiteInfo['social'] = {};
  for (const u of [].concat(biz.sameAs || []) as string[]) {
    const k = SOCIALS.find((s) => u.includes(`${s}.com`));
    if (k) social[k] = u;
  }
  if (Object.keys(social).length) out.social = social;
  if (Array.isArray(biz.openingHoursSpecification)) {
    const h = Object.fromEntries(DAYS.map((d) => [d, null])) as Hours;
    for (const s of biz.openingHoursSpecification) {
      for (const day of [].concat(s.dayOfWeek || []) as string[]) {
        const d = DAYS.find((x) => LONG[x] === String(day).replace(/^.*\//, ''));
        if (d && s.opens && s.closes) h[d] = { open: s.opens.slice(0, 5), close: s.closes.slice(0, 5) };
      }
    }
    out.hours = h;
  }
  return out;
}

export const fmtPhone = (d: string) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);

/** "07:30" → "7:30am", "17:00" → "5:00pm". */
export function fmtTime(t: string) {
  const [H, M] = t.split(':').map(Number);
  const h = H % 12 || 12;
  return `${h}:${String(M || 0).padStart(2, '0')}${H < 12 ? 'am' : 'pm'}`;
}

/** Consecutive days with the same hours, in week order. */
function groups(h: Hours) {
  const out: { days: Day[]; v: Hours[Day] }[] = [];
  for (const d of DAYS) {
    const v = h[d];
    const last = out[out.length - 1];
    const same = last && JSON.stringify(last.v) === JSON.stringify(v);
    if (same) last.days.push(d); else out.push({ days: [d], v });
  }
  return out;
}

/** The formats the pages show hours in. */
export function hoursFormats(h: Hours) {
  const g = groups(h);
  // The pages list each closed day on its own line ("Saturday: Closed", "Sunday: Closed").
  const longGroups = g.flatMap((x) => (x.v ? [x] : x.days.map((d) => ({ days: [d], v: null }))));
  const longLines = longGroups.map(({ days, v }) => {
    const label = days.length > 1 ? `${LONG[days[0]]} - ${LONG[days[days.length - 1]]}` : LONG[days[0]];
    return `${label}: ${v ? `${fmtTime(v.open)} - ${fmtTime(v.close)}` : 'Closed'}`;
  });
  const short = g.filter((x) => x.v).map(({ days, v }) => {
    const label = days.length > 1 ? `${SHORT[days[0]]}–${SHORT[days[days.length - 1]]}` : SHORT[days[0]];
    return `${label} ${fmtTime(v!.open)}–${fmtTime(v!.close)}`;
  }).join(', ');
  const spec = g.filter((x) => x.v).map(({ days, v }) => ({
    '@type': 'OpeningHoursSpecification', dayOfWeek: days.map((d) => LONG[d]), opens: v!.open, closes: v!.close,
  }));
  return { longLines, short, spec };
}

const BR_HTML = '<br>';
const BR_TPL = '",{"n":"br","a":{}},"'; // how a line break sits inside the page script's templates

/** Escapes a value the way it appears inside HTML attributes/text and inside JSON strings. */
const variants = (from: string, to: string): [string, string][] => {
  const out: [string, string][] = [[from, to]];
  const he = (s: string) => s.replace(/&/g, '&amp;');
  if (he(from) !== from) out.push([he(from), he(to)]);
  const je = (s: string) => JSON.stringify(s).slice(1, -1);
  if (!from.includes('"') && je(from) !== from) out.push([je(from), je(to)]);
  return out;
};

/**
 * Exact find → replace pairs that turn the base values into the current ones.
 * Longest first, so a full address line is replaced before the street alone.
 */
export function infoReplacements(base: SiteInfo, cur: SiteInfo, html?: string): [string, string][] {
  const pairs: [string, string][] = [];
  const add = (from?: string, to?: string) => {
    if (!from || to == null || to === '' || from === to) return;
    pairs.push(...variants(from, to));
  };

  add(base.name, cur.name);

  const bd = digits(base.phone), cd = digits(cur.phone);
  if (bd.length === 10 && cd.length === 10 && bd !== cd) {
    const f = (d: string) => [
      `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
      `+1-${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
      `+1${d}`,
      `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
      `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`,
    ];
    const a = f(bd), b = f(cd);
    a.forEach((x, i) => add(x, b[i]));
  }

  const addr = (i: SiteInfo) => ({
    full: `${i.street}, ${i.city}, ${i.region} ${i.zip}`,
    line2: `${i.city}, ${i.region} ${i.zip}`,
  });
  if (base.street && base.city && base.region && base.zip) {
    const c = { street: cur.street || base.street, city: cur.city || base.city, region: cur.region || base.region, zip: cur.zip || base.zip };
    const A = addr(base), B = addr(c);
    add(A.full, B.full);
    add(A.line2, B.line2);
    add(`"streetAddress":"${base.street}"`, `"streetAddress":"${c.street}"`);
    add(`"addressLocality":"${base.city}"`, `"addressLocality":"${c.city}"`);
    add(`"addressRegion":"${base.region}"`, `"addressRegion":"${c.region}"`);
    add(`"postalCode":"${base.zip}"`, `"postalCode":"${c.zip}"`);
    add(base.street, c.street);
  }

  add(base.mapUrl, cur.mapUrl);
  for (const s of SOCIALS) add(base.social?.[s], cur.social?.[s]);

  if (base.hours && cur.hours && JSON.stringify(base.hours) !== JSON.stringify(cur.hours)) {
    const A = hoursFormats(base.hours), B = hoursFormats(cur.hours);
    add(A.longLines.join(BR_HTML), B.longLines.join(BR_HTML));
    add(A.longLines.join(BR_TPL), B.longLines.join(BR_TPL));
    add(A.short, B.short);
    // The search markup: replace the whole openingHoursSpecification array as it appears.
    const m = html?.match(/"openingHoursSpecification":\[(?:\{[^{}]*\},?)*\]/);
    if (m) add(m[0], `"openingHoursSpecification":${JSON.stringify(B.spec)}`);
  }

  return pairs.sort((x, y) => y[0].length - x[0].length);
}

/** Which fields differ between two infos (for "unpublished" badges). */
export const infoChanged = (a: SiteInfo = {}, b: SiteInfo = {}) => JSON.stringify(a) !== JSON.stringify(b);

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const emails = (v: unknown) =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/)).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20);
const time = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

/** Keeps only known fields, trimmed and validated, from what the form sent. */
export function cleanInfo(b: any): SiteInfo {
  const out: SiteInfo = {};
  for (const k of ['name', 'phone', 'street', 'city', 'region', 'zip', 'mapUrl'] as const) {
    const v = str(b[k], k === 'mapUrl' ? 2000 : 200);
    if (v) out[k] = v;
  }
  if (b.hours && typeof b.hours === 'object') {
    out.hours = Object.fromEntries(DAYS.map((d) => {
      const h = b.hours[d];
      const open = time(h?.open), close = time(h?.close);
      return [d, open && close ? { open, close } : null];
    })) as Hours;
  }
  if (b.social && typeof b.social === 'object') {
    const s: SiteInfo['social'] = {};
    for (const k of SOCIALS) { const v = str(b.social[k], 500); if (v && /^https?:\/\//.test(v)) s[k] = v; }
    out.social = s;
  }
  out.leadEmails = emails(b.leadEmails);
  out.estimateEmails = emails(b.estimateEmails);
  return out;
}
