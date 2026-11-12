# Scholarly — Review & Evaluation Pipeline

**Course**: DBMS Experiential Learning — Level 3 Project
**Author**: Sanchita Sunil
**Module**: Review & Evaluation (Reviewer Expertise, Conflicts of Interest, Assignments, Reviews, Decisions, Audit)
**Database**: PostgreSQL 16 (developed and verified), PostgreSQL 14+ compatible

Companion to `TECHNICAL_DOCUMENTATION.md`, which covers the Core Platform module
(the 12 identity, conference and submission tables).

---

## 1. Design Position

The guiding constraint for this module is that **the database enforces the review
rules, not the application**. Every invariant below is a trigger, a constraint or a
view, so it holds no matter which client writes to the database: the Next.js app,
`psql`, or a future admin script.

| Rule | Enforced by | Not by |
| :--- | :--- | :--- |
| A conflicted reviewer cannot be assigned | `trg_assignment_block_coi` | application validation |
| A reviewer cannot exceed their quota | `trg_assignment_enforce_load` with a row lock | counting in JavaScript |
| Authors never see reviewer identity | `v_author_review_feedback` projection | hiding fields in the UI |
| Reviewers never see author identity | `v_reviewer_paper_view` projection | hiding fields in the UI |
| One review per assignment, one decision per paper | `UNIQUE` constraints | API checks |
| Every pipeline write is recorded | `trg_fn_audit_row` | logging middleware |

---

## 2. Data Dictionary (6 Tables)

### 2.1 `REVIEWER_TOPICS` — reviewer expertise

Many-to-many between reviewers and the topics they are competent to judge. Drives
the expertise half of reviewer matching.

| Column | Type | Null | Key | Constraint |
| :--- | :--- | :--- | :--- | :--- |
| `reviewer_person_id` | `BIGINT` | NO | PK, FK → `REVIEWER_PROFILES` | `ON DELETE CASCADE` |
| `topic_id` | `BIGINT` | NO | PK, FK → `TOPICS` | `ON DELETE RESTRICT` |
| `expertise_level` | `SMALLINT` | NO | | `CHECK (1..5)`, default `3` |
| `declared_at` | `TIMESTAMPTZ` | NO | | default `NOW()` |

`expertise_level` runs 1 (peripheral familiarity) to 5 (primary research area).
`ON DELETE RESTRICT` on the topic prevents deleting a taxonomy entry that reviewers
still claim.

### 2.2 `CONFLICTS_OF_INTEREST` — detected and declared conflicts

One row per (paper, reviewer, reason). A reviewer can hit several reasons at once,
which is why the type is part of the uniqueness rule rather than the row identity.

| Column | Type | Null | Key | Constraint |
| :--- | :--- | :--- | :--- | :--- |
| `coi_id` | `BIGSERIAL` | NO | PK | |
| `paper_id` | `BIGINT` | NO | FK → `PAPERS` | `ON DELETE CASCADE` |
| `reviewer_person_id` | `BIGINT` | NO | FK → `PEOPLE` | `ON DELETE CASCADE` |
| `coi_type` | `VARCHAR(30)` | NO | | `CHECK IN ('self_authorship','co_authorship','shared_affiliation','declared')` |
| `detection_method` | `VARCHAR(10)` | NO | | `CHECK IN ('automatic','manual')`, default `'automatic'` |
| `detail` | `TEXT` | YES | | human-readable justification |
| `detected_at` | `TIMESTAMPTZ` | NO | | default `NOW()` |

`UNIQUE (paper_id, reviewer_person_id, coi_type)` makes detection idempotent: the
detector can be re-run any number of times without duplicating rows.

### 2.3 `REVIEW_ASSIGNMENTS` — reviewer to paper

| Column | Type | Null | Key | Constraint |
| :--- | :--- | :--- | :--- | :--- |
| `assignment_id` | `BIGSERIAL` | NO | PK | |
| `paper_id` | `BIGINT` | NO | FK → `PAPERS` | `ON DELETE CASCADE` |
| `reviewer_person_id` | `BIGINT` | NO | FK → `PEOPLE` | `ON DELETE RESTRICT` |
| `assigned_by_person_id` | `BIGINT` | YES | FK → `PEOPLE` | `ON DELETE SET NULL` |
| `assignment_status` | `VARCHAR(20)` | NO | | `CHECK IN ('pending','accepted','declined','completed','revoked')` |
| `assigned_at` | `TIMESTAMPTZ` | NO | | default `NOW()` |
| `due_at` | `TIMESTAMPTZ` | YES | | `CHECK (due_at > assigned_at)` |

