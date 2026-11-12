-- ============================================================================
-- Scholarly - Review & Evaluation Pipeline Schema (DDL)
-- Module: Reviewer Expertise, Conflicts of Interest, Assignments,
--         Reviews, Decisions & Audit (6 Tables)
-- Database: PostgreSQL 14+
--
-- Depends on: db/schema/01_core_tables.sql
-- ============================================================================

-- ============================================================================
-- 1. DROP EXISTING TABLES (Reverse Dependency Order for clean reruns)
-- ============================================================================
DROP TABLE IF EXISTS AUDIT_LOG CASCADE;
DROP TABLE IF EXISTS DECISIONS CASCADE;
DROP TABLE IF EXISTS REVIEWS CASCADE;
DROP TABLE IF EXISTS REVIEW_ASSIGNMENTS CASCADE;
DROP TABLE IF EXISTS CONFLICTS_OF_INTEREST CASCADE;
DROP TABLE IF EXISTS REVIEWER_TOPICS CASCADE;

-- ============================================================================
-- 2. REVIEWER EXPERTISE (1 Table)
-- ============================================================================

-- Table 13: REVIEWER_TOPICS
-- Many-to-many link between reviewers and the research topics they can judge.
-- expertise_level drives the expertise-matching half of reviewer assignment.
CREATE TABLE REVIEWER_TOPICS (
    reviewer_person_id BIGINT NOT NULL
        REFERENCES REVIEWER_PROFILES(person_id) ON DELETE CASCADE,
    topic_id BIGINT NOT NULL
        REFERENCES TOPICS(topic_id) ON DELETE RESTRICT,
    expertise_level SMALLINT NOT NULL DEFAULT 3
        CHECK (expertise_level BETWEEN 1 AND 5),
    declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reviewer_person_id, topic_id)
);

COMMENT ON TABLE REVIEWER_TOPICS IS
    'Self-declared reviewer expertise. expertise_level 1=peripheral, 5=primary area.';

-- ============================================================================
-- 3. CONFLICTS OF INTEREST (1 Table)
-- ============================================================================

-- Table 14: CONFLICTS_OF_INTEREST
-- One row per (paper, reviewer, reason). Populated automatically by triggers
-- in 09_review_features.sql, and manually for declared conflicts.
CREATE TABLE CONFLICTS_OF_INTEREST (
    coi_id BIGSERIAL PRIMARY KEY,
    paper_id BIGINT NOT NULL
        REFERENCES PAPERS(paper_id) ON DELETE CASCADE,
    reviewer_person_id BIGINT NOT NULL
        REFERENCES PEOPLE(person_id) ON DELETE CASCADE,
    coi_type VARCHAR(30) NOT NULL
        CHECK (coi_type IN (
            'self_authorship',      -- reviewer is an author of this paper
            'co_authorship',        -- reviewer has co-authored with an author elsewhere
            'shared_affiliation',   -- reviewer and an author share a current institution
            'declared'              -- manually declared by reviewer or chair
        )),
    detection_method VARCHAR(10) NOT NULL DEFAULT 'automatic'
        CHECK (detection_method IN ('automatic', 'manual')),
    detail TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coi_paper_reviewer_type UNIQUE (paper_id, reviewer_person_id, coi_type)
);

COMMENT ON TABLE CONFLICTS_OF_INTEREST IS
    'Conflicts blocking a reviewer from a paper. A reviewer may hit several types at once.';

-- ============================================================================
-- 4. REVIEW ASSIGNMENTS (1 Table)
-- ============================================================================

