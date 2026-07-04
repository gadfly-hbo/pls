import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth } from "./middleware/auth.js";
import { workspace } from "./middleware/workspace.js";
import { requestId } from "./middleware/request-id.js";
import products from "./routes/products.js";
import channels from "./routes/channels.js";
import predictions from "./routes/predictions.js";
import matches from "./routes/matches.js";
import batches from "./routes/batches.js";
import tasks from "./routes/tasks.js";
import taxonomy from "./routes/taxonomy.js";
import audit from "./routes/audit.js";
import accountMatches from "./routes/account-matches.js";
import biDouyin from "./routes/bi-douyin.js";
import dataManagement from "./routes/data-management.js";
import channelEntities from "./routes/channel-entities.js";
import newProducts from "./routes/new-products.js";
import flywheel from "./routes/flywheel.js";
import adminDatabase from "./routes/admin-database.js";
import tools from "./routes/tools.js";

const app = new Hono();

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// API routes with requestId → auth → workspace middleware
const api = new Hono();
api.use("*", requestId);
api.use("*", auth);
api.use("*", workspace);
api.route("/tools", tools);
api.route("/products", products);
api.route("/channels/entities", channelEntities);
api.route("/channels", channels);
api.route("/predictions", predictions);
api.route("/matches", matches);
api.route("/batches", batches);
api.route("/tasks", tasks);
api.route("/taxonomy", taxonomy);
api.route("/audit", audit);
api.route("/account-matches", accountMatches);
api.route("/bi/douyin", biDouyin);
api.route("/data-management", dataManagement);
api.route("/new-products", newProducts);
api.route("/operations", flywheel);
api.route("/admin/database", adminDatabase);

app.route("/api/v0", api);

const port = parseInt(process.env.PORT ?? "3100");
console.log(`PLS server starting on http://localhost:${port}`);
console.log(`Auth token: pls-p0-demo-token`);
console.log(`Workspace header: X-PLS-Workspace: ws_demo`);

serve({ fetch: app.fetch, port });
