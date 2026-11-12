-- ============================================================================
-- Scholarly - Review Pipeline Synthetic Dataset
--
-- Builds the evaluation set the project is tested on:
--   50 reviewers, 40 authors, 200 papers on one conference,
--   automatic conflict detection, k=3 reviewer assignment, reviews, decisions.
--
-- Deterministic: md5-based ordering plus a fixed seed, so every run of this
-- script produces the same dataset and the same analytics output.
--
-- Depends on: 01_core_tables.sql, 02_advanced_features.sql, 03_seed_data.sql,
--             08_review_tables.sql, 09_review_features.sql
-- ============================================================================

SELECT setseed(0.42);

-- ============================================================================
-- 0. IDEMPOTENT RERUN
--
-- Clears any previous synthetic load so this script can be run repeatedly.
-- Deleting the papers cascades to PAPER_AUTHORS, PAPER_TOPICS,
-- REVIEW_ASSIGNMENTS, REVIEWS, DECISIONS and CONFLICTS_OF_INTEREST.
-- ============================================================================
DELETE FROM PAPERS      WHERE conference_id = 4;
DELETE FROM CONFERENCES WHERE conference_id = 4;

-- ============================================================================
-- 1. CONFERENCE FOR THE SYNTHETIC SET
--
-- Created 'open' so that the submission-window trigger from 02_advanced_features
-- accepts the 200 inserts, then moved to 'in_review' once loading is done.
-- ============================================================================
INSERT INTO CONFERENCES (
    conference_id, name, acronym, year, description,
    submission_open_at, submission_close_at, review_deadline, status
) VALUES (
    4,
    'International Conference on Data Management Systems',
    'ICDMS',
    2026,
    'Benchmark conference used to exercise the full review pipeline at scale.',
    NOW() - INTERVAL '30 days',
    NOW() + INTERVAL '30 days',
    NOW() + INTERVAL '75 days',
    'open'
)
ON CONFLICT (conference_id) DO NOTHING;

SELECT setval('conferences_conference_id_seq', (SELECT MAX(conference_id) FROM CONFERENCES));


-- ============================================================================
-- 2. ADDITIONAL INSTITUTIONS
-- ============================================================================
INSERT INTO AFFILIATIONS (affiliation_id, institution_name, institution_domain, country_code) VALUES
(7,  'ETH Zurich',                              'ethz.ch',        'CH'),
(8,  'National University of Singapore',         'nus.edu.sg',     'SG'),
(9,  'University of Tokyo',                      'u-tokyo.ac.jp',  'JP'),
(10, 'Technical University of Munich',           'tum.de',         'DE'),
(11, 'University of Toronto',                    'utoronto.ca',    'CA'),
(12, 'Indian Institute of Technology Bombay',    'iitb.ac.in',     'IN'),
(13, 'Tsinghua University',                      'tsinghua.edu.cn','CN'),
(14, 'University of California, Berkeley',       'berkeley.edu',   'US')
ON CONFLICT (affiliation_id) DO NOTHING;

SELECT setval('affiliations_affiliation_id_seq', (SELECT MAX(affiliation_id) FROM AFFILIATIONS));


-- ============================================================================
-- 3. EXTENDED TOPIC TAXONOMY (6 existing + 12 new = 18)
-- ============================================================================
INSERT INTO TOPICS (topic_id, topic_name, description) VALUES
(7,  'Query Optimization',            'Cost models, cardinality estimation, and plan enumeration.'),
(8,  'Storage Engines & Indexing',    'LSM trees, B+ trees, column stores, and compression.'),
(9,  'Stream Processing',             'Windowing, watermarks, and exactly-once delivery semantics.'),
(10, 'Data Privacy & Security',       'Differential privacy, encryption at rest, and access control.'),
(11, 'Machine Learning for Systems',  'Learned indexes, workload forecasting, and auto-tuning.'),
(12, 'Benchmarking & Workloads',      'TPC benchmarks, workload characterization, and reproducibility.'),
(13, 'Data Integration & Cleaning',   'Schema matching, entity resolution, and data quality.'),
(14, 'Spatial & Temporal Data',       'Geospatial indexing, trajectory data, and time-series storage.'),
(15, 'Distributed Consensus',         'Raft, Paxos, replication protocols, and fault tolerance.'),
(16, 'Query Languages & Semantics',   'SQL extensions, recursive queries, and formal semantics.'),
(17, 'Hardware-Accelerated Databases','GPU, FPGA, NVM, and RDMA-aware data processing.'),
(18, 'Provenance & Explainability',   'Lineage tracking, why-not provenance, and query explanation.')
ON CONFLICT (topic_id) DO NOTHING;

