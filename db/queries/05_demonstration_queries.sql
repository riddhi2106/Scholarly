-- ============================================================================
-- Scholarly - Complex Analytical Queries
-- Covers: JOIN, GROUP BY, HAVING, ORDER BY, Aggregates, Subqueries, Full-Text Search
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Multi-Table JOIN: Conference -> Papers -> Authors -> Person -> Affiliation
-- Retrieves submitted papers with conference acronym, corresponding author name, 
-- and primary institutional affiliation.
-- ----------------------------------------------------------------------------
SELECT 
    c.acronym AS conference,
    c.year,
    p.paper_id,
    p.title AS paper_title,
    author.full_name AS corresponding_author,
    author.email AS author_email,
    COALESCE(aff.institution_name, 'Independent Researcher') AS institution
FROM PAPERS p
JOIN CONFERENCES c ON p.conference_id = c.conference_id
JOIN PAPER_AUTHORS pa ON p.paper_id = pa.paper_id AND pa.is_corresponding = TRUE
JOIN PEOPLE author ON pa.author_person_id = author.person_id
LEFT JOIN PERSON_AFFILIATIONS paf ON author.person_id = paf.person_id AND paf.end_date IS NULL
LEFT JOIN AFFILIATIONS aff ON paf.affiliation_id = aff.affiliation_id
ORDER BY c.year DESC, p.paper_id ASC;

-- ----------------------------------------------------------------------------
-- 2. GROUP BY, HAVING, Aggregation: Conference Submission Statistics
-- Aggregates total submissions, distinct lead authors, and filter conferences 
-- having at least 1 submission.
-- ----------------------------------------------------------------------------
SELECT 
    c.conference_id,
    c.name AS conference_name,
    c.acronym,
    c.status AS conference_status,
    COUNT(p.paper_id) AS total_submissions,
    COUNT(DISTINCT p.created_by_person_id) AS distinct_submitters
FROM CONFERENCES c
LEFT JOIN PAPERS p ON c.conference_id = p.conference_id
GROUP BY c.conference_id, c.name, c.acronym, c.status
HAVING COUNT(p.paper_id) >= 1
ORDER BY total_submissions DESC;

-- ----------------------------------------------------------------------------
-- 3. Complex Aggregation: Topic Popularity Across Submissions
-- Calculates how many papers and distinct authors are associated with each topic.
-- ----------------------------------------------------------------------------
SELECT 
    t.topic_id,
    t.topic_name,
    COUNT(pt.paper_id) AS paper_count,
    COUNT(DISTINCT pa.author_person_id) AS involved_authors
FROM TOPICS t
LEFT JOIN PAPER_TOPICS pt ON t.topic_id = pt.topic_id
LEFT JOIN PAPER_AUTHORS pa ON pt.paper_id = pa.paper_id
GROUP BY t.topic_id, t.topic_name
ORDER BY paper_count DESC, t.topic_name ASC;

-- ----------------------------------------------------------------------------
-- 4. Subquery (Nested Non-Correlated): Active Authors
-- Finds all researchers who are authors on papers in 'open' conferences 
-- but have NO reviewer assignments.
-- ----------------------------------------------------------------------------
SELECT 
    pe.person_id,
    pe.full_name,
    pe.email
FROM PEOPLE pe
WHERE pe.person_id IN (
    SELECT pa.author_person_id 
    FROM PAPER_AUTHORS pa
    JOIN PAPERS p ON pa.paper_id = p.paper_id
    JOIN CONFERENCES c ON p.conference_id = c.conference_id
    WHERE c.status = 'open'
)
AND pe.person_id NOT IN (
    SELECT cm.person_id 
    FROM CONFERENCE_MEMBERSHIPS cm
    WHERE cm.role = 'reviewer'
);

-- ----------------------------------------------------------------------------
-- 5. Subquery (Correlated): Most Prolific Authors
-- For each author, calculate their paper count and verify whether their count
-- exceeds the average number of papers per author across the platform.
-- ----------------------------------------------------------------------------
SELECT 
    pe.person_id,
    pe.full_name,
    pe.email,
    COUNT(pa.paper_id) AS total_papers
FROM PEOPLE pe
JOIN PAPER_AUTHORS pa ON pe.person_id = pa.author_person_id
GROUP BY pe.person_id, pe.full_name, pe.email
HAVING COUNT(pa.paper_id) > (
    SELECT AVG(author_paper_count) FROM (
        SELECT COUNT(paper_id) AS author_paper_count 
        FROM PAPER_AUTHORS 
        GROUP BY author_person_id
    ) sub
)
ORDER BY total_papers DESC;

-- ----------------------------------------------------------------------------
-- 6. Full-Text Search Query using GIN index & search_vector
-- Searches papers by natural language query, ranking by match relevance.
-- ----------------------------------------------------------------------------
SELECT 
    p.paper_id,
    p.title,
    ts_rank(p.search_vector, websearch_to_tsquery('english', 'PostgreSQL OR vector')) AS rank
FROM PAPERS p
WHERE p.search_vector @@ websearch_to_tsquery('english', 'PostgreSQL OR vector')
ORDER BY rank DESC;
