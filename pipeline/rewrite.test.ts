import assert from "node:assert/strict";
import test from "node:test";
import { parseBrief, rewrite } from "./rewrite";

const validBrief = {
  title: "Une annonce de MMA",
  summary: "Une organisation annonce un combat à venir.",
  body: "L'organisation a confirmé l'affiche dans un communiqué. Le combat est prévu lors de son prochain événement.",
  sport: "mma",
  tags: ["mma"],
};

const item = {
  title: "Promotion announces upcoming fight",
  snippet: "The promotion confirmed the matchup for its next event.",
  publisher: "Fight News",
  sport: "mma",
  date: "2026-09-28T10:00:00.000Z",
};

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function completed(text: string, extraContent: object[] = []) {
  return response({
    status: "completed",
    output: [{ type: "message", content: [...extraContent, { type: "output_text", text }] }],
    usage: { input_tokens: 10, output_tokens: 20 },
  });
}

test("parseBrief accepts a valid brief and refuses an empty body for a sport", () => {
  assert.deepEqual(parseBrief(JSON.stringify(validBrief)), validBrief);
  assert.throws(
    () => parseBrief(JSON.stringify({ ...validBrief, body: "   " })),
    /Brève OpenAI invalide/,
  );
});

test("rewrite sends the economical, non-stored JSON-schema request and parses the brief", async () => {
  let sent: Record<string, unknown> | undefined;
  const result = await rewrite(item, ["Autre titre"], {
    apiKey: "unit-test-secret",
    request: async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return completed(JSON.stringify(validBrief));
    },
  });

  assert.deepEqual(result, validBrief);
  assert.equal(sent?.model, "gpt-6-luna");
  assert.deepEqual(sent?.reasoning, { effort: "none" });
  assert.equal(sent?.store, false);
  const text = sent?.text as { format: { type: string; strict: boolean; schema: { additionalProperties: boolean } } };
  assert.equal(text.format.type, "json_schema");
  assert.equal(text.format.strict, true);
  assert.equal(text.format.schema.additionalProperties, false);
});

test("rewrite reports HTTP 401 without exposing the API secret", async () => {
  const secret = "do-not-leak-this-secret";
  await assert.rejects(
    rewrite(item, [], { apiKey: secret, request: async () => response({ error: { message: secret } }, 401) }),
    (error: unknown) => {
      assert.match((error as Error).message, /OpenAI HTTP 401/);
      assert.doesNotMatch((error as Error).message, new RegExp(secret));
      return true;
    },
  );
});

test("rewrite defers incomplete responses and refusals", async () => {
  await assert.rejects(
    rewrite(item, [], { apiKey: "test", request: async () => response({ status: "incomplete", output: [] }) }),
    /Réponse OpenAI incomplète/,
  );
  await assert.rejects(
    rewrite(item, [], { apiKey: "test", request: async () => completed("", [{ type: "refusal", refusal: "refusé" }]) }),
    /OpenAI a refusé/,
  );
  await assert.rejects(
    rewrite(item, [], { apiKey: "test", request: async () => completed(JSON.stringify({ ...validBrief, body: "" })) }),
    /Brève OpenAI invalide/,
  );
});
