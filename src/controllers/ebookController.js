import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import { objectStorageConfigured, readObject, removeObject, storeObject } from '../services/objectStorageService.js'

const prisma = new PrismaClient()
const uploadDir = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')

export async function listEbooks(_req, res) {
  const ebooks = await prisma.ebook.findMany({ orderBy: { createdAt: 'desc' } })
  return res.json(ebooks.map(({ storageKey, ...ebook }) => ({ ...ebook, url: `/ebooks/${ebook.id}/file` })))
}

export async function createEbook(req, res) {
  let uploadedStorageKey = null
  try {
    if (!req.file || !req.body?.title?.trim()) return res.status(400).json({ error: 'Informe o título e selecione um PDF' })
    uploadedStorageKey = req.file.filename
    if (objectStorageConfigured()) {
      uploadedStorageKey = `ebooks/${crypto.randomUUID()}.pdf`
      await storeObject({ key: uploadedStorageKey, buffer: req.file.buffer, contentType: 'application/pdf' })
    }
    const ebook = await prisma.ebook.create({ data: { title: req.body.title.trim().slice(0, 160), description: String(req.body.description || '').trim().slice(0, 2000) || null, storageKey: uploadedStorageKey, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size } })
    return res.status(201).json({ ...ebook, storageKey: undefined, url: `/ebooks/${ebook.id}/file` })
  } catch (error) { if (uploadedStorageKey) await removeObject(uploadedStorageKey, uploadDir); if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {}); console.error('Erro ao criar e-book:', error); return res.status(500).json({ error: 'Erro ao publicar e-book' }) }
}

export async function downloadEbook(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  const object = await readObject(ebook.storageKey, uploadDir)
  if (!object) return res.status(404).json({ error: 'Arquivo não encontrado' })
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(ebook.originalName)}"`, 'Cache-Control': 'private, no-store' })
  return object.buffer ? res.send(object.buffer) : res.sendFile(object.filePath)
}

export async function deleteEbook(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  await prisma.ebook.delete({ where: { id: ebook.id } })
  await removeObject(ebook.storageKey, uploadDir)
  return res.json({ message: 'E-book excluído' })
}
