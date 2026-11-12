#!/usr/bin/env bash
# =============================================================================
# Scholarly - Reviewer Quota Concurrency Test
#
# Proves the claim that reviewer limits hold under concurrent assignment.
#
# Setup leaves exactly ONE free slot in a reviewer's quota, then fires two
# independent database sessions that both try to claim it at the same moment.
# Exactly one must succeed.
#
# The guarantee comes from trg_fn_enforce_reviewer_load, which takes a
# SELECT ... FOR UPDATE row lock on the reviewer's CONFERENCE_MEMBERSHIPS row
# before counting. The second session blocks on that lock until the first
# commits, then re-counts and sees the slot is gone. Without the row lock both
# sessions would read the same stale count and both would be admitted.
#
# Usage:  ./db/tests/13_concurrency_test.sh [database_name]
# =============================================================================

set -uo pipefail

DB="${1:-scholarly}"
PSQL="psql -qtAX -d $DB"

echo "=== Reviewer quota concurrency test (database: $DB) ==="
echo

# -----------------------------------------------------------------------------
# 1. Choose a reviewer and two conflict-free papers they are not yet assigned to
# -----------------------------------------------------------------------------
read -r REVIEWER P1 P2 ORIG_CAP ACTIVE <<<"$(
$PSQL <<'SQL'
WITH r AS (
    SELECT cm.person_id, cm.max_active_assignments
    FROM CONFERENCE_MEMBERSHIPS cm
    WHERE cm.conference_id = 4 AND cm.role = 'reviewer'
    ORDER BY cm.person_id
    LIMIT 1
),
active AS (
    SELECT COUNT(*) AS n
    FROM REVIEW_ASSIGNMENTS ra
    JOIN PAPERS p ON p.paper_id = ra.paper_id, r
    WHERE ra.reviewer_person_id = r.person_id
      AND p.conference_id = 4
      AND ra.assignment_status IN ('pending','accepted')
),
free AS (
    SELECT p.paper_id,
           ROW_NUMBER() OVER (ORDER BY p.paper_id) AS rn
    FROM PAPERS p, r
    WHERE p.conference_id = 4
      AND NOT fn_has_conflict(p.paper_id, r.person_id)
      AND NOT EXISTS (
            SELECT 1 FROM REVIEW_ASSIGNMENTS ra
            WHERE ra.paper_id = p.paper_id
              AND ra.reviewer_person_id = r.person_id)
)
SELECT r.person_id || ' '
    || (SELECT paper_id FROM free WHERE rn = 1) || ' '
    || (SELECT paper_id FROM free WHERE rn = 2) || ' '
    || COALESCE(r.max_active_assignments::text, 'NULL') || ' '
    || (SELECT n FROM active)
FROM r;
SQL
)"

if [[ -z "${REVIEWER:-}" || "$P1" == "" || "$P2" == "" ]]; then
    echo "FAILED: could not find a reviewer with two spare conflict-free papers."
    exit 1
fi

echo "Reviewer under test : $REVIEWER"
echo "Active assignments  : $ACTIVE"
echo "Original cap        : $ORIG_CAP"
echo "Contended papers    : $P1 and $P2"
echo

# -----------------------------------------------------------------------------
# 2. Leave exactly one free slot
# -----------------------------------------------------------------------------
NEW_CAP=$((ACTIVE + 1))
$PSQL -c "UPDATE CONFERENCE_MEMBERSHIPS
          SET max_active_assignments = $NEW_CAP
          WHERE conference_id = 4 AND person_id = $REVIEWER AND role = 'reviewer';" >/dev/null

echo "Cap pinned to $NEW_CAP, so exactly one slot is free."
echo "Firing two concurrent sessions..."
echo

# -----------------------------------------------------------------------------
# 3. Two sessions race for the last slot
#
# Session A holds its transaction open for 2 seconds after inserting, so the
# two attempts genuinely overlap rather than running one after the other.
# -----------------------------------------------------------------------------
(
    psql -qtAX -d "$DB" <<SQL 2>&1 | sed 's/^/  [session A] /'
BEGIN;
INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
VALUES ($P1, $REVIEWER, 1);
SELECT 'inserted, holding transaction open';
SELECT pg_sleep(2);
COMMIT;
SELECT 'committed';
SQL
) &
PID_A=$!

sleep 0.3

(
    psql -qtAX -d "$DB" <<SQL 2>&1 | sed 's/^/  [session B] /'
BEGIN;
INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
VALUES ($P2, $REVIEWER, 1);
SELECT 'inserted';
COMMIT;
SELECT 'committed';
SQL
) &
PID_B=$!

wait $PID_A $PID_B
echo

# -----------------------------------------------------------------------------
# 4. Verify exactly one session won
# -----------------------------------------------------------------------------
WON=$($PSQL -c "SELECT COUNT(*) FROM REVIEW_ASSIGNMENTS
                WHERE reviewer_person_id = $REVIEWER
                  AND paper_id IN ($P1, $P2);")

FINAL_ACTIVE=$($PSQL -c "SELECT COUNT(*) FROM REVIEW_ASSIGNMENTS ra
                         JOIN PAPERS p ON p.paper_id = ra.paper_id
                         WHERE ra.reviewer_person_id = $REVIEWER
                           AND p.conference_id = 4
                           AND ra.assignment_status IN ('pending','accepted');")

echo "Assignments created by the race : $WON (expected 1)"
echo "Reviewer active total           : $FINAL_ACTIVE (cap was $NEW_CAP)"
echo

RESULT=0
if [[ "$WON" -eq 1 && "$FINAL_ACTIVE" -le "$NEW_CAP" ]]; then
    echo "PASSED: exactly one session claimed the last slot; the cap held."
else
    echo "FAILED: $WON assignments were created and the reviewer now holds $FINAL_ACTIVE against a cap of $NEW_CAP."
    RESULT=1
fi

# -----------------------------------------------------------------------------
# 5. Restore original state
# -----------------------------------------------------------------------------
$PSQL -c "DELETE FROM REVIEW_ASSIGNMENTS
          WHERE reviewer_person_id = $REVIEWER AND paper_id IN ($P1, $P2);" >/dev/null

if [[ "$ORIG_CAP" == "NULL" ]]; then
    $PSQL -c "UPDATE CONFERENCE_MEMBERSHIPS SET max_active_assignments = NULL
              WHERE conference_id = 4 AND person_id = $REVIEWER AND role = 'reviewer';" >/dev/null
else
    $PSQL -c "UPDATE CONFERENCE_MEMBERSHIPS SET max_active_assignments = $ORIG_CAP
              WHERE conference_id = 4 AND person_id = $REVIEWER AND role = 'reviewer';" >/dev/null
fi

echo "State restored."
exit $RESULT
