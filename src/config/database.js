const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function connectDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Banco de dados conectado!');
  } catch (error) {
    console.error('❌ Erro ao conectar:', error);
    throw error;
  }
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = { prisma, connectDatabase, disconnectDatabase };