SELECT setval('topics_topic_id_seq', (SELECT MAX(topic_id) FROM TOPICS));


-- ============================================================================
-- 4. SYNTHETIC PEOPLE
--
-- 50 reviewers (person_id 101-150) and 40 authors (person_id 201-240).
-- The two pools deliberately overlap in affiliation so that shared-affiliation
-- conflicts actually occur and the COI trigger has something to catch.
-- ============================================================================

-- 4a. Reviewers
INSERT INTO PEOPLE (person_id, full_name, email)
SELECT
    100 + i,
    (ARRAY['Aditi','Marcus','Yuki','Lena','Omar','Priya','Tomas','Sofia','Chen','Ravi',
           'Ingrid','Diego','Mei','Jonas','Fatima','Nikhil','Clara','Hassan','Anya','Luca'])
        [1 + (i % 20)]
    || ' ' ||
    (ARRAY['Shah','Weber','Tanaka','Novak','Farouk','Iyer','Horvath','Rossi','Liu','Menon',
           'Larsen','Alvarez','Zhang','Bergmann','Noor','Rao','Dubois','Karim','Petrova','Conti'])
        [1 + ((i * 7) % 20)]
    || ' (R' || i || ')',
    'reviewer' || i || '@scholarly-icdms.org'
FROM generate_series(1, 50) AS i
ON CONFLICT (person_id) DO NOTHING;

-- 4b. Authors
INSERT INTO PEOPLE (person_id, full_name, email)
SELECT
    200 + i,
    (ARRAY['Arjun','Helena','Kenji','Nora','Samir','Divya','Pavel','Giulia','Wei','Kavya',
           'Erik','Lucia','Hiro','Anton','Zara','Rohan','Emma','Yusuf','Irina','Marco'])
        [1 + (i % 20)]
    || ' ' ||
    (ARRAY['Krishnan','Vogel','Sato','Lindqvist','Haddad','Nair','Sokolov','Ferrari','Huang','Pillai',
           'Johansson','Moreno','Yamada','Kovac','Aziz','Desai','Schulz','Rahman','Volkova','Bianchi'])
        [1 + ((i * 11) % 20)]
    || ' (A' || i || ')',
    'author' || i || '@scholarly-icdms.org'
FROM generate_series(1, 40) AS i
ON CONFLICT (person_id) DO NOTHING;

SELECT setval('people_person_id_seq', (SELECT MAX(person_id) FROM PEOPLE));


-- ============================================================================
-- 5. PROFILES, AFFILIATIONS, EXPERTISE AND MEMBERSHIPS
-- ============================================================================

-- 5a. Reviewer profiles
INSERT INTO REVIEWER_PROFILES (person_id, bio, research_keywords, reviewer_status)
SELECT
    100 + i,
    'Researcher in data management systems, programme committee member for ICDMS 2026.',
    'databases, systems, ' || (SELECT topic_name FROM TOPICS WHERE topic_id = 1 + (i % 18)),
    CASE WHEN i % 25 = 0 THEN 'unavailable' ELSE 'active' END
FROM generate_series(1, 50) AS i
ON CONFLICT (person_id) DO NOTHING;

-- 5b. Author profiles
INSERT INTO AUTHOR_PROFILES (person_id, profile_status)
SELECT 200 + i, 'active'
FROM generate_series(1, 40) AS i
ON CONFLICT (person_id) DO NOTHING;

-- 5b-ii. Login accounts for the synthetic reviewers.
--
-- Without these the seeded reviewers exist in the database but cannot sign in,
-- so the reviewer dashboard has nobody to demonstrate it with. Same bcrypt hash
-- as 03_seed_data.sql, so the password is 'Password123!'.
-- Example login: reviewer1@scholarly-icdms.org
INSERT INTO USER_ACCOUNTS (person_id, password_hash, system_role, account_status)
SELECT
    100 + i,
    '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa',
    'user',
    'active'
FROM generate_series(1, 50) AS i
ON CONFLICT (person_id) DO NOTHING;

-- 5c. Reviewer affiliations (spread over institutions 1-14)
INSERT INTO PERSON_AFFILIATIONS (person_id, affiliation_id, start_date, end_date)
SELECT 100 + i, 1 + (i % 14), DATE '2019-01-01' + (i * 7), NULL
FROM generate_series(1, 50) AS i
ON CONFLICT DO NOTHING;

-- 5d. Author affiliations (same institution pool, so overlaps are guaranteed)
INSERT INTO PERSON_AFFILIATIONS (person_id, affiliation_id, start_date, end_date)
SELECT 200 + i, 1 + ((i * 3) % 14), DATE '2020-06-01' + (i * 5), NULL
FROM generate_series(1, 40) AS i
ON CONFLICT DO NOTHING;

-- 5e. Reviewer expertise: 3 topics each, deterministic pseudo-random selection
INSERT INTO REVIEWER_TOPICS (reviewer_person_id, topic_id, expertise_level)
SELECT
    r.person_id,
    t.topic_id,
    3 + (r.person_id + t.topic_id) % 3        -- expertise_level in 3..5
FROM (SELECT 100 + i AS person_id FROM generate_series(1, 50) AS i) r
CROSS JOIN LATERAL (
    SELECT topic_id
    FROM TOPICS
    ORDER BY md5(r.person_id::text || '-' || topic_id::text)
    LIMIT 3
) t
ON CONFLICT (reviewer_person_id, topic_id) DO NOTHING;

-- 5f. Conference memberships
--     Caps are set to 15, except every 10th reviewer who is capped at 4 so the
--     workload trigger is exercised by the assignment run.
INSERT INTO CONFERENCE_MEMBERSHIPS
    (conference_id, person_id, role, membership_status, max_active_assignments)
SELECT
    4,
    100 + i,
    'reviewer',
    'active',
    CASE WHEN i % 10 = 0 THEN 4 ELSE 15 END
FROM generate_series(1, 50) AS i
ON CONFLICT DO NOTHING;

-- Chair for the synthetic conference (reuse person 1, Alice Johnson)
INSERT INTO CONFERENCE_MEMBERSHIPS
    (conference_id, person_id, role, membership_status, max_active_assignments)
VALUES (4, 1, 'chair', 'active', NULL)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 6. 200 PAPERS
--
-- The COI refresh trigger on PAPER_AUTHORS is disabled during bulk load and the
-- detection pass is run once afterwards. Leaving it enabled would re-scan every
-- reviewer on each of the ~500 author rows inserted below.
-- ============================================================================

INSERT INTO PAPERS (
    paper_id, conference_id, title, abstract,
    submission_status, submitted_at, created_by_person_id
)
SELECT
    1000 + i,
    4,
    (ARRAY['Adaptive','Scalable','Robust','Efficient','Learned','Distributed',
           'Incremental','Elastic','Verifiable','Low-Latency'])[1 + (i % 10)]
    || ' ' ||
    (ARRAY['Indexing','Query Planning','Replication','Checkpointing','Partitioning',
           'Caching','Compression','Scheduling','Recovery','Vectorization'])[1 + ((i * 3) % 10)]
    || ' for ' ||
    (ARRAY['Cloud-Native Warehouses','Streaming Workloads','Multi-Tenant Databases',
           'Graph Analytics','Vector Search Engines','HTAP Systems',
           'Edge Deployments','Serverless Runtimes'])[1 + ((i * 5) % 8)],
    'This paper investigates '
    || (ARRAY['a cost-based','an adaptive','a learned','a lock-free','a hardware-aware'])[1 + ((i * 7) % 5)]
    || ' approach to '
    || (ARRAY['query execution','data placement','transaction scheduling',
              'index maintenance','workload isolation'])[1 + ((i * 13) % 5)]
    || '. We implement the technique on PostgreSQL and evaluate it against standard '
    || 'benchmarks, reporting throughput, tail latency and resource utilisation. '
    || 'Results show consistent improvements under skewed and bursty workloads.',
    'submitted',
    NOW() - ((i % 25) || ' days')::INTERVAL,
    200 + (1 + (i % 40))
FROM generate_series(1, 200) AS i
ON CONFLICT (paper_id) DO NOTHING;

SELECT setval('papers_paper_id_seq', (SELECT MAX(paper_id) FROM PAPERS));

-- 6a. Authors per paper (1 to 4, first author is corresponding)
ALTER TABLE PAPER_AUTHORS DISABLE TRIGGER trg_paper_authors_refresh_coi;

INSERT INTO PAPER_AUTHORS (paper_id, author_person_id, author_order, is_corresponding)
SELECT
    p.paper_id,
    a.person_id,
    a.ord,
    (a.ord = 1)
