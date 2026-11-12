import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET: The logged-in reviewer's assignment queue.
 *
 * Reads from v_reviewer_paper_view, which is the double-blind projection: it
 * carries the paper content and topics but deliberately contains no author
 * identity. Blinding is enforced by the view, not by filtering here, so this
 * endpoint cannot leak author names even if it tried to select them.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const result = await query(
      `
      SELECT
        v.assignment_id,
        v.assignment_status,
        v.assigned_at,
        v.due_at,
        v.paper_id,
        v.title,
        v.abstract,
        v.conference_acronym,
        v.conference_year,
        v.review_deadline,
        v.topics,
        v.author_count,
        r.review_id,
        r.overall_score,
        r.confidence,
        r.recommendation,
        r.submitted_at AS review_submitted_at
      FROM v_reviewer_paper_view v
      LEFT JOIN REVIEWS r ON r.assignment_id = v.assignment_id
      WHERE v.reviewer_person_id = $1
        AND v.assignment_status <> 'revoked'
      ORDER BY
        (r.review_id IS NOT NULL),   -- outstanding work first
        v.due_at NULLS LAST,
        v.assignment_id
      `,
      [session.personId]
    );

    const assignments = result.rows;

    return NextResponse.json({
      assignments,
      summary: {
        total: assignments.length,
        pending: assignments.filter((a: any) => !a.review_id).length,
        completed: assignments.filter((a: any) => a.review_id).length,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/assignments]', err);
    return NextResponse.json(
      { error: 'Failed to load review assignments.' },
      { status: 500 }
    );
  }
}
