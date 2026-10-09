#!/usr/bin/env bash
# End-to-end check: healthy site + fresh backup -> one care-run -> report saved and emailed;
# then an outdated plugin + no backup -> the next report is amber/red and tells the owner to update/back up.
# Ends with the site healthy and up to date (plugin re-updated, fresh backup). Clears the Mailpit test mailbox.
set -euo pipefail
cd "$(dirname "$0")"
P5=${SITE_DIR:-../wp-site-rescue}   # the WordPress site: mcknx/wp-site-rescue cloned next to this repo
q() { docker exec va-pg psql -U va -d va -t -A -c "$1"; }
fail() { echo "FAIL: $1"; exit 1; }
run() { curl -sf -m 400 -X POST localhost:5678/webhook/care-run; }
mails() { curl -sf 'localhost:8025/api/v1/search?query=to:owner@bayviewdental.example'; }
node parse.check.mjs
docker exec -i -e PGOPTIONS=-cclient_min_messages=warning va-pg psql -U va -d va -q < schema.sql
$P5/restore.sh
./install.sh
./backup.sh
q "truncate p6_reports restart identity" >/dev/null
curl -sf -X DELETE localhost:8025/api/v1/messages >/dev/null

r1=$(run) || fail "care-run webhook (run 1)"; echo "run 1: $r1"
[ "$(q "select count(*) from p6_reports")" = "1" ] || fail "expected 1 row in p6_reports"
s1=$(q "select status from p6_reports where id = 1")
[[ $s1 =~ ^(green|amber|red)$ ]] && echo "p6 ok: status $s1" || fail "status $s1"
[ "$(q "select jsonb_array_length(report->'actions') > 0 and (data->'uptime'->>'ok')::boolean and emailed from p6_reports where id = 1")" = "t" ] \
  && echo "p6 ok: actions present, uptime ok, emailed" || fail "actions/uptime/emailed: $(q "select report, data->'uptime', emailed from p6_reports where id = 1")"
m=$(mails)
[ "$(node -pe 'JSON.parse(process.argv[1]).messages_count' "$m")" = "1" ] && node -pe 'JSON.parse(process.argv[1]).messages[0].Subject' "$m" | grep -q "Website care report" \
  && echo "p6 ok: 1 email to the owner, subject: $(node -pe 'JSON.parse(process.argv[1]).messages[0].Subject' "$m")" || fail "mailpit: $m"

# Make it worse: one plugin behind, and no backup on record.
was=$($P5/wp plugin get contact-form-7 --field=version)
$P5/wp plugin install contact-form-7 --version=6.1.7 --force --quiet 2>/dev/null
$P5/wp option delete bayview_last_backup_at --quiet
r2=$(run) || fail "care-run webhook (run 2)"; echo "run 2: $r2"
s2=$(q "select status from p6_reports where id = 2")
[[ $s2 =~ ^(amber|red)$ ]] && echo "p6 ok: status $s2 with an outdated plugin and no backup" || fail "status after breaking: $s2"
q "select a->>'what' || ' ' || (a->>'why') from p6_reports, jsonb_array_elements(report->'actions') a where id = 2" | grep -qiE 'updat|backup' \
  && echo "p6 ok: an action says to update / back up" || fail "no update/backup action: $(q "select report->'actions' from p6_reports where id = 2")"
[ "$(node -pe 'JSON.parse(process.argv[1]).messages_count' "$(mails)")" = "2" ] && echo "p6 ok: 2nd email sent" || fail "second email missing"

# Leave the site healthy and up to date.
$P5/wp plugin install contact-form-7 --version="$was" --force --quiet 2>/dev/null
./backup.sh >/dev/null
echo "p6 PASS (site back to contact-form-7 $was, fresh backup)"
