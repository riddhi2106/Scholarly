import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let sql = `
      SELECT 
        c.conference_id,
        c.name,
        c.acronym,
        c.year,
        c.description,
        c.submission_open_at,
        c.submission_close_at,
        c.review_deadline,
        c.status,
        c.created_at,
        COUNT(p.paper_id)::INT AS total_submissions
      FROM CONFERENCES c
      LEFT JOIN PAPERS p ON c.conference_id = p.conference_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (c.name ILIKE $${params.length} OR c.acronym ILIKE $${params.length})`;
    }

    sql += `
      GROUP BY c.conference_id
      ORDER BY c.year DESC, c.submission_close_at ASC
    `;

    const result = await query(sql, params);
    return NextResponse.json({ conferences: result.rows });
  } catch (error: any) {
    console.error('Error fetching conferences:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch conferences' }, { status: 500 });
  }
}
