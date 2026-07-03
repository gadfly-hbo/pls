#!/usr/bin/env node
const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";
const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };
let f = 0;
async function req(p, o={}) { const r = await fetch(`${BASE}${p}`, {headers:HDR,...o}); return {status:r.status, body:await r.json().catch(()=>({}))}; }
function ok(l, c, d="") { if(c) console.log(`  OK   ${l}`); else { console.error(`  FAIL ${l} :: ${d}`); f++; } }

console.log(`Smoke channel-entities against ${BASE}`);

const list = await req("/channels/entities");
ok("list returns 17 items", list.body.data?.items?.length === 17, `got ${list.body.data?.items?.length}`);

const shops = await req("/channels/entities?entityType=shop");
ok("entityType=shop returns 6", shops.body.data?.items?.length === 6);

const accounts = await req("/channels/entities?entityType=account");
ok("entityType=account returns 6", accounts.body.data?.items?.length === 6);

const douyin = await req("/channels/entities?sourceId=douyin_bi");
ok("sourceId=douyin_bi returns 13", douyin.body.data?.items?.length === 13);

const mock = await req("/channels/entities?sourceId=channel_profile");
ok("sourceId=channel_profile returns 4", mock.body.data?.items?.length === 4);

const detail = await req("/channels/entities/douyin:shop:douyin_account_semir_official_flagship_baseline");
ok("douyin shop detail has benchmarkTags", (detail.body.data?.benchmarkTags?.length ?? 0) > 0);
ok("douyin shop detail entityType=shop", detail.body.data?.entityType === "shop");
ok("douyin shop detail sourceId=douyin_bi", detail.body.data?.sourceId === "douyin_bi");

const mockDetail = await req("/channels/entities/mock:shop:mock_channel_shelf_001");
ok("mock shop detail has profileTags", (mockDetail.body.data?.profileTags?.length ?? 0) > 0);
ok("mock shop detail has performanceMetrics", !!mockDetail.body.data?.performanceMetrics?.trafficIndex);

const nf = await req("/channels/entities/nope");
ok("404 on missing entity", nf.status === 404);

// Verify existing /channels not broken
const ch = await req("/channels");
ok("/channels still works", ch.body.data?.items?.length === 4);
const chDetail = await req("/channels/mock_channel_shelf_001");
ok("/channels/:id still works", chDetail.status === 200);

const noAuth = await fetch(`${BASE}/channels/entities`, {headers:{"X-PLS-Workspace":WS}});
ok("401 without token", noAuth.status === 401);
const noWs = await fetch(`${BASE}/channels/entities`, {headers:{Authorization:`Bearer ${TOKEN}`}});
ok("400 without workspace", noWs.status === 400);

if (f) { console.error(`\n${f} failed`); process.exit(1); }
else console.log(`\nAll checks passed.`);
