-- ============================================================================
-- Scholarly - Review Pipeline Constraint & Negative Tests
--
-- Proves the database refuses invalid review operations on its own, with no
-- help from the application layer. Each test attempts an illegal write and
-- passes only when PostgreSQL rejects it.
--
-- Run after: 08_review_tables.sql, 09_review_features.sql, 10_review_seed_data.sql
-- Every test is self-contained and leaves no rows behind.
-- ============================================================================

\set ON_ERROR_STOP off

-- ----------------------------------------------------------------------------
-- TEST 1: Conflict of interest - self authorship
-- A reviewer who is an author of the paper cannot be assigned to review it.
-- Expected: trigger trg_assignment_block_coi raises.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
    v_author_id BIGINT;
BEGIN
    -- Pick an author who is also a registered reviewer on the same conference
    SELECT pa.paper_id, pa.author_person_id
    INTO v_paper_id, v_author_id
    FROM PAPER_AUTHORS pa
    JOIN PAPERS p ON p.paper_id = pa.paper_id
    JOIN CONFERENCE_MEMBERSHIPS cm
         ON cm.person_id = pa.author_person_id
        AND cm.conference_id = p.conference_id
        AND cm.role = 'reviewer'
    WHERE p.conference_id = 4
    LIMIT 1;

    IF v_paper_id IS NULL THEN
        RAISE NOTICE 'TEST 1 SKIPPED: no author doubles as a reviewer in this dataset.';
        RETURN;
    END IF;

    INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
    VALUES (v_paper_id, v_author_id, 1);

    RAISE EXCEPTION 'TEST 1 FAILED: an author was assigned to review their own paper!';
EXCEPTION
    WHEN integrity_constraint_violation THEN
        RAISE NOTICE 'TEST 1 PASSED: self-authorship conflict blocked (%).', SQLERRM;
END $$;


-- ----------------------------------------------------------------------------
-- TEST 2: Conflict of interest - co-authorship
-- A reviewer who has co-authored with an author of the paper is blocked.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
    v_reviewer_id BIGINT;
BEGIN
    SELECT coi.paper_id, coi.reviewer_person_id
    INTO v_paper_id, v_reviewer_id
    FROM CONFLICTS_OF_INTEREST coi
    JOIN PAPERS p ON p.paper_id = coi.paper_id
    WHERE coi.coi_type = 'co_authorship'
      AND p.conference_id = 4
      AND NOT EXISTS (
            SELECT 1 FROM REVIEW_ASSIGNMENTS ra
            WHERE ra.paper_id = coi.paper_id
              AND ra.reviewer_person_id = coi.reviewer_person_id)
    LIMIT 1;

    IF v_paper_id IS NULL THEN
        RAISE NOTICE 'TEST 2 SKIPPED: no co-authorship conflict available.';
        RETURN;
    END IF;

    INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
    VALUES (v_paper_id, v_reviewer_id, 1);

    RAISE EXCEPTION 'TEST 2 FAILED: a co-author was assigned as reviewer!';
EXCEPTION
    WHEN integrity_constraint_violation THEN
        RAISE NOTICE 'TEST 2 PASSED: co-authorship conflict blocked.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 3: Conflict of interest - shared institutional affiliation
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
    v_reviewer_id BIGINT;
BEGIN
    SELECT coi.paper_id, coi.reviewer_person_id
    INTO v_paper_id, v_reviewer_id
    FROM CONFLICTS_OF_INTEREST coi
    JOIN PAPERS p ON p.paper_id = coi.paper_id
    WHERE coi.coi_type = 'shared_affiliation'
      AND p.conference_id = 4
      AND NOT EXISTS (
            SELECT 1 FROM REVIEW_ASSIGNMENTS ra
            WHERE ra.paper_id = coi.paper_id
              AND ra.reviewer_person_id = coi.reviewer_person_id)
    LIMIT 1;

    IF v_paper_id IS NULL THEN
        RAISE NOTICE 'TEST 3 SKIPPED: no shared-affiliation conflict available.';
        RETURN;
    END IF;

    INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
    VALUES (v_paper_id, v_reviewer_id, 1);

    RAISE EXCEPTION 'TEST 3 FAILED: a colleague of the authors was assigned as reviewer!';
