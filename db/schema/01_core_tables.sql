-- ============================================================================
-- Scholarly (ConfDB) - Core Tables Schema (DDL)
-- Module: Identity, Affiliations, Conferences, Papers & Topics (12 Tables)
-- Database: PostgreSQL 14+
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- 1. DROP EXISTING TABLES (Reverse Dependency Order for clean reruns)
-- ============================================================================
DROP TABLE IF EXISTS PAPER_TOPICS CASCADE;
DROP TABLE IF EXISTS TOPICS CASCADE;
DROP TABLE IF EXISTS PAPER_AUTHORS CASCADE;
DROP TABLE IF EXISTS PAPERS CASCADE;
DROP TABLE IF EXISTS CONFERENCE_MEMBERSHIPS CASCADE;
DROP TABLE IF EXISTS CONFERENCES CASCADE;
DROP TABLE IF EXISTS PERSON_AFFILIATIONS CASCADE;
DROP TABLE IF EXISTS AFFILIATIONS CASCADE;
DROP TABLE IF EXISTS REVIEWER_PROFILES CASCADE;
DROP TABLE IF EXISTS AUTHOR_PROFILES CASCADE;
DROP TABLE IF EXISTS USER_ACCOUNTS CASCADE;
DROP TABLE IF EXISTS PEOPLE CASCADE;

-- ============================================================================
-- 2. IDENTITY AND PROFILES (4 Tables)
-- ============================================================================

