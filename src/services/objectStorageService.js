import fs from 'node:fs'
import path from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const requiredEnvironment = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']

export function objectStorageConfigured() {
  return requiredEnvironment.every((name) => Boolean(process.env[name]?.trim()))
}

let client
function r2Client() {
  if (!objectStorageConfigured()) return null
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    })
  }
  return client
}

export async function storeObject({ key, buffer, contentType, metadata = {} }) {
  const storage = r2Client()
  if (!storage) throw new Error('Armazenamento R2 não configurado')
  await storage.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: metadata
  }))
  return key
}

export async function readObject(storageKey, legacyDirectory) {
  const storage = r2Client()
  if (storage) {
    try {
      const object = await storage.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: storageKey }))
      return { buffer: Buffer.from(await object.Body.transformToByteArray()), contentType: object.ContentType }
    } catch (error) {
      if (!['NoSuchKey', 'NotFound'].includes(error?.name) && error?.$metadata?.httpStatusCode !== 404) throw error
    }
  }

  const legacyPath = path.resolve(legacyDirectory, storageKey)
  if (!fs.existsSync(legacyPath)) return null
  return { filePath: legacyPath }
}

export async function removeObject(storageKey, legacyDirectory) {
  const storage = r2Client()
  if (storage) {
    try {
      await storage.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: storageKey }))
    } catch (error) {
      console.error('Erro ao remover objeto do R2:', error)
    }
  }

  const legacyPath = path.resolve(legacyDirectory, storageKey)
  await fs.promises.unlink(legacyPath).catch(() => {})
}
