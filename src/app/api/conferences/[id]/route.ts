import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const confId = parseInt(id, 10);
    if (isNaN(confId)) {
      return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
    }

    const confRes = await query(
      `SELECT 
        c.*,
        COUNT(p.paper_id)::INT AS total_submissions
       FROM CONFERENCES c
       LEFT JOIN PAPERS p ON c.conference_id = p.conference_id
       WHERE c.conference_id = $1
       GROUP BY c.conference_id`,
      [confId]
    );

    if (confRes.rowCount === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Get members/chairs
    const membersRes = await query(
      `SELECT 
        cm.role,
        cm.membership_status,
        p.person_id,
        p.full_name,
        p.email
       FROM CONFERENCE_MEMBERSHIPS cm
       JOIN PEOPLE p ON cm.person_id = p.person_id
       WHERE cm.conference_id = $1
       ORDER BY cm.role ASC`,
      [confId]
    );

    return NextResponse.json({
      conference: confRes.rows[0],
      members: membersRes.rows,
    });
  } catch (error: any) {
    console.error('Error fetching conference details:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
