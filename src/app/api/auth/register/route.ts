import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { hashPassword, signToken, COOKIE_NAME, AuthSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullName, email, password } = body;

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Full name, email, and password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await query('SELECT person_id FROM PEOPLE WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json(
        { error: 'An account with this email address already exists.' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Atomic transaction for PEOPLE, USER_ACCOUNTS, and AUTHOR_PROFILES
    const client = await getClient();
    let newPersonId: number;
    let newAccountId: number;

    try {
      await client.query('BEGIN');

      // 1. Insert into PEOPLE
      const personRes = await client.query(
        `INSERT INTO PEOPLE (full_name, email) VALUES ($1, $2) RETURNING person_id`,
        [fullName, email]
      );
      newPersonId = Number(personRes.rows[0].person_id);

      // 2. Insert into USER_ACCOUNTS
      const accountRes = await client.query(
        `INSERT INTO USER_ACCOUNTS (person_id, password_hash, system_role, account_status)
         VALUES ($1, $2, 'user', 'active')
         RETURNING account_id`,
        [newPersonId, passwordHash]
      );
      newAccountId = Number(accountRes.rows[0].account_id);

      // 3. Insert default AUTHOR_PROFILES
      await client.query(
        `INSERT INTO AUTHOR_PROFILES (person_id, profile_status) VALUES ($1, 'active')`,
        [newPersonId]
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Create session token
    const session: AuthSession = {
      personId: newPersonId,
      accountId: newAccountId,
      email: email,
      fullName: fullName,
      role: 'user',
    };

    const token = signToken(session);

    const response = NextResponse.json({
      success: true,
      user: session,
      message: 'Account created successfully.',
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
