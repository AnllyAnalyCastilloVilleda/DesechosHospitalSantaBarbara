// src/scripts/test-prisma.js (ESM)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  await prisma.$connect();
  console.log('✅ Prisma conectado correctamente.');
} catch (err) {
  console.error('❌ Error conectando Prisma:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
