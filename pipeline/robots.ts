import { download, escapeRe } from "./feeds";

// Lecture du robots.txt d'un site, partagée par le vérificateur des flux (check-sources.ts)
// et la recherche de photo d'aperçu (preview.ts).

/**
 * Le robots.txt du site interdit-il à FightNewsBot de lire cette adresse (flux ou page) ? Renvoie la règle qui l'interdit, sinon null.
 * (blocs User-agent, règles Allow / Disallow, jokers * et $ : la règle la plus longue l'emporte, Allow à égalité)
 */
// Un seul téléchargement du robots.txt par site et par passage, même pour plusieurs pages du même site.
const cache = new Map<string, Promise<string | null>>();
function robotsTxt(origin: string): Promise<string | null> {
  if (!cache.has(origin)) {
    cache.set(
      origin,
      download(`${origin}/robots.txt`).then(
        (res) => (res.status >= 300 ? null : res.body.toString("utf8")), // pas de robots.txt : rien n'est interdit
        () => null, // injoignable : la lecture du flux ou de la page dira si le site répond
      ),
    );
  }
  return cache.get(origin)!;
}

export async function robotsForbids(feedUrl: string): Promise<string | null> {
  const url = new URL(feedUrl);
  const text = await robotsTxt(url.origin);
  if (text === null) return null;
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let readingAgents = false;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*(#.*)?$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (!readingAgents) groups.push({ agents: [], rules: [] });
      groups[groups.length - 1].agents.push(m[2].toLowerCase());
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    if ((key === "allow" || key === "disallow") && m[2] && groups.length) {
      groups[groups.length - 1].rules.push({ allow: key === "allow", path: m[2] });
    }
  }
  // On applique le bloc qui nomme FightNewsBot, sinon celui de "*".
  const ours = groups.filter((g) => g.agents.includes("fightnewsbot"));
  const rules = (ours.length ? ours : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const path = url.pathname + url.search;
  let best: { allow: boolean; path: string } | undefined;
  for (const r of rules) {
    const re = new RegExp("^" + r.path.split("*").map(escapeRe).join(".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best && !best.allow ? `Disallow: ${best.path}` : null;
}
