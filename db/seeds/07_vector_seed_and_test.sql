-- ============================================================================
-- Scholarly (ConfDB) - Sample Vector Embeddings & Similarity Search Demo
-- Populates mock embeddings for papers and demonstrates cosine similarity search
-- ============================================================================

-- Function to generate synthetic normalized vector for testing
CREATE OR REPLACE FUNCTION fn_generate_dummy_vector(seed INT) 
RETURNS VECTOR(384) AS $$
DECLARE
    vals TEXT[];
    i INT;
BEGIN
    vals := ARRAY[]::TEXT[];
    FOR i IN 1..384 LOOP
        -- Generate deterministic pseudo-random float between -1.0 and 1.0
        vals := array_append(vals, round((sin(seed * 1000 + i))::numeric, 4)::TEXT);
    END LOOP;
    RETURN ('[' || array_to_string(vals, ',') || ']')::VECTOR(384);
END;
$$ LANGUAGE plpgsql;

-- Insert embeddings for Paper 1, Paper 2, and Paper 3
INSERT INTO PAPER_EMBEDDINGS (paper_id, embedding, model_name, content_hash)
VALUES
(1, fn_generate_dummy_vector(1), 'all-MiniLM-L6-v2', md5('paper1_content')),
(2, fn_generate_dummy_vector(2), 'all-MiniLM-L6-v2', md5('paper2_content')),
(3, fn_generate_dummy_vector(1), 'all-MiniLM-L6-v2', md5('paper3_content')) -- Same seed as Paper 1 (high similarity)
ON CONFLICT (paper_id) DO UPDATE SET embedding = EXCLUDED.embedding;

-- Insert reviewer embedding for Reviewer 1 (Alice) and Reviewer 2 (Bob)
INSERT INTO REVIEWER_EMBEDDINGS (reviewer_person_id, embedding, model_name)
VALUES
(1, fn_generate_dummy_vector(1), 'all-MiniLM-L6-v2'),
(2, fn_generate_dummy_vector(5), 'all-MiniLM-L6-v2')
ON CONFLICT (reviewer_person_id) DO UPDATE SET embedding = EXCLUDED.embedding;

-- Clean up helper generator function
DROP FUNCTION fn_generate_dummy_vector(INT);

-- ----------------------------------------------------------------------------
-- Demonstration Query: Find Top Similar Papers to Paper 1 using Cosine Distance (<=>)
-- ----------------------------------------------------------------------------
SELECT * FROM fn_find_similar_papers(1, 5);
