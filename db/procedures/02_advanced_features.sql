-- ============================================================================
-- Scholarly (ConfDB) - Advanced SQL: Triggers, Functions & Views
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger Function: Automatically update updated_at timestamp on PAPERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_papers_updated_at ON PAPERS;
CREATE TRIGGER trg_papers_updated_at
BEFORE UPDATE ON PAPERS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_update_timestamp();

-- ----------------------------------------------------------------------------
-- 2. Trigger Function: Validate conference submission window before paper insertion
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_validate_paper_submission()
RETURNS TRIGGER AS $$
DECLARE
    v_open TIMESTAMPTZ;
    v_close TIMESTAMPTZ;
    v_status VARCHAR(20);
BEGIN
    SELECT submission_open_at, submission_close_at, status 
    INTO v_open, v_close, v_status
    FROM CONFERENCES
    WHERE conference_id = NEW.conference_id;

    IF v_status <> 'open' THEN
        RAISE EXCEPTION 'Cannot submit paper: Conference % is currently in % status, not open', 
            NEW.conference_id, v_status;
    END IF;

    IF NOW() < v_open OR NOW() > v_close THEN
        RAISE EXCEPTION 'Cannot submit paper: Current timestamp (%) is outside the submission window (% to %)',
            NOW(), v_open, v_close;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_paper_submission_window ON PAPERS;
CREATE TRIGGER trg_enforce_paper_submission_window
BEFORE INSERT ON PAPERS
FOR EACH ROW
EXECUTE FUNCTION trg_fn_validate_paper_submission();

-- ----------------------------------------------------------------------------
-- 3. Stored Procedure: Atomic Paper Submission Transaction
-- Inserts a paper, links co-authors with order, and assigns research topics.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_submit_paper(
    p_conference_id BIGINT,
    p_created_by_person_id BIGINT,
    p_title VARCHAR(300),
    p_abstract TEXT,
    p_author_ids BIGINT[],
    p_corresponding_author_id BIGINT,
    p_topic_ids BIGINT[],
    INOUT p_new_paper_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    i INT;
    v_author_id BIGINT;
    v_topic_id BIGINT;
BEGIN
    -- 1. Insert Paper
    INSERT INTO PAPERS (
        conference_id, 
        created_by_person_id, 
        title, 
        abstract, 
        submission_status, 
        submitted_at
    )
    VALUES (
        p_conference_id, 
        p_created_by_person_id, 
        p_title, 
        p_abstract, 
        'submitted', 
        NOW()
    )
    RETURNING paper_id INTO p_new_paper_id;

    -- 2. Insert Authors
    FOR i IN 1 .. array_length(p_author_ids, 1) LOOP
        v_author_id := p_author_ids[i];
        
        -- Automatically register profile if author profile does not exist
        INSERT INTO AUTHOR_PROFILES (person_id, profile_status)
        VALUES (v_author_id, 'active')
        ON CONFLICT (person_id) DO NOTHING;

        INSERT INTO PAPER_AUTHORS (
            paper_id, 
            author_person_id, 
            author_order, 
            is_corresponding
        )
        VALUES (
            p_new_paper_id, 
            v_author_id, 
            i, 
            (v_author_id = p_corresponding_author_id)
        );
    END LOOP;

    -- 3. Insert Topics
    FOREACH v_topic_id IN ARRAY p_topic_ids LOOP
        INSERT INTO PAPER_TOPICS (paper_id, topic_id)
        VALUES (p_new_paper_id, v_topic_id);
    END LOOP;

    -- Ensure conference membership has author role
    INSERT INTO CONFERENCE_MEMBERSHIPS (conference_id, person_id, role, membership_status)
    VALUES (p_conference_id, p_created_by_person_id, 'author', 'active')
    ON CONFLICT (conference_id, person_id, role) DO NOTHING;

END;
$$;

-- ----------------------------------------------------------------------------
-- 4. View: Author Dashboard View
-- Aggregates paper details, conference name, topics list, and co-authors.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_author_dashboard AS
SELECT 
    p.paper_id,
    p.title,
    p.abstract,
    p.submission_status,
    p.submitted_at,
    p.updated_at,
    c.conference_id,
    c.name AS conference_name,
    c.acronym AS conference_acronym,
    c.year AS conference_year,
    p.created_by_person_id,
    creator.full_name AS creator_name,
    creator.email AS creator_email,
    -- Aggregate topics as JSON array
    COALESCE(
        json_agg(DISTINCT jsonb_build_object('topic_id', t.topic_id, 'topic_name', t.topic_name)) 
        FILTER (WHERE t.topic_id IS NOT NULL), '[]'::json
    ) AS topics,
    -- Aggregate authors in author order as JSON array
    COALESCE(
        json_agg(DISTINCT jsonb_build_object(
            'author_person_id', pe.person_id,
            'full_name', pe.full_name,
            'email', pe.email,
            'author_order', pa.author_order,
            'is_corresponding', pa.is_corresponding
        )) FILTER (WHERE pe.person_id IS NOT NULL), '[]'::json
    ) AS authors
FROM PAPERS p
JOIN CONFERENCES c ON p.conference_id = c.conference_id
JOIN PEOPLE creator ON p.created_by_person_id = creator.person_id
LEFT JOIN PAPER_TOPICS pt ON p.paper_id = pt.paper_id
LEFT JOIN TOPICS t ON pt.topic_id = t.topic_id
LEFT JOIN PAPER_AUTHORS pa ON p.paper_id = pa.paper_id
LEFT JOIN PEOPLE pe ON pa.author_person_id = pe.person_id
GROUP BY 
    p.paper_id, 
    c.conference_id, 
    creator.person_id;
