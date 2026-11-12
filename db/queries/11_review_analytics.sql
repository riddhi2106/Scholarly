-- ============================================================================
-- Scholarly - Review Pipeline Analytical Queries
--
-- The reporting layer a programme chair actually needs: where reviewers
-- disagree, which reviewers score off-centre, and which papers the matching
-- algorithm could not staff with a subject expert.
--
-- SQL features exercised, for the rubric:
--   Q1  GROUP BY + HAVING + aggregates + STDDEV
--   Q2  window functions (leave-one-out comparison)
--   Q3  correlated NOT EXISTS subquery
--   Q4  five-table join
--   Q5  LEFT JOIN + aggregate + computed utilisation
--   Q6  non-correlated subquery + HAVING
--   Q7  anti-join via NOT EXISTS
--   Q8  CASE aggregation / pivot
--   Q9  full-text search against the GIN index
--   Q10 JSONB inspection of the audit trail
--
-- Run against the dataset produced by db/seeds/10_review_seed_data.sql.
-- ============================================================================


-- ############################################################################
-- Q1. REVIEWER DISAGREEMENT
--
-- Papers where the review panel did not converge. Spread is the gap between the
-- harshest and most generous score; a spread of 5 or more on a 1-10 scale means
-- the panel fundamentally disagrees and the chair has to read the paper.
-- Demonstrates: GROUP BY, HAVING, COUNT/MIN/MAX/AVG/STDDEV_SAMP.
-- ############################################################################
\echo ''
\echo '=== Q1. Papers with the widest reviewer disagreement ==='
SELECT
    p.paper_id,
    LEFT(p.title, 52)                                   AS title,
    COUNT(r.review_id)                                  AS reviews,
    MIN(r.overall_score)                                AS min_score,
    MAX(r.overall_score)                                AS max_score,
    MAX(r.overall_score) - MIN(r.overall_score)         AS spread,
    ROUND(AVG(r.overall_score), 2)                      AS mean_score,
    ROUND(STDDEV_SAMP(r.overall_score), 2)              AS stddev
FROM PAPERS p
JOIN REVIEW_ASSIGNMENTS ra ON ra.paper_id = p.paper_id
JOIN REVIEWS r             ON r.assignment_id = ra.assignment_id
WHERE p.conference_id = 4
  AND r.review_status = 'submitted'
GROUP BY p.paper_id, p.title
HAVING COUNT(r.review_id) >= 2
   AND MAX(r.overall_score) - MIN(r.overall_score) >= 5
ORDER BY spread DESC, stddev DESC
LIMIT 15;


-- ############################################################################
-- Q2. REVIEWER SCORING BIAS
--
-- For each review, compare the score to what the OTHER reviewers of the same
-- paper gave. Averaging that difference per reviewer controls for paper quality,
-- so what is left is the reviewer's own tendency to run hot or cold.
-- A positive deviation means systematically generous, negative means harsh.
-- Demonstrates: window functions with PARTITION BY, leave-one-out aggregation.
-- ############################################################################
\echo ''
\echo '=== Q2. Reviewer scoring bias (deviation from co-reviewers) ==='
WITH scored AS (
    SELECT
        ra.reviewer_person_id,
        ra.paper_id,
        r.overall_score,
        -- Mean of the other reviewers on this same paper
        (SUM(r.overall_score) OVER (PARTITION BY ra.paper_id) - r.overall_score)
            / NULLIF(COUNT(*) OVER (PARTITION BY ra.paper_id) - 1, 0)::NUMERIC
            AS co_reviewer_mean
    FROM REVIEWS r
    JOIN REVIEW_ASSIGNMENTS ra ON ra.assignment_id = r.assignment_id
    JOIN PAPERS p              ON p.paper_id = ra.paper_id
    WHERE p.conference_id = 4
      AND r.review_status = 'submitted'
)
SELECT
    s.reviewer_person_id,
    pe.full_name,
    COUNT(*)                                                   AS reviews_written,
    ROUND(AVG(s.overall_score), 2)                             AS own_mean,
    ROUND(AVG(s.co_reviewer_mean), 2)                          AS co_reviewer_mean,
    ROUND(AVG(s.overall_score - s.co_reviewer_mean), 2)        AS bias,
    CASE
        WHEN AVG(s.overall_score - s.co_reviewer_mean) >=  2.0 THEN 'markedly lenient'
        WHEN AVG(s.overall_score - s.co_reviewer_mean) >=  1.0 THEN 'lenient'
        WHEN AVG(s.overall_score - s.co_reviewer_mean) <= -2.0 THEN 'markedly harsh'
        WHEN AVG(s.overall_score - s.co_reviewer_mean) <= -1.0 THEN 'harsh'
        ELSE 'calibrated'
    END                                                        AS assessment
