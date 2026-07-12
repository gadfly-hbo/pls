#!/usr/bin/env node
// A-P2-9 + A-P2-10 combined smoke.
//
// Safety: this script performs writes (predictions, decisions, actions, feedback).
// By default it refuses to run against ws_demo. Set PLS_WORKSPACE to a temporary
// workspace, or set PLS_ALLOW_WS_DEMO_WRITE=1 (controller-only override).

import { guardWriteWorkspace } from "./lib/workspace-guard.mjs";

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";
const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };
let f = 0;

guardWriteWorkspace(WS, { purpose: "smoke p2-api writes" });
async function req(p, o={}) { const r = await fetch(`${BASE}${p}`, {headers:HDR,...o}); return {status:r.status, body:await r.json().catch(()=>({}))}; }
function ok(l, c, d="") { if(c) console.log(`  OK   ${l}`); else { console.error(`  FAIL ${l} :: ${d}`); f++; } }

console.log(`Smoke A-P2-9 + A-P2-10 against ${BASE}`);

// --- A-P2-9: New product prediction ---
const pred = await req("/new-products/predictions", {method:"POST", headers:{...HDR,"Content-Type":"application/json"}, body:JSON.stringify({productMaster:{identity:{productId:"SMOKE_001",sourceProductKey:"smoke-test"},category:{categoryLv1:"女装"},styleAndScenario:{mappedProductTags:[{tagId:"demo.female",score:0.9,confidence:0.8,source:"test"}]},lineage:{sourceBatchId:"smoke_batch",dataVersion:"v_smoke",generatedAt:"2026-07-03T00:00:00Z",sourceType:"user_authorized"}}})});
ok("POST prediction succeeds", pred.status===200);
const pid = pred.body?.data?.predictionId;
ok("prediction has id", !!pid);
ok("prediction has confidence", typeof pred.body?.data?.confidence === "number");
ok("prediction has predictedProfileTags", Array.isArray(pred.body?.data?.predictedProfileTags));
ok("prediction has riskFlags", Array.isArray(pred.body?.data?.riskFlags));

const predList = await req("/new-products/predictions");
ok("GET predictions list", predList.body?.data?.items?.length >= 1);

const predDetail = await req(`/new-products/predictions/${pid}`);
ok("GET prediction detail", predDetail.status===200 && predDetail.body?.data?.predictionId===pid);

// Match
const match = await req(`/new-products/predictions/${pid}/match`, {method:"POST", headers:{...HDR,"Content-Type":"application/json"}, body:JSON.stringify({channelIds:["mock_channel_shelf_001"]})});
ok("POST match prediction", match.status===200 && match.body?.data?.matches?.length >= 1);

// --- A-P2-10: Flywheel ---
const dec = await req("/operations/decisions", {method:"POST", headers:{...HDR,"Content-Type":"application/json"}, body:JSON.stringify({skuId:"109326100005",channelId:"mock_channel_shelf_001",recommendation:"priority_launch",rationale:"smoke test"})});
ok("POST decision", dec.status===200);
const did = dec.body?.data?.decisionId;
ok("decision has id", !!did);

const act = await req(`/operations/decisions/${did}/actions`, {method:"POST", headers:{...HDR,"Content-Type":"application/json"}, body:JSON.stringify({actionType:"listing",detail:{platform:"smoke"}})});
ok("POST action", act.status===200 && !!act.body?.data?.actionId);

const fb = await req(`/operations/decisions/${did}/feedback`, {method:"POST", headers:{...HDR,"Content-Type":"application/json"}, body:JSON.stringify({feedbackType:"sales",metricName:"dailySales",metricValue:100,metricUnit:"件"})});
ok("POST feedback", fb.status===200 && !!fb.body?.data?.feedbackId);

const rv = await req(`/operations/decisions/${did}/review`, {method:"POST", headers:{...HDR,"Content-Type":"application/json"}, body:JSON.stringify({reviewStatus:"verified",rationale:"smoke verified"})});
ok("POST review", rv.status===200 && rv.body?.data?.reviewStatus==="verified");

const det = await req(`/operations/decisions/${did}`);
ok("GET decision detail has actions", det.body?.data?.actions?.length >= 1);
ok("GET decision detail has feedbacks", det.body?.data?.feedbacks?.length >= 1);
ok("GET decision detail has reviews", det.body?.data?.reviews?.length >= 1);

const decList = await req("/operations/decisions");
ok("GET decisions list", decList.body?.data?.items?.length >= 1);

// 404
const nf = await req("/new-products/predictions/nope");
ok("404 on missing prediction", nf.status===404);

const nf2 = await req("/operations/decisions/nope");
ok("404 on missing decision", nf2.status===404);

// Auth
const noAuth = await fetch(`${BASE}/new-products/predictions`, {headers:{"X-PLS-Workspace":WS}});
ok("401 without token", noAuth.status===401);

if (f) { console.error(`\n${f} failed`); process.exit(1); }
else console.log(`\nAll checks passed.`);
