import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-scholarly-jwt-token-key-2026';
const COOKIE_NAME = 'scholarly_token';

export interface AuthSession {
  personId: number;
  accountId: number;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
}

/**
 * Hash a plain text password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verify a plain text password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Sign a JWT token for a session
 */
export function signToken(session: AuthSession): string {
  return jwt.sign(session, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): AuthSession | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthSession;
  } catch (err) {
    return null;
  }
}

/**
 * Get the currently logged-in user session from HTTP-only cookie
 */
export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { COOKIE_NAME };
