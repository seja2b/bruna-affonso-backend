import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRegistrationInput, validateRegistrationInput } from '../src/utils/registrationValidation.js'

test('registration requires every visible field and a valid phone with DDD', () => {
  const complete = normalizeRegistrationInput({ name: '  Maria da Silva ', email: ' MARIA@EXAMPLE.COM ', phone: '(11) 99999-9999', password: 'segura123' })
  assert.deepEqual(complete, { name: 'Maria da Silva', email: 'maria@example.com', phone: '(11) 99999-9999', password: 'segura123' })
  assert.equal(validateRegistrationInput(complete), null)
  assert.match(validateRegistrationInput({ ...complete, phone: '' }), /telefone/i)
  assert.match(validateRegistrationInput({ ...complete, phone: '1234' }), /válido/i)
  assert.match(validateRegistrationInput({ ...complete, email: 'invalido' }), /e-mail válido/i)
})
