// Films the real P6 flow headless: title → `curl …/webhook/care-run` (real run) → the n8n flow rendered from workflow.json while
// that run is still going → the email in Mailpit, opened → one plugin made out of date with WP-CLI → a second real run → the
// amber email and its update action → the /p6 archive with both reports → end card.
// node capture.mjs   (needs the va-p5 stack on :8092 with install.sh done, n8n :5678, bridge :8788, Mailpit :8025, va-pg)
// Before filming: contact-form-7 back to its current version, fresh backup.sh, p6_reports + Mailpit emptied (not filmed).
// After: contact-form-7 back to that version + fresh backup.sh, as check.sh leaves it.
// Writes $OUT/raw.webm + $OUT/run.json (event marks in seconds since the page opened ≈ video t=0, and both reports as saved).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");

const OUT = process.env.OUT || "/tmp/va-p6-demo";
const SIZE = { width: 1280, height: 720 };
const RUN = ["-s", "-m", "400", "-X", "POST", "localhost:5678/webhook/care-run"];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const here = new URL(".", import.meta.url).pathname;
const proj = here + "../";
const P5 = (process.env.SITE_DIR || proj + "../wp-site-rescue") + "/";
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const sh = (cmd, ...args) => execFileSync(cmd, args, { cwd: proj, encoding: "utf8" });
const q = (sql) => sh("docker", "exec", "va-pg", "psql", "-U", "va", "-d", "va", "-t", "-A", "-c", sql).trim();

const css = `body{margin:0;height:100vh;background:#0f1d29;color:#e8eef3;font:18px -apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}`;
// The growing bar keeps frames coming: a page that never repaints gives the recorder no first frame (seen: a 6 s offset).
const card = (eyebrow, title, sub) => `<!doctype html><meta charset="utf-8"><style>${css}
  body{display:grid;place-items:center;text-align:center}
  .e{letter-spacing:.18em;text-transform:uppercase;color:#7fd3da;font-size:15px;font-weight:600} h1{font-size:50px;margin:14px 0 12px;line-height:1.15} p{color:#b9c8d4;margin:0}
  .bar{height:3px;width:0;margin:22px auto 0;background:#7fd3da;animation:g 6s linear forwards} @keyframes g{to{width:320px}}
  </style><div><div class="e">${eyebrow}</div><h1>${title}</h1><p>${sub}</p><div class="bar"></div></div>`;

const term = (title) => `<!doctype html><meta charset="utf-8"><style>${css}
  body{background:#0b1117}
  .win{position:absolute;left:90px;top:104px;width:1100px;height:470px;background:#0d1520;border:1px solid #233243;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.5)}
  .bar{height:38px;background:#16212d;display:flex;align-items:center;padding:0 16px;gap:8px;color:#9fb3c3;font:600 14px ui-monospace,Menlo,monospace}
  .bar i{width:12px;height:12px;border-radius:50%;display:inline-block} .bar span{margin-left:12px} #el{margin-left:auto;color:#7fd3da}
  #log{padding:14px 20px;font:15px/1.55 ui-monospace,Menlo,monospace;white-space:pre-wrap;height:432px;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
  .p{color:#7fd3da} .x{color:#c9d6e0} .ok{color:#5fd38d;font-weight:700}
  </style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
  <span>${title}</span><b id="el"></b></div><div id="log"></div></div>`;
const say = (page, html, c = "x") => page.evaluate(([h, c]) => { const el = document.createElement("div"); el.className = c; el.innerHTML = h; document.getElementById("log").appendChild(el); }, [html, c]).catch(() => {});
const prompt = (page, dir, cmd) => say(page, `<span class="p">~/${dir} $</span> ${esc(cmd)}`);

