import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const paperId = parseInt(id, 10);
    if (isNaN(paperId)) {
      return NextResponse.json({ error: 'Invalid paper ID' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = `
      SELECT 
        p.*,
        c.name AS conference_name,
        c.acronym AS conference_acronym,
        c.year AS conference_year,
        creator.full_name AS creator_name,
        creator.email AS creator_email,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('topic_id', t.topic_id, 'topic_name', t.topic_name)) 
          FILTER (WHERE t.topic_id IS NOT NULL), '[]'::json
        ) AS topics,
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
      WHERE p.paper_id = $1
      GROUP BY p.paper_id, c.conference_id, creator.person_id
    `;

    const res = await query(sql, [paperId]);
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    return NextResponse.json({ paper: res.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE: Withdraw submission if allowed
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const paperId = parseInt(id, 10);
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const check = await query(
      'SELECT created_by_person_id, submission_status FROM PAPERS WHERE paper_id = $1',
      [paperId]
    );

    if (check.rowCount === 0) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    const paper = check.rows[0];
    if (Number(paper.created_by_person_id) !== session.personId && session.role !== 'admin') {
      return NextResponse.json({ error: 'Only the submitter can withdraw this paper.' }, { status: 403 });
    }

    await query(
      `UPDATE PAPERS SET submission_status = 'withdrawn' WHERE paper_id = $1`,
      [paperId]
    );

    return NextResponse.json({ success: true, message: 'Paper status set to withdrawn.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
