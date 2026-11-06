import assert from "node:assert/strict";
import test from "node:test";
import { imageOf, readYouTube, MissingKeyError, videoText, youTubeItems } from "./feeds";
import { youTubeId } from "../lib/youtube";

test("une réponse de l'API YouTube devient des entrées de flux (titre, lien, date, résumé, miniature)", () => {
  const items = youTubeItems([
    {
      snippet: {
        title: "GANE VS HOKIT : le film du combat",
        description: "Retour sur la nuit de Ciryl Gane à l'UFC 334.\n\n00:00 Intro\n02:15 Le combat\n\nAbonne-toi : https://youtube.com/@RMCSportCombat\n#UFC #MMA",
        publishedAt: "2026-11-01T10:00:00Z",
        thumbnails: { high: { url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" }, maxres: { url: "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg" } },
      },
      contentDetails: { videoId: "abcdefghijk", videoPublishedAt: "2026-11-01T09:00:00Z" },
      status: { privacyStatus: "public" },
    },
    { snippet: { title: "Private video" }, contentDetails: { videoId: "zzzzzzzzzzz" }, status: { privacyStatus: "private" } },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(items[0].isoDate, "2026-11-01T09:00:00Z");
  assert.equal(items[0].contentSnippet, "Retour sur la nuit de Ciryl Gane à l'UFC 334.");
  assert.equal(imageOf(items[0]), "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg");
});

test("la description d'une vidéo perd liens, mots-clés, chapitres et appels aux réseaux", () => {
  assert.equal(
    videoText("Benoît Saint Denis prend un gros risque.\nSuivez-nous sur Instagram : https://instagram.com/x\n#BSD #UFC\n12:30 Pronostics"),
    "Benoît Saint Denis prend un gros risque.",
  );
});

test("sans clé d'API, une chaîne YouTube est ignorée sans faire échouer le passage", async () => {
  const saved = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  await assert.rejects(readYouTube("UCDqrC9HH1w7hyZCspmukU6A"), MissingKeyError);
  if (saved !== undefined) process.env.YOUTUBE_API_KEY = saved;
});

test("le site reconnaît une vidéo YouTube à son adresse", () => {
  assert.equal(youTubeId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(youTubeId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(youTubeId("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(youTubeId("https://www.lequipe.fr/Mma/article.html"), null);
});

test("sans clé d'API, le rafraîchissement des vidéos est refusé proprement", async () => {
  const saved = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  const { currentVideos } = await import("./feeds");
  await assert.rejects(currentVideos(["abcdefghijk"]), MissingKeyError);
  if (saved !== undefined) process.env.YOUTUBE_API_KEY = saved;
});

test("la durée ISO d'une vidéo YouTube est lue en secondes", async () => {
  const { isoSeconds, MIN_VIDEO_SECONDS } = await import("./feeds");
  assert.equal(isoSeconds("PT58S"), 58);
  assert.equal(isoSeconds("PT12M3S"), 723);
  assert.equal(isoSeconds("PT1H2M30S"), 3750);
  assert.equal(isoSeconds("P0D"), Infinity); // direct en cours : gardé
  assert.equal(isoSeconds("PT0S"), Infinity);
  assert.ok(isoSeconds("PT2M50S") <= MIN_VIDEO_SECONDS);
});
