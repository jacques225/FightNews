"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Photo d'un article, affichée depuis le serveur de son média. Si elle ne se charge pas (lien mort,
 * site qui refuse l'affichage de ses images ailleurs que chez lui), elle disparaît et laisse voir le
 * visuel de repli placé dessous.
 */
export default function SourcePhoto({ src, credit, eager = false }: { src: string; credit?: string; eager?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  // Une image en échec avant que React ne prenne la main sur la page ne déclenche pas onError.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return null;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
  );
  if (!credit) return img;
  return (
    <figure className="article-photo">
      {img}
      <figcaption>Photo : {credit}</figcaption>
    </figure>
  );
}
