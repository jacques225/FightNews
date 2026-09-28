import { notFound, redirect } from "next/navigation";
import ArticleListing, { parsePage } from "@/components/ArticleListing";

export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Params) {
  return { title: `Toute l'actu, page ${(await params).n}` };
}

export default async function AllNewsArchivePage({ params }: Params) {
  const { n } = await params;
  if (n === "1") redirect("/actus");
  const page = parsePage(n);
  if (!page) notFound();
  return <ArticleListing page={page} />;
}
