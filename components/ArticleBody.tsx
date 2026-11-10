import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Corps d'un article enrichi (skill .claude/skills/enrichir-articles), stocké en texte simple dans
 * la colonne `body` : paragraphes séparés par une ligne vide, « ## » pour un intertitre, « > » pour
 * une citation, et des liens [texte](https://…) vers les sources.
 */
export default function ArticleBody({ body }: { body: string }) {
  return (
    <div className="article-body">
      {body.split(/\n\s*\n/).map((block, i) => {
        const text = block.trim();
        if (!text) return null;
        if (text.startsWith("## ")) return <h2 key={i}>{inline(text.slice(3))}</h2>;
        if (text.startsWith("> ")) return <blockquote key={i}>{inline(text.replace(/^>\s?/gm, ""))}</blockquote>;
        return <p key={i}>{inline(text.replace(/\s*\n\s*/g, " "))}</p>;
      })}
    </div>
  );
}

/** Liens [texte](https://…) vers les médias, [texte](/article/…) vers FightNews ; le reste reste du texte (pas de HTML possible). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[\w\-\/]*)\)/g)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[2].startsWith("/") ? <Link key={m.index} href={m[2]}>{m[1]}</Link> : <a key={m.index} href={m[2]} target="_blank" rel="noopener">{m[1]}</a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
