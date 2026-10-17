-- ============================================================================
-- Scholarly - Realistic Sample Data (Seed Script)
-- Demonstrates realistic entities across all 12 tables.
-- ============================================================================

-- 1. AFFILIATIONS
INSERT INTO AFFILIATIONS (affiliation_id, institution_name, institution_domain, country_code) VALUES
(1, 'Massachusetts Institute of Technology', 'mit.edu', 'US'),
(2, 'Stanford University', 'stanford.edu', 'US'),
(3, 'Indian Institute of Science', 'iisc.ac.in', 'IN'),
(4, 'PES University', 'pes.edu', 'IN'),
(5, 'Carnegie Mellon University', 'cmu.edu', 'US'),
(6, 'University of Oxford', 'ox.ac.uk', 'GB')
ON CONFLICT (affiliation_id) DO NOTHING;

SELECT setval('affiliations_affiliation_id_seq', (SELECT MAX(affiliation_id) FROM AFFILIATIONS));

-- 2. PEOPLE
-- (Passwords for user accounts will be bcrypt hash of 'Password123!')
-- bcrypt hash: $2a$10$WdYj/s9bL4qB9b9k6tA.g.iU6D8z/5eWnB7pYyR9Q2sWJbC4d8v9G
INSERT INTO PEOPLE (person_id, full_name, email) VALUES
(1, 'Alice Johnson', 'alice@mit.edu'),
(2, 'Bob Chen', 'bob@stanford.edu'),
(3, 'Riddhi Mundada', 'riddhi@pes.edu'),
(4, 'David Kumar', 'david@iisc.ac.in'),
(5, 'Elena Rostova', 'elena@ox.ac.uk'),
(6, 'Frank Miller', 'frank@cmu.edu'),
(7, 'Grace Hopper', 'grace@mit.edu'),
(8, 'Hari Prasad', 'hari@pes.edu')
ON CONFLICT (person_id) DO NOTHING;

SELECT setval('people_person_id_seq', (SELECT MAX(person_id) FROM PEOPLE));

-- 3. USER_ACCOUNTS
INSERT INTO USER_ACCOUNTS (account_id, person_id, password_hash, system_role, account_status) VALUES
(1, 1, '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa', 'admin', 'active'),
(2, 2, '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa', 'user', 'active'),
(3, 3, '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa', 'admin', 'active'),
(4, 4, '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa', 'user', 'active'),
(5, 5, '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa', 'user', 'active'),
(6, 6, '$2b$10$Ml9Y/UqfDW0MHnSjM8YDcueUrcQEvcVesLBN5/J6LV/EznQmby4pa', 'user', 'active')
ON CONFLICT (account_id) DO NOTHING;

SELECT setval('user_accounts_account_id_seq', (SELECT MAX(account_id) FROM USER_ACCOUNTS));

-- 4. AUTHOR_PROFILES & REVIEWER_PROFILES
INSERT INTO AUTHOR_PROFILES (person_id, profile_status) VALUES
(1, 'active'),
(2, 'active'),
(3, 'active'),
(4, 'active'),
(5, 'active')
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO REVIEWER_PROFILES (person_id, bio, research_keywords, reviewer_status) VALUES
(1, 'Professor of Distributed Databases at MIT.', 'distributed systems, consensus, query optimization', 'active'),
(2, 'Associate Professor in Systems and Cloud Architecture.', 'cloud databases, serverless, storage systems', 'active'),
(5, 'Senior Research Scientist at Oxford working on Vector AI systems.', 'pgvector, semantic search, multimodal retrieval', 'active'),
(6, 'Researcher at CMU specializing in transaction processing.', 'concurrency control, isolation levels, MVCC', 'active')
ON CONFLICT (person_id) DO NOTHING;

-- 5. PERSON_AFFILIATIONS
INSERT INTO PERSON_AFFILIATIONS (person_id, affiliation_id, start_date, end_date) VALUES
(1, 1, '2015-08-01', NULL),
(2, 2, '2018-09-01', NULL),
(3, 4, '2023-08-01', NULL),
(4, 3, '2020-01-15', NULL),
(5, 6, '2019-03-01', NULL),
(6, 5, '2017-07-01', NULL)
ON CONFLICT DO NOTHING;

-- 6. CONFERENCES
-- Conference 1 is actively open for submissions right now
-- Conference 2 is upcoming in review
-- Conference 3 is closed
INSERT INTO CONFERENCES (
    conference_id, name, acronym, year, description, 
    submission_open_at, submission_close_at, review_deadline, status
) VALUES
(
    1, 
    'International Conference on Very Large Data Bases', 
    'VLDB', 
    2026, 
    'Premier annual forum for database and data management research.',
    NOW() - INTERVAL '10 days', 
    NOW() + INTERVAL '45 days', 
    NOW() + INTERVAL '90 days', 
    'open'
),
(
    2, 
    'ACM SIGMOD/PODS International Conference on Management of Data', 
    'SIGMOD', 
    2026, 
    'Leading international conference on database systems research and principles.',
    NOW() - INTERVAL '60 days', 
    NOW() - INTERVAL '5 days', 
    NOW() + INTERVAL '30 days', 
    'in_review'
),
(
    3, 
    'IEEE International Conference on Data Engineering', 
    'ICDE', 
    2025, 
    'Addressing research issues in designing, building, and evaluating data systems.',
    '2024-09-01 00:00:00+00', 
    '2024-11-01 23:59:59+00', 
    '2025-01-15 23:59:59+00', 
    'closed'
)
ON CONFLICT (conference_id) DO NOTHING;

SELECT setval('conferences_conference_id_seq', (SELECT MAX(conference_id) FROM CONFERENCES));

-- 7. CONFERENCE_MEMBERSHIPS
INSERT INTO CONFERENCE_MEMBERSHIPS (conference_id, person_id, role, membership_status, max_active_assignments) VALUES
(1, 1, 'chair', 'active', NULL),
(1, 2, 'reviewer', 'active', 5),
(1, 5, 'reviewer', 'active', 4),
(1, 6, 'reviewer', 'active', 6),
(2, 6, 'chair', 'active', NULL),
(2, 1, 'reviewer', 'active', 5)
ON CONFLICT DO NOTHING;

-- 8. TOPICS
INSERT INTO TOPICS (topic_id, topic_name, description) VALUES
(1, 'Distributed Query Processing', 'Techniques for distributed optimization, joins, and partition pruning.'),
(2, 'Transaction Processing & MVCC', 'Concurrency control, ACID isolation guarantees, and logging mechanisms.'),
(3, 'Vector Indexing & Semantic Search', 'Approximate nearest neighbor algorithms, HNSW, IVFFlat, and embeddings.'),
(4, 'Full-Text Retrieval', 'Inverted index, BM25 scoring, and search ranking algorithms.'),
(5, 'Cloud-Native & Serverless Data', 'Storage-compute separation, elasticity, and multi-tenant architectures.'),
(6, 'Graph Data Management', 'Graph traversals, pattern matching, and property graph querying.')
ON CONFLICT (topic_id) DO NOTHING;

SELECT setval('topics_topic_id_seq', (SELECT MAX(topic_id) FROM TOPICS));

-- 9. PAPERS & PAPER_AUTHORS & PAPER_TOPICS
-- Submit sample paper 1 via direct insert to Conference 1 (which is open)
INSERT INTO PAPERS (
    paper_id, conference_id, title, abstract, submission_status, submitted_at, created_by_person_id
) VALUES
(
    1, 
    1, 
    'Adaptive Query Routing in Distributed Multi-Cloud PostgreSQL Clusters', 
    'We present a dynamic latency-aware query routing mechanism for distributed PostgreSQL replicas across heterogeneous cloud providers.',
    'submitted', 
    NOW() - INTERVAL '2 days', 
    3
),
(
    2, 
    1, 
    'Efficient High-Dimensional Vector Search with Dynamic Clustering', 
    'This paper introduces an adaptive indexing layer over pgvector that adjusts centroid distribution dynamically as streaming embeddings arrive.',
    'submitted', 
    NOW() - INTERVAL '1 day', 
    4
)
ON CONFLICT (paper_id) DO NOTHING;

SELECT setval('papers_paper_id_seq', (SELECT MAX(paper_id) FROM PAPERS));

-- Paper Authors (Supporting multi-authors per paper)
INSERT INTO PAPER_AUTHORS (paper_id, author_person_id, author_order, is_corresponding) VALUES
(1, 3, 1, TRUE),   -- Riddhi Mundada (Corresponding & 1st author)
(1, 4, 2, FALSE),  -- David Kumar (2nd author)
(2, 4, 1, TRUE),   -- David Kumar (Corresponding & 1st author)
(2, 2, 2, FALSE),  -- Bob Chen (2nd author)
(2, 5, 3, FALSE);  -- Elena Rostova (3rd author)

-- Paper Topics (Supporting multiple topics per paper)
INSERT INTO PAPER_TOPICS (paper_id, topic_id) VALUES
(1, 1), -- Paper 1 has Distributed Query Processing
(1, 5), -- Paper 1 has Cloud-Native Data
(2, 3), -- Paper 2 has Vector Indexing
(2, 4)  -- Paper 2 has Full-Text Retrieval
ON CONFLICT DO NOTHING;
