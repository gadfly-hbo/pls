import { Hono } from "hono";
import { ok } from "../lib/response.js";
import { getAllTagIds, isValidTagId, TAXONOMY_VERSION } from "../lib/taxonomy.js";

const taxonomy = new Hono();

// GET /taxonomy - return whitelist
taxonomy.get("/", (c) => {
  const all = getAllTagIds();
  const dimensions = [
    { dimension: "demo", tags: all.filter((t) => t.startsWith("demo.")) },
    { dimension: "style", tags: all.filter((t) => t.startsWith("style.")) },
    { dimension: "price", tags: all.filter((t) => t.startsWith("price.")) },
    { dimension: "occasion", tags: all.filter((t) => t.startsWith("occasion.")) },
    { dimension: "intent", tags: all.filter((t) => t.startsWith("intent.")) },
    { dimension: "channel", tags: all.filter((t) => t.startsWith("channel.")) },
  ];

  return ok(c, {
    taxonomyVersion: TAXONOMY_VERSION,
    dimensions,
    totalTags: all.length,
  });
});

// POST /taxonomy/validate
taxonomy.post("/validate", async (c) => {
  const body = await c.req.json();
  const tagIds = (body.tagIds as string[]) ?? [];
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of tagIds) {
    (isValidTagId(id) ? valid : invalid).push(id);
  }

  return ok(c, { valid, invalid, suggestions: [] });
});

export default taxonomy;
