# Scholarly — Technical Documentation & Deliverables

**Course**: DBMS Experiential Learning — Level 3 Project  
**Author**: Riddhi Mundada  
**Module**: Core Platform (Identity, Affiliations, Conferences, Papers & Topics)  
**Database**: PostgreSQL 14+ with `pgvector` & `citext`  
**Web Framework**: Next.js 16 (App Router, TypeScript, Tailwind CSS)

---

## 1. Schema & Relational Structure (12 Core Tables)

### 1.1 Identity and Profiles (4 Tables)
- **`PEOPLE`**: Core directory of researchers and platform users.
  - `person_id BIGSERIAL PRIMARY KEY`
  - `full_name VARCHAR(200) NOT NULL`
  - `email CITEXT NOT NULL UNIQUE`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **`USER_ACCOUNTS`**: Authentication credentials and security role.
  - `account_id BIGSERIAL PRIMARY KEY`
  - `person_id BIGINT UNIQUE NOT NULL REFERENCES PEOPLE(person_id) ON DELETE CASCADE`
  - `password_hash TEXT NOT NULL`
  - `system_role VARCHAR(10) NOT NULL CHECK (system_role IN ('admin', 'user'))`
  - `account_status VARCHAR(20) NOT NULL CHECK (account_status IN ('active', 'suspended', 'pending'))`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `last_login_at TIMESTAMPTZ`
- **`AUTHOR_PROFILES`**: Profile attributes for individuals acting as paper authors.
  - `person_id BIGINT PRIMARY KEY REFERENCES PEOPLE(person_id) ON DELETE CASCADE`
  - `profile_status VARCHAR(20) NOT NULL CHECK (profile_status IN ('active', 'inactive'))`
- **`REVIEWER_PROFILES`**: Reviewer domain metadata.
  - `person_id BIGINT PRIMARY KEY REFERENCES PEOPLE(person_id) ON DELETE CASCADE`
  - `bio TEXT`, `research_keywords TEXT`
  - `reviewer_status VARCHAR(20) NOT NULL CHECK (reviewer_status IN ('active', 'unavailable', 'suspended'))`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 1.2 Affiliations (2 Tables)
- **`AFFILIATIONS`**: Universities and research institutions.
  - `affiliation_id BIGSERIAL PRIMARY KEY`
  - `institution_name VARCHAR(250) NOT NULL`
  - `institution_domain VARCHAR(150)`, `country_code CHAR(2)`
- **`PERSON_AFFILIATIONS`**: Researcher institutional affiliations over time.
  - `(person_id, affiliation_id, start_date) PRIMARY KEY`
  - `person_id REFERENCES PEOPLE(person_id) ON DELETE CASCADE`
  - `affiliation_id REFERENCES AFFILIATIONS(affiliation_id) ON DELETE CASCADE`
  - `CONSTRAINT chk_affiliation_dates CHECK (end_date IS NULL OR end_date >= start_date)`

### 1.3 Conferences (2 Tables)
- **`CONFERENCES`**: Academic conference editions with critical submission timelines.
  - `conference_id BIGSERIAL PRIMARY KEY`
  - `name VARCHAR(200) NOT NULL`, `acronym VARCHAR(20) NOT NULL`, `year SMALLINT NOT NULL`
  - `submission_open_at TIMESTAMPTZ NOT NULL`, `submission_close_at TIMESTAMPTZ NOT NULL`, `review_deadline TIMESTAMPTZ NOT NULL`
  - `status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'open', 'in_review', 'decision_pending', 'closed'))`
  - `CONSTRAINT uq_conference_acronym_year UNIQUE (acronym, year)`
  - `CONSTRAINT chk_submission_window CHECK (submission_close_at > submission_open_at)`
  - `CONSTRAINT chk_review_window CHECK (review_deadline > submission_close_at)`
- **`CONFERENCE_MEMBERSHIPS`**: Association and roles of researchers within a conference.
  - `(conference_id, person_id, role) PRIMARY KEY`
  - `conference_id REFERENCES CONFERENCES(conference_id) ON DELETE CASCADE`
  - `person_id REFERENCES PEOPLE(person_id) ON DELETE CASCADE`
  - `role VARCHAR(20) CHECK (role IN ('chair', 'author', 'reviewer', 'pc_member'))`
  - `membership_status VARCHAR(20) CHECK (membership_status IN ('active', 'invited', 'declined', 'revoked'))`

### 1.4 Papers and Authors (2 Tables)
- **`PAPERS`**: Research paper submissions.
  - `paper_id BIGSERIAL PRIMARY KEY`
  - `conference_id BIGINT REFERENCES CONFERENCES(conference_id) ON DELETE RESTRICT`
  - `title VARCHAR(300) NOT NULL`, `abstract TEXT NOT NULL`
  - `submission_status VARCHAR(20) CHECK (submission_status IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn'))`
  - `created_by_person_id BIGINT REFERENCES PEOPLE(person_id) ON DELETE RESTRICT`
  - `search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(abstract, ''))) STORED`
