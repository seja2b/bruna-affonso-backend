import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const uploadDir = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')

export async function listEbooks(_req, res) {
  const ebooks = await prisma.ebook.findMany({ orderBy: { createdAt: 'desc' } })
  return res.json(ebooks.map(({ storageKey, ...ebook }) => ({ ...ebook, url: `/ebooks/${ebook.id}/file` })))
}

export async function createEbook(req, res) {
  try {
    if (!req.file || !req.body?.title?.trim()) return res.status(400).json({ error: 'Informe o título e selecione um PDF' })
    const ebook = await prisma.ebook.create({ data: { title: req.body.title.trim().slice(0, 160), description: String(req.body.description || '').trim().slice(0, 2000) || null, storageKey: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size } })
    return res.status(201).json({ ...ebook, storageKey: undefined, url: `/ebooks/${ebook.id}/file` })
  } catch (error) { if (req.file) fs.promises.unlink(req.file.path).catch(() => {}); console.error('Erro ao criar e-book:', error); return res.status(500).json({ error: 'Erro ao publicar e-book' }) }
}

export async function downloadEbook(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  const filePath = path.join(uploadDir, ebook.storageKey)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' })
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(ebook.originalName)}"`, 'Cache-Control': 'private, no-store' })
  return res.sendFile(filePath)
}

export async function deleteEbook(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  await prisma.ebook.delete({ where: { id: ebook.id } })
  fs.promises.unlink(path.join(uploadDir, ebook.storageKey)).catch(() => {})
  return res.json({ message: 'E-book excluído' })
}
