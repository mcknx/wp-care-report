#!/usr/bin/env bash
# Install the care-plan check into the running WordPress site (wp-site-rescue) (idempotent): mu-plugin + care-bot user with only the
# bayview_health capability + a fixed application password, and the matching n8n credential (vaP6CareBot).
# wp-site-rescue's restore.sh wipes the docroot and database, so run this again after every restore (check.sh does).
set -euo pipefail
cd "$(dirname "$0")"
P5=${SITE_DIR:-../wp-site-rescue}   # the WordPress site: mcknx/wp-site-rescue cloned next to this repo
cli() { docker compose -p va-p5 exec -T cli "$@"; }
[[ -s .care-bot-pass ]] || openssl rand -hex 12 > .care-bot-pass   # gitignored; no tr|head pipe: under pipefail tr's SIGPIPE killed the first run
pass=$(cat .care-bot-pass)

cli sh -c 'mkdir -p wp-content/mu-plugins && cat > wp-content/mu-plugins/bayview-health.php' < mu-plugin/bayview-health.php
$P5/wp user get care-bot --field=ID >/dev/null 2>&1 \
  || $P5/wp user create care-bot care-bot@bayviewdental.example --role=subscriber --quiet >/dev/null
$P5/wp user add-cap care-bot bayview_health >/dev/null
# One application password, set to the stored secret (WordPress would generate a new one on every create).
$P5/wp eval '
  $u = get_user_by("login", "care-bot")->ID; $pass = "'"$pass"'";
  $ok = array_filter(WP_Application_Passwords::get_user_application_passwords($u),
    fn($p) => $p["name"] === "n8n" && WP_Application_Passwords::check_password($pass, $p["password"]));
  if (!$ok) {
    WP_Application_Passwords::delete_all_application_passwords($u);
    WP_Application_Passwords::create_new_application_password($u, ["name" => "n8n"]);
    $all = WP_Application_Passwords::get_user_application_passwords($u);
    $all[0]["password"] = WP_Application_Passwords::hash_password($pass);
    update_user_meta($u, "_application_passwords", $all);
  }' >/dev/null

# n8n credential: only (re)imported when it does not hold this password yet.
stamp=$(printf %s "$pass" | shasum | cut -c1-12)
if [[ $(cat .care-bot-cred 2>/dev/null) != "$stamp" ]]; then
  printf '[{"id":"vaP6CareBot","name":"VA P6 care-bot (WordPress)","type":"httpBasicAuth","data":{"user":"care-bot","password":"%s"}}]' "$pass" > /tmp/vaP6-cred.json
  docker cp /tmp/vaP6-cred.json n8n:/tmp/vaP6-cred.json && rm /tmp/vaP6-cred.json
  docker exec n8n n8n import:credentials --input=/tmp/vaP6-cred.json >/dev/null 2>&1
  docker exec -u root n8n rm -f /tmp/vaP6-cred.json
  echo "$stamp" > .care-bot-cred
fi
code=$(curl -s -o /dev/null -w '%{http_code}' -u "care-bot:$pass" 'http://localhost:8092/?rest_route=/bayview/v1/health')
[[ $code == 200 ]] || { echo "[install] health endpoint answered $code" >&2; exit 1; }
echo "[install] mu-plugin + care-bot ready, health endpoint 200"
