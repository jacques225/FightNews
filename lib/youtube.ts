/** Identifiant de la vidéo si l'adresse est une vidéo YouTube (youtube.com/watch, /shorts, youtu.be), sinon null. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be" ? u.pathname.slice(1)
      : host === "youtube.com" ? (u.searchParams.get("v") ?? /^\/(shorts|embed|live)\/([^/?#]+)/.exec(u.pathname)?.[2] ?? "")
      : "";
    return /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
