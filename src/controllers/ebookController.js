import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import { objectStorageConfigured, readObject, removeObject, storeObject } from '../services/objectStorageService.js'

const prisma = new PrismaClient()
const uploadDir = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')

function publicEbook(ebook) {
  const { storageKey, coverStorageKey, ...data } = ebook
  return { ...data, url: `/ebooks/${ebook.id}/file`, coverUrl: coverStorageKey ? `/ebooks/${ebook.id}/cover` : null }
}

async function persistUpload(file, kind) {
  if (!file) return null
  if (!objectStorageConfigured()) return file.filename
  const key = `ebooks/${kind === 'cover' ? 'covers/' : ''}${crypto.randomUUID()}${kind === 'cover' ? '.webp' : '.pdf'}`
  await storeObject({ key, buffer: file.buffer, contentType: file.mimetype })
  return key
}

export async function listEbooks(_req, res) {
  const ebooks = await prisma.ebook.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] })
  return res.json(ebooks.map(publicEbook))
}

export async function createEbook(req, res) {
  const file = req.files?.file?.[0]
  const cover = req.files?.cover?.[0]
  let uploadedStorageKey = null
  let uploadedCoverKey = null
  try {
    if (!file || !req.body?.title?.trim()) return res.status(400).json({ error: 'Informe o título e selecione um PDF' })
    uploadedStorageKey = await persistUpload(file, 'file')
    uploadedCoverKey = await persistUpload(cover, 'cover')
    const last = await prisma.ebook.aggregate({ _max: { sortOrder: true } })
    const ebook = await prisma.ebook.create({ data: { title: req.body.title.trim().slice(0, 160), description: String(req.body.description || '').trim().slice(0, 2000) || null, storageKey: uploadedStorageKey, coverStorageKey: uploadedCoverKey, originalName: file.originalname, mimeType: file.mimetype, size: file.size, sortOrder: (last._max.sortOrder ?? 0) + 1 } })
    return res.status(201).json(publicEbook(ebook))
  } catch (error) {
    if (uploadedStorageKey) await removeObject(uploadedStorageKey, uploadDir)
    if (uploadedCoverKey) await removeObject(uploadedCoverKey, uploadDir)
    for (const upload of [file, cover]) if (upload?.path) fs.promises.unlink(upload.path).catch(() => {})
    console.error('Erro ao criar e-book:', error)
    return res.status(500).json({ error: 'Erro ao publicar e-book' })
  }
}

export async function reorderEbooks(req, res) {
  const { ids, previousIds } = req.body || {}
  const valid = value => Array.isArray(value) && value.length <= 1000 && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200) && new Set(value).size === value.length
  if (!valid(ids) || !valid(previousIds) || ids.length !== previousIds.length || ids.some(id => !previousIds.includes(id))) return res.status(400).json({ error: 'Envie a lista completa de e-books, sem repetições.' })
  try {
    const ebooks = await prisma.$transaction(async tx => {
      const current = await tx.ebook.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] })
      if (current.length !== previousIds.length || current.some((ebook, index) => ebook.id !== previousIds[index])) {
        const error = new Error('A biblioteca mudou. Atualize a lista e tente novamente.')
        error.status = 409
        throw error
      }
      for (const [sortOrder, id] of ids.entries()) await tx.ebook.update({ where: { id }, data: { sortOrder: sortOrder + 1 } })
      return tx.ebook.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] })
    }, { isolationLevel: 'Serializable', timeout: 15000 })
    return res.json(ebooks.map(publicEbook))
  } catch (error) {
    if (error.status === 409 || error.code === 'P2034') return res.status(409).json({ error: 'A biblioteca mudou. Atualize a lista e tente novamente.' })
    console.error('Erro ao ordenar e-books:', error)
    return res.status(500).json({ error: 'Não foi possível salvar a ordem dos e-books.' })
  }
}

export async function downloadEbook(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  const requestedRange = req.headers.range
  let range = null
  if (requestedRange) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(requestedRange)
    if (!match) return res.status(416).set('Content-Range', `bytes */${ebook.size}`).end()
    const start = Number(match[1])
    const end = match[2] ? Math.min(Number(match[2]), ebook.size - 1) : ebook.size - 1
    if (start >= ebook.size || end < start) return res.status(416).set('Content-Range', `bytes */${ebook.size}`).end()
    range = { start, end, header: `bytes=${start}-${end}` }
  }
  const object = await readObject(ebook.storageKey, uploadDir, range?.header)
  if (!object) return res.status(404).json({ error: 'Arquivo não encontrado' })
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(ebook.originalName)}"`, 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' })
  if (range && object.buffer) {
    res.status(206).set({ 'Content-Range': object.contentRange || `bytes ${range.start}-${range.end}/${ebook.size}`, 'Content-Length': String(object.contentLength || object.buffer.length) })
    return res.send(object.buffer)
  }
  res.set('Content-Length', String(ebook.size))
  return object.buffer ? res.send(object.buffer) : res.sendFile(object.filePath)
}

export async function getEbookCover(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook?.coverStorageKey) return res.status(404).json({ error: 'Capa não encontrada' })
  const object = await readObject(ebook.coverStorageKey, uploadDir)
  if (!object) return res.status(404).json({ error: 'Capa não encontrada' })
  res.set({ 'Content-Type': object.contentType || 'image/webp', 'Cache-Control': 'private, max-age=3600' })
  return object.buffer ? res.send(object.buffer) : res.sendFile(object.filePath)
}

export async function updateEbookCover(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem de capa' })
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  let newKey = null
  try {
    newKey = await persistUpload(req.file, 'cover')
    const updated = await prisma.ebook.update({ where: { id: ebook.id }, data: { coverStorageKey: newKey } })
    if (ebook.coverStorageKey) await removeObject(ebook.coverStorageKey, uploadDir)
    return res.json(publicEbook(updated))
  } catch (error) {
    if (newKey) await removeObject(newKey, uploadDir)
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {})
    console.error('Erro ao salvar capa do e-book:', error)
    return res.status(500).json({ error: 'Erro ao salvar a capa do e-book' })
  }
}

export async function deleteEbook(req, res) {
  const ebook = await prisma.ebook.findUnique({ where: { id: req.params.id } })
  if (!ebook) return res.status(404).json({ error: 'E-book não encontrado' })
  await prisma.ebook.delete({ where: { id: ebook.id } })
  await removeObject(ebook.storageKey, uploadDir)
  if (ebook.coverStorageKey) await removeObject(ebook.coverStorageKey, uploadDir)
  return res.json({ message: 'E-book excluído' })
}
