import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import { getSite } from '@/lib/bodyshop';
import SiteInfoForm from './SiteInfoForm';

export const dynamic = 'force-dynamic';

export default async function SiteInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const site = await getSite((await params).slug);
  if (!site) notFound();
  return (
    <>
      <TopBar user={user} on="bs-sites" />
      <main className="wrap" style={{ maxWidth: 980 }}>
        <div className="head">
          <div>
            <div className="eyebrow"><Link href="/body-shop/sites">Sites</Link> · <Link href={`/body-shop/sites/${site.slug}`}>{site.name}</Link></div>
            <h1 className="title">Site info</h1>
            <p className="sub">The shop’s details in one place. A change here updates every page that shows it: header, footer, contact blocks, hours lists and the business details Google reads.</p>
          </div>
        </div>
        <SiteInfoForm slug={site.slug} base={site.info_base} info={site.info} live={site.live_info} />
      </main>
    </>
  );
}
