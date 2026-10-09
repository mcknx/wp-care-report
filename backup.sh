#!/usr/bin/env bash
# Back up the WordPress site: database export + wp-content tar into backups/ (gitignored), keep the newest 2,
# then record the time in the bayview_last_backup_at option, which the health endpoint reports.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
ts=$(date -u +%Y%m%dT%H%M%SZ)
cli() { docker compose -p va-p5 exec -T cli "$@"; }
cli wp db export - --quiet > "backups/$ts.sql"
cli tar -C /var/www/html -cf - wp-content > "backups/$ts.wp-content.tar"
[[ -s backups/$ts.sql && -s backups/$ts.wp-content.tar ]] || { echo "[backup] empty backup" >&2; exit 1; }
ls -1t backups/*.sql | tail -n +3 | sed 's/\.sql$//' | while read -r old; do rm -f "$old.sql" "$old.wp-content.tar"; done
cli wp option update bayview_last_backup_at "$(date +%s)" --quiet
echo "[backup] backups/$ts ($(du -sh "backups/$ts.wp-content.tar" | cut -f1) wp-content)"