EXCEPTION
    WHEN integrity_constraint_violation THEN
        RAISE NOTICE 'TEST 3 PASSED: shared-affiliation conflict blocked.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 4: Reviewer workload cap
-- A reviewer already at max_active_assignments cannot take another paper.
--
-- The test creates its own precondition by pinning the reviewer's cap to the
-- number of assignments they currently hold, rather than hoping someone in the
-- dataset happens to be at quota. Only pending and accepted assignments count
-- as active, so completed work frees the slot back up.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_reviewer_id BIGINT;
    v_paper_id BIGINT;
    v_active INTEGER;
    v_original INTEGER;
    v_breached BOOLEAN := FALSE;
BEGIN
    SELECT cm.person_id, cm.max_active_assignments
    INTO v_reviewer_id, v_original
    FROM CONFERENCE_MEMBERSHIPS cm
    WHERE cm.conference_id = 4
      AND cm.role = 'reviewer'
    ORDER BY cm.person_id
    LIMIT 1;

    SELECT COUNT(*)
    INTO v_active
    FROM REVIEW_ASSIGNMENTS ra
    JOIN PAPERS p ON p.paper_id = ra.paper_id
    WHERE ra.reviewer_person_id = v_reviewer_id
      AND p.conference_id = 4
      AND ra.assignment_status IN ('pending', 'accepted');

    -- A conflict-free paper they are not already on
    SELECT p.paper_id
    INTO v_paper_id
    FROM PAPERS p
    WHERE p.conference_id = 4
      AND NOT fn_has_conflict(p.paper_id, v_reviewer_id)
      AND NOT EXISTS (SELECT 1 FROM REVIEW_ASSIGNMENTS ra
                      WHERE ra.paper_id = p.paper_id
                        AND ra.reviewer_person_id = v_reviewer_id)
    LIMIT 1;

    IF v_paper_id IS NULL THEN
        RAISE NOTICE 'TEST 4 SKIPPED: no conflict-free spare paper for reviewer %.', v_reviewer_id;
        RETURN;
    END IF;

    -- Pin the cap to exactly what this reviewer already holds
    UPDATE CONFERENCE_MEMBERSHIPS
    SET max_active_assignments = v_active
    WHERE conference_id = 4 AND person_id = v_reviewer_id AND role = 'reviewer';

    BEGIN
        INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
        VALUES (v_paper_id, v_reviewer_id, 1);
        v_breached := TRUE;
    EXCEPTION
        WHEN integrity_constraint_violation THEN
            RAISE NOTICE 'TEST 4 PASSED: workload cap enforced at % active assignments (%).',
                v_active, SQLERRM;
    END;

    -- Restore the original cap whatever happened
    UPDATE CONFERENCE_MEMBERSHIPS
    SET max_active_assignments = v_original
    WHERE conference_id = 4 AND person_id = v_reviewer_id AND role = 'reviewer';

    IF v_breached THEN
        DELETE FROM REVIEW_ASSIGNMENTS
        WHERE paper_id = v_paper_id AND reviewer_person_id = v_reviewer_id;
        RAISE EXCEPTION 'TEST 4 FAILED: reviewer % exceeded a cap of %!', v_reviewer_id, v_active;
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- TEST 5: Assignment to a person who is not a reviewer on that conference
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
    v_outsider BIGINT;
BEGIN
    SELECT paper_id INTO v_paper_id FROM PAPERS WHERE conference_id = 4 LIMIT 1;

    SELECT pe.person_id INTO v_outsider
    FROM PEOPLE pe
    WHERE NOT EXISTS (
        SELECT 1 FROM CONFERENCE_MEMBERSHIPS cm
        WHERE cm.person_id = pe.person_id AND cm.conference_id = 4)
      AND NOT fn_has_conflict(v_paper_id, pe.person_id)
    LIMIT 1;

    IF v_outsider IS NULL THEN
        RAISE NOTICE 'TEST 5 SKIPPED: no unaffiliated person available.';
        RETURN;
    END IF;

    INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
    VALUES (v_paper_id, v_outsider, 1);

    RAISE EXCEPTION 'TEST 5 FAILED: a non-reviewer was assigned to a paper!';
