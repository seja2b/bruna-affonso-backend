import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function connectDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Banco de dados conectado!');
  } catch (error) {
    console.error('❌ Erro ao conectar:', error);
    throw error;
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export { prisma };