FROM scored s
JOIN PEOPLE pe ON pe.person_id = s.reviewer_person_id
WHERE s.co_reviewer_mean IS NOT NULL
GROUP BY s.reviewer_person_id, pe.full_name
HAVING COUNT(*) >= 4
-- Ordered by magnitude so both ends of the scale surface: a systematically
-- harsh reviewer is as much of a calibration problem as a generous one.
ORDER BY ABS(AVG(s.overall_score - s.co_reviewer_mean)) DESC
LIMIT 12;


-- ############################################################################
-- Q3. PAPERS WITH NO ELIGIBLE EXPERT
--
-- A paper is unstaffable when no active reviewer on the conference both
-- (a) declares one of the paper's topics and (b) is free of a conflict with it.
-- These are the submissions a chair must handle by hand, by recruiting an
-- external reviewer.
-- Demonstrates: correlated NOT EXISTS over a multi-table predicate.
-- ############################################################################
\echo ''
\echo '=== Q3. Papers with no conflict-free topic expert ==='
SELECT
    p.paper_id,
    LEFT(p.title, 56)                                          AS title,
    (SELECT string_agg(t.topic_name, '; ')
       FROM PAPER_TOPICS pt JOIN TOPICS t USING (topic_id)
      WHERE pt.paper_id = p.paper_id)                          AS topics,
    (SELECT COUNT(*) FROM CONFLICTS_OF_INTEREST coi
      WHERE coi.paper_id = p.paper_id)                         AS conflicts
FROM PAPERS p
WHERE p.conference_id = 4
  AND NOT EXISTS (
        SELECT 1
        FROM CONFERENCE_MEMBERSHIPS cm
        JOIN REVIEWER_PROFILES rp  ON rp.person_id = cm.person_id
        JOIN REVIEWER_TOPICS rt    ON rt.reviewer_person_id = cm.person_id
        JOIN PAPER_TOPICS pt       ON pt.topic_id = rt.topic_id
                                  AND pt.paper_id = p.paper_id
        WHERE cm.conference_id = p.conference_id
          AND cm.role = 'reviewer'
          AND cm.membership_status = 'active'
          AND rp.reviewer_status = 'active'
          AND NOT fn_has_conflict(p.paper_id, cm.person_id)
  )
ORDER BY p.paper_id;

\echo '(An empty result means every paper could be staffed with a subject expert.)'


-- ############################################################################
-- Q4. CONFLICT OF INTEREST BREAKDOWN
--
-- What the automatic detector actually caught, and against which institutions.
-- Demonstrates: five-table join across conferences, papers, conflicts, people
-- and affiliations.
-- ############################################################################
\echo ''
\echo '=== Q4. Conflicts of interest by type and detection method ==='
SELECT
    c.acronym                                   AS conference,
    coi.coi_type,
    coi.detection_method,
    COUNT(*)                                    AS conflicts,
    COUNT(DISTINCT coi.paper_id)                AS papers_affected,
    COUNT(DISTINCT coi.reviewer_person_id)      AS reviewers_affected
FROM CONFLICTS_OF_INTEREST coi
JOIN PAPERS p      ON p.paper_id = coi.paper_id
JOIN CONFERENCES c ON c.conference_id = p.conference_id
JOIN PEOPLE pe     ON pe.person_id = coi.reviewer_person_id
WHERE c.conference_id = 4
GROUP BY c.acronym, coi.coi_type, coi.detection_method
ORDER BY conflicts DESC;