- **`PAPER_AUTHORS`**: Many-to-many relationship supporting multi-author papers with author ordering.
  - `(paper_id, author_person_id) PRIMARY KEY`
  - `paper_id REFERENCES PAPERS(paper_id) ON DELETE CASCADE`
  - `author_person_id REFERENCES PEOPLE(person_id) ON DELETE RESTRICT`
  - `author_order SMALLINT NOT NULL CHECK (author_order >= 1)`
  - `is_corresponding BOOLEAN NOT NULL DEFAULT FALSE`
  - `CONSTRAINT uq_paper_author_order UNIQUE (paper_id, author_order) DEFERRABLE INITIALLY DEFERRED`

### 1.5 Topics (2 Tables)
- **`TOPICS`**: Scientific domain taxonomy.
  - `topic_id BIGSERIAL PRIMARY KEY`
  - `topic_name VARCHAR(100) NOT NULL UNIQUE`, `description TEXT`
- **`PAPER_TOPICS`**: Many-to-many relationship supporting multi-topic tagging per paper.
  - `(paper_id, topic_id) PRIMARY KEY`
  - `paper_id REFERENCES PAPERS(paper_id) ON DELETE CASCADE`
  - `topic_id REFERENCES TOPICS(topic_id) ON DELETE RESTRICT`

---

## 2. Advanced Database Features Implementation

| Advanced Concept | Implementation in Project | File Reference |
| :--- | :--- | :--- |
| **ACID Transactions** | Multi-table atomic submission stored procedure & Route Handlers (`sp_submit_paper`) inserting into `PAPERS`, `PAPER_AUTHORS`, and `PAPER_TOPICS` with rollback safety | `db/procedures/02_advanced_features.sql` |
| **Triggers** | `trg_enforce_paper_submission_window`: Rejects paper creation outside open conference windows.<br>`trg_papers_updated_at`: Auto-updates timestamps on modification. | `db/procedures/02_advanced_features.sql` |
| **Views** | `v_author_dashboard`: Aggregates papers, co-author lists with emails, and research topics into structured JSON arrays. | `db/procedures/02_advanced_features.sql` |
| **Full-Text Search** | Stored `TSVECTOR` generated column (`search_vector`) on `PAPERS` indexed with a GIN index and queried with `websearch_to_tsquery` and `ts_rank`. | `db/schema/01_core_tables.sql`<br>`db/queries/05_demonstration_queries.sql` |
| **Vector Database (`pgvector`)** | `PAPER_EMBEDDINGS` and `REVIEWER_EMBEDDINGS` with 384-dimensional dense vectors, HNSW index (`vector_cosine_ops`), and cosine similarity search function `fn_find_similar_papers`. | `db/schema/06_vector_embeddings.sql`<br>`db/seeds/07_vector_seed_and_test.sql` |

---

## 3. Constraint Validation Test Results

All negative tests were executed against `scholarly_db` and verified:

```text
TEST 1: Duplicate email rejected -> unique_violation (PASSED)
TEST 2: Invalid conference dates (close < open) rejected -> check_violation (PASSED)
TEST 3: Invalid system role rejected -> check_violation (PASSED)
TEST 4: Non-existent conference_id rejected -> foreign_key_violation (PASSED)
TEST 5: Submission to closed conference rejected by trigger -> exception (PASSED)
TEST 6: Duplicate author order per paper rejected -> unique_violation (PASSED)
TEST 7: Conference deletion with active papers rejected -> ON DELETE RESTRICT (PASSED)
```

---

## 4. Analytical SQL Queries Demonstrated

1. **5-Table Multi-JOIN**: Links `CONFERENCES`, `PAPERS`, `PAPER_AUTHORS`, `PEOPLE`, and `AFFILIATIONS` to report accepted/submitted works with corresponding authors and institutional affiliations.
2. **GROUP BY & HAVING**: Conference submission statistics filtering conferences with $\ge 1$ submission.
3. **Subqueries**: Identifying prolific authors exceeding the platform's average submissions, and active authors not in review pools.
4. **Ranking Search Query**: Full-text and vector cosine similarity queries ranking matching research papers.

---

## 5. Web Application Endpoints & Pages

| Route | Type | Description |
| :--- | :--- | :--- |
| `/` | Page | Platform landing page detailing project architecture and quick actions. |
| `/login` | Page | Sign-in interface with credential authentication and demo seed helper. |
| `/register` | Page | User registration creating `PEOPLE`, `USER_ACCOUNTS`, and `AUTHOR_PROFILES`. |
| `/conferences` | Page | Searchable catalog of conferences with status badges and deadlines. |
| `/conferences/[id]` | Page | Detailed milestone schedule and organizing committee listing. |
| `/conferences/[id]/submit`| Page | Transactional multi-author and multi-topic research submission form. |
| `/dashboard` | Page | Author portal listing submitted papers, co-authors, topics, and status. |
| `/api/auth/register` | API | Atomic registration handler. |
| `/api/auth/login` | API | Password verification and JWT cookie issuance. |
| `/api/auth/session` | API | Session retrieval and logout handler. |
| `/api/conferences` | API | Search and filter conference listings. |
| `/api/conferences/[id]` | API | Conference detail and committee members. |
| `/api/papers` | API | GET author papers / POST transactional submission. |
| `/api/papers/[id]` | API | GET paper details / DELETE to withdraw paper. |
| `/api/topics` | API | Scientific taxonomy topics list. |
