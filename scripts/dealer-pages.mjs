// Builds each dealership's version of the template pages from the Garber Buick originals.
//
// Mission/Vision/Values, Community and History are group-branded and essentially identical
// across stores, so they get the store's links and a local line. About Us gets the store's
// name, city, brands, logo, storefront and links, with copy that's true for every Garber store.
// Reviews is assembled from the About page's reviews + recognition sections.
//
// Anything only the store can supply (Google rating, review text) is a bracketed placeholder.
import * as cheerio from 'cheerio';

const STATES = { FL: 'Florida', GA: 'Georgia', MI: 'Michigan', NY: 'New York', IL: 'Illinois', IN: 'Indiana', SC: 'South Carolina' };
const GREAT_LAKES_BAY = ['Saginaw', 'Midland', 'Bay City', 'Linwood', 'Chesaning'];

// Garber Buick image files (seed/assets) the builder swaps or removes.
export const ASSET = {
  buickStorefront: 'gcs-asset://7276efa9bb44c423.jpg',
  buickLogoWhite: 'gcs-asset://35567681083a49c2.webp',
  originalBuilding: 'gcs-asset://17fc76037040a206.jpg',
};

export const TITLES = { about: 'About Us', mission: 'Mission, Vision & Values', reviews: 'Reviews', community: 'Community', history: 'Our History' };

/** Store facts used in copy. */
export function storeFacts(d) {
  const [cityName, st = ''] = (d.city ?? '').split(',').map((s) => s.trim());
  const brands = d.makes ?? [];
  const brandList = brands.length <= 1 ? brands.join('') : `${brands.slice(0, -1).join(', ')} and ${brands.at(-1)}`;
  const website = (d.website ?? '').replace(/\/+$/, '');
  return {
    name: d.name, slug: d.slug, city: cityName || d.city || '', st, state: STATES[st] ?? st,
    place: st ? `${cityName}, ${st}` : cityName,
    region: GREAT_LAKES_BAY.includes(cityName) ? 'Great Lakes Bay Region' : `${cityName}-area`,
    brands, brandList, website,
    logoWhite: d.logo_white || d.logoWhite || d.logo || null,
    storefront: d.image_h || d.imageHorizontal || null,
    reviewsUrl: `https://www.google.com/search?q=${encodeURIComponent(`${d.name} ${cityName} reviews`)}`,
  };
}

