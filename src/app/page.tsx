import Link from "next/link"
import { redirect } from "next/navigation"
import { loadMostRecentEdition } from "@/lib/load-edition"

export default async function HomePage() {
  const latest = await loadMostRecentEdition()
  if (!latest) {
    return (
      <section aria-labelledby="empty-state">
        <h1 id="empty-state">No editions yet</h1>
        <p>
          Add your feed configuration to <code>feeds.yml</code> and run{" "}
          <code>npm run generate:edition</code> to publish your first Daily
          Brief.
        </p>
        <p>
          Need a hand? Start with <code>feeds.example.yml</code> to bootstrap
          the configuration.
        </p>
        <p>
          Once you have editions, this page will redirect to the latest one
          automatically. In the meantime, you can{" "}
          <Link href="/archives">browse the archives view</Link>.
        </p>
      </section>
    )
  }

  redirect(`/edition/${latest.slug}`)
}
