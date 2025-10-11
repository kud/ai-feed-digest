import Link from "next/link";
import { listEditionSlugs, loadEditionByDate } from "@/lib/load-edition";
import type { EditionDocument } from "@/lib/types";
import { t, getLocale } from "@/lib/i18n";

export const metadata = {
  title: `Archives — ${t("siteTitle")}`
};

export default async function ArchivePage() {
  const slugs = await listEditionSlugs();
  const editions = (await Promise.all(slugs.map((slug) => loadEditionByDate(slug)))).filter(
    (edition): edition is EditionDocument => Boolean(edition)
  );

  return (
    <section aria-labelledby="archive-heading">
      <header>
        <h1 id="archive-heading" className="edition-heading">{t("archiveTitle")}</h1>
        <p className="muted" style={{ fontSize: '1.125rem', marginBottom: '2rem' }}>
          {t("archiveDescription")}
        </p>
        <Link href="/" className="muted" style={{ display: 'inline-block', marginBottom: '2rem' }}>
          {t("backToLatest")}
        </Link>
      </header>
      <div className="archive-list" role="list">
        {editions.map((edition) => {
          return (
            <Link key={edition.slug} href={`/edition/${edition.slug}`} className="archive-item" role="listitem">
              <span className="archive-item__date">{formatEditionDate(edition.date)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function formatEditionDate(date: string): string {
  const locale = getLocale();
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