EXCEPTION
    WHEN integrity_constraint_violation THEN
        RAISE NOTICE 'TEST 5 PASSED: non-reviewer assignment blocked.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 6: Duplicate assignment of the same reviewer to the same paper
-- Expected: UNIQUE (paper_id, reviewer_person_id)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
    v_reviewer_id BIGINT;
BEGIN
    SELECT ra.paper_id, ra.reviewer_person_id
    INTO v_paper_id, v_reviewer_id
    FROM REVIEW_ASSIGNMENTS ra
    JOIN PAPERS p ON p.paper_id = ra.paper_id
    WHERE p.conference_id = 4
    LIMIT 1;

    INSERT INTO REVIEW_ASSIGNMENTS (paper_id, reviewer_person_id, assigned_by_person_id)
    VALUES (v_paper_id, v_reviewer_id, 1);

    RAISE EXCEPTION 'TEST 6 FAILED: duplicate assignment was allowed!';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'TEST 6 PASSED: duplicate reviewer assignment rejected.';
    WHEN integrity_constraint_violation THEN
        RAISE NOTICE 'TEST 6 PASSED: duplicate assignment rejected upstream by the COI guard.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 7: Two reviews against one assignment
-- Expected: UNIQUE (assignment_id) on REVIEWS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_assignment_id BIGINT;
BEGIN
    SELECT assignment_id INTO v_assignment_id FROM REVIEWS LIMIT 1;

    INSERT INTO REVIEWS (assignment_id, overall_score, confidence, recommendation, comments_to_authors)
    VALUES (v_assignment_id, 7, 3, 'accept', 'A second review for the same assignment.');

    RAISE EXCEPTION 'TEST 7 FAILED: two reviews accepted for one assignment!';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'TEST 7 PASSED: one review per assignment enforced.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 8: Two final decisions on one paper
-- Expected: UNIQUE (paper_id) on DECISIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
BEGIN
    SELECT paper_id INTO v_paper_id FROM DECISIONS LIMIT 1;

    INSERT INTO DECISIONS (paper_id, decided_by_person_id, outcome, rationale)
    VALUES (v_paper_id, 1, 'reject', 'Conflicting second decision.');

    RAISE EXCEPTION 'TEST 8 FAILED: a paper received two final decisions!';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'TEST 8 PASSED: one decision per paper enforced.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 9: Review score outside the permitted 1-10 range
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_assignment_id BIGINT;
BEGIN
    SELECT ra.assignment_id INTO v_assignment_id
    FROM REVIEW_ASSIGNMENTS ra
    WHERE NOT EXISTS (SELECT 1 FROM REVIEWS r WHERE r.assignment_id = ra.assignment_id)
    LIMIT 1;

    INSERT INTO REVIEWS (assignment_id, overall_score, confidence, recommendation, comments_to_authors)
    VALUES (v_assignment_id, 42, 3, 'accept', 'Score far outside the scale.');

    RAISE EXCEPTION 'TEST 9 FAILED: an out-of-range score was accepted!';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'TEST 9 PASSED: out-of-range review score rejected.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 10: Invalid recommendation value
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_assignment_id BIGINT;
BEGIN
    SELECT ra.assignment_id INTO v_assignment_id
    FROM REVIEW_ASSIGNMENTS ra
    WHERE NOT EXISTS (SELECT 1 FROM REVIEWS r WHERE r.assignment_id = ra.assignment_id)
    LIMIT 1;

    INSERT INTO REVIEWS (assignment_id, overall_score, confidence, recommendation, comments_to_authors)
    VALUES (v_assignment_id, 7, 3, 'maybe_later', 'Not a permitted recommendation.');

    RAISE EXCEPTION 'TEST 10 FAILED: an invalid recommendation was accepted!';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'TEST 10 PASSED: invalid recommendation rejected.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 11: Expertise level outside 1-5
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO REVIEWER_TOPICS (reviewer_person_id, topic_id, expertise_level)
    VALUES (101, 1, 9);

    RAISE EXCEPTION 'TEST 11 FAILED: expertise level 9 was accepted!';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'TEST 11 PASSED: out-of-range expertise level rejected.';
    WHEN unique_violation THEN
        RAISE NOTICE 'TEST 11 SKIPPED: reviewer 101 already declares topic 1.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 12: Double-blind enforcement is structural