FROM (SELECT 1000 + i AS paper_id, i AS idx FROM generate_series(1, 200) AS i) p
CROSS JOIN LATERAL (
    SELECT person_id, ROW_NUMBER() OVER (ORDER BY md5(p.idx::text || '-' || person_id::text)) AS ord
    FROM (SELECT 200 + j AS person_id FROM generate_series(1, 40) AS j) pool
    ORDER BY md5(p.idx::text || '-' || person_id::text)
    LIMIT 1 + (p.idx % 4)
) a
-- Arbiter named explicitly: the UNIQUE(paper_id, author_order) constraint is
-- DEFERRABLE and therefore cannot be used to resolve ON CONFLICT.
ON CONFLICT (paper_id, author_person_id) DO NOTHING;

-- 6a-ii. Programme committee members who also submit.
--
-- Without this, the reviewer pool and the author pool are disjoint and the
-- co-authorship rule can never fire. Eight reviewers co-author three papers
-- each, which produces both self-authorship conflicts on those papers and
-- co-authorship conflicts on every other paper by the same collaborators.
--
-- Written as a loop so that MAX(author_order) sees rows inserted earlier in
-- this same pass; a set-based INSERT would hand two reviewers the same order
-- on a shared paper and trip the deferred UNIQUE at COMMIT.
DO $$
DECLARE
    r INTEGER;
    s INTEGER;
    v_paper_id BIGINT;
    v_next_order SMALLINT;
BEGIN
    FOR r IN 1 .. 8 LOOP
        FOR s IN 1 .. 3 LOOP
            v_paper_id := 1000 + ((r * 17 + s * 29) % 200) + 1;

            SELECT COALESCE(MAX(author_order), 0) + 1
            INTO v_next_order
            FROM PAPER_AUTHORS
            WHERE paper_id = v_paper_id;

            INSERT INTO PAPER_AUTHORS
                (paper_id, author_person_id, author_order, is_corresponding)
            VALUES (v_paper_id, 100 + r, v_next_order, FALSE)
            ON CONFLICT (paper_id, author_person_id) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE PAPER_AUTHORS ENABLE TRIGGER trg_paper_authors_refresh_coi;

-- 6b. Topics per paper (1 to 3)
INSERT INTO PAPER_TOPICS (paper_id, topic_id)
SELECT
    p.paper_id,
    t.topic_id
FROM (SELECT 1000 + i AS paper_id, i AS idx FROM generate_series(1, 200) AS i) p
CROSS JOIN LATERAL (
    SELECT topic_id
    FROM TOPICS
    ORDER BY md5(p.idx::text || '#' || topic_id::text)
    LIMIT 1 + (p.idx % 3)
) t
ON CONFLICT DO NOTHING;

-- Conference moves into the review phase
UPDATE CONFERENCES SET status = 'in_review' WHERE conference_id = 4;


-- ============================================================================
-- 7. CONFLICT DETECTION ACROSS THE WHOLE SET
-- ============================================================================
DO $$
DECLARE
    rec RECORD;
    v_total INTEGER := 0;
BEGIN
    FOR rec IN SELECT paper_id FROM PAPERS WHERE conference_id = 4 ORDER BY paper_id LOOP
        v_total := v_total + fn_detect_conflicts_for_paper(rec.paper_id);
    END LOOP;

    RAISE NOTICE 'Conflict detection complete: % conflict rows recorded across 200 papers.', v_total;
END $$;


-- ============================================================================
-- 8. AUTOMATED REVIEWER ASSIGNMENT (k = 3 per paper)
-- ============================================================================
DO $$
DECLARE
    rec RECORD;
    v_assigned INTEGER;
    v_total INTEGER := 0;
    v_short INTEGER := 0;
BEGIN
    FOR rec IN SELECT paper_id FROM PAPERS WHERE conference_id = 4 ORDER BY paper_id LOOP
        CALL sp_assign_reviewers(
            p_paper_id              => rec.paper_id,
            p_k                     => 3,
            p_assigned_by_person_id => 1,
            p_due_in_days           => 45,
            p_assigned_count        => v_assigned
        );

        v_total := v_total + v_assigned;
        IF v_assigned < 3 THEN
            v_short := v_short + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Assignment complete: % assignments placed; % papers received fewer than 3 reviewers.',
        v_total, v_short;
END $$;


