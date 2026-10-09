// node bridge.mjs -> :8788. POST /reply {prompt} -> `claude -p` (local Claude Code CLI). POST /p6/lighthouse one mobile Lighthouse run
// of the site. GET / or /p6 the report archive, GET /p6/state the last 20 reports.
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const SITE = process.env.SITE_URL || "http://localhost:8092/";
process.env.CHROME_PATH ||= "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; // macOS; set CHROME_PATH elsewhere
const run = (cmd, args, input, timeout = 120e3) => new Promise((ok, no) => {
  const p = execFile(cmd, args, { maxBuffer: 1e8, timeout }, (e, out) => (e ? no(e) : ok(out)));
  if (input) p.stdin.end(input);
});
createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type }); res.end(body); };
  try {
    if (req.method === "POST" && req.url === "/reply") {
      let b = ""; for await (const c of req) b += c;
      const { prompt } = JSON.parse(b);
      const text = (await run("claude", ["-p", "--model", "opus"], prompt)).trim();
      return send(200, "application/json", JSON.stringify({ text }));
    }
    if (req.method === "POST" && req.url === "/p6/lighthouse") {
      const lhr = JSON.parse(await run("npx", ["-y", "lighthouse@13.5.0", SITE, "--form-factor=mobile", "--screenEmulation.mobile",
        "--throttling-method=simulate", "--only-categories=performance", "--output=json", "--quiet", "--chrome-flags=--headless=new --no-sandbox"], null, 90e3));
      if (lhr.runtimeError) throw new Error(lhr.runtimeError.message);
      const a = lhr.audits;
      return send(200, "application/json", JSON.stringify({ score: Math.round(lhr.categories.performance.score * 100),
        lcp_ms: Math.round(a["largest-contentful-paint"].numericValue), total_bytes: Math.round(a["total-byte-weight"].numericValue) }));
    }
    if (req.url === "/p6/state") {
      const json = await run("docker", ["exec", "va-pg", "psql", "-U", "va", "-d", "va", "-t", "-A", "-c",
        "select coalesce(json_agg(r order by id desc), '[]') from (select * from p6_reports order by id desc limit 20) r"]);
      return send(200, "application/json", json.trim());
    }
    if (req.url === "/" || req.url === "/p6") return send(200, "text/html", readFileSync(dir + "report-archive.html"));
    send(404, "text/plain", "not found");
  } catch (e) { send(500, "text/plain", String(e)); }
}).listen(8788, () => console.log("bridge :8788"));
