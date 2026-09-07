import assert from 'node:assert/strict';
import { sessionSecretRaw } from '../src/lib/secret';
import { getDb } from '../src/db';

async function main() {
Object.assign(process.env, { NODE_ENV:'production', DATABASE_URL:'', SESSION_SECRET:'', ALLOW_INSECURE_DEV_SECRET:'true', ALLOW_EMBEDDED_DB_IN_PRODUCTION:'true', PGLITE_DATA_DIR:'/tmp/fittlist-must-not-create', VERCEL:'1' });
assert.throws(sessionSecretRaw, /SESSION_SECRET is not set/);
await assert.rejects(getDb, /refusing to use the embedded development database/);
console.log('Production fails closed despite development overrides: signing secret and hosted database');

}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
