import { listEditionSlugs, loadEditionByDate } from "@/lib/load-edition"
import { toPublicEdition } from "@/lib/edition-items"

export const dynamic = "force-static"
export const dynamicParams = false

export async function generateStaticParams() {
  const slugs = await listEditionSlugs()
  return slugs.map((slug) => ({ date: slug }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params
  const edition = await loadEditionByDate(date)
  if (!edition) {
    return Response.json({ error: "edition not found" }, { status: 404 })
  }
  return Response.json(toPublicEdition(edition))
}
