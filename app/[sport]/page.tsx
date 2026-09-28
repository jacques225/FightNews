import ArticleListing from "@/components/ArticleListing";
import { SPORTS, getSport } from "@/lib/sports";

export const revalidate = 300;

export function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }) {
  const sport = getSport((await params).sport);
  return { title: sport ? `Actu ${sport.name}` : "Rubrique" };
}

export default async function SportPage({ params }: { params: Promise<{ sport: string }> }) {
  return <ArticleListing sport={(await params).sport} page={1} />;
}
