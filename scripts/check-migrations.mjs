import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
const root = path.resolve(import.meta.dirname, '..')
const container = `synox-migrations-${process.pid}`
const image = process.env.SYNOX_MIGRATION_IMAGE ?? 'supabase/postgres:15.8.1.085'
function docker(args, input) {
  const result = spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...args], { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message)
  return result.stdout
}
function sql(source, user = "postgres") {
  return docker(['exec', '-i', '--env', 'PGPASSWORD=disposable-test-only', container, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], source)
}
try {
  docker(['run', '--detach', '--name', container, '--env', 'POSTGRES_PASSWORD=disposable-test-only', image])
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break } catch { await setTimeout(1000) }
  }
  if (!ready) throw new Error('PostgreSQL startup timed out')
  sql(fs.readFileSync(path.join(root, 'tests/migration-bootstrap.sql'), 'utf8'), 'supabase_admin')
  const directory = path.join(root, 'supabase/migrations')
  const migrations = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort()
  for (const migration of migrations) {
    try { sql(fs.readFileSync(path.join(directory, migration), 'utf8')) }
    catch (error) { throw new Error(`${migration}: ${error.message}`) }
    console.log(`OK ${migration}`)
  }
  const policySignature = `SELECT md5(string_agg(policyname||cmd||coalesce(qual,'')||coalesce(with_check,''),'|' ORDER BY policyname)) FROM pg_policies WHERE schemaname='storage' AND tablename='objects';`
  const policiesBeforeReplay = sql(policySignature)
  sql(fs.readFileSync(path.join(directory, '017_referentiel_storage.sql'), 'utf8'))
  assert.equal(sql(policySignature), policiesBeforeReplay)
  sql(fs.readFileSync(path.join(root, 'tests/migration-assertions.sql'), 'utf8'))
  sql("SET app.supabase_url='https://installation-test.supabase.co';\n" + fs.readFileSync(path.join(directory, '20261009034436_configure_notification_webhook_vault.sql'), 'utf8'))
  sql("DO $$ BEGIN ASSERT (SELECT decrypted_secret='https://installation-test.supabase.co/functions/v1/notify-admin-new-user' FROM vault.decrypted_secrets WHERE name='synox_notification_webhook_url'); ASSERT (SELECT count(*)=1 FROM vault.secrets WHERE name='synox_notification_webhook_token'); END $$;")
  console.log(`${migrations.length} migrations applied; storage replay and final assertions passed.`)
} finally {
  try { docker(['rm', '--force', '--volumes', container]) } catch { /* preserve the original failure */ }
}
