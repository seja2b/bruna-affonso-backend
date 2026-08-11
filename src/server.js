const express = require('express');
const cors = require('cors');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const workoutRoutes = require('./routes/workoutRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend funcionando!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Tá tudo certo!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3000;

async function runMigrations() {
  try {
    const { execSync } = require('child_process');
    console.log('🔄 Rodando migrations...');
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('✅ Migrations completas!');
  } catch (error) {
    console.log('⚠️ Migrations já completas ou erro:', error.message);
  }
}

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor...');
    await connectDatabase();
    await runMigrations();

    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando servidor...');
  await disconnectDatabase();
  process.exit(0);
});

module.exports = app;