// Flow diagram from workflow.json: all nodes in 5 boxes (every name checked against the file), plus a live pill under it that
// counts the run in progress and shows its webhook answer when it lands (under, not top-right: the answer is long).
function flowHtml() {
  const wf = JSON.parse(readFileSync(proj + "workflow.json", "utf8"));
  const names = new Set(wf.nodes.map((n) => n.name));
  const groups = [
    ["Start the run", ["Every Monday 08:00", "Run now"]],
    ["Check the site", ["Uptime x3", "Health", "Lighthouse"]],
    ["Claude writes it up", ["Build prompt", "Ask Claude", "Parse"]],
    ["Save to the archive", ["Save"]],
    ["Email the owner", ["Render email", "Send email", "Mark emailed", "Respond"]],
  ];
  const shown = groups.flatMap((g) => g[1]);
  for (const n of shown) if (!names.has(n)) throw new Error("workflow.json has no node " + n);
  if (shown.length !== names.size) throw new Error(`flow shows ${shown.length} of ${names.size} nodes`);
  const boxes = groups.map(([title, ns], i) => `${i ? '<div class="arr" style="animation-delay:' + (0.8 + i * 1.2) + 's">→</div>' : ""}
    <div class="box" style="animation-delay:${0.8 + i * 1.2}s"><div class="k">${i + 1}</div><b>${title}</b><span>${ns.join(" · ")}</span></div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#f3f7fa;color:#0f2a3d;font:16px -apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
  h2{margin:0 0 6px;font-size:30px;text-align:center} p{margin:0 0 40px;text-align:center;color:#5b7083}
  .row{display:flex;align-items:center;justify-content:center;gap:6px}
  .box{width:180px;min-height:150px;padding:18px 10px;box-sizing:border-box;background:#fff;border:2px solid #dde5ec;border-radius:14px;text-align:center;opacity:.35;animation:on .5s forwards}
  .box b{display:block;font-size:18px;margin:8px 0 6px;line-height:1.25} .box span{color:#5b7083;font-size:13px}
  .k{width:30px;height:30px;margin:0 auto;border-radius:50%;background:#0e7c86;color:#fff;display:grid;place-items:center;font-weight:700}
  .arr{font-size:24px;color:#0e7c86;opacity:.2;animation:on2 .5s forwards}
  @keyframes on{to{opacity:1;border-color:#0e7c86;box-shadow:0 8px 24px rgba(14,124,134,.18)}} @keyframes on2{to{opacity:1}}
  #live{width:max-content;margin:34px auto 120px;padding:8px 14px;border-radius:10px;background:rgba(14,17,22,.92);color:#E6EDF3;font:600 15px ui-monospace,Menlo,monospace}
  </style><div><h2>${wf.name.replace(/^VA P6 — /, "")}: the n8n workflow</h2><p>Rendered from workflow.json · all ${wf.nodes.length} nodes, grouped in 5 steps</p><div class="row">${boxes}</div><div id="live"></div></div>`;
}

// Visible cursor + ring (Playwright's mouse is invisible on video), and an optional label pill. All pointer-events:none, on <html>.
const overlayJs = (label) => {
  if (!document.getElementById("__cur")) {
    const mk = (id, css) => Object.assign(document.documentElement.appendChild(Object.assign(document.createElement("div"), { id })).style, { position: "fixed", pointerEvents: "none", zIndex: 2147483646, ...css });
    mk("__cur", { width: "20px", height: "20px", borderRadius: "50%", background: "rgba(20,20,20,.9)", boxShadow: "0 0 0 5px rgba(255,255,255,.85),0 3px 10px rgba(0,0,0,.4)", left: "60%", top: "60%", transition: "left .6s cubic-bezier(.4,0,.2,1),top .6s cubic-bezier(.4,0,.2,1)" });
    mk("__ring", { border: "3px solid #EF621C", borderRadius: "14px", boxShadow: "0 0 0 6px rgba(239,98,28,.18)", opacity: 0, transition: "all .5s cubic-bezier(.4,0,.2,1)" });
  }
  if (label) {
    const el = document.documentElement.appendChild(document.createElement("div"));
    Object.assign(el.style, { position: "fixed", pointerEvents: "none", zIndex: 2147483645, right: "16px", bottom: "120px", padding: "7px 14px", borderRadius: "999px",
      font: "600 15px -apple-system,Segoe UI,Roboto,sans-serif", color: "#fff", background: "#0e7c86", boxShadow: "0 4px 14px rgba(0,0,0,.3)" });
    el.textContent = label;
  }
};
// Scroll the element (in the page or in Mailpit's message iframe) clear of the burned-in captions, then ring it.
async function point(page, loc, hold = 800) {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(300);
  let b; for (let i = 0; i < 10 && !(b = await loc.boundingBox()); i++) await wait(100);
  if (!b) throw new Error("nothing to point at: " + loc);
  await page.evaluate((b) => {
    Object.assign(document.getElementById("__cur").style, { left: b.x + b.width - 4 + "px", top: b.y + b.height - 4 + "px" });
    Object.assign(document.getElementById("__ring").style, { left: b.x - 8 + "px", top: b.y - 8 + "px", width: b.width + 10 + "px", height: b.height + 10 + "px", opacity: 1 });
  }, b);
  await wait(hold);
}

// A real command, spawned; every line it prints is appended to the terminal page as it arrives.
function stream(page, cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", buf = "";
    const take = (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trimEnd(); buf = buf.slice(i + 1); if (l) say(page, esc(l)); } };
    p.stdout.on("data", (d) => { out += d; take(d); });
    p.stderr.on("data", (d) => { err += d; take(d); });
    p.on("error", reject);
    p.on("close", (code) => { if (buf.trim()) say(page, esc(buf.trim())); code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${err}`)); });
  });
}
const tick = (page, label, from = 0) => page.evaluate(([label, from]) => { const t = performance.now() - from * 1000, el = document.getElementById("el") || document.getElementById("live"); window.__tick = setInterval(() => (el.textContent = `${label}${((performance.now() - t) / 1000).toFixed(1)} s`), 100); }, [label, from]);
const untick = (page, extra = "") => page.evaluate((extra) => { clearInterval(window.__tick); const el = document.getElementById("el") || document.getElementById("live"); el.textContent += extra; }, extra);

// Mailpit: the inbox, then the newest care email opened. Returns a locator factory for its HTML body (an iframe).
async function inbox(page, key, n) {
  await page.goto("http://localhost:8025/", { waitUntil: "networkidle" });
  await page.locator("a.message").nth(n - 1).waitFor(); await page.evaluate(overlayJs);
  if ((await page.locator("a.message").count()) !== n) throw new Error(`expected ${n} emails in Mailpit`);
  mark("inbox" + key); await wait(600);
  const msg = page.locator("a.message").first();
  await point(page, msg, 1300);
  await msg.click();
  const body = page.frameLocator("iframe").first();
  await body.locator("h1").waitFor(); await page.evaluate(overlayJs);
  mark("email" + key); await wait(400);
  return body;
}

const FIELDS = "id, status, emailed, report, data->'uptime' uptime, data->'lighthouse' lighthouse, data->'updates_pending' updates_pending, data->'backup_age_days' backup_age_days";
const row = (id) => JSON.parse(q(`select row_to_json(r) from (select ${FIELDS} from p6_reports where id = ${id}) r`));

let browser, ctx, t0, cf7;
const run = { marks: {}, responses: [], reports: [] };
const mark = (k) => (run.marks[k] = +((Date.now() - t0) / 1000).toFixed(2));
try {
  // ── setup, not filmed: healthy + up to date + fresh backup, empty archive and mailbox
  if (sh("curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "localhost:8092/") !== "200") throw new Error("site not healthy — run ../wp-site-rescue/restore.sh && ./install.sh");
  cf7 = sh(P5 + "wp", "plugin", "get", "contact-form-7", "--field=version").trim();
  if (sh(P5 + "wp", "plugin", "list", "--name=contact-form-7", "--field=update").trim() !== "none") throw new Error("contact-form-7 is not current: " + cf7);
  console.error(sh(proj + "backup.sh").trim());
  q("truncate p6_reports restart identity");
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });

  mkdirSync(OUT + "/raw", { recursive: true });
  browser = await chromium.launch({ headless: true });
  ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: OUT + "/raw", size: SIZE } });
  const page = await ctx.newPage();
  t0 = Date.now();

  await page.setContent(card("Bayview Dental · a demo WordPress site", "Paying for “maintenance”.<br>But what was done?", "A weekly website care report · n8n checks the site · Claude writes it in plain English"));
  mark("title"); await wait(6500);

  // ── run 1: the real webhook; the flow diagram shows while it is still running
  await page.setContent(term("p6-care-report — run the weekly check now")); await page.evaluate(overlayJs);
  await prompt(page, "p6-care-report", "curl -X POST localhost:5678/webhook/care-run");
  mark("run1"); const t1 = Date.now();
  const r1 = stream(page, "curl", RUN, proj); let done1 = false; r1.then(() => (done1 = true), () => (done1 = true));
  await tick(page, "running · "); await wait(2500);
  await page.setContent(flowHtml()); await tick(page, "live run #1 · ", (Date.now() - t1) / 1000); mark("flow"); // the timer carries on from the curl
  const res1 = await r1; mark("done1");
  run.responses.push(JSON.parse(res1));
  await untick(page, ` ✓ → ${res1}`); await wait(1800);

  // ── the email it sent, opened
  let body = await inbox(page, 1, 1);
  await point(page, body.locator("p", { hasText: /^(GREEN|AMBER|RED)$/ }), 1300);
  await point(page, body.locator("h1"), 1600); mark("sections1");
  for (const h of await body.locator("h2").all()) {
    if (/What to do/.test(await h.innerText())) break;
    await point(page, h.locator("xpath=following-sibling::p[1]"), 1000);
  }
  mark("actions1");
  await point(page, body.locator("ol"), 2200);
  await point(page, body.locator("table"), 1800);

  // ── one plugin falls behind, then run 2
  await page.setContent(term("p6-care-report — a plugin falls behind, then the next check")); await page.evaluate(overlayJs);
  await prompt(page, "wp-site-rescue", "./wp plugin install contact-form-7 --version=6.1.7 --force");
  mark("stale"); await tick(page, "");
  await stream(page, P5 + "wp", ["plugin", "install", "contact-form-7", "--version=6.1.7", "--force"], P5);
  await untick(page); mark("staleDone"); await wait(800);
  await prompt(page, "p6-care-report", "curl -X POST localhost:5678/webhook/care-run");
  mark("run2"); await tick(page, "run #2 · ");
  const res2 = await stream(page, "curl", RUN, proj); mark("done2");
  run.responses.push(JSON.parse(res2));
  await untick(page, " ✓"); await wait(1500);

  body = await inbox(page, 2, 2);
  await point(page, body.locator("p", { hasText: /^(GREEN|AMBER|RED)$/ }), 1300);
  await point(page, body.locator("h1"), 1500);
  await point(page, body.locator("h2", { hasText: "Updates" }).locator("xpath=following-sibling::p[1]"), 2000); mark("actions2");
  await point(page, body.locator("ol li", { hasText: /updat.*contact.form/i }).first(), 3000);

  // ── the archive page, both reports
  await page.goto("http://localhost:8788/p6", { waitUntil: "networkidle" });
  await page.locator(".runs button").nth(1).waitFor(); await page.evaluate(overlayJs);
  mark("archive"); await wait(600);
  await point(page, page.locator(".runs button").nth(0), 1300);
  await point(page, page.locator(".runs button").nth(1), 900);
  await page.locator(".runs button").nth(1).click(); await wait(300);
  await point(page, page.locator("#report .top"), 1800);

  await page.setContent(card("Built by", "McKeen Asma", "WordPress &amp; AI Automation VA · n8n + Claude")); mark("end"); await wait(5500);
  mark("stop");

  // what the film claims must be what the runs produced (a miss = failed take, exit 1, re-run)
  run.reports = [row(1), row(2)];
  const [a, b] = run.reports;
  if (a.status !== "green" || !a.emailed) throw new Error("run 1 not green+emailed: " + JSON.stringify(a));
  if (b.status !== "amber" || !b.emailed) throw new Error("run 2 not amber+emailed: " + JSON.stringify(b));
  if (!b.report.actions.some((x) => /contact.form/i.test(x.what) && /updat/i.test(x.what))) throw new Error("run 2 has no update action for contact-form-7");
} catch (e) { run.error = String(e.stack || e); console.error(e); process.exitCode = 1; }
finally {
  const v = ctx && ctx.pages()[0]?.video();
  await ctx?.close(); await browser?.close(); // close is what writes the webm
  if (v) renameSync(await v.path(), OUT + "/raw.webm");
  writeFileSync(OUT + "/run.json", JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ marks: run.marks, responses: run.responses, reports: run.reports.map((r) => ({ id: r.id, status: r.status, headline: r.report.headline, actions: r.report.actions.map((x) => x.what) })), error: run.error }, null, 2));
  try { // leave the site as check.sh does: plugin current again, fresh backup
    if (cf7) sh(P5 + "wp", "plugin", "install", "contact-form-7", "--version=" + cf7, "--force", "--quiet");
    console.error(sh(proj + "backup.sh").trim());
  } catch (e) { console.error("restore failed — contact-form-7 may be left at 6.1.7", e); process.exitCode = 1; }
}
