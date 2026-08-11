const bcryptjs = require('bcryptjs');

async function hashPassword(password) {
  return bcryptjs.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcryptjs.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };