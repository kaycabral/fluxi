// Reads a password from stdin and prints its SCRAM-SHA-256 verifier, the form
// Postgres stores. `ALTER ROLE ... PASSWORD '<verifier>'` sets the password
// without the plaintext ever reaching the server, its logs or the SQL editor
// history (docs/production.md, `fluxi_sync` login). ASCII passwords only (the
// runbook uses `openssl rand -hex 32`), so SASLprep is the identity.
//
//   printf %s "$PW" | pnpm -s scram:verifier

import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { text } from 'node:stream/consumers'

const ITERATIONS = 4096

const password = (await text(process.stdin)).trim()
if (!/^[\x21-\x7e]{16,}$/.test(password)) {
  console.error('expected a printable ASCII password of at least 16 characters on stdin')
  process.exit(1)
}
const salt = randomBytes(16)
const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
const hmac = (key: Buffer, message: string) => createHmac('sha256', key).update(message).digest()
const storedKey = createHash('sha256').update(hmac(salted, 'Client Key')).digest()
const serverKey = hmac(salted, 'Server Key')
console.log(
  `SCRAM-SHA-256$${ITERATIONS}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`,
)
