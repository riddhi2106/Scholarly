-- ============================================================================
-- Scholarly - Vector Database Extension (pgvector)
-- Demonstrates Vector Database Paradigm (Option 2: SQL + Vector Database)
-- Tables: PAPER_EMBEDDINGS, REVIEWER_EMBEDDINGS
-- Dimension: 384 (standard for fast embeddings e.g., all-MiniLM-L6-v2)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Table: PAPER_EMBEDDINGS
-- Stores dense vector representations of paper title and abstract.
CREATE TABLE IF NOT EXISTS PAPER_EMBEDDINGS (
    paper_id BIGINT PRIMARY KEY REFERENCES PAPERS(paper_id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL,
    model_name VARCHAR(120) NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    content_hash CHAR(64),
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: REVIEWER_EMBEDDINGS
-- Stores dense vector representations of reviewer research keywords and bio.
CREATE TABLE IF NOT EXISTS REVIEWER_EMBEDDINGS (
    reviewer_person_id BIGINT PRIMARY KEY REFERENCES REVIEWER_PROFILES(person_id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL,
    model_name VARCHAR(120) NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    content_hash CHAR(64),
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW Vector Index for sub-millisecond approximate nearest neighbor (Cosine Distance)
CREATE INDEX IF NOT EXISTS idx_paper_embeddings_hnsw 
ON PAPER_EMBEDDINGS USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_reviewer_embeddings_hnsw 
ON REVIEWER_EMBEDDINGS USING hnsw (embedding vector_cosine_ops);

-- Stored Function: Semantic Similarity Matching (Find Top N Similar Papers)
CREATE OR REPLACE FUNCTION fn_find_similar_papers(
    p_paper_id BIGINT, 
    p_limit INT DEFAULT 5
)
RETURNS TABLE (
    similar_paper_id BIGINT,
    title VARCHAR(300),
    similarity_score DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.paper_id,
        p.title,
        (1 - (pe.embedding <=> target.embedding))::DOUBLE PRECISION AS similarity_score
    FROM PAPER_EMBEDDINGS pe
    JOIN PAPERS p ON pe.paper_id = p.paper_id,
    (SELECT embedding FROM PAPER_EMBEDDINGS WHERE paper_id = p_paper_id) target
    WHERE pe.paper_id <> p_paper_id
    ORDER BY pe.embedding <=> target.embedding ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