-- ============================================================================
-- 9. REVIEWS
--
-- About 80% of assignments are completed. Two reviewers are given deliberate
-- scoring bias so that the bias query in 11_review_analytics.sql has a real
-- signal to find:
--   reviewer 101 scores harshly, reviewer 102 scores leniently.
-- ============================================================================
INSERT INTO REVIEWS (
    assignment_id, overall_score, confidence, recommendation,
    comments_to_authors, comments_to_chair, review_status, submitted_at
)
SELECT
    ra.assignment_id,
    score.v,
    1 + (ra.assignment_id % 5),
    CASE
        WHEN score.v <= 2 THEN 'strong_reject'
        WHEN score.v <= 3 THEN 'reject'
        WHEN score.v <= 4 THEN 'weak_reject'
        WHEN score.v  = 5 THEN 'borderline'
        WHEN score.v <= 7 THEN 'weak_accept'
        WHEN score.v <= 8 THEN 'accept'
        ELSE 'strong_accept'
    END,
    'The paper addresses a relevant problem. The evaluation section would benefit '
    || 'from a broader set of baselines and a clearer description of the workload '
    || 'generator. Presentation is generally clear.',
    CASE WHEN ra.assignment_id % 4 = 0
         THEN 'Confidential note to chair: borderline, would not fight for it.'
         ELSE NULL END,
    'submitted',
    NOW() - ((ra.assignment_id % 15) || ' days')::INTERVAL
FROM REVIEW_ASSIGNMENTS ra
JOIN PAPERS p ON p.paper_id = ra.paper_id
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN ra.reviewer_person_id = 101 THEN 1 + (ra.assignment_id % 3)   -- harsh: 1-3
        WHEN ra.reviewer_person_id = 102 THEN 8 + (ra.assignment_id % 3)   -- lenient: 8-10
        ELSE 1 + ((ra.assignment_id * 7 + ra.paper_id * 3) % 10)           -- spread: 1-10
    END AS v
) score
WHERE p.conference_id = 4
  AND (ra.assignment_id % 5) <> 0          -- ~80% completion rate
ON CONFLICT (assignment_id) DO NOTHING;


-- ============================================================================
-- 10. CHAIR DECISIONS
--
-- Recorded for papers that have at least 2 submitted reviews. The outcome
-- follows the mean score; the trigger in 09_review_features then propagates it
-- to PAPERS.submission_status.
-- ============================================================================
INSERT INTO DECISIONS (paper_id, decided_by_person_id, outcome, rationale, decided_at)
SELECT
    p.paper_id,
    1,
    CASE
        WHEN AVG(r.overall_score) >= 7.0 THEN 'accept'
        WHEN AVG(r.overall_score) >= 5.5 THEN 'minor_revision'
        WHEN AVG(r.overall_score) >= 4.0 THEN 'major_revision'
        ELSE 'reject'
    END,
    'Decision based on ' || COUNT(r.review_id) || ' reviews, mean score '
        || ROUND(AVG(r.overall_score), 2) || '.',
    NOW() - INTERVAL '1 day'
FROM PAPERS p
JOIN REVIEW_ASSIGNMENTS ra ON ra.paper_id = p.paper_id
JOIN REVIEWS r             ON r.assignment_id = ra.assignment_id
WHERE p.conference_id = 4
  AND r.review_status = 'submitted'
GROUP BY p.paper_id
HAVING COUNT(r.review_id) >= 2
   AND (p.paper_id % 3) = 0        -- chair has worked through a third of the pile
ON CONFLICT (paper_id) DO NOTHING;


-- ============================================================================
-- 11. LOAD SUMMARY
-- ============================================================================
SELECT 'reviewers'          AS entity, COUNT(*) FROM REVIEWER_PROFILES WHERE person_id BETWEEN 101 AND 150
UNION ALL SELECT 'authors',           COUNT(*) FROM AUTHOR_PROFILES   WHERE person_id BETWEEN 201 AND 240
UNION ALL SELECT 'papers',            COUNT(*) FROM PAPERS            WHERE conference_id = 4
UNION ALL SELECT 'paper_authors',     COUNT(*) FROM PAPER_AUTHORS pa JOIN PAPERS p USING (paper_id) WHERE p.conference_id = 4
UNION ALL SELECT 'conflicts',         COUNT(*) FROM CONFLICTS_OF_INTEREST coi JOIN PAPERS p USING (paper_id) WHERE p.conference_id = 4
UNION ALL SELECT 'assignments',       COUNT(*) FROM REVIEW_ASSIGNMENTS ra JOIN PAPERS p USING (paper_id) WHERE p.conference_id = 4
UNION ALL SELECT 'reviews',           COUNT(*) FROM REVIEWS r JOIN REVIEW_ASSIGNMENTS ra USING (assignment_id) JOIN PAPERS p USING (paper_id) WHERE p.conference_id = 4
UNION ALL SELECT 'decisions',         COUNT(*) FROM DECISIONS d JOIN PAPERS p USING (paper_id) WHERE p.conference_id = 4
UNION ALL SELECT 'audit_rows',        COUNT(*) FROM AUDIT_LOG;