--
-- The author-facing view must not expose reviewer identity or the confidential
-- comments to the chair. This asserts against the catalog, so the test fails if
-- someone later adds those columns to the view.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_leaks TEXT;
BEGIN
    SELECT string_agg(column_name, ', ')
    INTO v_leaks
    FROM information_schema.columns
    WHERE table_name = 'v_author_review_feedback'
      AND column_name IN ('reviewer_person_id', 'comments_to_chair', 'assignment_id');

    IF v_leaks IS NOT NULL THEN
        RAISE EXCEPTION 'TEST 12 FAILED: author view exposes reviewer identity (%)!', v_leaks;
    END IF;

    RAISE NOTICE 'TEST 12 PASSED: author view exposes no reviewer identity or chair comments.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 13: Reviewer view hides author identity
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_leaks TEXT;
BEGIN
    SELECT string_agg(column_name, ', ')
    INTO v_leaks
    FROM information_schema.columns
    WHERE table_name = 'v_reviewer_paper_view'
      AND column_name IN ('author_person_id', 'full_name', 'email',
                          'created_by_person_id', 'authors');

    IF v_leaks IS NOT NULL THEN
        RAISE EXCEPTION 'TEST 13 FAILED: reviewer view exposes author identity (%)!', v_leaks;
    END IF;

    RAISE NOTICE 'TEST 13 PASSED: reviewer view exposes no author identity.';
END $$;


-- ----------------------------------------------------------------------------
-- TEST 14: Audit trail captures review pipeline writes
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_before BIGINT;
    v_after BIGINT;
    v_assignment_id BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_before FROM AUDIT_LOG WHERE table_name = 'reviews';

    SELECT ra.assignment_id INTO v_assignment_id
    FROM REVIEW_ASSIGNMENTS ra
    WHERE NOT EXISTS (SELECT 1 FROM REVIEWS r WHERE r.assignment_id = ra.assignment_id)
    LIMIT 1;

    INSERT INTO REVIEWS (assignment_id, overall_score, confidence, recommendation, comments_to_authors)
    VALUES (v_assignment_id, 6, 3, 'weak_accept', 'Audit trail probe.');

    SELECT COUNT(*) INTO v_after FROM AUDIT_LOG WHERE table_name = 'reviews';

    IF v_after <= v_before THEN
        RAISE EXCEPTION 'TEST 14 FAILED: no audit row written for the review insert!';
    END IF;

    RAISE NOTICE 'TEST 14 PASSED: audit row written (% -> % rows).', v_before, v_after;

    -- Leave no trace. The review insert flipped its assignment to 'completed'
    -- via trg_review_complete_assignment, so that has to be undone too.
    DELETE FROM REVIEWS WHERE assignment_id = v_assignment_id;
    UPDATE REVIEW_ASSIGNMENTS
    SET assignment_status = 'pending'
    WHERE assignment_id = v_assignment_id;
END $$;


-- ----------------------------------------------------------------------------
-- TEST 15: Deleting a paper cascades cleanly through the review pipeline
--
-- Regression test. PAPER_AUTHORS has an AFTER DELETE trigger that recomputes
-- conflicts; without a guard it fires on a paper that no longer exists and
-- aborts the delete.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_paper_id BIGINT;
    v_remaining INTEGER;
BEGIN
    INSERT INTO PAPERS (conference_id, title, abstract, created_by_person_id, submission_status)
    VALUES (1, 'Disposable Paper For Cascade Test',
            'Inserted and removed by TEST 15.', 1, 'submitted')
    RETURNING paper_id INTO v_paper_id;

    INSERT INTO PAPER_AUTHORS (paper_id, author_person_id, author_order, is_corresponding)
    VALUES (v_paper_id, 1, 1, TRUE);

    DELETE FROM PAPERS WHERE paper_id = v_paper_id;

    SELECT COUNT(*) INTO v_remaining
    FROM PAPER_AUTHORS WHERE paper_id = v_paper_id;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'TEST 15 FAILED: % orphan author rows left behind!', v_remaining;
    END IF;

    RAISE NOTICE 'TEST 15 PASSED: paper delete cascaded without tripping the COI trigger.';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST 15 FAILED: paper delete raised %', SQLERRM;
END $$;

\echo ''
\echo 'Review pipeline constraint tests complete.'
