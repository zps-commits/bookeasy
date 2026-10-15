/**
 * Generates the value for ADMIN_PASSWORD_HASH.
 *
 *   node scripts/hash-password.mjs 'the password you chose'
 *
 * The password is never written anywhere by this script. Paste the output
 * into the environment and keep the password in a password manager.
 */
const password = process.argv[2];

if (!password || password.length < 12) {
  console.error('Pass a password of at least 12 characters, quoted.');
  process.exit(1);
}

const ITERATIONS = 210_000;
const salt = new Uint8Array(16);
crypto.getRandomValues(salt);

const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  key,
  256,
);

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
console.log(`ADMIN_PASSWORD_HASH='pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}'`);
