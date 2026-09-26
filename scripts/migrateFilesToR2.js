import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { objectStorageConfigured, storeObject } from '../src/services/objectStorageService.js'

if (!objectStorageConfigured()) throw new Error('Configure todas as variáveis R2_* antes da migração')

const prisma = new PrismaClient()
const assessmentDirectory = path.resolve(process.env.ASSESSMENT_UPLOAD_DIR || 'private_uploads/assessments')
const ebookDirectory = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')

async function migrate(records, directory, label) {
  let uploaded = 0
  let missing = 0
  for (const record of records) {
    const source = path.resolve(directory, record.storageKey)
    if (!fs.existsSync(source)) {
      missing += 1
      console.warn(`[${label}] arquivo local ausente: ${record.storageKey}`)
      continue
    }
    await storeObject({
      key: record.storageKey,
      buffer: await fs.promises.readFile(source),
      contentType: record.mimeType,
      metadata: { migrated: 'true' }
    })
    uploaded += 1
  }
  return { total: records.length, uploaded, missing }
}

try {
  const [photos, ebooks] = await Promise.all([
    prisma.assessmentPhoto.findMany({ select: { storageKey: true, mimeType: true } }),
    prisma.ebook.findMany({ select: { storageKey: true, mimeType: true } })
  ])
  const assessmentResult = await migrate(photos, assessmentDirectory, 'avaliação')
  const ebookResult = await migrate(ebooks, ebookDirectory, 'ebook')
  console.log(JSON.stringify({ assessmentResult, ebookResult }, null, 2))
  if (assessmentResult.missing || ebookResult.missing) process.exitCode = 2
} finally {
  await prisma.$disconnect()
}