`UNIQUE (paper_id, reviewer_person_id)` stops double assignment. The reviewer FK is
`RESTRICT` rather than `CASCADE` because deleting a person must not silently erase
the review history attached to them.

An assignment counts against a reviewer's quota only while its status is `pending`
or `accepted`; completing or declining releases the slot.

### 2.4 `REVIEWS` — the submitted evaluation

| Column | Type | Null | Key | Constraint |
| :--- | :--- | :--- | :--- | :--- |
| `review_id` | `BIGSERIAL` | NO | PK | |
| `assignment_id` | `BIGINT` | NO | FK → `REVIEW_ASSIGNMENTS`, `UNIQUE` | `ON DELETE CASCADE` |
| `overall_score` | `SMALLINT` | NO | | `CHECK (1..10)` |
| `confidence` | `SMALLINT` | NO | | `CHECK (1..5)`, default `3` |
| `recommendation` | `VARCHAR(20)` | NO | | `CHECK IN ('strong_reject'…'strong_accept')` |
| `comments_to_authors` | `TEXT` | NO | | returned to authors |
| `comments_to_chair` | `TEXT` | YES | | **confidential**, never in the author view |
| `review_status` | `VARCHAR(20)` | NO | | `CHECK IN ('draft','submitted')` |
| `submitted_at` | `TIMESTAMPTZ` | NO | | default `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | NO | | maintained by trigger |

`UNIQUE (assignment_id)` is what gives the one-review-per-assignment rule. Modelling
the review against the *assignment* rather than against (paper, reviewer) means a
review cannot exist without the assignment that authorised it.

### 2.5 `DECISIONS` — the chair's verdict

| Column | Type | Null | Key | Constraint |
| :--- | :--- | :--- | :--- | :--- |
| `decision_id` | `BIGSERIAL` | NO | PK | |
| `paper_id` | `BIGINT` | NO | FK → `PAPERS`, `UNIQUE` | `ON DELETE CASCADE` |
| `decided_by_person_id` | `BIGINT` | NO | FK → `PEOPLE` | `ON DELETE RESTRICT` |
| `outcome` | `VARCHAR(20)` | NO | | `CHECK IN ('accept','reject','major_revision','minor_revision')` |
| `rationale` | `TEXT` | YES | | |
| `decided_at` | `TIMESTAMPTZ` | NO | | default `NOW()` |

`UNIQUE (paper_id)` is the entire "exactly one final decision per paper" rule.

### 2.6 `AUDIT_LOG` — append-only trail

| Column | Type | Null | Key | Constraint |
| :--- | :--- | :--- | :--- | :--- |
| `audit_id` | `BIGSERIAL` | NO | PK | |
| `table_name` | `VARCHAR(60)` | NO | | |
| `operation` | `VARCHAR(10)` | NO | | `CHECK IN ('INSERT','UPDATE','DELETE')` |
| `record_pk` | `TEXT` | NO | | primary key of the audited row |
| `actor_person_id` | `BIGINT` | YES | FK → `PEOPLE` | `ON DELETE SET NULL` |
| `old_data` | `JSONB` | YES | | full row before the change |
| `new_data` | `JSONB` | YES | | full row after the change |
| `occurred_at` | `TIMESTAMPTZ` | NO | | default `NOW()` |

Storing whole rows as `JSONB` means one audit table serves every audited table, and
the trail survives later schema changes.

---

## 3. Conflict of Interest Detection

Three rules, evaluated against live data rather than a cached table:

1. **Self-authorship** — the reviewer is listed in `PAPER_AUTHORS` for this paper.
2. **Co-authorship** — the reviewer co-authored *some other* paper with any author
   of this one. Implemented as a three-way self-join on `PAPER_AUTHORS`.
3. **Shared affiliation** — the reviewer and an author both hold a *current*
   affiliation (`end_date IS NULL OR end_date >= CURRENT_DATE`) at the same
   institution.

`fn_has_conflict(paper_id, reviewer_id)` returns the live verdict and additionally
honours any row already in `CONFLICTS_OF_INTEREST`, which is how manually declared
conflicts enter the system.

`fn_detect_conflicts_for_paper(paper_id)` materialises all three rules into the COI
table for every active reviewer on the paper's conference, and returns the number
of new rows. It is idempotent.

`trg_paper_authors_refresh_coi` re-runs detection whenever a paper's author list
changes, so conflicts cannot go stale when a co-author is added late.

> **Implementation note.** That refresh trigger fires on cascade deletes too. When a
> paper is deleted its `PAPER_AUTHORS` rows cascade away and the trigger runs against
> a paper that no longer exists. The function guards on the paper still being present;
> without that guard, deleting any paper aborts with "paper does not exist". This is
> covered by TEST 15.

---

## 4. Reviewer Assignment

`sp_assign_reviewers(paper_id, k, assigned_by, due_in_days, OUT assigned_count)`

1. Runs conflict detection for the paper.
2. Reads the ranked candidate list from `fn_eligible_reviewers(paper_id)`.
3. Inserts assignments until `k` are placed.
4. Moves the paper to `under_review` if at least one reviewer was assigned.
5. Raises a `NOTICE` if fewer than `k` could be placed.

**Ranking** is expertise first, load second:

```
ORDER BY  SUM(expertise_level) over shared topics  DESC,
          current active assignments               ASC,
          person_id                                ASC
