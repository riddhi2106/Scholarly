-- ============================================================================
-- Scholarly - Review Pipeline: Triggers, Functions, Procedures & Views
--
-- The database, not the application, enforces the review rules:
--   * Conflicts of interest are detected from the data and block assignments.
--   * Reviewer workload caps hold under concurrent assignment.
--   * Double-blind visibility is enforced by views, not by UI filtering.
--   * Every write to the review pipeline is audited.
--
-- Depends on: db/schema/01_core_tables.sql, db/schema/08_review_tables.sql
-- ============================================================================


-- ############################################################################
-- SECTION 1: CONFLICT OF INTEREST DETECTION
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 1.1 fn_has_conflict - live conflict check for one (paper, reviewer) pair
--
-- Evaluated against current data rather than trusting the COI cache table, so
-- that an assignment cannot slip through on a stale row. Four rules:
--   1. self authorship      - reviewer is an author of this paper
--   2. co-authorship        - reviewer co-authored another paper with an author
--   3. shared affiliation   - reviewer currently shares an institution with an author
--   4. declared             - a row already exists in CONFLICTS_OF_INTEREST
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_has_conflict(
    p_paper_id BIGINT,
    p_reviewer_person_id BIGINT
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Rule 1: reviewer is an author of the paper under review
    IF EXISTS (
        SELECT 1 FROM PAPER_AUTHORS
        WHERE paper_id = p_paper_id
          AND author_person_id = p_reviewer_person_id
    ) THEN
        RETURN TRUE;
    END IF;

    -- Rule 2: reviewer has co-authored some *other* paper with an author of this one
    IF EXISTS (
        SELECT 1
        FROM PAPER_AUTHORS pa_target
        JOIN PAPER_AUTHORS pa_shared
             ON pa_shared.author_person_id = pa_target.author_person_id
            AND pa_shared.paper_id <> p_paper_id
        JOIN PAPER_AUTHORS pa_reviewer
             ON pa_reviewer.paper_id = pa_shared.paper_id
            AND pa_reviewer.author_person_id = p_reviewer_person_id
        WHERE pa_target.paper_id = p_paper_id
    ) THEN
        RETURN TRUE;
    END IF;

    -- Rule 3: reviewer and an author hold a current affiliation at the same institution
    IF EXISTS (
        SELECT 1
        FROM PAPER_AUTHORS pa
        JOIN PERSON_AFFILIATIONS author_aff
             ON author_aff.person_id = pa.author_person_id
            AND (author_aff.end_date IS NULL OR author_aff.end_date >= CURRENT_DATE)
        JOIN PERSON_AFFILIATIONS reviewer_aff
             ON reviewer_aff.affiliation_id = author_aff.affiliation_id
            AND reviewer_aff.person_id = p_reviewer_person_id
            AND (reviewer_aff.end_date IS NULL OR reviewer_aff.end_date >= CURRENT_DATE)
        WHERE pa.paper_id = p_paper_id
    ) THEN
        RETURN TRUE;
    END IF;

    -- Rule 4: an explicitly recorded conflict (including manual declarations)
    IF EXISTS (
        SELECT 1 FROM CONFLICTS_OF_INTEREST
        WHERE paper_id = p_paper_id
          AND reviewer_person_id = p_reviewer_person_id
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;


-- ----------------------------------------------------------------------------
-- 1.2 fn_detect_conflicts_for_paper - materialise conflicts into the COI table
--
-- Scans every reviewer registered on the paper's conference and records each
-- conflict reason found. Returns the number of new rows written.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_detect_conflicts_for_paper(p_paper_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
    v_conference_id BIGINT;
    v_total INTEGER := 0;
    v_rows INTEGER;
BEGIN
    SELECT conference_id INTO v_conference_id
    FROM PAPERS WHERE paper_id = p_paper_id;

    IF v_conference_id IS NULL THEN
        RAISE EXCEPTION 'Cannot detect conflicts: paper % does not exist', p_paper_id;
    END IF;

    -- Rule 1: self authorship (recorded for every author, reviewer or not)
    INSERT INTO CONFLICTS_OF_INTEREST
        (paper_id, reviewer_person_id, coi_type, detection_method, detail)
    SELECT
        p_paper_id,
        pa.author_person_id,
        'self_authorship',
        'automatic',
        'Listed as author ' || pa.author_order || ' on this paper.'
    FROM PAPER_AUTHORS pa
    WHERE pa.paper_id = p_paper_id
    ON CONFLICT (paper_id, reviewer_person_id, coi_type) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    -- Rule 2: co-authorship with any author of this paper on some other paper
    INSERT INTO CONFLICTS_OF_INTEREST
        (paper_id, reviewer_person_id, coi_type, detection_method, detail)
    SELECT DISTINCT
        p_paper_id,
        cm.person_id,
        'co_authorship',
        'automatic',
        'Co-authored paper ' || pa_shared.paper_id || ' with an author of this submission.'
    FROM CONFERENCE_MEMBERSHIPS cm
    JOIN PAPER_AUTHORS pa_target
         ON pa_target.paper_id = p_paper_id
    JOIN PAPER_AUTHORS pa_shared
         ON pa_shared.author_person_id = pa_target.author_person_id
        AND pa_shared.paper_id <> p_paper_id
    JOIN PAPER_AUTHORS pa_reviewer
         ON pa_reviewer.paper_id = pa_shared.paper_id
        AND pa_reviewer.author_person_id = cm.person_id
    WHERE cm.conference_id = v_conference_id
      AND cm.role = 'reviewer'
      AND cm.membership_status = 'active'
    ON CONFLICT (paper_id, reviewer_person_id, coi_type) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    -- Rule 3: current shared institutional affiliation
    INSERT INTO CONFLICTS_OF_INTEREST
        (paper_id, reviewer_person_id, coi_type, detection_method, detail)
    SELECT DISTINCT
        p_paper_id,
        cm.person_id,
        'shared_affiliation',
        'automatic',
        'Shares current affiliation "' || af.institution_name || '" with an author.'
    FROM CONFERENCE_MEMBERSHIPS cm
    JOIN PERSON_AFFILIATIONS reviewer_aff
         ON reviewer_aff.person_id = cm.person_id
        AND (reviewer_aff.end_date IS NULL OR reviewer_aff.end_date >= CURRENT_DATE)
    JOIN PERSON_AFFILIATIONS author_aff
         ON author_aff.affiliation_id = reviewer_aff.affiliation_id
        AND (author_aff.end_date IS NULL OR author_aff.end_date >= CURRENT_DATE)
    JOIN PAPER_AUTHORS pa
         ON pa.author_person_id = author_aff.person_id
        AND pa.paper_id = p_paper_id
    JOIN AFFILIATIONS af
         ON af.affiliation_id = reviewer_aff.affiliation_id
    WHERE cm.conference_id = v_conference_id
      AND cm.role = 'reviewer'
      AND cm.membership_status = 'active'
      AND cm.person_id <> pa.author_person_id
    ON CONFLICT (paper_id, reviewer_person_id, coi_type) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------------------
-- 1.3 Trigger: re-detect conflicts whenever a paper's author list changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_refresh_conflicts()
RETURNS TRIGGER AS $$
DECLARE
    v_paper_id BIGINT := COALESCE(NEW.paper_id, OLD.paper_id);
BEGIN
    -- When a PAPER is deleted its PAPER_AUTHORS rows cascade away and fire this
    -- trigger, but the parent paper is already gone by then. Recomputing is both
    -- pointless and fatal, since fn_detect_conflicts_for_paper raises on a
    -- missing paper. Guard on the paper still existing.
    IF EXISTS (SELECT 1 FROM PAPERS WHERE paper_id = v_paper_id) THEN
        PERFORM fn_detect_conflicts_for_paper(v_paper_id);
    END IF;

    RETURN NULL;  -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_paper_authors_refresh_coi ON PAPER_AUTHORS;
CREATE TRIGGER trg_paper_authors_refresh_coi
AFTER INSERT OR UPDATE OR DELETE ON PAPER_AUTHORS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_refresh_conflicts();


-- ----------------------------------------------------------------------------
-- 1.4 Trigger: BLOCK any assignment that violates a conflict of interest
--
-- This is the rule the project description calls out: the database refuses the
-- write. No application code can route around it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_block_conflicted_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_reason TEXT;
BEGIN
    IF fn_has_conflict(NEW.paper_id, NEW.reviewer_person_id) THEN

        SELECT string_agg(coi_type, ', ' ORDER BY coi_type)
        INTO v_reason
        FROM CONFLICTS_OF_INTEREST
        WHERE paper_id = NEW.paper_id
          AND reviewer_person_id = NEW.reviewer_person_id;

        RAISE EXCEPTION
            'Conflict of interest: reviewer % cannot be assigned to paper % (%)',
            NEW.reviewer_person_id,
            NEW.paper_id,
            COALESCE(v_reason, 'detected from co-authorship or affiliation data')
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assignment_block_coi ON REVIEW_ASSIGNMENTS;
CREATE TRIGGER trg_assignment_block_coi
BEFORE INSERT OR UPDATE OF paper_id, reviewer_person_id ON REVIEW_ASSIGNMENTS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_block_conflicted_assignment();


-- ############################################################################
-- SECTION 2: REVIEWER WORKLOAD CAP (CONCURRENCY SAFE)
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 2.1 Trigger: enforce CONFERENCE_MEMBERSHIPS.max_active_assignments
--
-- The SELECT ... FOR UPDATE on the membership row is what makes this hold under
-- concurrency. Two sessions assigning the same reviewer at the same time
-- serialise on that row lock, so the count cannot be read stale and both
-- transactions cannot pass the cap check.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enforce_reviewer_load()
RETURNS TRIGGER AS $$
DECLARE
    v_conference_id BIGINT;
    v_max INTEGER;
    v_current INTEGER;
    v_found BOOLEAN;
BEGIN
    -- Only guard transitions INTO an active state
    IF TG_OP = 'UPDATE'
       AND NOT (NEW.assignment_status IN ('pending', 'accepted')
                AND OLD.assignment_status NOT IN ('pending', 'accepted')) THEN
        RETURN NEW;
    END IF;

    SELECT conference_id INTO v_conference_id
    FROM PAPERS WHERE paper_id = NEW.paper_id;

    -- Row lock: serialises concurrent assignment of the same reviewer
    SELECT max_active_assignments, TRUE
    INTO v_max, v_found
    FROM CONFERENCE_MEMBERSHIPS
    WHERE conference_id = v_conference_id
      AND person_id = NEW.reviewer_person_id
      AND role = 'reviewer'
    FOR UPDATE;

    IF NOT COALESCE(v_found, FALSE) THEN
        RAISE EXCEPTION
            'Reviewer % is not registered as a reviewer on conference %',
            NEW.reviewer_person_id, v_conference_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_max IS NULL THEN
        RETURN NEW;  -- no cap configured
    END IF;

    SELECT COUNT(*)
    INTO v_current
    FROM REVIEW_ASSIGNMENTS ra
    JOIN PAPERS p ON p.paper_id = ra.paper_id
    WHERE ra.reviewer_person_id = NEW.reviewer_person_id
      AND p.conference_id = v_conference_id
      AND ra.assignment_status IN ('pending', 'accepted')
      AND ra.assignment_id IS DISTINCT FROM NEW.assignment_id;

    IF v_current >= v_max THEN
        RAISE EXCEPTION
            'Reviewer workload exceeded: reviewer % already holds % of % permitted active assignments on conference %',
            NEW.reviewer_person_id, v_current, v_max, v_conference_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assignment_enforce_load ON REVIEW_ASSIGNMENTS;
CREATE TRIGGER trg_assignment_enforce_load
BEFORE INSERT OR UPDATE ON REVIEW_ASSIGNMENTS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_enforce_reviewer_load();


-- ############################################################################
-- SECTION 3: AUTOMATED REVIEWER ASSIGNMENT
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 3.1 fn_eligible_reviewers - ranked candidate list for one paper
--
-- Ranking: expertise first (summed expertise_level over topics shared with the
-- paper), then current workload ascending so load spreads evenly, then
-- reviewer id for a deterministic tie-break.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_eligible_reviewers(p_paper_id BIGINT)
RETURNS TABLE (
    reviewer_person_id BIGINT,
    full_name VARCHAR(200),
    expertise_score INTEGER,
    matched_topics INTEGER,
    current_load BIGINT,
    max_load INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH paper_conf AS (
        SELECT conference_id FROM PAPERS WHERE paper_id = p_paper_id
    ),
    paper_topic_set AS (
        SELECT topic_id FROM PAPER_TOPICS WHERE paper_id = p_paper_id
    ),
    candidate AS (
        SELECT
            cm.person_id,
            cm.max_active_assignments,
            COALESCE(SUM(rt.expertise_level) FILTER (
                WHERE rt.topic_id IN (SELECT topic_id FROM paper_topic_set)
            ), 0)::INTEGER AS expertise,
            COUNT(rt.topic_id) FILTER (
                WHERE rt.topic_id IN (SELECT topic_id FROM paper_topic_set)
            )::INTEGER AS matched
        FROM CONFERENCE_MEMBERSHIPS cm
        JOIN paper_conf pc ON pc.conference_id = cm.conference_id
        JOIN REVIEWER_PROFILES rp ON rp.person_id = cm.person_id
        LEFT JOIN REVIEWER_TOPICS rt ON rt.reviewer_person_id = cm.person_id
        WHERE cm.role = 'reviewer'
          AND cm.membership_status = 'active'
          AND rp.reviewer_status = 'active'
          AND NOT fn_has_conflict(p_paper_id, cm.person_id)
        GROUP BY cm.person_id, cm.max_active_assignments
    ),
    loaded AS (
        SELECT
            c.person_id,
            c.max_active_assignments,
            c.expertise,
            c.matched,
            (
                SELECT COUNT(*)
                FROM REVIEW_ASSIGNMENTS ra
                JOIN PAPERS p2 ON p2.paper_id = ra.paper_id
                WHERE ra.reviewer_person_id = c.person_id
                  AND p2.conference_id = (SELECT conference_id FROM paper_conf)
                  AND ra.assignment_status IN ('pending', 'accepted')
            ) AS load_now
        FROM candidate c
    )
    SELECT
        l.person_id,
        pe.full_name,
        l.expertise,
        l.matched,
        l.load_now,
        l.max_active_assignments
    FROM loaded l
    JOIN PEOPLE pe ON pe.person_id = l.person_id
    WHERE l.max_active_assignments IS NULL
       OR l.load_now < l.max_active_assignments
    ORDER BY l.expertise DESC, l.load_now ASC, l.person_id ASC;
END;
$$ LANGUAGE plpgsql STABLE;


-- ----------------------------------------------------------------------------
-- 3.2 sp_assign_reviewers - assign k conflict-free reviewers to a paper
--
-- Runs conflict detection first, then walks the ranked candidate list inserting
-- assignments until k are placed. Each insert is individually guarded so that a
-- reviewer who becomes ineligible mid-run is skipped rather than aborting the
-- whole procedure.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_assign_reviewers(
    p_paper_id BIGINT,
    p_k INTEGER DEFAULT 3,
    p_assigned_by_person_id BIGINT DEFAULT NULL,
    p_due_in_days INTEGER DEFAULT 30,
    INOUT p_assigned_count INTEGER DEFAULT 0
)
LANGUAGE plpgsql
AS $$
DECLARE
    rec RECORD;
BEGIN
    p_assigned_count := 0;

    IF p_k < 1 THEN
        RAISE EXCEPTION 'sp_assign_reviewers: k must be at least 1 (got %)', p_k;
    END IF;

    -- Refresh the conflict table so ranking sees current data
    PERFORM fn_detect_conflicts_for_paper(p_paper_id);

    FOR rec IN
        SELECT * FROM fn_eligible_reviewers(p_paper_id)
    LOOP
        EXIT WHEN p_assigned_count >= p_k;

        BEGIN
            INSERT INTO REVIEW_ASSIGNMENTS (
                paper_id,
                reviewer_person_id,
                assigned_by_person_id,
                assignment_status,
                due_at
            )
            VALUES (
                p_paper_id,
                rec.reviewer_person_id,
                p_assigned_by_person_id,
                'pending',
                NOW() + (p_due_in_days || ' days')::INTERVAL
            );

            p_assigned_count := p_assigned_count + 1;

        EXCEPTION
            WHEN unique_violation THEN
                -- already assigned to this paper; move on
                NULL;
            WHEN integrity_constraint_violation THEN
                -- conflict or workload cap tripped since ranking; move on
                NULL;
        END;
    END LOOP;

    IF p_assigned_count < p_k THEN
        RAISE NOTICE
            'Paper %: only % of % requested reviewers could be assigned (no further conflict-free, under-quota experts).',
            p_paper_id, p_assigned_count, p_k;
    END IF;

    -- Move the paper into review once it has reviewers
    IF p_assigned_count > 0 THEN
        UPDATE PAPERS
        SET submission_status = 'under_review'
        WHERE paper_id = p_paper_id
          AND submission_status = 'submitted';
    END IF;
END;
$$;


-- ############################################################################
-- SECTION 4: DECISION AUTOMATION
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 4.1 Trigger: a recorded decision drives the paper's submission_status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_apply_decision()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE PAPERS
    SET submission_status = CASE NEW.outcome
            WHEN 'accept' THEN 'accepted'
            WHEN 'reject' THEN 'rejected'
            ELSE 'under_review'      -- revisions keep the paper in the pipeline
        END
    WHERE paper_id = NEW.paper_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decision_apply ON DECISIONS;
CREATE TRIGGER trg_decision_apply
AFTER INSERT OR UPDATE ON DECISIONS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_apply_decision();


-- ----------------------------------------------------------------------------
-- 4.2 Trigger: submitting a review completes its assignment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_complete_assignment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.review_status = 'submitted' THEN
        UPDATE REVIEW_ASSIGNMENTS
        SET assignment_status = 'completed'
        WHERE assignment_id = NEW.assignment_id
          AND assignment_status <> 'completed';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_complete_assignment ON REVIEWS;
CREATE TRIGGER trg_review_complete_assignment
AFTER INSERT OR UPDATE ON REVIEWS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_complete_assignment();


-- ----------------------------------------------------------------------------
-- 4.3 Trigger: keep REVIEWS.updated_at current
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON REVIEWS;
CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON REVIEWS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_update_timestamp();


-- ############################################################################
-- SECTION 5: AUDIT TRAIL
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 5.1 Generic row auditor
--
-- The primary key column is passed as a trigger argument. The acting user is
-- read from the session GUC 'scholarly.actor_person_id', which the application
-- sets per request with SET LOCAL; it is optional and defaults to NULL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_audit_row()
RETURNS TRIGGER AS $$
DECLARE
    v_pk_column TEXT := TG_ARGV[0];
    v_pk TEXT;
    v_actor BIGINT;
    v_old JSONB;
    v_new JSONB;
BEGIN
    v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
    v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
    v_pk  := COALESCE(v_new ->> v_pk_column, v_old ->> v_pk_column);

    BEGIN
        v_actor := NULLIF(current_setting('scholarly.actor_person_id', TRUE), '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
    END;

    -- Never let an unknown actor id break the audited write
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM PEOPLE WHERE person_id = v_actor) THEN
        v_actor := NULL;
    END IF;

    INSERT INTO AUDIT_LOG
        (table_name, operation, record_pk, actor_person_id, old_data, new_data)
    VALUES
        (TG_TABLE_NAME, TG_OP, v_pk, v_actor, v_old, v_new);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_assignments ON REVIEW_ASSIGNMENTS;
CREATE TRIGGER trg_audit_assignments
AFTER INSERT OR UPDATE OR DELETE ON REVIEW_ASSIGNMENTS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_audit_row('assignment_id');

DROP TRIGGER IF EXISTS trg_audit_reviews ON REVIEWS;
CREATE TRIGGER trg_audit_reviews
AFTER INSERT OR UPDATE OR DELETE ON REVIEWS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_audit_row('review_id');

DROP TRIGGER IF EXISTS trg_audit_decisions ON DECISIONS;
CREATE TRIGGER trg_audit_decisions
AFTER INSERT OR UPDATE OR DELETE ON DECISIONS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_audit_row('decision_id');


-- ############################################################################
-- SECTION 6: DOUBLE-BLIND VISIBILITY VIEWS
--
-- Each role gets its own view. The blinding is in the projection: the columns
-- a role must not see are simply not selected, so no application bug can leak
-- them.
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 6.1 v_reviewer_paper_view - what an assigned REVIEWER may see
--     Paper content and topics. No author names, emails or affiliations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_reviewer_paper_view AS
SELECT
    ra.assignment_id,
    ra.reviewer_person_id,
    ra.assignment_status,
    ra.assigned_at,
    ra.due_at,
    p.paper_id,
    p.title,
    p.abstract,
    p.submission_status,
    c.conference_id,
    c.acronym AS conference_acronym,
    c.year    AS conference_year,
    c.review_deadline,
    COALESCE(
        json_agg(DISTINCT t.topic_name) FILTER (WHERE t.topic_id IS NOT NULL),
        '[]'::json
    ) AS topics,
    (SELECT COUNT(*) FROM PAPER_AUTHORS pa WHERE pa.paper_id = p.paper_id) AS author_count
    -- Deliberately omitted: author identities, affiliations, other reviewers.
FROM REVIEW_ASSIGNMENTS ra
JOIN PAPERS p      ON p.paper_id = ra.paper_id
JOIN CONFERENCES c ON c.conference_id = p.conference_id
LEFT JOIN PAPER_TOPICS pt ON pt.paper_id = p.paper_id
LEFT JOIN TOPICS t        ON t.topic_id = pt.topic_id
GROUP BY ra.assignment_id, p.paper_id, c.conference_id;

COMMENT ON VIEW v_reviewer_paper_view IS
    'Double-blind: reviewers see submission content without author identity.';


-- ----------------------------------------------------------------------------
-- 6.2 v_author_review_feedback - what an AUTHOR may see of their reviews
--     Scores and author-facing comments under anonymous labels.
--     No reviewer identity, no confidential comments to the chair.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_author_review_feedback AS
SELECT
    p.paper_id,
    p.title,
    p.submission_status,
    r.review_id,
    'Reviewer ' || ROW_NUMBER() OVER (
        PARTITION BY p.paper_id ORDER BY r.review_id
    ) AS reviewer_label,
    r.overall_score,
    r.confidence,
    r.recommendation,
    r.comments_to_authors,
    r.submitted_at
    -- Deliberately omitted: reviewer_person_id, comments_to_chair.
FROM PAPERS p
JOIN REVIEW_ASSIGNMENTS ra ON ra.paper_id = p.paper_id
JOIN REVIEWS r             ON r.assignment_id = ra.assignment_id
WHERE r.review_status = 'submitted';

COMMENT ON VIEW v_author_review_feedback IS
    'Double-blind: authors see review content under anonymous labels only.';


-- ----------------------------------------------------------------------------
-- 6.3 v_chair_paper_overview - the unblinded CHAIR view
--     Everything: reviewer identities, score spread, conflicts and decision.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_chair_paper_overview AS
SELECT
    p.paper_id,
    p.title,
    p.submission_status,
    c.conference_id,
    c.acronym AS conference_acronym,
    COUNT(DISTINCT ra.assignment_id)                                   AS assignments_made,
    COUNT(DISTINCT r.review_id)                                        AS reviews_received,
    ROUND(AVG(r.overall_score), 2)                                     AS avg_score,
    MIN(r.overall_score)                                               AS min_score,
    MAX(r.overall_score)                                               AS max_score,
    COALESCE(MAX(r.overall_score) - MIN(r.overall_score), 0)           AS score_spread,
    ROUND(COALESCE(STDDEV_SAMP(r.overall_score), 0), 2)                AS score_stddev,
    COALESCE(
        json_agg(DISTINCT jsonb_build_object(
            'reviewer_person_id', rev.person_id,
            'full_name',          rev.full_name,
            'status',             ra.assignment_status
        )) FILTER (WHERE rev.person_id IS NOT NULL),
        '[]'::json
    ) AS reviewers,
    (SELECT COUNT(*) FROM CONFLICTS_OF_INTEREST coi
      WHERE coi.paper_id = p.paper_id)                                 AS conflicts_recorded,
    d.outcome                                                          AS decision_outcome,
    d.decided_at
FROM PAPERS p
JOIN CONFERENCES c              ON c.conference_id = p.conference_id
LEFT JOIN REVIEW_ASSIGNMENTS ra ON ra.paper_id = p.paper_id
LEFT JOIN PEOPLE rev            ON rev.person_id = ra.reviewer_person_id
LEFT JOIN REVIEWS r             ON r.assignment_id = ra.assignment_id
                               AND r.review_status = 'submitted'
LEFT JOIN DECISIONS d           ON d.paper_id = p.paper_id
GROUP BY p.paper_id, c.conference_id, d.outcome, d.decided_at;

COMMENT ON VIEW v_chair_paper_overview IS
    'Unblinded chair view: reviewer identities, score dispersion and decision state.';
