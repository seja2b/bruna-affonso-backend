export function normalizeRegistrationInput(body = {}) {
  return {
    name: typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim().replace(/[^0-9()+\-\s]/g, '').slice(0, 30) : '',
    password: typeof body.password === 'string' ? body.password : ''
  }
}

export function validateRegistrationInput(input) {
  if (!input.name || !input.email || !input.phone || !input.password) return 'Nome, e-mail, telefone e senha são obrigatórios'
  if (input.name.length < 3 || input.name.length > 120) return 'Informe o nome completo'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'Informe um e-mail válido'
  const phoneDigits = input.phone.replace(/\D/g, '')
  if (phoneDigits.length < 10 || phoneDigits.length > 13) return 'Informe um telefone/WhatsApp válido com DDD'
  if (input.password.length < 8) return 'A senha deve ter pelo menos 8 caracteres'
  return null
}
