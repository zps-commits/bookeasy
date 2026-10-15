import { redirect } from 'next/navigation';
import { adminAvailable, isSignedIn } from './session';

/**
 * Every admin route calls this first. A route that forgets to is the gap
 * that per-route permission lists always eventually produce, so there is
 * exactly one of these and it is not optional.
 */
export async function requireAdmin(): Promise<void> {
  if (!adminAvailable()) redirect('/admin/login');
  if (!(await isSignedIn())) redirect('/admin/login');
}
