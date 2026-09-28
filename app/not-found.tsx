import Link from "next/link";
export default function NotFound() {
  return <p className="empty">Page introuvable. <Link href="/">Retour à l'accueil</Link></p>;
}
