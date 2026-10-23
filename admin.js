/**
 * ==========================================================================
 * PAINEL DO DONO - LÓGICA JAVASCRIPT (admin.js)
 * ==========================================================================
 */

'use strict';

const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';

const AdminApp = {
  agendamentos: [],
  filtroAtual: 'todos',
  config: { maxVagasPorDia: 3 },

  elementos: {
    conteudoAdmin: document.getElementById('conteudo-admin'),
    metricaTotal: document.getElementById('metrica-total'),
    metricaHoje: document.getElementById('metrica-hoje'),
    metricaVagasMax: document.getElementById('metrica-vagas-max'),
    filtroDias: document.getElementById('filtro-dias'),
    listaAgendamentos: document.getElementById('lista-agendamentos'),
    semAgendamentos: document.getElementById('sem-agendamentos'),
    contadorLista: document.getElementById('contador-lista'),
    btnAtualizar: document.getElementById('btn-atualizar'),
    btnNovoManual: document.getElementById('btn-novo-manual'),
    modalManual: document.getElementById('modal-manual'),
    btnFecharModalManual: document.getElementById('btn-fechar-modal-manual'),
    formManual: document.getElementById('form-manual'),
    inputManualData: document.getElementById('manual-data'),
    inputManualNome: document.getElementById('manual-nome'),
    inputManualTelefone: document.getElementById('manual-telefone'),
    inputManualVeiculo: document.getElementById('manual-veiculo')
  },

  async init() {
    this.elementos.btnAtualizar.addEventListener('click', () => {
      this.carregarDados();
    });

    // Abrir/Fechar modal de agendamento manual (Ilimitado)
    if (this.elementos.btnNovoManual) {
      this.elementos.btnNovoManual.addEventListener('click', () => {
        const hoje = new Date();
        const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        this.elementos.inputManualData.value = hojeIso;
        this.elementos.modalManual.classList.remove('hidden');
      });
    }

    if (this.elementos.btnFecharModalManual) {
      this.elementos.btnFecharModalManual.addEventListener('click', () => {
        this.elementos.modalManual.classList.add('hidden');
      });
    }

    // Formulário manual (envia com flag isAdmin para não bloquear por vagas)
    if (this.elementos.formManual) {
      this.elementos.formManual.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dataIso = this.elementos.inputManualData.value;
        const nome = this.elementos.inputManualNome.value.trim();
        const telefone = this.elementos.inputManualTelefone.value.trim();
        const veiculo = this.elementos.inputManualVeiculo.value.trim();

        try {
          const res = await fetch(`${API_BASE}/api/agendamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: dataIso,
              nome,
              telefone,
              veiculo,
              isAdmin: true // Liberação ilimitada para o dono
            })
          });

          if (res.ok) {
            this.elementos.modalManual.classList.add('hidden');
            this.elementos.formManual.reset();
            await this.carregarDados();
          } else {
            const erroJson = await res.json().catch(() => ({}));
            alert(`Erro: ${erroJson.erro || 'Falha ao salvar agendamento.'}`);
          }
        } catch (err) {
          console.error('Erro na gravação manual:', err);
        }
      });
    }

    await this.carregarConfig();
    await this.carregarDados();

    // Auto-refresh a cada 10 segundos
    setInterval(() => this.carregarDados(), 10000);
  },

  async carregarConfig() {
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      if (res.ok) {
        this.config = await res.json();
      }
    } catch (e) {
      console.warn('Usando configuração padrão.');
    }
    // Para o dono, a capacidade é ilimitada
    if (this.elementos.metricaVagasMax) {
      this.elementos.metricaVagasMax.textContent = 'Ilimitado';
    }
  },

  async carregarDados() {
    this.elementos.contadorLista.textContent = 'Atualizando...';

    try {
      const res = await fetch(`${API_BASE}/api/agendamentos`);
      if (res.ok) {
        this.agendamentos = await res.json();
      } else {
        throw new Error('Falha ao obter agendamentos');
      }
    } catch (err) {
      console.warn('Erro ao carregar da API, tentando localStorage como fallback:', err);
      const local = localStorage.getItem('lavarapido_agendamentos_v1');
      this.agendamentos = local ? JSON.parse(local) : [];
    }

    this.atualizarMetricas();
    this.construirBotoesFiltro();
    this.renderizarLista();
  },

  atualizarMetricas() {
    const total = this.agendamentos.length;
    
    // Obter data de hoje em YYYY-MM-DD
    const hoje = new Date();
    const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    
    const hojeTotal = this.agendamentos.filter(a => a.data === hojeIso).length;

    this.elementos.metricaTotal.textContent = total;
    this.elementos.metricaHoje.textContent = hojeTotal;
  },

  construirBotoesFiltro() {
    const datasUnicas = [...new Set(this.agendamentos.map(a => a.data))].sort();
    
    let html = `<button class="filtro-btn ${this.filtroAtual === 'todos' ? 'active' : ''}" data-filtro="todos">Todos (${this.agendamentos.length})</button>`;

    datasUnicas.forEach(dataIso => {
      const qtd = this.agendamentos.filter(a => a.data === dataIso).length;
      // Converte YYYY-MM-DD para DD/MM
      const partes = dataIso.split('-');
      const dataFormatada = partes.length === 3 ? `${partes[2]}/${partes[1]}` : dataIso;

      html += `
        <button class="filtro-btn ${this.filtroAtual === dataIso ? 'active' : ''}" data-filtro="${dataIso}">
          ${dataFormatada} (${qtd})
        </button>
      `;
    });

    this.elementos.filtroDias.innerHTML = html;

    // Adiciona evento de clique nos filtros
    const botoes = this.elementos.filtroDias.querySelectorAll('.filtro-btn');
    botoes.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filtroAtual = btn.dataset.filtro;
        botoes.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderizarLista();
      });
    });
  },

  renderizarLista() {
    const lista = this.elementos.listaAgendamentos;
    const vazio = this.elementos.semAgendamentos;
    lista.innerHTML = '';

    // Filtrar agendamentos
    let filtrados = this.agendamentos;
    if (this.filtroAtual !== 'todos') {
      filtrados = this.agendamentos.filter(a => a.data === this.filtroAtual);
    }

    // Ordena pelos mais recentes
    filtrados.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));

    this.elementos.contadorLista.textContent = `${filtrados.length} agendamento(s)`;

    if (filtrados.length === 0) {
      vazio.classList.remove('hidden');
      return;
    }

    vazio.classList.add('hidden');

    filtrados.forEach(item => {
      const card = document.createElement('div');
      const status = item.status || 'confirmado';
      card.className = `agendamento-card ${status}`;

      // Formata data
      const partesData = (item.data || '').split('-');
      const dataBonita = partesData.length === 3 ? `${partesData[2]}/${partesData[1]}/${partesData[0]}` : item.data;

      // Link do WhatsApp (remove caracteres especiais)
      const telLimpo = (item.telefone || '').replace(/\D/g, '');
      const msgWhatsapp = encodeURIComponent(
        `Olá ${item.nome}! Aqui é do Lava-Rápido Express sobre seu agendamento de ${item.veiculo} para o dia ${dataBonita}.`
      );
      const linkWhatsApp = `https://wa.me/55${telLimpo}?text=${msgWhatsapp}`;

      card.innerHTML = `
        <div class="card-top">
          <div>
            <strong class="card-cliente-nome">${item.nome}</strong>
            <span class="card-veiculo">🚗 ${item.veiculo}</span>
          </div>
          <span class="card-badge-status ${status}">${status}</span>
        </div>

        <div class="card-detalhes-grid">
          <div class="card-detalhe-item">
            <span>Data</span>
            <strong>${dataBonita}</strong>
          </div>
          <div class="card-detalhe-item">
            <span>Telefone</span>
            <strong>${item.telefone}</strong>
          </div>
          <div class="card-detalhe-item" style="grid-column: span 2;">
            <span>Protocolo</span>
            <strong style="font-family: monospace; color: var(--primary-light);">${item.id}</strong>
          </div>
        </div>

        <div class="card-acoes">
          <a href="${linkWhatsApp}" target="_blank" rel="noopener" class="btn-whatsapp" title="Conversar no WhatsApp">
            💬 WhatsApp
          </a>

          ${status !== 'concluido' ? `
            <button class="btn-concluir" data-id="${item.id}" title="Marcar lavagem como concluída">
              ✓ Concluir
            </button>
          ` : ''}

          <button class="btn-cancelar" data-id="${item.id}" title="Remover este agendamento">
            🗑️ Cancelar
          </button>
        </div>
      `;

      // Evento de concluir
      const btnConcluir = card.querySelector('.btn-concluir');
      if (btnConcluir) {
        btnConcluir.addEventListener('click', () => this.alterarStatus(item.id, 'concluido'));
      }

      // Evento de cancelar/excluir
      const btnCancelar = card.querySelector('.btn-cancelar');
      if (btnCancelar) {
        btnCancelar.addEventListener('click', () => this.removerAgendamento(item.id));
      }

      lista.appendChild(card);
    });
  },

  async alterarStatus(id, novoStatus) {
    try {
      const res = await fetch(`${API_BASE}/api/agendamentos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus })
      });

      if (res.ok) {
        await this.carregarDados();
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  },

  async removerAgendamento(id) {
    if (!confirm('Deseja realmente cancelar este agendamento? A vaga será liberada no sistema.')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/agendamentos/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await this.carregarDados();
      }
    } catch (err) {
      console.error('Erro ao remover:', err);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
