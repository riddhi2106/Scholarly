import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, signToken, COOKIE_NAME, AuthSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    // Query user credentials joined with people
    const res = await query(
      `SELECT 
        u.account_id, 
        u.person_id, 
        u.password_hash, 
        u.system_role, 
        u.account_status,
        p.full_name, 
        p.email
       FROM USER_ACCOUNTS u
       JOIN PEOPLE p ON u.person_id = p.person_id
       WHERE p.email = $1`,
      [email]
    );

    if (res.rowCount === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const user = res.rows[0];

    if (user.account_status !== 'active') {
      return NextResponse.json(
        { error: `Account is ${user.account_status}. Please contact administrator.` },
        { status: 403 }
      );
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Update last_login_at
    await query('UPDATE USER_ACCOUNTS SET last_login_at = NOW() WHERE account_id = $1', [user.account_id]);

    const session: AuthSession = {
      personId: Number(user.person_id),
      accountId: Number(user.account_id),
      email: user.email,
      fullName: user.full_name,
      role: user.system_role,
    };

    const token = signToken(session);

    const response = NextResponse.json({
      success: true,
      user: session,
      message: 'Logged in successfully.',
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
