import type { Metadata } from "next";
import ArticleListing from "@/components/ArticleListing";

export const revalidate = 300;
export const metadata: Metadata = { title: "Toute l'actu" };

export default function AllNewsPage() {
  return <ArticleListing page={1} />;
}
