import { notFound, redirect } from "next/navigation";
import ArticleListing, { parsePage } from "@/components/ArticleListing";
import { getSport } from "@/lib/sports";

export const revalidate = 300;

// Pages d'archives générées à la première visite, puis gardées en cache.
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ sport: string; n: string }> };

export async function generateMetadata({ params }: Params) {
  const { sport, n } = await params;
  const s = getSport(sport);
  return { title: s ? `Actu ${s.name}, page ${n}` : "Rubrique" };
}

export default async function SportArchivePage({ params }: Params) {
  const { sport, n } = await params;
  if (n === "1") redirect(`/${sport}`);
  const page = parsePage(n);
  if (!page) notFound();
  return <ArticleListing sport={sport} page={page} />;
}
