import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listEditionSlugs, loadEditionByDate } from "@/lib/load-edition";
import type { EditionDocument } from "@/lib/types";
import { Tag } from "@/components/ui";
import { t, getLocale } from "@/lib/i18n";

export async function generateStaticParams() {
  const slugs = await listEditionSlugs();
  return slugs.map((slug) => ({ date: slug }));
}

interface EditionPageProps {
  params: Promise<{
    date: string;
  }>;
}

export async function generateMetadata({ params }: EditionPageProps): Promise<Metadata> {
  const { date } = await params;
  const edition = await loadEditionByDate(date);
  if (!edition) {
    return {
      title: `Édition introuvable — ${t("siteTitle")}`
    };
  }
  return {
    title: `${edition.title} — ${t("siteTitle")}`,
    description: `${edition.sources.length} sources • ${formatEditionDate(edition.date)}`
  };
}

export default async function EditionPage({ params }: EditionPageProps) {
  const { date } = await params;
  const edition = await loadEditionByDate(date);
  if (!edition) {
    notFound();
  }

  return <EditionView edition={edition} />;
}

function EditionView({ edition }: { edition: EditionDocument }) {
  const totalItems = edition.sources.reduce((acc, source) => acc + source.items.length, 0);
  
  const generatedAtText = edition.generatedAt 
    ? formatGeneratedAt(edition.generatedAt, edition.timezone)
    : null;

  // Split edition.title into main + date part using preferred separators
  let mainTitle = edition.title;
  let datePart: string | null = null;
  if (mainTitle.includes(" — ")) {
    const parts = mainTitle.split(" — ");
    if (parts.length === 2) {
      mainTitle = parts[0];
      datePart = parts[1] || null;
    }
  } else if (mainTitle.includes(" - ")) {
    const parts = mainTitle.split(" - ");
    if (parts.length === 2) {
      mainTitle = parts[0];
      datePart = parts[1] || null;
    }
  }

  return (
    <article aria-labelledby="edition-title" className="edition-layout">
      <header>
        <div className="entry-meta">
          <Tag>{edition.timezone}</Tag>
          <span>{formatEditionDate(edition.date)}</span>
          <span>{totalItems} {t("stories")}</span>
          {generatedAtText && <span>{generatedAtText}</span>}
          <Link href="/archive" className="muted">
            {t("viewArchive")}
          </Link>
        </div>
        <h1 id="edition-title" className="edition-heading">
          <span className="edition-heading__main">{mainTitle}</span>
          {datePart && (
            <>
              <span className="edition-heading__sep">—</span>
              <span className="edition-heading__date">{datePart}</span>
            </>
          )}
        </h1>
      </header>

      {edition.content && (
        <div className="markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer">
                  {props.children}
                </a>
              )
            }}
          >
            {edition.content}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
}

function formatEditionDate(date: string): string {
  const locale = getLocale();
  const formatted = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return formatted || date;
}

function formatGeneratedAt(isoString: string, timezone: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(getLocale(), {
      timeZone: timezone,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch {
    return "";
  }
}