-- ############################################################################
-- Q5. REVIEWER WORKLOAD AND QUOTA UTILISATION
--
-- Shows that load balancing worked and that nobody exceeded their declared cap.
-- Demonstrates: LEFT JOIN so reviewers with zero assignments still appear.
-- ############################################################################
\echo ''
\echo '=== Q5. Reviewer workload against declared cap ==='
SELECT
    pe.person_id,
    LEFT(pe.full_name, 28)                                        AS reviewer,
    cm.max_active_assignments                                     AS cap,
    COUNT(ra.assignment_id)                                       AS assigned,
    COUNT(r.review_id)                                            AS submitted,
    CASE
        WHEN cm.max_active_assignments IS NULL THEN NULL
        ELSE ROUND(
            100.0 * COUNT(ra.assignment_id) / cm.max_active_assignments, 0)
    END                                                           AS pct_of_cap
FROM CONFERENCE_MEMBERSHIPS cm
JOIN PEOPLE pe                  ON pe.person_id = cm.person_id
LEFT JOIN REVIEW_ASSIGNMENTS ra ON ra.reviewer_person_id = cm.person_id
                               AND ra.paper_id IN (SELECT paper_id FROM PAPERS WHERE conference_id = 4)
LEFT JOIN REVIEWS r             ON r.assignment_id = ra.assignment_id
WHERE cm.conference_id = 4
  AND cm.role = 'reviewer'
GROUP BY pe.person_id, pe.full_name, cm.max_active_assignments
ORDER BY assigned DESC, pe.person_id
LIMIT 15;


-- ############################################################################
-- Q6. TOPIC COVERAGE RISK
--
-- Topics carried by many submissions but declared by few reviewers. These are
-- where the programme committee is thin and recruitment should be targeted.
-- Demonstrates: two non-correlated subqueries plus HAVING.
-- ############################################################################
\echo ''
\echo '=== Q6. Topics where committee expertise is thin ==='
SELECT
    t.topic_id,
    t.topic_name,
    (SELECT COUNT(*) FROM PAPER_TOPICS pt
      JOIN PAPERS p USING (paper_id)
     WHERE pt.topic_id = t.topic_id AND p.conference_id = 4)      AS submissions,
    (SELECT COUNT(*) FROM REVIEWER_TOPICS rt
      JOIN CONFERENCE_MEMBERSHIPS cm
           ON cm.person_id = rt.reviewer_person_id
          AND cm.conference_id = 4
          AND cm.role = 'reviewer'
     WHERE rt.topic_id = t.topic_id)                              AS qualified_reviewers,
    ROUND(
        (SELECT COUNT(*) FROM PAPER_TOPICS pt
          JOIN PAPERS p USING (paper_id)
         WHERE pt.topic_id = t.topic_id AND p.conference_id = 4)::NUMERIC
        / NULLIF((SELECT COUNT(*) FROM REVIEWER_TOPICS rt
                   JOIN CONFERENCE_MEMBERSHIPS cm
                        ON cm.person_id = rt.reviewer_person_id
                       AND cm.conference_id = 4
                       AND cm.role = 'reviewer'
                  WHERE rt.topic_id = t.topic_id), 0)
    , 1)                                                          AS papers_per_reviewer
FROM TOPICS t
ORDER BY papers_per_reviewer DESC NULLS FIRST, submissions DESC
LIMIT 12;


-- ############################################################################
-- Q7. ASSIGNMENTS MADE WITHOUT TOPIC EXPERTISE
--
-- Where the matcher had to fall back on a reviewer with no declared overlap,
-- because every topic expert was conflicted or at quota. A direct measure of
-- match quality.
-- Demonstrates: anti-join via NOT EXISTS.
-- ############################################################################
\echo ''
\echo '=== Q7. Assignments where the reviewer declared none of the paper topics ==='
SELECT
    COUNT(*)                                                      AS off_topic_assignments,
    ROUND(100.0 * COUNT(*) / NULLIF((
        SELECT COUNT(*) FROM REVIEW_ASSIGNMENTS ra2
        JOIN PAPERS p2 ON p2.paper_id = ra2.paper_id
        WHERE p2.conference_id = 4), 0), 1)                       AS pct_of_all_assignments