```

**Eligibility** requires all of: registered reviewer on that conference, active
membership, active reviewer profile, no conflict, and current load below the cap.

Each insert is wrapped in its own exception block, so a reviewer who becomes
ineligible between ranking and insertion is skipped rather than aborting the run.
The triggers still fire on every insert, so the procedure cannot bypass the rules it
is trying to respect.

---

## 5. Reviewer Quota Under Concurrency

`trg_fn_enforce_reviewer_load` runs `BEFORE INSERT OR UPDATE` on
`REVIEW_ASSIGNMENTS`:

```sql
SELECT max_active_assignments INTO v_max
FROM CONFERENCE_MEMBERSHIPS
WHERE conference_id = ... AND person_id = ... AND role = 'reviewer'
FOR UPDATE;          -- <- the row lock that makes this concurrency safe
```

The `FOR UPDATE` is load-bearing. Two sessions assigning the same reviewer
simultaneously serialise on that membership row: the second blocks until the first
commits, then re-counts and sees the slot is taken. Without it both sessions read
the same stale count and both pass the check, overfilling the reviewer.

Verified by `db/tests/13_concurrency_test.sh`, which pins a reviewer's cap so exactly
one slot is free and fires two overlapping sessions at it. Observed output:

```
Cap pinned to 4, so exactly one slot is free.
  [session A] inserted, holding transaction open
  [session A] committed
  [session B] ERROR:  Reviewer workload exceeded: reviewer 101 already holds
                      4 of 4 permitted active assignments on conference 4
