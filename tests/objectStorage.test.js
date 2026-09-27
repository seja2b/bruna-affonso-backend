import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { objectStorageConfigured, readObject, removeObject } from '../src/services/objectStorageService.js'

test('uses the legacy private directory when R2 is not configured', async () => {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  names.forEach((name) => delete process.env[name])
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bruna-storage-'))
  const file = path.join(directory, 'private.jpg')
  await fs.promises.writeFile(file, 'private-content')

  try {
    assert.equal(objectStorageConfigured(), false)
    assert.equal((await readObject('private.jpg', directory)).filePath, file)
    await removeObject('private.jpg', directory)
    assert.equal(fs.existsSync(file), false)
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true })
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
})
