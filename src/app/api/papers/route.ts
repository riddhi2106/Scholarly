import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET: Fetch papers submitted by the currently logged-in author
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q');

    let sql = `
      SELECT 
        p.paper_id,
        p.title,
        p.abstract,
        p.submission_status,
        p.submitted_at,
        p.updated_at,
        c.conference_id,
        c.name AS conference_name,
        c.acronym AS conference_acronym,
        c.year AS conference_year,
        creator.person_id AS creator_person_id,
        creator.full_name AS creator_name,
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
      JOIN PAPER_AUTHORS my_auth ON p.paper_id = my_auth.paper_id AND my_auth.author_person_id = $1
      LEFT JOIN PAPER_TOPICS pt ON p.paper_id = pt.paper_id
      LEFT JOIN TOPICS t ON pt.topic_id = t.topic_id
      LEFT JOIN PAPER_AUTHORS pa ON p.paper_id = pa.paper_id
      LEFT JOIN PEOPLE pe ON pa.author_person_id = pe.person_id
    `;

    const params: any[] = [session.personId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` WHERE (p.title ILIKE $2 OR p.abstract ILIKE $2)`;
    }

    sql += `
      GROUP BY p.paper_id, c.conference_id, creator.person_id
      ORDER BY p.submitted_at DESC
    `;

    const result = await query(sql, params);
    return NextResponse.json({ papers: result.rows });
  } catch (error: any) {
    console.error('Error fetching author papers:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch papers' }, { status: 500 });
  }
}

/**
 * POST: Submit a new paper atomically via procedure / transaction
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const body = await request.json();
    const { conferenceId, title, abstract, coAuthors, topicIds } = body;

    if (!conferenceId || !title || !abstract) {
      return NextResponse.json(
        { error: 'Conference, title, and abstract are required.' },
        { status: 400 }
      );
    }

    if (!topicIds || topicIds.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one topic for your submission.' },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Verify conference is open
      const confCheck = await client.query(
        'SELECT status, submission_open_at, submission_close_at FROM CONFERENCES WHERE conference_id = $1',
        [conferenceId]
      );

      if (confCheck.rowCount === 0) {
        throw new Error('Selected conference does not exist.');
      }

      const conf = confCheck.rows[0];
      const now = new Date();
      if (conf.status !== 'open' || now < new Date(conf.submission_open_at) || now > new Date(conf.submission_close_at)) {
        throw new Error('Conference submission window is closed.');
      }

      // 2. Insert into PAPERS
      const paperRes = await client.query(
        `INSERT INTO PAPERS (conference_id, title, abstract, submission_status, created_by_person_id)
         VALUES ($1, $2, $3, 'submitted', $4)
         RETURNING paper_id`,
        [conferenceId, title, abstract, session.personId]
      );
      const newPaperId = Number(paperRes.rows[0].paper_id);

      // 3. Process Authors
      // Primary author (logged-in user) is order 1 and corresponding author
      await client.query(
        `INSERT INTO AUTHOR_PROFILES (person_id, profile_status)
         VALUES ($1, 'active')
         ON CONFLICT (person_id) DO NOTHING`,
        [session.personId]
      );

      await client.query(
        `INSERT INTO PAPER_AUTHORS (paper_id, author_person_id, author_order, is_corresponding)
         VALUES ($1, $2, 1, TRUE)`,
        [newPaperId, session.personId]
      );

      // Process additional co-authors if provided
      if (Array.isArray(coAuthors)) {
        let currentOrder = 2;
        for (const author of coAuthors) {
          if (!author.email || !author.fullName) continue;

          // Find or create person
          let personId: number;
          const existingPerson = await client.query(
            'SELECT person_id FROM PEOPLE WHERE email = $1',
            [author.email.trim()]
          );

          if (existingPerson.rowCount && existingPerson.rowCount > 0) {
            personId = Number(existingPerson.rows[0].person_id);
          } else {
            const createPerson = await client.query(
              'INSERT INTO PEOPLE (full_name, email) VALUES ($1, $2) RETURNING person_id',
              [author.fullName.trim(), author.email.trim()]
            );
            personId = Number(createPerson.rows[0].person_id);
          }

          // Ensure author profile exists
          await client.query(
            `INSERT INTO AUTHOR_PROFILES (person_id, profile_status)
             VALUES ($1, 'active')
             ON CONFLICT (person_id) DO NOTHING`,
            [personId]
          );

          // Insert into PAPER_AUTHORS
          await client.query(
            `INSERT INTO PAPER_AUTHORS (paper_id, author_person_id, author_order, is_corresponding)
             VALUES ($1, $2, $3, FALSE)`,
            [newPaperId, personId, currentOrder++]
          );
        }
      }

      // 4. Link Topics
      for (const topicId of topicIds) {
        await client.query(
          `INSERT INTO PAPER_TOPICS (paper_id, topic_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [newPaperId, topicId]
        );
      }

      // 5. Ensure Conference Membership
      await client.query(
        `INSERT INTO CONFERENCE_MEMBERSHIPS (conference_id, person_id, role, membership_status)
         VALUES ($1, $2, 'author', 'active')
         ON CONFLICT (conference_id, person_id, role) DO NOTHING`,
        [conferenceId, session.personId]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        paperId: newPaperId,
        message: 'Paper successfully submitted!',
      });
    } catch (txError: any) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Submission error:', error);
    return NextResponse.json(
      { error: error.message || 'Submission failed' },
      { status: 400 }
    );
  }
}