Assignments created by the race : 1 (expected 1)
PASSED: exactly one session claimed the last slot; the cap held.
```

---

## 6. Double-Blind Views

Blinding is structural: the columns a role must not see are simply absent from its
view, so no application bug can leak them.

| View | Audience | Shows | Deliberately omits |
| :--- | :--- | :--- | :--- |
| `v_reviewer_paper_view` | assigned reviewer | title, abstract, topics, deadline, author **count** | author names, emails, affiliations, other reviewers |
| `v_author_review_feedback` | paper author | scores, confidence, recommendation, comments to authors, anonymous reviewer labels | `reviewer_person_id`, `comments_to_chair`, `assignment_id` |
| `v_chair_paper_overview` | programme chair | everything: reviewer identities, mean/min/max, spread, stddev, conflict count, decision | nothing |

`v_author_review_feedback` generates its anonymous labels with
`ROW_NUMBER() OVER (PARTITION BY paper_id ORDER BY review_id)`, so an author sees
"Reviewer 1", "Reviewer 2" consistently without any stable identifier that could be
correlated across papers.

TEST 12 and TEST 13 assert against `information_schema.columns`, so the tests fail
if someone later adds an identifying column to either view.

---

## 7. Analytical Queries

`db/queries/11_review_analytics.sql` — ten queries, each annotated with the SQL
feature it demonstrates.

| # | Query | SQL features |
| :--- | :--- | :--- |
| Q1 | Papers with widest reviewer disagreement | `GROUP BY`, `HAVING`, `MIN`/`MAX`/`AVG`/`STDDEV_SAMP` |
| Q2 | Reviewer scoring bias vs co-reviewers | window functions, leave-one-out aggregation |
| Q3 | Papers with no conflict-free topic expert | correlated `NOT EXISTS` |
| Q4 | Conflict breakdown by type and method | five-table join |
| Q5 | Reviewer workload against cap | `LEFT JOIN`, computed utilisation |
| Q6 | Topics where committee expertise is thin | non-correlated subqueries, `HAVING` |
| Q7 | Assignments with no topic overlap | anti-join via `NOT EXISTS` |
| Q8 | Decision outcomes vs mean review score | `CASE` pivot, `FILTER` |
| Q9 | Full-text search over submissions | `tsvector @@ to_tsquery`, `ts_rank`, GIN index |
| Q10 | Audit trail summary and status transitions | `JSONB` extraction |

**Q2 is the interesting one.** Comparing a reviewer's score to the *mean of the other
reviewers on the same paper* controls for paper quality, so what remains is the
reviewer's own calibration. On the synthetic dataset it correctly isolates the two
reviewers given deliberate bias during seeding:

```
 reviewer |      full_name     | reviews | own_mean | co_reviewer_mean |  bias | assessment
----------+--------------------+---------+----------+------------------+-------+------------------
      101 | Marcus Rossi (R1)  |       5 |     1.80 |             6.80 | -5.00 | markedly harsh
      102 | Yuki Noor (R2)     |       9 |     8.78 |             4.83 |  3.94 | markedly lenient
```

---

## 8. Synthetic Dataset

`db/seeds/10_review_seed_data.sql` builds the evaluation set. It is deterministic
(fixed `setseed` plus `md5`-based ordering) and idempotent, so repeated runs give
identical data.

| Entity | Count |
| :--- | ---: |
| Reviewers | 50 |
| Authors | 40 |
| Papers | 200 |
| Conflicts detected | 2,873 |
| — shared affiliation | 1,756 |
| — co-authorship | 593 |
| — self-authorship | 524 |
| Assignments placed | 600 (3 per paper, 0 papers short) |
| Reviews submitted | 480 |
| Decisions recorded | 67 |

Two deliberate design choices in the seed:

- **Eight reviewers also submit papers.** Without this the reviewer and author pools
  are disjoint, the co-authorship rule can never fire, and the headline feature goes
  untested. This mirrors reality, where programme committee members submit too.
- **Two reviewers are given scoring bias** (101 harsh, 102 lenient) so the bias query
  in Q2 has a real signal to recover rather than only noise.

Bulk loading disables the COI refresh trigger and runs detection once at the end;
leaving it enabled re-scans all 50 reviewers on each of ~500 author-row inserts.

---

## 9. Test Results

### 9.1 Constraint and negative tests — `db/tests/12_review_constraint_tests.sql`

All 15 pass against PostgreSQL 16.15.

| # | Test | Expected rejection |
| :--- | :--- | :--- |
| 1 | Author assigned to review their own paper | COI trigger |
| 2 | Co-author assigned as reviewer | COI trigger |
| 3 | Institutional colleague assigned as reviewer | COI trigger |
| 4 | Reviewer assigned beyond quota | workload trigger |
| 5 | Non-reviewer assigned to a paper | workload trigger (membership check) |
| 6 | Same reviewer assigned twice to one paper | `UNIQUE (paper_id, reviewer_person_id)` |
| 7 | Two reviews for one assignment | `UNIQUE (assignment_id)` |
| 8 | Two decisions for one paper | `UNIQUE (paper_id)` |
| 9 | Review score of 42 on a 1–10 scale | `CHECK` |
| 10 | Recommendation `'maybe_later'` | `CHECK` |
| 11 | Expertise level 9 on a 1–5 scale | `CHECK` |
| 12 | Author view exposing reviewer identity | `information_schema` assertion |
| 13 | Reviewer view exposing author identity | `information_schema` assertion |
| 14 | Audit row written for a review insert | positive assertion |
| 15 | Paper delete cascading cleanly (regression) | positive assertion |

Tests 4, 14 and 15 create and clean up their own fixtures, so the suite is
re-runnable and leaves no residue.

### 9.2 Concurrency test — `db/tests/13_concurrency_test.sh`

Passes. See section 5 for the captured output.

---

## 10. Running This Module

```bash
# From a database that already has the Core Platform loaded
psql -d scholarly -f db/schema/08_review_tables.sql
psql -d scholarly -f db/procedures/09_review_features.sql
psql -d scholarly -f db/seeds/10_review_seed_data.sql
psql -d scholarly -f db/queries/11_review_analytics.sql
psql -d scholarly -f db/tests/12_review_constraint_tests.sql
./db/tests/13_concurrency_test.sh scholarly
```

Full setup from an empty database is in the repository `README.md`.

---

## 11. Web Application Surface

| Route | Type | Description |
| :--- | :--- | :--- |
| `/reviewer` | Page | Reviewer dashboard: assignment queue and review submission form. |
| `/api/assignments` | API | `GET` the caller's assignment queue, read from `v_reviewer_paper_view`. |
| `/api/reviews` | API | `GET` author-visible feedback from `v_author_review_feedback`; `POST` to submit a review. |

Both endpoints read through the double-blind views rather than the base tables, so
the blinding holds even if the query in the route were modified carelessly: the
columns simply are not there to select.

`POST /api/reviews` opens a transaction and calls
`set_config('scholarly.actor_person_id', ..., true)` before inserting, so the audit
trigger records who submitted the review. Verified against a live server:

```
 audit_id | table_name | operation | record_pk | actor_person_id
