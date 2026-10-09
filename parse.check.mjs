// node parse.check.mjs -> asserts the Parse rules (status floor, numbers guard, must-have actions) on the exact code in workflow.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("parse.js", import.meta.url), "utf8");
const wf = JSON.parse(readFileSync(new URL("workflow.json", import.meta.url), "utf8"));
assert.ok(wf.nodes.find((n) => n.name === "Parse").parameters.jsCode.startsWith(src), "workflow.json Parse node is out of sync with parse.js");
const parse = new Function(src + "\nreturn parseReport;")();

const healthy = {
  uptime: { ok: true, checks: 3, up: 3, avg_ms: 212, max_ms: 340 },
  health: { wp_version: "7.1.3", plugins: [{ slug: "contact-form-7", version: "6.2.1", update: null }], theme_updates: 0, core_update: null, debug_errors_24h: 0, disk_uploads_mb: 6.5 },
  backup_age_days: 0, backup_max_age_days: 7, lighthouse: { score: 72, lcp_s: 5.7, total_kb: 722, scale: 100 },
};
const reply = (o) => "```json\n" + JSON.stringify({ status: "green", headline: "All good: 3 of 3 checks up, average 212 ms.",
  sections: [{ title: "Speed", body: "Mobile score 72 out of 100, largest image shows in 5.7 s." }],
  actions: [{ what: "Keep going", why: "Healthy.", effort: "quick" }], ...o }) + "\n```";

const g = parse(reply(), healthy);
assert.equal(g.status, "green"); assert.equal(g.guarded, 0);
assert.equal(g.headline, "All good: 3 of 3 checks up, average 212 ms.");
assert.deepEqual(g.actions, [{ what: "Keep going", why: "Healthy.", effort: "quick" }]);

// Invented numbers are replaced: 99.9 % uptime, "1,500 visitors", a 45 in an action.
const inv = parse(reply({ headline: "99.9% uptime this week!", sections: [{ title: "Traffic", body: "1,500 visitors came." }],
  actions: [{ what: "Fix 45 broken links", why: "x", effort: "quick" }, { what: "Keep going", why: "Score 72.", effort: "fast" }] }), healthy);
assert.equal(inv.guarded, 3);
assert.match(inv.headline, /healthy this week/);
assert.match(inv.sections[0].body, /exact figures are in the table/);
assert.deepEqual(inv.actions, [{ what: "Keep going", why: "Score 72.", effort: "medium" }]);
assert.equal(parse(reply({ headline: "Total 722 KB, 07 plugins" }), { ...healthy, lighthouse: { ...healthy.lighthouse, n: 7 } }).guarded, 0);

// Outdated plugin + no backup: Claude says green with no actions -> floor amber, update + backup actions added.
const bad = { ...healthy, backup_age_days: null,
  health: { ...healthy.health, plugins: [{ slug: "contact-form-7", version: "6.1.7", update: "6.2.1" }] } };
const a = parse(reply({ actions: [] }), bad);
assert.equal(a.status, "amber");
assert.ok(a.actions.some((x) => /updat/i.test(x.what) && /contact-form-7/.test(x.what)));
assert.ok(a.actions.some((x) => /backup/i.test(x.what)));
assert.equal(parse(reply({ status: "red" }), bad).status, "red"); // Claude may raise the floor

// Site down / bridge failed / garbage -> red with an online action, template text.
const down = parse(undefined, { ...healthy, uptime: { ok: false, checks: 3, up: 0 } });
assert.equal(down.status, "red"); assert.match(down.actions[0].what, /back online/);
assert.equal(parse("not json", healthy).actions[0].what, "No action needed — keep the weekly checks running");
assert.equal(parse("not json", { ...healthy, lighthouse: null }).status, "amber");
console.log("parse ok: 12 cases");
