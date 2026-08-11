const express = require('express');
const cors = require('cors');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const workoutRoutes = require('./routes/workoutRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando!' });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Tá tudo certo!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

module.exports = app;