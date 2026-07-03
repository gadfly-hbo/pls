#!/usr/bin/env node
// A-P1-F2: Smoke script for the Douyin BI API.
// Assumes server on localhost:3100 and ws_demo import already done.
// Runs a series of read requests and asserts expected shapes / counts.
//
// Exit 0 = all pass; non-zero = first failure.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";

const HDR = {
  Authorization: `Bearer ${TOKEN}`,
  "X-PLS-Workspace": WS,
};

let failures = 0;

async function req(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HDR });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return { status: res.status, body };
}

function assert(label, cond, detail = "") {
  if (cond) console.log(`  OK   ${label}`);
  else {
    console.error(`  FAIL ${label} :: ${detail}`);
    failures += 1;
  }
}

async function main() {
  console.log(`Smoke against ${BASE}`);

  const versions = await req("/bi/douyin/versions");
  assert("versions returns items", Array.isArray(versions.body.data?.items) && versions.body.data.items.length >= 1,
    JSON.stringify(versions.body));

  const accounts = await req("/bi/douyin/accounts");
  assert("accounts list", accounts.body.data?.items?.length === 13,
    `got ${accounts.body.data?.items?.length}`);

  const baselineId = "douyin_account_semir_official_flagship_baseline";
  const baseline = await req(`/bi/douyin/accounts/${baselineId}`);
  assert("account detail benchmarkTags=26",
    baseline.body.data?.benchmarkTags?.length === 26,
    `got ${baseline.body.data?.benchmarkTags?.length}`);

  const nonBaseline = await req(`/bi/douyin/accounts/douyin_account_1a3814cd74`);
  assert("account detail non-baseline reports>=1",
    (nonBaseline.body.data?.reports?.length ?? 0) >= 1);

  const notFound = await req("/bi/douyin/accounts/does_not_exist");
  assert("404 on missing account", notFound.status === 404);

  const products = await req("/bi/douyin/products?pageSize=5");
  assert("products list pageSize=5", products.body.data?.items?.length === 5);

  const skuId = products.body.data.items[0].skuId;
  const product = await req(`/bi/douyin/products/${skuId}`);
  assert("product detail has mappedProfileTags",
    Array.isArray(product.body.data?.mappedProfileTags));
  assert("product detail has unmappedProfileFields",
    Array.isArray(product.body.data?.unmappedProfileFields));

  const fits = await req(`/bi/douyin/fits?accountChannelId=${baselineId}`);
  assert("fits list for baseline account", (fits.body.data?.items?.length ?? 0) === 73);

  const fitId = fits.body.data.items[0].fitId;
  const fitDetail = await req(`/bi/douyin/fits/${fitId}`);
  assert("fit detail has 5 comparison dimensions",
    fitDetail.body.data?.dimensions?.length === 5,
    `got ${fitDetail.body.data?.dimensions?.length}`);

  const advice = await req("/bi/douyin/advice?priority=high");
  assert("advice priority=high items>0",
    (advice.body.data?.items?.length ?? 0) > 0);

  const summary = await req("/bi/douyin/summary-metrics");
  assert("summary-metrics items>=1",
    (summary.body.data?.items?.length ?? 0) >= 1);

  const versionSet = new Set(versions.body.data.items.map((v) => v.dataVersion));
  if (versionSet.size >= 2) {
    // Multi-version sanity: pick a non-latest version and confirm we can
    // still fetch a specific product snapshot.
    const [v1] = [...versionSet].sort();
    const historic = await req(`/bi/douyin/products/${skuId}?dataVersion=${v1}`);
    assert(`product detail explicit dataVersion=${v1}`,
      historic.body.data?.dataVersion === v1);
  } else {
    console.log(`  SKIP multi-version test (only one version imported)`);
  }

  const noAuth = await fetch(`${BASE}/bi/douyin/accounts`, { headers: { "X-PLS-Workspace": WS } });
  assert("401 without token", noAuth.status === 401);

  const noWs = await fetch(`${BASE}/bi/douyin/accounts`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert("400 without workspace", noWs.status === 400);

  if (failures) {
    console.error(`\n${failures} smoke check(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\nAll smoke checks passed.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
