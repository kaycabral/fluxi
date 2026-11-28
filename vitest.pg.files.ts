import { afterAll } from 'vitest'
import { ownerDb } from './src/db/owner'

// Every file's fixtures share the owner pool (`ownerDb`); close it per file.
afterAll(async () => {
  await ownerDb.close()
})
