# Garber Content Studio

A small CMS for the HTML content the Garber marketing team embeds on dealership websites (Dealer.com content pages, homepage sections, About Us sets and similar).

- **Templates**: About Us, Mission/Vision/Values, Reviews, Community, History, and Custom (built from a prompt). Each template is a brief Claude follows, the inputs the form asks for, and a reference page to match. Admins add and edit templates under **Templates**.
- **Create**: pick a dealership and template, fill in the inputs, and Claude builds a paste-ready fragment in the Garber design system, then writes the page's meta title and description.
- **Import**: paste the HTML already on a dealer site (or upload a saved `.html` file) to bring it under version control.
- **Edit** four ways: type directly on the preview, ask Claude for a change, edit the code, or swap images.
- **Every save is a version.** History shows who changed what; any version can be previewed and restored.
- **Know what's live.** After pasting a page into Dealer.com, **Set live** records which version, the live URL, a note, and who did it and when. Every entry stays in the page's live log. When someone edits it later, the library flags it **Re-paste needed**.
- **Search & social** per page: meta title and description (character counters, Write with Claude, copy buttons for Dealer.com's SEO fields), optional canonical URL. Open Graph and Twitter tags are written at copy time from those fields plus the **dealership's** Open Graph image, set on each dealership's page.
- **Copy HTML / Download** gives the exact fragment to paste into the Dealer.com content area, social tags included.
- **Media library**: upload images, video and PDFs per dealership, pick them from the editor, or move every embedded image on a page to hosted URLs in one click. Photos over 2,400px are scaled down before upload.
- **Paste safety**: generated pages scope every CSS rule to one wrapper class, so nothing restyles the dealer site around it. Imported pages can be scoped with one click (Details tab).
- **Team sign-in** with admin and editor roles.

## Deploy (Vercel + Neon, same as Bios for Dealerships)

1. **Repo**: push this folder to a GitHub repo, for example `rnorcross/garber-content-studio`.
2. **Vercel**: Add New → Project → import the repo. Framework preset: Next.js. Don't deploy yet.
3. **Database**: in the Vercel project, Storage → Create → Neon Postgres, and connect it to the project. This adds `DATABASE_URL`.
4. **Image storage**: Storage → Create → Blob, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`. Uploads go straight from the browser to Blob (no size limit from the serverless function), are stored durably, and are served from Vercel's CDN at permanent URLs.
5. **Environment variables** (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | An API key from console.anthropic.com |
   | `AUTH_SECRET` | Any random string of 32+ characters (`openssl rand -base64 48`) |
   | `ADMIN_EMAIL` | The first admin's email, e.g. `rnorcross@garberauto.com` |
   | `ADMIN_PASSWORD` | A first-sign-in password for that admin (change it after) |
   | `ADMIN_NAME` | Optional, e.g. `Robert Norcross` |
   | `ANTHROPIC_MODEL` | Optional, defaults to `claude-sonnet-5-5` |

6. **Create tables and load content**, from this folder on any computer with Node 20+:

   ```bash
   npm install
   DATABASE_URL="<the Neon connection string>" npm run db:migrate
   DATABASE_URL="<the Neon connection string>" npm run db:seed
   ```

   The seed loads all 36 dealerships (roster, logos and storefront photos from `assets.garberauto.com`), the six starter templates, and the four imported Garber Buick pages. It's safe to run again, and it never overwrites templates you've edited in the app. Run `db:migrate` again after updates; it only adds what's missing.

7. **Deploy** in Vercel, open the site, and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. That creates the first admin. Add teammates from **Team**; each gets a temporary password and picks their own on first sign-in.

## Local development

```bash
cp .env.example .env.local   # fill in values; a local Postgres works for DATABASE_URL
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

## How pasting works

Every page is a fragment, not a full document: optional social-share meta tags, the Work Sans font link, one `<style>` block, then one wrapper `<div class="gcs-…">`. No header or footer, since Dealer.com supplies those. Paste the whole thing into the content area of the Dealer.com page.

Embedded images (`data:` URIs) work but make the paste heavy. The **Images** tab lists every image, flags embedded ones, and **Host all embedded images** uploads them to the media library and swaps in the hosted URLs (the Garber Buick About page drops from about 3 MB to about 116 KB). Any image can also be replaced by uploading, picking from the library, or pasting a URL.

Each dealership's Open Graph image defaults to `assets.garberauto.com/assets/open-graph/open-graph-<store>.jpg`. The dealership page shows whether that file exists and lets an admin pick or upload a different one.

Without `BLOB_READ_WRITE_TOKEN` (local development), uploads are saved under `.data/uploads` instead.

## Notes

- Claude edits send the page with embedded images collapsed to short tokens and restore them afterward, so a 3 MB page costs roughly what its markup does.
- Very long pages can exceed what Claude returns in one response. When that happens the result is discarded with a message rather than saved half-finished. Narrower instructions or hosted images help.
- Generation can take a minute or two on long pages. The API route allows up to 300 seconds, the limit on Vercel's standard plan.
- `scripts/build-seed.mjs` documents how the Garber Buick pages were converted from the preview site; it isn't needed again.
