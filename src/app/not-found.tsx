import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Edition not found</h1>
      <p className="muted">We couldn&apos;t find that Daily Brief edition.</p>
      <p>
        Head back to the <Link href="/">latest edition</Link> or browse the{" "}
        <Link href="/archive">archive</Link>.
      </p>
    </section>
  );
}
