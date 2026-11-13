#!/usr/bin/env bash
# =============================================================================
# Scholarly - capture execution logs for the project report
#
# Builds the database from scratch and saves the real CLI output of every
# script into docs/logs/. Nothing here is transcribed by hand, so the logs
# always match the current state of db/.
#
# Usage:  ./db/tools/capture_execution_logs.sh [database_name]
# =============================================================================

set -uo pipefail

DB="${1:-demo}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="$ROOT/docs/logs"

mkdir -p "$LOGS"
cd "$ROOT"

header() {
    {
        echo "============================================================================"
        echo "Scholarly - $1"
        echo "Database   : $DB"
        echo "PostgreSQL : $(psql -tAX -d postgres -c 'SHOW server_version;' 2>/dev/null | tr -d ' ')"
        echo "Captured   : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
        echo "Command    : $2"
        echo "============================================================================"
        echo
    }
}

run() {   # run <logfile> <title> <sql file>
    local log="$LOGS/$1" title="$2" file="$3"
    header "$title" "psql -d $DB -f $file" > "$log"
    psql -d "$DB" -f "$file" >> "$log" 2>&1
    echo "  wrote $1"
}

echo "Rebuilding $DB from scratch..."
dropdb --if-exists "$DB" >/dev/null 2>&1
createdb "$DB"

run 01_schema_core.log        "Core Platform schema (DDL)"           db/schema/01_core_tables.sql
run 02_procedures_core.log    "Core Platform triggers and procedures" db/procedures/02_advanced_features.sql
run 03_seed_core.log          "Core Platform seed data (DML)"        db/seeds/03_seed_data.sql
run 04_queries_core.log       "Core Platform demonstration queries"  db/queries/05_demonstration_queries.sql
run 05_tests_core.log         "Core Platform constraint tests"       db/tests/04_constraint_tests.sql
run 06_schema_review.log      "Review pipeline schema (DDL)"         db/schema/08_review_tables.sql
run 07_procedures_review.log  "Review pipeline triggers, procedures and views" db/procedures/09_review_features.sql
run 08_seed_review.log        "Review pipeline synthetic dataset (200 papers, 50 reviewers)" db/seeds/10_review_seed_data.sql
run 09_queries_review.log     "Review pipeline analytical queries"   db/queries/11_review_analytics.sql
run 10_tests_review.log       "Review pipeline constraint tests"     db/tests/12_review_constraint_tests.sql

# Concurrency test drives two sessions itself, so it is captured separately.
LOG="$LOGS/11_tests_concurrency.log"
header "Reviewer quota concurrency test" "./db/tests/13_concurrency_test.sh $DB" > "$LOG"
bash db/tests/13_concurrency_test.sh "$DB" >> "$LOG" 2>&1
echo "  wrote 11_tests_concurrency.log"

# Schema inventory
LOG="$LOGS/12_schema_inventory.log"
header "Schema inventory" "psql -d $DB" > "$LOG"
psql -d "$DB" >> "$LOG" 2>&1 <<'SQL'
\echo '--- Tables ---'
\dt
\echo ''
\echo '--- Views ---'
\dv
\echo ''
\echo '--- Functions and procedures ---'
\df public.*
\echo ''
\echo '--- Triggers ---'
SELECT event_object_table AS table_name, trigger_name, action_timing,
       string_agg(event_manipulation, ', ' ORDER BY event_manipulation) AS events
FROM information_schema.triggers
WHERE trigger_schema = 'public'
GROUP BY event_object_table, trigger_name, action_timing
ORDER BY event_object_table, trigger_name;
\echo ''
\echo '--- Row counts ---'
SELECT relname AS table_name, n_live_tup AS approx_rows
FROM pg_stat_user_tables ORDER BY relname;
SQL
echo "  wrote 12_schema_inventory.log"

echo
echo "Logs written to docs/logs/"
ls -1 "$LOGS"