/** Swaps the Garber Buick links and scope class for the store's. */
function relink(html, f, fromScope, toScope) {
  let out = html.split(fromScope).join(toScope).replace(/([.!?,])<br\s*\/?>/g, '$1 <br>');
  if (f.website) out = out.split('https://www.garberbuick.com').join(f.website);
  out = out
    .replace(/https:\/\/www\.garbercareers\.com\/garber-automotive-group\/garber-buick\/?/g, 'https://www.garbercareers.com/')
    .replace(/https:\/\/www\.google\.com\/search\?q=Garber\+Buick\+Saginaw\+reviews[^"']*/g, f.reviewsUrl.replace(/&/g, '&amp;'));
  return out;
}

const load = (html) => cheerio.load(html, { xml: false }, false);

/** Replaces the text of the first element whose own text equals `from`. */
function setText($, from, to, sel = '*') {
  const el = $(sel).filter((_, e) => $(e).text().trim() === from).last();
  if (!el.length) throw new Error(`Text not found in source page: “${from.slice(0, 60)}”`);
  el.text(to);
  return el;
}
function setTextStartsWith($, start, to, sel = 'p') {
  const el = $(sel).filter((_, e) => $(e).text().trim().startsWith(start)).first();
  if (!el.length) throw new Error(`Paragraph not found in source page: “${start}”`);
  el.text(to);
  return el;
}

/** Swaps the preview's sample review cards (and its unused EmbedSocial stub) for placeholders. */
function placeholderReviewCards($, f) {
  $('#reviews-live').remove();
  $('#reviews-sample .card').each((_, card) => {
    const c = $(card);
    c.find('p.card-text').text('[Paste a recent 5-star Google review for this store.]');
    c.find('span').filter((_, e) => $(e).css('font-weight') === '700').first().text('[Customer name]');
    c.find('span').filter((_, e) => $(e).text().trim() === 'Garber Buick' || $(e).text().trim() === f.name).text(f.name);
    c.find('span').filter((_, e) => $(e).text().trim() === '2 days ago').text('Google review');
  });
  $('span').filter((_, e) => $(e).text().trim().startsWith('Reviews shown are')).text(`Reviews are 5-star Google reviews of ${f.name}.`);
}

/** For stores other than Garber Buick: no testimonial videos, placeholder rating. */
function genericReviews($, f) {
  // the section was sized for the video row; let it fit what's left
  $('#reviews-sample').closest('section').css('height', 'auto');
  $('.video-row').remove();
  $('#gcs-video-modal').remove();
  $('style').filter((_, e) => $(e).text().includes('.gcs-video-modal')).remove();
  $('script').filter((_, e) => $(e).text().includes('gcs-video-modal')).remove();
  $('span').filter((_, e) => $(e).text().trim() === '4.8').text('[#.#]');
  $('strong').filter((_, e) => $(e).text().trim() === '2,877').text('[####]');
  $('span').filter((_, e) => /Google reviews for Garber Buick$/.test($(e).text().trim())).each((_, e) => {
    $(e).contents().filter((_, n) => n.type === 'text').last().replaceWith(` Google reviews for ${f.name}`);
  });
  placeholderReviewCards($, f);
}

export function buildAbout(src, f) {
  const $ = load(relink(src, f, 'gcs-garber-buick-about', `gcs-${f.slug}-about`));
  // hero
  setText($, 'Saginaw, Michigan', f.state ? `${f.city}, ${f.state}` : f.city, 'span');
  const logo = $(`img[src="${ASSET.buickLogoWhite}"]`);
  if (f.logoWhite) logo.attr('src', f.logoWhite).attr('alt', f.name); else logo.remove();
  $(`img[src="${ASSET.buickStorefront}"]`).each((_, e) => { $(e).attr('src', f.storefront ?? ASSET.originalBuilding); });
  setText($, 'Where Garber began.', `Your ${f.brandList || 'new and used car'} dealer in ${f.city}.`, 'p');
  setTextStartsWith($, 'Garber Buick is the oldest family-owned',
    `${f.name} is part of Garber Automotive Group, the family-owned dealership group founded in 1907 and still run by the same family three generations later. Every Garber store makes the same promise – you’ll do better at Garber.`);
  $('button').filter((_, e) => $(e).text().trim() === 'Shop New Buicks').text(f.brands.length === 1 ? `Shop New ${f.brands[0]}` : 'Shop New Vehicles');

  // about our dealership
  setText($, 'The flagship of the Garber family.', `Part of the Garber family.`, 'h2');
  setText($, 'Every Garber store traces its roots back to this Buick Showroom on State Street.',
    `Every Garber store traces its roots back to one Buick showroom in Saginaw, Michigan.`, 'p');
  setTextStartsWith($, 'Garber Buick is where the Garber Automotive Group story began.',
    `${f.name} is one of more than 25 Garber dealerships across six states, all owned by the same family that started selling Buicks in Saginaw in 1907. Here in ${f.city}, that means new ${f.brandList || 'vehicles'}, a used car lot with vehicles to match any price point, a service department that keeps you on the road, and a team that treats you like a neighbor — because you are one.`);
  setTextStartsWith($, 'We believe we are only doing our jobs',
    `We believe we are only doing our jobs when we create an experience for you where you choose to return and do business with us again. That includes taking vehicle trade-ins, offering special promotions, and providing financing assistance to help you get into the vehicle you need. And once you've driven off the lot, our service team can keep your vehicle in prime condition. These are just some of the reasons you'll do better at Garber!`);
  $('span').filter((_, e) => $(e).text().trim() === 'New Buick sales and leasing').text(`New ${f.brandList || 'vehicle'} sales and leasing`);
  // then and now
  setText($, 'Saginaw, 1910s', 'Where it began: Saginaw, 1910s', 'span');
  const now = $('img[alt="State Street, today"]');
  if (f.storefront) {
    now.attr('alt', `${f.name}, today`);
    setText($, 'State Street, today', `${f.city}, today`, 'span');
  } else {
    // no storefront photo on file: show the original building on its own
    now.closest('div').parent().remove();
    $('img[alt="The original Garber Buick building"]').closest('div[style*="grid-template-columns: repeat(2"]').css('grid-template-columns', 'minmax(0, 1fr)');
  }
  $('img[alt="The original Garber Buick building"]').attr('alt', 'The original Garber Buick building in Saginaw');

  genericReviews($, f);

  // community
  setTextStartsWith($, 'At Garber Buick, showing up for the community',
    `At ${f.name}, showing up for the community means sponsoring ${f.region} organizations, supporting events our team is passionate about, and giving to causes our customers bring to us. If it matters to ${f.city}, it matters here.`);
  // closing
  setTextStartsWith($, 'Stop by State Street, meet the team',
    `Stop by ${f.name} in ${f.city}, meet the team, and find out why Garber customers come back — generation after generation.`);
  return $.html();
}

/** Group pages: links, scope, and a local line in the closing section. */
function buildGroupPage(src, f, slugFrom, slugTo, closing) {
  const $ = load(relink(src, f, slugFrom, slugTo));
  const p = $('section').last().find('p.lead').first();
  if (!p.length) throw new Error('Closing paragraph not found');
  p.text(closing);
  return $.html();
}

export const buildMission = (src, f) => buildGroupPage(src, f, 'gcs-garber-buick-mission', `gcs-${f.slug}-mission`,
  `Stop by ${f.name} in ${f.city} and put our values to the test.`);
export const buildHistory = (src, f) => buildGroupPage(src, f, 'gcs-garber-buick-history', `gcs-${f.slug}-history`,
  `Whether you buy, service or come to work at ${f.name}, you join a story that started in 1907.`);
export const buildCommunity = (src, f) => buildGroupPage(src, f, 'gcs-garber-buick-community', `gcs-${f.slug}-community`,
  `Stop by ${f.name} in ${f.city} and find out what more than a century of being a good neighbor looks like.`);

/**
 * Reviews: a hero (from the Community page's hero), the About page's reviews and
 * recognition sections, and a closing call to action. Garber Buick keeps its real rating
 * and testimonial videos; other stores get placeholders for the rating and reviews.
 */
export function buildReviews(aboutSrc, communitySrc, f, { isBuick = false } = {}) {
  const scope = `gcs-${f.slug}-reviews`;
  const about = load(relink(aboutSrc, f, 'gcs-garber-buick-about', scope));
  const comm = load(relink(communitySrc, f, 'gcs-garber-buick-community', scope));
  const wrapper = about(`div.${scope}`).first();
  const sections = wrapper.children('section');
  const reviews = sections.filter((_, s) => about(s).text().includes('Thousands of happy customers.')).first();
  const recognition = sections.filter((_, s) => about(s).text().includes('Rated by customers. Ranked by the industry.')).first();
  if (!reviews.length || !recognition.length) throw new Error('Reviews or recognition section not found on the About page');

  const hero = comm(`div.${scope} > section`).first().clone();
  const heroImg = hero.find('img').first();
  heroImg.attr('src', f.storefront ?? heroImg.attr('src')).attr('alt', '');
  hero.find('.eyebrow').first().text(`${f.name} · ${f.state ? `${f.city}, ${f.state}` : f.city}`);
  hero.find('span, div').filter((_, e) => comm(e).children().length === 0 && comm(e).text().trim() === 'Community').first().text('Reviews');
  hero.find('h1').first().text('What our customers say');
  hero.find('p').eq(0).text('Real reviews from real neighbors.');
  hero.find('p.lead').first().text(
    `Garber dealerships average a 4.9-star Google rating — #1 in America for customer service among the Top 150 dealership groups, according to a Widewail study of every dealership Google profile in the U.S. (Q4 2025–Q1 2026). Here’s what ${isBuick ? 'our' : f.name} customers have to say.`);

  const closing = comm(`div.${scope} > section`).last().clone();
  closing.find('h2').first().text('Join thousands of happy Garber customers.');
  closing.find('p.lead').first().text(`Bought or had your vehicle serviced at ${f.name} recently? We’d love to hear how we did.`);
  closing.find('a').last().attr('href', f.reviewsUrl).attr('target', '_blank').attr('rel', 'noopener')
    .find('button').text('Leave a Review');

  // keep the About page's styles and video player; replace its sections with ours
  const keep = wrapper.children(':not(section)');
  wrapper.empty().append(hero, reviews, recognition, closing, keep);
  if (isBuick) placeholderReviewCards(about, f); else genericReviews(about, f);
  return about.html();
}

/** Meta title/description per template (Claude can rewrite them later in the app). */
export function metaFor(template, f) {
  const at = f.place || f.city;
  const fit = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
  const first = (n, ...opts) => opts.find((o) => o.length <= n) ?? fit(opts.at(-1), n);
  const m = {
    about: [first(60, `About ${f.name} | ${at}`, `About ${f.name}`), `${f.name} in ${at} is part of family-owned Garber Automotive Group. New ${f.brandList || 'vehicles'}, used cars, service and financing.`],
    mission: [first(60, `Mission, Vision & Values | ${f.name}`, `Mission & Values | ${f.name}`), first(160, `The mission, vision and six core values that guide ${f.name} and every Garber Automotive Group dealership — doing the right thing since 1907.`, `The mission, vision and core values behind ${f.name} and every Garber Automotive Group store — doing the right thing since 1907.`)],
    reviews: [first(60, `${f.name} Reviews | ${at}`, `${f.name} Reviews`), `Read what customers say about ${f.name} in ${at}. Garber Automotive Group is rated #1 in America for customer service.`],
    community: [first(60, `Community | ${f.name} in ${at}`, `Community | ${f.name}`), `How ${f.name} and Garber Automotive Group give back: $1.5M+ a year to local organizations and 10,000+ volunteer hours.`],
    history: [first(60, `Our History | ${f.name} · Garber Since 1907`, `Our History | ${f.name}`), `From one Buick store in 1907 to 25+ dealerships in six states — the family story behind ${f.name} and Garber Automotive Group.`],
  }[template];
  return { title: fit(m[0], 60), description: fit(m[1], 160) };
}

/** The imported Garber Buick About page still carries the preview's sample review cards. */
export function cleanSampleReviews(html, d) {
  const $ = load(html);
  placeholderReviewCards($, storeFacts(d));
  return $.html();
}

/** Builds one template page for a store. */
export function buildPage(template, sources, d) {
  const f = storeFacts(d);
  const isBuick = d.slug === 'garber-buick';
  switch (template) {
    case 'about': return buildAbout(sources.about, f);
    case 'mission': return buildMission(sources.values, f);
    case 'history': return buildHistory(sources.history, f);
    case 'community': return buildCommunity(sources.community, f);
    case 'reviews': return buildReviews(sources.about, sources.community, f, { isBuick });
    default: throw new Error(`No builder for template ${template}`);
  }
}

export function notesFor(template, f) {
  const base = `Pre-built from the Garber Buick ${TITLES[template]} page with ${f.name}'s name, links and images.`;
  if (template === 'about') return `${base} To finish: add the store's own story to "About our dealership" (when it opened or joined Garber, what it's known for), and fill in the Google rating, review count and three reviews marked with brackets. Paste the facts into Ask Claude and it will write them in.`;
  if (template === 'reviews') return `${base} To finish: fill in the Google rating, review count and reviews marked with brackets (Ask Claude can place reviews you paste in), and add testimonial videos if the store has them.`;
  return `${base} Group-branded content; only the links and closing line are local.`;
}
