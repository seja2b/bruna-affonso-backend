import bcryptjs from 'bcryptjs'

export async function hashPassword(password) {
  return bcryptjs.hash(password, 10)
}

export async function comparePassword(password, hash) {
  return bcryptjs.compare(password, hash)
}