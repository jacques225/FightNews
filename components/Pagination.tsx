import Link from "next/link";

/** Liens "Plus récents / Plus anciens" : page 1 = basePath, pages suivantes = basePath/page/N. */
export default function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;
  const href = (n: number) => (n <= 1 ? basePath : `${basePath}/page/${n}`);
  return (
    <nav className="pagination" aria-label="Pages d'archives">
      {page > 1 ? <Link href={href(page - 1)} rel="prev">← Plus récents</Link> : <span />}
      <span className="pagination-info">Page {page} sur {totalPages}</span>
      {page < totalPages ? <Link href={href(page + 1)} rel="next">Plus anciens →</Link> : <span />}
    </nav>
  );
}
