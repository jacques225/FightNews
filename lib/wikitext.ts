/**
 * Lecture du wikitexte des pages Wikipédia (en anglais) qui servent au calendrier des combats :
 * sections, tableaux, modèles {{MMAevent …}}, dates et liens. Sans dépendance, vérifié sur des
 * extraits réels dans pipeline/calendar.test.ts.
 */

export type Section = { title: string; level: number; text: string };
/** Un combat ; `done` : déjà disputé, gagné par `a` (« A def. B » le soir de l'événement). */
export type Bout = { weight: string; a: string; b: string; title: boolean; done?: boolean };
export type Segment = { name: string; bouts: Bout[] };
export type ListedEvent = {
  name: string;
  /** Page Wikipédia de l'événement, s'il en a une (UFC, grands événements du PFL). */
  page?: string;
  /** Section de la page annuelle consacrée à l'événement (ONE, KSW, Glory…). */
  anchor?: string;
  date: string; // AAAA-MM-JJ, date locale de l'événement
  venue: string;
  location: string;
};
type Row = { cells: string[]; header: boolean };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });
}

/** Découpe une page en sections (« == Titre == ») ; la première, au titre vide, est l'introduction. */
export function splitSections(w: string): Section[] {
  const out: Section[] = [];
  let title = "";
  let level = 1;
  let start = 0;
  for (const m of w.matchAll(/^(={2,6})[ \t]*(.+?)[ \t]*\1[ \t]*$/gm)) {
    out.push({ title, level, text: w.slice(start, m.index) });
    title = plain(m[2]);
    level = m[1].length;
    start = m.index + m[0].length;
  }
  out.push({ title, level, text: w.slice(start) });
  return out;
}

/** Une section suivie de ses sous-sections (jusqu'à la prochaine section de même niveau ou plus haut). */
export function withSubsections(sections: Section[], i: number): Section[] {
  const out = [sections[i]];
  for (let j = i + 1; j < sections.length && sections[j].level > sections[i].level; j++) out.push(sections[j]);
  return out;
}

/** Titre comparable : les liens d'ancre remplacent les espaces par « _ » et gardent parfois une espace finale. */
export const sameTitle = (a: string, b: string) => {
  const norm = (s: string) => decodeEntities(s).replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
};

/** Découpe sur « sep » hors des liens [[…]] et des modèles {{…}}. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      cur += two;
      i++;
    } else if ((two === "]]" || two === "}}") && depth > 0) {
      depth--;
      cur += two;
      i++;
    } else if (depth === 0 && s.startsWith(sep, i)) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
    } else {
      cur += s[i];
    }
  }
  out.push(cur);
  return out;
}

/** Remplace les modèles les plus internes jusqu'à ce qu'il n'en reste plus. */
function stripTemplates(s: string): string {
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => {
      const [name, ...params] = inner.split("|").map((p) => p.trim());
      const n = name.toLowerCase();
      const positional = params.filter((p) => !/^[\w ]+=/.test(p));
      if (/^(nowrap|nobr|small|big|lang|abbr)$/.test(n)) return n === "lang" ? positional[1] ?? "" : positional[0] ?? "";
      if (n === "sortname") return positional.slice(0, 2).join(" ");
      if (/^(tba|tbd)$/.test(n)) return "TBA";
      return ""; // drapeaux, {{n/a}}, notes, références…
    });
  } while (s !== prev);
  return s;
}

/** Texte lisible d'un bout de wikitexte : liens remplacés par leur texte, sans références, modèles ni mise en forme. */
export function plain(w: string): string {
  let s = w
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  s = stripTemplates(s);
  let prev;
  do {
    prev = s;
    s = s.replace(/\[\[([^[\]]*)\]\]/g, (_, inner: string) => {
      if (/^\s*(file|image|category)\s*:/i.test(inner)) return "";
      const parts = inner.split("|");
      return parts.length > 1 ? parts[parts.length - 1] : parts[0].replace(/^#/, "").replace(/#.*$/, "");
    });
  } while (s !== prev);
  s = s
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/[^\]]+\]/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

