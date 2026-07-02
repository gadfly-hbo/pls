// Tag ID whitelist from docs/profile-taxonomy-v0.md §3

const TAGS = [
  // demo
  "demo.age_18_24",
  "demo.age_25_34",
  "demo.age_35_44",
  "demo.age_45_plus",
  "demo.female",
  "demo.male",
  "demo.city_high_tier",
  "demo.city_lower_tier",
  // style
  "style.minimal",
  "style.trendy",
  "style.sweet",
  "style.elegant",
  "style.sporty",
  "style.street",
  "style.luxury",
  "style.basic",
  // price
  "price.value",
  "price.mid",
  "price.premium",
  "price.promo_sensitive",
  "price.new_arrival_sensitive",
  // occasion
  "occasion.work",
  "occasion.daily",
  "occasion.party",
  "occasion.travel",
  "occasion.home",
  "occasion.seasonal",
  // intent
  "intent.self_use",
  "intent.gift",
  "intent.outfit_match",
  "intent.repeat_purchase",
  "intent.try_new",
  // channel
  "channel.shelf_ecommerce",
  "channel.short_video",
  "channel.live_stream",
  "channel.private_domain",
];

const TAG_SET = new Set(TAGS);

export function isValidTagId(tagId: string): boolean {
  return TAG_SET.has(tagId);
}

export function validateTagIds(
  tagIds: string[]
): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of tagIds) {
    (isValidTagId(id) ? valid : invalid).push(id);
  }
  return { valid, invalid };
}

export function getAllTagIds(): string[] {
  return [...TAGS];
}

export const TAXONOMY_VERSION = "0.1";
