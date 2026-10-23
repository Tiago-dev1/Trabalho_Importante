/**
 * ==========================================================================
 * LAVA-RÁPIDO EXPRESS - SERVIDOR BACKEND (server.js)
 * ==========================================================================
 * Servidor Node.js com Express para gerenciar agendamentos centralizados.
 * Qualquer cliente que acessar pelo celular ou computador grava no mesmo banco.
 * O proprietário pode visualizar todos os agendamentos pelo Painel do Dono.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do Lava-Rápido centralizadas no Servidor
const CONFIG_SISTEMA = {
  maxVagasPorDia: 3, // Limite de 3 vagas por dia
  diasFuncionamento: [1, 2, 3, 4, 5, 6], // 1 = Segunda a 6 = Sábado
  horarioAtendimento: 'Seg a Sex: 09h às 16h • Sáb: 08h às 16h',
  horariosDetalhe: {
    semana: '09h às 16h', // Segunda a Sexta
    sabado: '08h às 16h'  // Sábado
  },
  pinAdmin: '1234'
};

// Caminho do arquivo de banco de dados
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'agendamentos.json');

// Garante que a pasta e o arquivo de banco de dados existam
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Helpers para leitura e escrita no banco de dados JSON
function lerAgendamentos() {
  try {
    const dados = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(dados || '[]');
  } catch (err) {
    console.error('Erro ao ler banco de dados:', err);
    return [];
  }
}

function salvarAgendamentos(lista) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(lista, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Erro ao salvar no banco de dados:', err);
    return false;
  }
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve os arquivos estáticos (HTML, CSS, JS)

// ==========================================================================
// ROTAS DA API
// ==========================================================================

// 1. Obter configurações do sistema
app.get('/api/config', (req, res) => {
  res.json({
    maxVagasPorDia: CONFIG_SISTEMA.maxVagasPorDia,
    diasFuncionamento: CONFIG_SISTEMA.diasFuncionamento,
    horarioAtendimento: CONFIG_SISTEMA.horarioAtendimento
  });
});

// 2. Listar agendamentos (opcionalmente filtrados por data)
app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;
  const todos = lerAgendamentos();

  if (data) {
    const filtrados = todos.filter(item => item.data === data && item.status !== 'cancelado');
    return res.json(filtrados);
  }

  res.json(todos);
});

// 3. Criar novo agendamento (vagas limitadas para clientes, ilimitadas para o dono)
app.post('/api/agendamentos', (req, res) => {
  const { data, diaSemana, nome, telefone, veiculo, isAdmin } = req.body;

  // Validação básica dos campos
  if (!data || !nome || !telefone || !veiculo) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
  }

  const agendamentos = lerAgendamentos();

  // Se NÃO for o dono, aplica a trava de vagas máximas
  const ocupadas = agendamentos.filter(
    item => item.data === data && item.status !== 'cancelado'
  ).length;

  if (!isAdmin && ocupadas >= CONFIG_SISTEMA.maxVagasPorDia) {
    return res.status(409).json({ erro: 'As vagas para este dia já estão esgotadas!' });
  }

  // Gera novo agendamento com ID único de protocolo
  const novoAgendamento = {
    id: `LAV-${Date.now().toString(36).toUpperCase()}`,
    data,
    diaSemana: diaSemana || '',
    nome: nome.trim(),
    telefone: telefone.trim(),
    veiculo: veiculo.trim(),
    status: 'confirmado', // confirmado | concluido | cancelado
    criadoEm: new Date().toISOString()
  };

  agendamentos.push(novoAgendamento);
  salvarAgendamentos(agendamentos);

  console.log(`[NOVO AGENDAMENTO] ${novoAgendamento.id} - ${novoAgendamento.nome} (${novoAgendamento.data})`);

  res.status(201).json(novoAgendamento);
});

// 4. Concluir ou Cancelar um agendamento (Ação do Dono)
app.patch('/api/agendamentos/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'concluido' ou 'cancelado'

  if (!['confirmado', 'concluido', 'cancelado'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  const agendamentos = lerAgendamentos();
  const item = agendamentos.find(a => a.id === id);

  if (!item) {
    return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  }

  item.status = status;
  salvarAgendamentos(agendamentos);

  res.json({ mensagem: 'Status atualizado com sucesso!', agendamento: item });
});

// 5. Excluir agendamento (Ação do Dono)
app.delete('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;
  let agendamentos = lerAgendamentos();
  const inicial = agendamentos.length;

  agendamentos = agendamentos.filter(a => a.id !== id);

  if (agendamentos.length === inicial) {
    return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  }

  salvarAgendamentos(agendamentos);
  res.json({ mensagem: 'Agendamento removido com sucesso!' });
});

// 6. Rota para validar o PIN de acesso do Dono
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === CONFIG_SISTEMA.pinAdmin) {
    return res.json({ sucesso: true });
  }
  return res.status(401).json({ erro: 'PIN incorreto.' });
});

// Helper para obter o IP local da máquina na rede Wi-Fi/Ethernet
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('====================================================');
  console.log('🚗 LAVA-RÁPIDO EXPRESS - SERVIDOR ATIVO!');
  console.log('====================================================');
  console.log(`💻 Acesso neste computador:  http://localhost:${PORT}`);
  console.log(`📱 Acesso pelo celular:      http://${localIP}:${PORT}`);
  console.log(`👔 Painel do Dono (Admin):   http://${localIP}:${PORT}/admin.html`);
  console.log('====================================================');
  console.log('Pressione Ctrl + C para parar o servidor.');
});
