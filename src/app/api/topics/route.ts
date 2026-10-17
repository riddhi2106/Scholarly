import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const res = await query('SELECT topic_id, topic_name, description FROM TOPICS ORDER BY topic_name ASC');
    return NextResponse.json({ topics: res.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch topics' }, { status: 500 });
  }
}