/** Premier lien interne : page visée (sans l'ancre) et ancre éventuelle. */
export function firstLink(w: string): { page: string; anchor?: string } | null {
  const m = /\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/.exec(w);
  if (!m) return null;
  const [page, anchor] = m[1].split("#");
  return { page: page.trim(), anchor: anchor?.trim() || undefined };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function ymd(y: string, m: string, d: string): string | null {
  const year = Number(y);
  const day = Number(d);
  const month = /^\d+$/.test(m) ? Number(m) : MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1;
  if (!(year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function textDate(s: string): string | null {
  let m = /\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s); // December 12, 2026
  if (m) return ymd(m[3], m[1], m[2]);
  m = /\b(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})\b/.exec(s); // 12 December 2026
  if (m) return ymd(m[3], m[2], m[1]);
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  return m ? ymd(m[1], m[2], m[3]) : null;
}

/** Date au format AAAA-MM-JJ : {{dts|2026|Oct|3}}, {{dts|2026|10|03}}, {{start date|2026|12|12}} ou « December 12, 2026 ». */
export function parseDate(w: string): string | null {
  const t = /\{\{\s*(?:dts|start date(?: and age)?|date)\s*\|([^{}]*)\}\}/i.exec(w);
  if (t) {
    const parts = t[1].split("|").map((p) => p.trim()).filter((p) => p && !p.includes("="));
    if (parts.length >= 3) return ymd(parts[0], parts[1], parts[2]);
    if (parts.length === 1) return textDate(parts[0]);
  }
  return textDate(plain(w));
}

const ATTRS = /^\s*(?:[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'|]+)\s*)+$/;

/** Contenu d'une cellule, et ses fusions : « rowspan="2" | texte » donne { texte, rowspan: 2 }. */
function cell(raw: string) {
  const [first, ...rest] = splitTop(raw, "|");
  const hasAttrs = rest.length > 0 && ATTRS.test(first);
  const attrs = hasAttrs ? first : "";
  const span = (name: string) => Math.max(1, Number(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, "i").exec(attrs)?.[1] ?? 1));
  return { text: (hasAttrs ? rest.join("|") : raw).trim(), rowspan: span("rowspan"), colspan: span("colspan") };
}

/** Tableaux {| … |} de premier niveau, lignes dans l'ordre, cellules fusionnées dépliées. */
export function parseTables(w: string): Row[][] {
  const tables: string[][] = [];
  let lines: string[] = [];
  let depth = 0;
  for (const line of w.split("\n")) {
    const l = line.trimStart();
    if (l.startsWith("{|")) {
      if (depth++ === 0) lines = [];
      continue;
    }
    if (depth === 0) continue;
    if (l.startsWith("|}")) {
      if (--depth === 0) tables.push(lines);
      continue;
    }
    if (depth === 1) lines.push(l);
  }

  return tables.map((tableLines) => {
    const raw: { cells: ReturnType<typeof cell>[]; header: boolean }[] = [];
    let row: (typeof raw)[number] | null = null;
    for (const l of tableLines) {
      if (l.startsWith("|+")) continue; // légende
      if (l.startsWith("|-")) {
        row = null;
        continue;
      }
      const isHeader = l.startsWith("!");
      if (isHeader || l.startsWith("|")) {
        if (!row) raw.push((row = { cells: [], header: isHeader }));
        if (!isHeader) row.header = false;
        row.cells.push(...splitTop(l.slice(1), isHeader ? "!!" : "||").map(cell));
      } else if (row?.cells.length) {
        row.cells[row.cells.length - 1].text += `\n${l}`; // suite de la cellule sur plusieurs lignes
      }
    }
    // Cellules fusionnées sur plusieurs lignes : on les recopie à leur place dans les lignes suivantes.
    const pending: { text: string; left: number }[] = [];
    return raw.map(({ cells, header }): Row => {
      if (header) return { header, cells: cells.map((c) => c.text) };
      const out: string[] = [];
      const queue = [...cells];
      let col = 0;
      while (queue.length) {
        const p = pending[col];
        if (p?.left) {
          out[col++] = p.text;
          p.left--;
          continue;
        }
        const c = queue.shift()!;
        for (let k = 0; k < c.colspan; k++, col++) {
          out[col] = c.text;
          pending[col] = { text: c.text, left: c.rowspan - 1 };
        }
      }
      for (let k = col; k < pending.length; k++) {
        if (pending[k]?.left) {
          out[k] = pending[k].text;
          pending[k].left--;
        }
      }
      return { header, cells: Array.from(out, (x) => x ?? "") };
    });
  });
}

/** Modèles de premier niveau dont le nom correspond, dans l'ordre du texte, avec leurs paramètres. */
export function templates(w: string, name: RegExp): { name: string; params: string[] }[] {
  const out: { name: string; params: string[] }[] = [];
  let i = w.indexOf("{{");
  while (i !== -1) {
    let depth = 0;
    let end = -1;
    for (let j = i; j < w.length - 1; j++) {
      if (w[j] === "{" && w[j + 1] === "{") {
        depth++;
        j++;
      } else if (w[j] === "}" && w[j + 1] === "}") {
        depth--;
        j++;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end === -1) break; // modèle jamais refermé
    const [head, ...params] = splitTop(w.slice(i + 2, end - 2), "|");
    const tname = head.trim().replace(/_/g, " ");
    if (name.test(tname)) out.push({ name: tname, params: params.map((p) => p.trim()) });
    i = w.indexOf("{{", end);
  }
  return out;
}

const positional = (params: string[]) => params.filter((p) => !/^[A-Za-z][\w ]{0,20}=/.test(p));

const CHAMPION = /\((?:c|ic|interim c)\)/i;

/** Un combat à venir (« A vs. B ») ou qui vient d'avoir lieu (« A def. B ») ; le reste de la ligne est ignoré. */
function bout(weight: string, a: string, vs: string, b: string, notes: string): Bout | null {
  const sep = plain(vs);
  const done = /^def\.?$/i.test(sep);
  if (!done && !/^vs\.?$/i.test(sep)) return null;
  const name = (s: string) => {
    const n = plain(s).replace(/\s*\((?:c|ic|interim c)\)/gi, "").trim();
    return /^(tba|tbd)$/i.test(n) ? "À désigner" : n;
  };
  const [na, nb] = [name(a), name(b)];
  if (!na && !nb) return null;
  const title = CHAMPION.test(a) || CHAMPION.test(b) || /champion|title/i.test(plain(notes));
  return { weight: plain(weight), a: na || "À désigner", b: nb || "À désigner", title, ...(done ? { done: true } : {}) };
}

/** Seules les lignes qui annoncent un segment de soirée (« Main card », « Prelims ») deviennent des segments. */
const segmentName = (s: string) => (/card|prelim/i.test(s) ? s : "");

/**
 * Carte d'un événement : modèles {{MMAevent card}} / {{MMAevent bout}} (UFC, PFL, KSW, Oktagon…)
 * ou tableau de résultats (ONE, Glory), segment par segment (carte principale, préliminaires…).
 */
export function parseCard(text: string): Segment[] {
  const segments: Segment[] = [];
  const current = () => segments[segments.length - 1] ?? (segments.push({ name: "", bouts: [] }), segments[0]);
  const tpl = templates(text, /^MMAevent (card|bout)$/i);
  if (tpl.length) {
    for (const t of tpl) {
      const p = positional(t.params);
      if (/card$/i.test(t.name)) segments.push({ name: plain(p[0] ?? ""), bouts: [] });
      else {
        const b = bout(p[0] ?? "", p[1] ?? "", p[2] ?? "", p[3] ?? "", p[7] ?? "");
        if (b) current().bouts.push(b);
      }
    }
  } else {
    for (const rows of parseTables(text)) {
      for (const row of rows) {
        const texts = row.cells.map(plain);
        if (row.header) {
          if (texts.filter(Boolean).length === 1) segments.push({ name: segmentName(texts.find(Boolean)!), bouts: [] });
          continue;
        }
        const k = texts.findIndex((t) => /^(vs\.?|def\.?)$/i.test(t));
        if (k < 1) continue;
        const notes = [...row.cells.slice(k + 2)].reverse().find((c) => plain(c)) ?? "";
        const b = bout(row.cells[k - 2] ?? "", row.cells[k - 1], row.cells[k], row.cells[k + 1] ?? "", notes);
        if (b) current().bouts.push(b);
      }
    }
  }
  return segments.filter((s) => s.bouts.length);
}

/**
 * Liste « Announced bouts » des pages d'événement, pour les combats pas encore placés sur la carte :
 * « *Welterweight bout: A vs. B » ou « *[[UFC Middleweight Championship]] bout: A (c) vs. B ».
 */
export function parseAnnounced(text: string): Bout[] {
  const out: Bout[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("*")) continue;
    const s = plain(line.replace(/^\*+/, ""));
    const m = /^(.*?)\s*\bbout\s*:\s*(.+?)\s+vs\.?\s+(.+?)$/i.exec(s);
    if (!m) continue;
    const isTitle = /championship|title/i.test(m[1]);
    const weight = m[1].replace(/\b(championship|title|interim|undisputed|vacant|UFC|PFL|ONE)\b/gi, "").replace(/\s+/g, " ").trim();
    const b = bout(weight, m[2], "vs.", m[3], isTitle ? "title" : "");
    if (b) out.push(b);
  }
  return out;
}

/** Tableau des événements (« Scheduled events », « List of events ») : nom, page ou ancre, date, salle, lieu. */
export function parseEventList(text: string): ListedEvent[] {
  const rows = parseTables(text)[0];
  if (!rows) return [];
  const headers = rows.filter((r) => r.header).sort((a, b) => b.cells.length - a.cells.length)[0]?.cells.map((h) => plain(h).toLowerCase()) ?? [];
  const col = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const [iEvent, iDate, iVenue, iPlace, iCountry] = [col(/event/), col(/date/), col(/venue|arena/), col(/location|city/), col(/country/)];
  if (iEvent < 0 || iDate < 0) return [];
  const out: ListedEvent[] = [];
  for (const { cells, header } of rows) {
    if (header) continue;
    const name = plain(cells[iEvent] ?? "");
    const date = parseDate(cells[iDate] ?? "");
    if (!name || !date) continue;
    const link = firstLink(cells[iEvent] ?? "");
    const place = [iPlace, iCountry].filter((i) => i >= 0).map((i) => plain(cells[i] ?? "")).filter((p) => p && !/^tb[ad]$/i.test(p));
    const venue = iVenue >= 0 ? plain(cells[iVenue] ?? "") : "";
    out.push({
      name,
      page: link && link.page ? link.page : undefined,
      anchor: link && !link.page ? link.anchor : undefined,
      date,
      venue: /^tb[ad]$/i.test(venue) ? "" : venue,
      location: place.join(", "),
    });
  }
  return out;
}
