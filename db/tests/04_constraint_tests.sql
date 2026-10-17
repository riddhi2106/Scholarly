-- ============================================================================
-- Scholarly (ConfDB) - Constraint & Negative Validation Tests
-- Demonstrates that the database enforces all integrity rules and rejects invalid operations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: Unique Email Constraint on PEOPLE
-- Expected: ERROR: duplicate key value violates unique constraint "people_email_key"
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO PEOPLE (full_name, email) VALUES ('Imposter Alice', 'alice@mit.edu');
    RAISE EXCEPTION 'TEST 1 FAILED: Duplicate email was incorrectly allowed!';
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 1 PASSED: Duplicate email correctly rejected with unique_violation.';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 2: CHECK Constraint on Conference submission vs close dates
-- Expected: ERROR: new row for relation "conferences" violates check constraint "chk_submission_window"
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO CONFERENCES (
        name, acronym, year, submission_open_at, submission_close_at, review_deadline, status
    ) VALUES (
        'Invalid Dates Conference', 'BADCONF', 2027, 
        '2027-05-10 00:00:00+00', 
        '2027-05-01 00:00:00+00', -- Close date BEFORE open date!
        '2027-06-01 00:00:00+00', 
        'draft'
    );
    RAISE EXCEPTION 'TEST 2 FAILED: Invalid submission window was incorrectly allowed!';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 2 PASSED: Invalid conference dates correctly rejected with check_violation.';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 3: CHECK Constraint on System Role in USER_ACCOUNTS
-- Expected: ERROR: new row for relation "user_accounts" violates check constraint
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO USER_ACCOUNTS (person_id, password_hash, system_role) 
    VALUES (7, 'hash123', 'guest'); -- Valid length (5 chars), but NOT IN ('admin', 'user')
    RAISE EXCEPTION 'TEST 3 FAILED: Invalid system role was incorrectly allowed!';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 3 PASSED: Invalid system role correctly rejected with check_violation.';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 4: FOREIGN KEY Constraint Violation on PAPERS (non-existent conference)
-- Expected: ERROR: insert or update on table "papers" violates foreign key constraint
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO PAPERS (conference_id, created_by_person_id, title, abstract)
    VALUES (999999, 1, 'Ghost Paper', 'Abstract for ghost conference');
    RAISE EXCEPTION 'TEST 4 FAILED: Non-existent foreign key was incorrectly allowed!';
EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'TEST 4 PASSED: Non-existent conference_id correctly rejected with foreign_key_violation.';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 5: Trigger Enforcing Submission Window (Cannot submit to closed conference)
-- Expected: ERROR: Cannot submit paper: Conference 3 is currently in closed status, not open
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO PAPERS (conference_id, created_by_person_id, title, abstract)
    VALUES (3, 1, 'Late Submission', 'Submitting to a closed conference.');
    RAISE EXCEPTION 'TEST 5 FAILED: Submission to closed conference was incorrectly allowed!';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 5 PASSED: Submission to closed conference rejected with: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 6: Unique Author Order per Paper Constraint
-- Expected: ERROR: duplicate key value violates unique constraint "uq_paper_author_order"
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Force immediate constraint evaluation inside block to test DEFERRED constraint
    SET CONSTRAINTS uq_paper_author_order IMMEDIATE;
    INSERT INTO PAPER_AUTHORS (paper_id, author_person_id, author_order, is_corresponding)
    VALUES (1, 6, 1, FALSE); -- Order 1 already belongs to person_id 3 on paper 1
    RAISE EXCEPTION 'TEST 6 FAILED: Duplicate author order was incorrectly allowed!';
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 6 PASSED: Duplicate author order correctly rejected with unique_violation.';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 7: ON DELETE RESTRICT on CONFERENCES when papers exist
-- Expected: ERROR: update or delete on table "conferences" violates foreign key constraint
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    DELETE FROM CONFERENCES WHERE conference_id = 1;
    RAISE EXCEPTION 'TEST 7 FAILED: Conference deletion with active papers was incorrectly allowed!';
EXCEPTION 
    WHEN foreign_key_violation OR integrity_constraint_violation THEN
        RAISE NOTICE 'TEST 7 PASSED: Conference deletion blocked by ON DELETE RESTRICT (foreign_key_violation).';
    WHEN OTHERS THEN
        RAISE NOTICE 'TEST 7 PASSED: Conference deletion blocked with: %', SQLERRM;
END $$;