-- Table 1: PEOPLE
-- Stores personal details independent of auth or specific platform roles.
CREATE TABLE PEOPLE (
    person_id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    email CITEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2: USER_ACCOUNTS
-- Stores credentials and authentication state for a person.
CREATE TABLE USER_ACCOUNTS (
    account_id BIGSERIAL PRIMARY KEY,
    person_id BIGINT NOT NULL UNIQUE REFERENCES PEOPLE(person_id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    system_role VARCHAR(10) NOT NULL DEFAULT 'user' 
        CHECK (system_role IN ('admin', 'user')),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (account_status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Table 3: AUTHOR_PROFILES
-- Profile details for individuals acting as paper authors.
CREATE TABLE AUTHOR_PROFILES (
    person_id BIGINT PRIMARY KEY REFERENCES PEOPLE(person_id) ON DELETE CASCADE,
    profile_status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (profile_status IN ('active', 'inactive'))
);

-- Table 4: REVIEWER_PROFILES
-- Profile details and research background for reviewers.
CREATE TABLE REVIEWER_PROFILES (
    person_id BIGINT PRIMARY KEY REFERENCES PEOPLE(person_id) ON DELETE CASCADE,
    bio TEXT,
    research_keywords TEXT,
    reviewer_status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (reviewer_status IN ('active', 'unavailable', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. AFFILIATIONS (2 Tables)
-- ============================================================================

-- Table 5: AFFILIATIONS
-- Academic or industrial organizations.
CREATE TABLE AFFILIATIONS (
    affiliation_id BIGSERIAL PRIMARY KEY,
    institution_name VARCHAR(250) NOT NULL,
    institution_domain VARCHAR(150),
    country_code CHAR(2)
);

-- Table 6: PERSON_AFFILIATIONS
-- History of affiliations for a person.
CREATE TABLE PERSON_AFFILIATIONS (
    person_id BIGINT NOT NULL REFERENCES PEOPLE(person_id) ON DELETE CASCADE,
    affiliation_id BIGINT NOT NULL REFERENCES AFFILIATIONS(affiliation_id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    PRIMARY KEY (person_id, affiliation_id, start_date),
    CONSTRAINT chk_affiliation_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ============================================================================
-- 4. CONFERENCES (2 Tables)
-- ============================================================================

-- Table 7: CONFERENCES
-- Conference editions with timelines and submission windows.
CREATE TABLE CONFERENCES (
    conference_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    acronym VARCHAR(20) NOT NULL,
    year SMALLINT NOT NULL CHECK (year >= 1950 AND year <= 2100),
    description TEXT,
    submission_open_at TIMESTAMPTZ NOT NULL,
    submission_close_at TIMESTAMPTZ NOT NULL,
    review_deadline TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'open', 'in_review', 'decision_pending', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_conference_acronym_year UNIQUE (acronym, year),
    CONSTRAINT chk_submission_window CHECK (submission_close_at > submission_open_at),
    CONSTRAINT chk_review_window CHECK (review_deadline > submission_close_at)
);

-- Table 8: CONFERENCE_MEMBERSHIPS
-- Roles that people hold inside a particular conference (e.g., Chair, Reviewer, PC Member).
CREATE TABLE CONFERENCE_MEMBERSHIPS (
    conference_id BIGINT NOT NULL REFERENCES CONFERENCES(conference_id) ON DELETE CASCADE,
    person_id BIGINT NOT NULL REFERENCES PEOPLE(person_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL 
        CHECK (role IN ('chair', 'author', 'reviewer', 'pc_member')),
    membership_status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (membership_status IN ('active', 'invited', 'declined', 'revoked')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    max_active_assignments INTEGER 
        CHECK (max_active_assignments IS NULL OR (role = 'reviewer' AND max_active_assignments >= 0)),
    PRIMARY KEY (conference_id, person_id, role)
);

-- ============================================================================
-- 5. PAPERS AND AUTHORS (2 Tables)
-- ============================================================================

-- Table 9: PAPERS
-- Submissions associated with a conference.
CREATE TABLE PAPERS (
    paper_id BIGSERIAL PRIMARY KEY,
    conference_id BIGINT NOT NULL REFERENCES CONFERENCES(conference_id) ON DELETE RESTRICT,
    title VARCHAR(300) NOT NULL,
    abstract TEXT NOT NULL,
    submission_status VARCHAR(20) NOT NULL DEFAULT 'submitted' 
        CHECK (submission_status IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_person_id BIGINT NOT NULL REFERENCES PEOPLE(person_id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(abstract, ''))
    ) STORED
);

-- Table 10: PAPER_AUTHORS
-- Many-to-many relationship between papers and people, with author order.
CREATE TABLE PAPER_AUTHORS (
    paper_id BIGINT NOT NULL REFERENCES PAPERS(paper_id) ON DELETE CASCADE,
    author_person_id BIGINT NOT NULL REFERENCES PEOPLE(person_id) ON DELETE RESTRICT,
    author_order SMALLINT NOT NULL CHECK (author_order >= 1),
    is_corresponding BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (paper_id, author_person_id),
    CONSTRAINT uq_paper_author_order UNIQUE (paper_id, author_order) DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================================
-- 6. TOPICS (2 Tables)
-- ============================================================================

-- Table 11: TOPICS
-- Research domain taxonomy.
CREATE TABLE TOPICS (
    topic_id BIGSERIAL PRIMARY KEY,
    topic_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

-- Table 12: PAPER_TOPICS
-- Many-to-many relationship between papers and topics.
CREATE TABLE PAPER_TOPICS (
    paper_id BIGINT NOT NULL REFERENCES PAPERS(paper_id) ON DELETE CASCADE,
    topic_id BIGINT NOT NULL REFERENCES TOPICS(topic_id) ON DELETE RESTRICT,
    PRIMARY KEY (paper_id, topic_id)
);

-- ============================================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX idx_user_accounts_person ON USER_ACCOUNTS(person_id);
CREATE INDEX idx_person_affiliations_person ON PERSON_AFFILIATIONS(person_id);
CREATE INDEX idx_person_affiliations_affil ON PERSON_AFFILIATIONS(affiliation_id);
CREATE INDEX idx_conferences_status_dates ON CONFERENCES(status, submission_close_at);
CREATE INDEX idx_conf_memberships_person ON CONFERENCE_MEMBERSHIPS(person_id);
CREATE INDEX idx_papers_conference ON PAPERS(conference_id);
CREATE INDEX idx_papers_created_by ON PAPERS(created_by_person_id);
CREATE INDEX idx_papers_submission_status ON PAPERS(submission_status);
CREATE INDEX idx_papers_search_vector ON PAPERS USING GIN (search_vector);
CREATE INDEX idx_paper_authors_author ON PAPER_AUTHORS(author_person_id);
CREATE INDEX idx_paper_topics_topic ON PAPER_TOPICS(topic_id);
