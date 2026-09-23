import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialAdmin } from '../lib/initial-access';
const user = { id: 'verified', email: 'admin@example.test', email_confirmed_at: '2026-01-01', is_anonymous: false };
test('initial admin visibility requires verified identity and enabled admin access', async () => {
  const request = async () => Response.json(user);
  assert.equal(await resolveInitialAdmin('token', request, async () => ({ enabled: true, role: 'admin' })), true);
  assert.equal(await resolveInitialAdmin('token', request, async () => ({ enabled: false, role: 'admin' })), false);
  assert.equal(await resolveInitialAdmin('token', request, async () => ({ enabled: true, role: 'user' })), false);
  assert.equal(await resolveInitialAdmin('token', request, async () => null), false);
  assert.equal(await resolveInitialAdmin(undefined, async () => { throw new Error('must not fetch'); }), false);
  assert.equal(await resolveInitialAdmin('bad', async () => new Response('', { status: 401 })), false);
  assert.equal(await resolveInitialAdmin('token', async () => Response.json({ ...user, is_anonymous: true })), false);
  assert.equal(await resolveInitialAdmin('token', request, async () => { throw new Error('unavailable'); }), false);
});

test('initials use the registered first and last names', async () => {
  const { userInitials, userDisplayName } = await import('../lib/user-display-name');
  assert.equal(userInitials(userDisplayName({ ...user, user_metadata: { display_name: 'Guilherme Waltrick' } })), 'GW');
  assert.equal(userInitials('  Maria de Souza  '), 'MS');
  assert.equal(userInitials('José'), 'J');
  assert.equal(userInitials(''), '?');
  const { resolveInitialSession } = await import('../lib/initial-access');
  const access = await resolveInitialSession('token', async () => Response.json({ ...user, user_metadata: { display_name: 'Guilherme Waltrick' } }), async () => ({ enabled: true, role: 'admin' }));
  assert.equal(access.displayName, 'Guilherme Waltrick');
  assert.equal(access.admin, true);
});