FROM REVIEW_ASSIGNMENTS ra
JOIN PAPERS p ON p.paper_id = ra.paper_id
WHERE p.conference_id = 4
  AND NOT EXISTS (
        SELECT 1
        FROM PAPER_TOPICS pt
        JOIN REVIEWER_TOPICS rt ON rt.topic_id = pt.topic_id
                               AND rt.reviewer_person_id = ra.reviewer_person_id
        WHERE pt.paper_id = ra.paper_id
  );


-- ############################################################################
-- Q8. DECISION OUTCOMES AGAINST REVIEW SCORES
--
-- Sanity check that decisions track the reviews they were based on.
-- Demonstrates: CASE-based pivot aggregation.
-- ############################################################################
\echo ''
\echo '=== Q8. Decision outcome distribution vs mean review score ==='
WITH paper_scores AS (
    SELECT
        d.paper_id,
        d.outcome,
        AVG(r.overall_score) AS mean_score
    FROM DECISIONS d
    JOIN REVIEW_ASSIGNMENTS ra ON ra.paper_id = d.paper_id
    JOIN REVIEWS r             ON r.assignment_id = ra.assignment_id
    JOIN PAPERS p              ON p.paper_id = d.paper_id
    WHERE p.conference_id = 4
      AND r.review_status = 'submitted'
    GROUP BY d.paper_id, d.outcome
)
SELECT
    outcome,
    COUNT(*)                                                      AS papers,
    ROUND(AVG(mean_score), 2)                                     AS avg_of_mean_scores,
    ROUND(MIN(mean_score), 2)                                     AS lowest,
    ROUND(MAX(mean_score), 2)                                     AS highest,
    COUNT(*) FILTER (WHERE mean_score >= 7)                       AS strong_papers,
    COUNT(*) FILTER (WHERE mean_score < 4)                        AS weak_papers
FROM paper_scores
GROUP BY outcome
ORDER BY avg_of_mean_scores DESC;


-- ############################################################################
-- Q9. FULL-TEXT SEARCH OVER SUBMISSIONS
--
-- Uses the GIN index on PAPERS.search_vector built in 01_core_tables.sql.
-- ts_rank orders by relevance rather than by match/no-match.
-- ############################################################################
\echo ''
\echo '=== Q9. Full-text search: submissions about replication or consensus ==='
SELECT
    p.paper_id,
    LEFT(p.title, 60)                                             AS title,
    ROUND(ts_rank(p.search_vector,
                  to_tsquery('english', 'replication | consensus'))::NUMERIC, 4) AS rank
FROM PAPERS p
WHERE p.conference_id = 4
  AND p.search_vector @@ to_tsquery('english', 'replication | consensus')
ORDER BY rank DESC, p.paper_id
LIMIT 10;


-- ############################################################################
-- Q10. AUDIT TRAIL
--
-- Every write to the review pipeline is captured by trigger. This reads the
-- JSONB payload back out to show status transitions.
-- Demonstrates: JSONB field extraction and filtering.
-- ############################################################################
\echo ''
\echo '=== Q10. Audit trail summary ==='
SELECT
    table_name,
    operation,
    COUNT(*)                                                      AS events,
    MIN(occurred_at)                                              AS first_event,
    MAX(occurred_at)                                              AS last_event
FROM AUDIT_LOG
GROUP BY table_name, operation
ORDER BY table_name, operation;

\echo ''
\echo '=== Q10b. Most recent assignment status changes ==='
SELECT
    audit_id,
    record_pk                        AS assignment_id,
    old_data ->> 'assignment_status' AS old_status,
    new_data ->> 'assignment_status' AS new_status,
    occurred_at
FROM AUDIT_LOG
WHERE table_name = 'review_assignments'
  AND operation = 'UPDATE'
  AND old_data ->> 'assignment_status' IS DISTINCT FROM new_data ->> 'assignment_status'
ORDER BY audit_id DESC
LIMIT 10;