----------+------------+-----------+-----------+-----------------
     4412 | reviews    | INSERT    | 969       |             105
```

Rows seeded in bulk carry a `NULL` actor, which correctly distinguishes machine
loading from a human action.

Observed endpoint behaviour against the seeded database:

| Request | Result |
| :--- | :--- |
| Valid review submission | `201`, assignment auto-flipped to `completed` by trigger |
| Second review for the same assignment | `409` from `UNIQUE (assignment_id)` |
| Score of 42 on a 1–10 scale | `400` |
| Review against another reviewer's assignment | `404` |

Seeded reviewers can sign in with their generated addresses, for example
`reviewer1@scholarly-icdms.org`, password `Password123!`.

> The reviewer dashboard is reachable at `/reviewer` but is not yet linked from
> `Navbar.tsx`, which belongs to the Core Platform module. Adding the link is a
> one-line change and was left out to avoid a merge conflict.

---

## 12. Known Limitations

- **Conflict detection is scoped to registered reviewers** on the paper's
  conference. A person who is not a committee member generates no COI rows, though
  `fn_has_conflict` would still block them live if they were assigned.
- **Shared-affiliation conflicts use current affiliations only.** A reviewer who left
  the author's institution last year is not flagged. Real venues commonly use a
  rolling window of two to five years; that would be a `start_date`/`end_date`
  overlap test against an interval rather than against `CURRENT_DATE`.
- **`fn_eligible_reviewers` calls `fn_has_conflict` per candidate**, which is correct
  but does more work than a set-based anti-join against `CONFLICTS_OF_INTEREST`. At
  50 reviewers and 200 papers the full assignment run completes in roughly two
  seconds, so this was left readable rather than optimised.
- **Vector-based expertise matching is not wired into assignment.** The
  `REVIEWER_EMBEDDINGS` table from the Core Platform module could supply a semantic
  similarity score to complement declared topics; ranking currently uses declared
  topics only.
- **On the synthetic dataset, Q3 returns no rows**, because 50 reviewers across 18
  topics are enough to staff every paper. The query is correct; the dataset is simply
  not adversarial enough to trigger it. A smaller committee or a more concentrated
  set of affiliations would produce unstaffable papers.