-- Table 15: REVIEW_ASSIGNMENTS
-- A reviewer is asked to review a paper. Guarded by COI and workload triggers.
CREATE TABLE REVIEW_ASSIGNMENTS (
    assignment_id BIGSERIAL PRIMARY KEY,
    paper_id BIGINT NOT NULL
        REFERENCES PAPERS(paper_id) ON DELETE CASCADE,
    reviewer_person_id BIGINT NOT NULL
        REFERENCES PEOPLE(person_id) ON DELETE RESTRICT,
    assigned_by_person_id BIGINT
        REFERENCES PEOPLE(person_id) ON DELETE SET NULL,
    assignment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (assignment_status IN ('pending', 'accepted', 'declined', 'completed', 'revoked')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ,
    CONSTRAINT uq_assignment_paper_reviewer UNIQUE (paper_id, reviewer_person_id),
    CONSTRAINT chk_assignment_due CHECK (due_at IS NULL OR due_at > assigned_at)
);

COMMENT ON TABLE REVIEW_ASSIGNMENTS IS
    'Reviewer-to-paper assignments. An assignment counts against a reviewer''s '
    'max_active_assignments while status is pending or accepted.';

-- ============================================================================
-- 5. REVIEWS (1 Table)
-- ============================================================================

-- Table 16: REVIEWS
-- The submitted evaluation for one assignment. One review per assignment.
CREATE TABLE REVIEWS (
    review_id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL UNIQUE
        REFERENCES REVIEW_ASSIGNMENTS(assignment_id) ON DELETE CASCADE,
    overall_score SMALLINT NOT NULL
        CHECK (overall_score BETWEEN 1 AND 10),
    confidence SMALLINT NOT NULL DEFAULT 3
        CHECK (confidence BETWEEN 1 AND 5),
    recommendation VARCHAR(20) NOT NULL
        CHECK (recommendation IN (
            'strong_reject', 'reject', 'weak_reject',
            'borderline',
            'weak_accept', 'accept', 'strong_accept'
        )),
    comments_to_authors TEXT NOT NULL,
    comments_to_chair TEXT,
    review_status VARCHAR(20) NOT NULL DEFAULT 'submitted'
        CHECK (review_status IN ('draft', 'submitted')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN REVIEWS.comments_to_chair IS
    'Confidential. Never exposed through the author-facing double-blind view.';

-- ============================================================================
-- 6. DECISIONS (1 Table)
-- ============================================================================

-- Table 17: DECISIONS
-- Final chair decision. At most one per paper.
CREATE TABLE DECISIONS (
    decision_id BIGSERIAL PRIMARY KEY,
    paper_id BIGINT NOT NULL UNIQUE
        REFERENCES PAPERS(paper_id) ON DELETE CASCADE,
    decided_by_person_id BIGINT NOT NULL
        REFERENCES PEOPLE(person_id) ON DELETE RESTRICT,
    outcome VARCHAR(20) NOT NULL
        CHECK (outcome IN ('accept', 'reject', 'major_revision', 'minor_revision')),
    rationale TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE DECISIONS IS
    'UNIQUE(paper_id) is what makes a paper have exactly one final decision.';

-- ============================================================================
-- 7. AUDIT LOG (1 Table)
-- ============================================================================

-- Table 18: AUDIT_LOG
-- Append-only trail of changes to the review pipeline, written by triggers.
CREATE TABLE AUDIT_LOG (
    audit_id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(60) NOT NULL,
    operation VARCHAR(10) NOT NULL
        CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_pk TEXT NOT NULL,
    actor_person_id BIGINT
        REFERENCES PEOPLE(person_id) ON DELETE SET NULL,
    old_data JSONB,
    new_data JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE AUDIT_LOG IS
    'Append-only. Written by trg_fn_audit_row; never updated by application code.';

-- ============================================================================
-- 8. PERFORMANCE INDEXES
-- ============================================================================

-- Expertise lookup: "which reviewers know topic X"
CREATE INDEX idx_reviewer_topics_topic ON REVIEWER_TOPICS(topic_id);

-- COI lookup is on the hot path of every assignment attempt
CREATE INDEX idx_coi_paper ON CONFLICTS_OF_INTEREST(paper_id);
CREATE INDEX idx_coi_reviewer ON CONFLICTS_OF_INTEREST(reviewer_person_id);
CREATE INDEX idx_coi_paper_reviewer ON CONFLICTS_OF_INTEREST(paper_id, reviewer_person_id);

-- Workload counting: "how many active assignments does reviewer R hold"
CREATE INDEX idx_assignments_reviewer_status
    ON REVIEW_ASSIGNMENTS(reviewer_person_id, assignment_status);
CREATE INDEX idx_assignments_paper ON REVIEW_ASSIGNMENTS(paper_id);

-- Analytics scan reviews by score
CREATE INDEX idx_reviews_score ON REVIEWS(overall_score);

CREATE INDEX idx_decisions_outcome ON DECISIONS(outcome);

-- Audit is queried by table and time
CREATE INDEX idx_audit_table_time ON AUDIT_LOG(table_name, occurred_at DESC);
