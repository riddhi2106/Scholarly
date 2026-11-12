import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_RECOMMENDATIONS = [
  'strong_reject',
  'reject',
  'weak_reject',
  'borderline',
  'weak_accept',
  'accept',
  'strong_accept',
];

/**
 * GET: Reviews an author may see for their own papers.
 *
 * Reads v_author_review_feedback, which exposes scores and comments to authors
 * under anonymous labels and omits reviewer_person_id and comments_to_chair
 * entirely. The ownership check restricts the rows to papers the caller
 * actually authored.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paperId = searchParams.get('paperId');

    const params: any[] = [session.personId];
    let sql = `
      SELECT f.*
      FROM v_author_review_feedback f
      WHERE EXISTS (
        SELECT 1 FROM PAPER_AUTHORS pa
        WHERE pa.paper_id = f.paper_id
          AND pa.author_person_id = $1
      )
    `;

    if (paperId) {
      params.push(paperId);
      sql += ` AND f.paper_id = $2`;
    }

    sql += ` ORDER BY f.paper_id, f.reviewer_label`;

    const result = await query(sql, params);
    return NextResponse.json({ reviews: result.rows });
  } catch (err: any) {
    console.error('[GET /api/reviews]', err);
    return NextResponse.json({ error: 'Failed to load reviews.' }, { status: 500 });
  }
}

/**
 * POST: Submit a review against one of the caller's own assignments.
 *
 * The database does the rest: trg_review_complete_assignment flips the
 * assignment to 'completed' and trg_audit_reviews writes the audit row. The
 * transaction sets scholarly.actor_person_id so the audit trail records who
 * acted.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      assignmentId,
      overallScore,
      confidence,
      recommendation,
      commentsToAuthors,
      commentsToChair,
    } = body;

    if (!assignmentId || overallScore === undefined || !recommendation || !commentsToAuthors) {
      return NextResponse.json(
        {
          error:
            'assignmentId, overallScore, recommendation and commentsToAuthors are required.',
        },
        { status: 400 }
      );
    }

    const score = Number(overallScore);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      return NextResponse.json(
        { error: 'overallScore must be a whole number between 1 and 10.' },
        { status: 400 }
      );
    }

    const conf = confidence === undefined ? 3 : Number(confidence);
    if (!Number.isInteger(conf) || conf < 1 || conf > 5) {
      return NextResponse.json(
        { error: 'confidence must be a whole number between 1 and 5.' },
        { status: 400 }
      );
    }

    if (!VALID_RECOMMENDATIONS.includes(recommendation)) {
      return NextResponse.json(
        { error: `recommendation must be one of: ${VALID_RECOMMENDATIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Name the actor for the audit trigger, scoped to this transaction
      await client.query('SELECT set_config($1, $2, true)', [
        'scholarly.actor_person_id',
        String(session.personId),
      ]);

      // The assignment must exist and belong to the caller
      const owned = await client.query(
        `SELECT assignment_id, assignment_status
           FROM REVIEW_ASSIGNMENTS
          WHERE assignment_id = $1 AND reviewer_person_id = $2`,
        [assignmentId, session.personId]
      );

      if (owned.rowCount === 0) {
        throw Object.assign(new Error('Assignment not found for this reviewer.'), {
          status: 404,
        });
      }

      if (owned.rows[0].assignment_status === 'revoked') {
        throw Object.assign(new Error('This assignment has been revoked.'), {
          status: 409,
        });
      }

      const inserted = await client.query(
        `INSERT INTO REVIEWS (
            assignment_id, overall_score, confidence, recommendation,
            comments_to_authors, comments_to_chair, review_status
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
         RETURNING review_id, submitted_at`,
        [
          assignmentId,
          score,
          conf,
          recommendation,
          commentsToAuthors,
          commentsToChair || null,
        ]
      );

      await client.query('COMMIT');

      return NextResponse.json(
        {
          message: 'Review submitted.',
          review: inserted.rows[0],
        },
        { status: 201 }
      );
    } catch (err: any) {
      await client.query('ROLLBACK');

      // 23505 unique_violation: a review already exists for this assignment
      if (err.code === '23505') {
        return NextResponse.json(
          { error: 'You have already submitted a review for this assignment.' },
          { status: 409 }
        );
      }

      // 23514 check_violation: a value fell outside a CHECK constraint
      if (err.code === '23514') {
        return NextResponse.json(
          { error: 'A submitted value was outside the permitted range.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: err.message || 'Failed to submit review.' },
        { status: err.status || 500 }
      );
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[POST /api/reviews]', err);
    return NextResponse.json({ error: 'Failed to submit review.' }, { status: 500 });
  }
}
