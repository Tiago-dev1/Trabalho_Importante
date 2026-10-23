/**
 * ==========================================================================
 * LAVA-RÁPIDO EXPRESS - LÓGICA DA APLICAÇÃO (app.js)
 * ==========================================================================
 * Responsabilidades:
 * 1. Gerenciar configurações (vagas diárias, dias de funcionamento).
 * 2. Calcular os dias da semana atual a partir de hoje.
 * 3. Gerenciar o estado de vagas via localStorage (com camada pronta para Backend).
 * 4. Controlar o fluxo do formulário e validações mobile-first.
 */

'use strict';

/* ==========================================================================
   1. CONFIGURAÇÕES DA APLICAÇÃO (Ajuste aqui conforme seu negócio)
   ========================================================================== */
const CONFIG = {
  // NÚMERO MÁXIMO DE VAGAS POR DIA
  MAX_VAGAS_POR_DIA: 3,

  // DIAS DA SEMANA EM QUE O LAVA-RÁPIDO FUNCIONA:
  // 1 = Segunda a 6 = Sábado
  DIAS_FUNCIONAMENTO: [1, 2, 3, 4, 5, 6],

  // HORÁRIOS DE ATENDIMENTO
  HORARIO_RESUMO: 'Seg a Sex: 09h às 16h • Sáb: 08h às 16h',
  HORARIOS: {
    semana: '09h às 16h', // Segunda a Sexta
    sabado: '08h às 16h'  // Sábado
  },

  // CHAVE DE ARMAZENAMENTO NO LOCALSTORAGE DO NAVEGADOR
  STORAGE_KEY: 'lavarapido_agendamentos_v1'
};


/* ==========================================================================
   2. CAMADA DE DADOS / STORAGE SERVICE
   ==========================================================================
   Esta camada abstrai a persistência de dados. Hoje ela lê e grava no
   `localStorage` do navegador.
   
   COMO TROCAR POR UM BACKEND (API REST / GraphQL) NO FUTURO:
   Para migrar para um servidor real (Node.js, Python, PHP, etc.), substitua
   o conteúdo das funções abaixo por chamadas HTTP assíncronas com `fetch`.
   
   Exemplo de migração:
   async buscarTodos() {
     const resposta = await fetch('/api/agendamentos');
     return await resposta.json();
   }
   async salvar(novoAgendamento) {
     const resposta = await fetch('/api/agendamentos', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(novoAgendamento)
     });
     return await resposta.json();
   }
   ========================================================================== */
const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';

const StorageService = {
  cacheAgendamentos: [],

  /**
   * Sincroniza os agendamentos com o servidor backend central.
   * Se o servidor estiver offline, lê do localStorage com segurança.
   */
  async sincronizarComServidor() {
    try {
      const resposta = await fetch(`${API_BASE}/api/agendamentos`);
      if (resposta.ok) {
        this.cacheAgendamentos = await resposta.json();
        // Mantém cópia de segurança no localStorage
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.cacheAgendamentos));
        return this.cacheAgendamentos;
      }
    } catch (e) {
      // Modo offline ou visualização via arquivo local
    }

    try {
      const local = localStorage.getItem(CONFIG.STORAGE_KEY);
      this.cacheAgendamentos = local ? JSON.parse(local) : [];
    } catch (erro) {
      this.cacheAgendamentos = [];
    }
    return this.cacheAgendamentos;
  },

  /**
   * Obtém todos os agendamentos registrados.
   * @returns {Array<Object>} Lista de agendamentos
   */
  obterTodos() {
    if (this.cacheAgendamentos && this.cacheAgendamentos.length > 0) {
      return this.cacheAgendamentos;
    }
    try {
      const dados = localStorage.getItem(CONFIG.STORAGE_KEY);
      return dados ? JSON.parse(dados) : [];
    } catch (erro) {
      console.error('Erro ao ler agendamentos:', erro);
      return [];
    }
  },

  /**
   * Retorna a quantidade de agendamentos válidos para uma data específica (formato YYYY-MM-DD).
   * @param {string} dataIso - Data no formato YYYY-MM-DD
   * @returns {number} Quantidade de agendamentos
   */
  contarPorData(dataIso) {
    const todos = this.obterTodos();
    return todos.filter(item => item.data === dataIso && item.status !== 'cancelado').length;
  },

  /**
   * Salva um novo agendamento na API central do servidor.
   * Em caso de falha de rede, grava no localStorage como contingência.
   * @param {Object} agendamento - Objeto com os dados do agendamento
   * @returns {Promise<{sucesso: boolean, agendamento?: Object, erro?: string}>}
   */
  async salvar(agendamento) {
    try {
      // 1. Envia para o Backend Central
      const resposta = await fetch(`${API_BASE}/api/agendamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agendamento)
      });

      if (resposta.ok) {
        const agendamentoCriado = await resposta.json();
        await this.sincronizarComServidor();
        return { sucesso: true, agendamento: agendamentoCriado };
      } else {
        const erroJson = await resposta.json().catch(() => ({}));
        return { sucesso: false, erro: erroJson.erro || 'Vagas esgotadas para este dia.' };
      }
    } catch (erroRede) {
      // 2. Fallback contingencial no localStorage
      console.warn('Backend indisponível, gravando localmente:', erroRede);
      const todos = this.obterTodos();
      todos.push(agendamento);
      this.cacheAgendamentos = todos;
      try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(todos));
        return { sucesso: true, agendamento };
      } catch (e) {
        return { sucesso: false, erro: 'Erro ao salvar no armazenamento local.' };
      }
    }
  }
};


/* ==========================================================================
   3. ESTADO DA APLICAÇÃO (State Management)
   ========================================================================== */
const Estado = {
  diaSelecionado: null, // Guardará o objeto do dia escolhido: { dataIso, diaSemana, diaFormatado }
  diasDaSemana: []      // Lista de dias gerados para a semana atual
};


/* ==========================================================================
   4. MANIPULAÇÃO DE DATAS (Semana Atual a partir de Hoje)
   ========================================================================== */
const DateHelper = {
  nomesDiasSemana: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  nomesDiasAbreviados: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'],

  /**
   * Formata data para o padrão ISO YYYY-MM-DD local (sem problemas de fuso horário UTC).
   */
  formatarIso(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  },

  /**
   * Formata data para exibição amigável em português (ex: "24/10").
   */
  formatarExibicao(data) {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
  },

  /**
   * Gera a lista de dias restantes na semana atual a partir de hoje até o sábado (fim de semana comercial).
   * @returns {Array<Object>} Lista de objetos representando os dias disponíveis
   */
  obterDiasSemanaAtual() {
    const dias = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diaSemanaHoje = hoje.getDay(); // 0 = Domingo, 1 = Segunda... 6 = Sábado

    // Se hoje for domingo e o domingo não for dia útil, a semana atual encerrou.
    // Caso contrário, iteramos de hoje até o final da semana (Sábado = índice 6 ou Domingo).
    // Aqui percorremos até o último dia da semana (Sábado = 6).
    const diasAteFimDaSemana = 6 - diaSemanaHoje;

    for (let i = 0; i <= diasAteFimDaSemana; i++) {
      const dataIterada = new Date(hoje);
      dataIterada.setDate(hoje.getDate() + i);

      const indiceSemana = dataIterada.getDay();

      // Verifica se o lava-rápido funciona nesse dia da semana
      if (CONFIG.DIAS_FUNCIONAMENTO.includes(indiceSemana)) {
        dias.push({
          dataObj: dataIterada,
          dataIso: this.formatarIso(dataIterada),
          diaFormatado: this.formatarExibicao(dataIterada),
          diaSemanaAbrev: this.nomesDiasAbreviados[indiceSemana],
          diaSemanaCompleto: this.nomesDiasSemana[indiceSemana],
          isHoje: i === 0
        });
      }
    }

    return dias;
  }
};


/* ==========================================================================
   5. RENDERIZAÇÃO DA INTERFACE (UI Rendering)
   ========================================================================== */
const UIRenderer = {
  elementos: {
    gridDias: document.getElementById('grid-dias'),
    alertaSemDias: document.getElementById('alerta-sem-dias'),
    resumoContainer: document.getElementById('resumo-dia-container'),
    resumoTexto: document.getElementById('resumo-dia-texto'),
    btnConfirmar: document.getElementById('btn-confirmar'),
    form: document.getElementById('form-agendamento'),
    inputNome: document.getElementById('cliente-nome'),
    inputTelefone: document.getElementById('cliente-telefone'),
    inputVeiculo: document.getElementById('cliente-veiculo'),
    erroNome: document.getElementById('erro-nome'),
    erroTelefone: document.getElementById('erro-telefone'),
    erroVeiculo: document.getElementById('erro-veiculo'),
    modal: document.getElementById('modal-sucesso'),
    modalData: document.getElementById('modal-resumo-data'),
    modalCliente: document.getElementById('modal-resumo-cliente'),
    modalVeiculo: document.getElementById('modal-resumo-veiculo'),
    modalProtocolo: document.getElementById('modal-resumo-protocolo'),
    modalNotaHorario: document.getElementById('modal-nota-horario'),
    btnFecharModal: document.getElementById('btn-fechar-modal')
  },

  /**
   * Renderiza os cards dos dias da semana com status atualizado de vagas.
   */
  renderizarDias() {
    const { gridDias, alertaSemDias } = this.elementos;
    gridDias.innerHTML = '';

    Estado.diasDaSemana = DateHelper.obterDiasSemanaAtual();

    if (Estado.diasDaSemana.length === 0) {
      alertaSemDias.classList.remove('hidden');
      return;
    }

    alertaSemDias.classList.add('hidden');

    Estado.diasDaSemana.forEach(dia => {
      const agendamentosExistentes = StorageService.contarPorData(dia.dataIso);
      const vagasRestantes = CONFIG.MAX_VAGAS_POR_DIA - agendamentosExistentes;
      const isLotado = vagasRestantes <= 0;

      // Criação do elemento Card do Dia
      const card = document.createElement('div');
      card.className = `dia-card ${isLotado ? 'dia-card--lotado' : ''}`;
      card.setAttribute('role', 'radio');
      card.setAttribute('tabindex', isLotado ? '-1' : '0');
      card.setAttribute('aria-checked', 'false');
      card.setAttribute('aria-disabled', isLotado ? 'true' : 'false');
      card.dataset.dataIso = dia.dataIso;

      // Se o dia já estiver selecionado no estado, mantém a seleção visual
      if (Estado.diaSelecionado && Estado.diaSelecionado.dataIso === dia.dataIso && !isLotado) {
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
      }

      // Badge de Vagas
      let badgeHtml = '';
      if (isLotado) {
        badgeHtml = `<span class="vagas-badge lotado" aria-label="Dia lotado">Esgotado</span>`;
      } else if (vagasRestantes === 1) {
        badgeHtml = `<span class="vagas-badge poucas">Última vaga!</span>`;
      } else {
        badgeHtml = `<span class="vagas-badge disponivel">${vagasRestantes} vagas</span>`;
      }

      // Conteúdo HTML do Card
      card.innerHTML = `
        <div class="dia-cabecalho">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="dia-semana">${dia.diaSemanaAbrev}</span>
            ${dia.isHoje ? '<span class="dia-badge-hoje">Hoje</span>' : ''}
          </div>
          <span class="dia-data">${dia.diaFormatado}</span>
        </div>
        ${badgeHtml}
      `;

      // Evento de seleção (Click e Acessibilidade por Teclado Enter/Espaço)
      if (!isLotado) {
        const selecionarAcao = () => this.selecionarDia(dia);
        card.addEventListener('click', selecionarAcao);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selecionarAcao();
          }
        });
      }

      gridDias.appendChild(card);
    });
  },

  /**
   * Processa a seleção de um dia pelo usuário.
   */
  selecionarDia(dia) {
    Estado.diaSelecionado = dia;

    // Atualiza classes visuais nos cards
    const todosCards = this.elementos.gridDias.querySelectorAll('.dia-card');
    todosCards.forEach(card => {
      const isSelected = card.dataset.dataIso === dia.dataIso;
      card.classList.toggle('selected', isSelected);
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    // Atualiza o painel de resumo
    this.elementos.resumoContainer.classList.add('has-selection');
    this.elementos.resumoTexto.textContent = `${dia.diaSemanaCompleto}, ${dia.diaFormatado}`;

    // Habilita o botão se o formulário for válido
    this.validarFormulario();
  },

  /**
   * Valida os campos em tempo real para habilitar o botão de envio.
   */
  validarFormulario() {
    const nomeValido = this.elementos.inputNome.value.trim().length >= 3;
    const telefoneValido = this.elementos.inputTelefone.value.replace(/\D/g, '').length >= 10;
    const veiculoValido = this.elementos.inputVeiculo.value.trim().length >= 2;
    const temDia = Estado.diaSelecionado !== null;

    const formValido = temDia && nomeValido && telefoneValido && veiculoValido;
    this.elementos.btnConfirmar.disabled = !formValido;

    return { formValido, nomeValido, telefoneValido, veiculoValido, temDia };
  },

  /**
   * Exibe mensagens de erro nos campos do formulário.
   */
  exibirErros({ nomeValido, telefoneValido, veiculoValido, temDia }) {
    this.elementos.erroNome.textContent = nomeValido ? '' : 'Por favor, informe seu nome completo.';
    this.elementos.erroTelefone.textContent = telefoneValido ? '' : 'Informe um telefone com DDD válido.';
    this.elementos.erroVeiculo.textContent = veiculoValido ? '' : 'Informe o modelo ou placa do veículo.';

    if (!temDia) {
      this.elementos.resumoTexto.textContent = '⚠️ Escolha um dia disponível acima';
      this.elementos.resumoContainer.style.borderColor = 'var(--color-danger)';
    } else {
      this.elementos.resumoContainer.style.borderColor = '';
    }
  },

  /**
   * Limpa as mensagens de erro.
   */
  limparErros() {
    this.elementos.erroNome.textContent = '';
    this.elementos.erroTelefone.textContent = '';
    this.elementos.erroVeiculo.textContent = '';
    this.elementos.resumoContainer.style.borderColor = '';
  },

  /**
   * Abre o modal com os dados do agendamento confirmado.
   */
  abrirModalSucesso(agendamento, dia) {
    this.elementos.modalData.textContent = `${dia.diaSemanaCompleto}, ${dia.diaFormatado}`;
    this.elementos.modalCliente.textContent = agendamento.nome;
    this.elementos.modalVeiculo.textContent = agendamento.veiculo;
    this.elementos.modalProtocolo.textContent = agendamento.id;

    // Horário específico conforme o dia da semana escolhido
    const isSabado = dia.diaSemanaCompleto === 'Sábado' || dia.diaSemanaAbrev === 'SÁB';
    const horarioAtendimento = isSabado ? CONFIG.HORARIOS.sabado : CONFIG.HORARIOS.semana;
    if (this.elementos.modalNotaHorario) {
      this.elementos.modalNotaHorario.textContent = `📍 Horário no seu dia (${dia.diaSemanaCompleto}): ${horarioAtendimento}. Te aguardamos!`;
    }

    this.elementos.modal.classList.remove('hidden');
    this.elementos.btnFecharModal.focus();
  },

  /**
   * Fecha o modal e reseta o formulário para um novo agendamento.
   */
  fecharModal() {
    this.elementos.modal.classList.add('hidden');
    this.elementos.form.reset();
    Estado.diaSelecionado = null;
    this.elementos.resumoContainer.classList.remove('has-selection');
    this.elementos.resumoTexto.textContent = 'Nenhum dia selecionado';
    this.elementos.btnConfirmar.disabled = true;
    this.limparErros();
    this.renderizarDias();
  }
};


/* ==========================================================================
   6. CONTROLADORES E EVENTOS (Event Handlers)
   ========================================================================== */
async function inicializarApp() {
  // Sincroniza dados com o servidor central
  await StorageService.sincronizarComServidor();

  // Atualiza o texto do badge com base na constante configurada
  const badgeHorario = document.getElementById('badge-horario');
  if (badgeHorario) {
    badgeHorario.textContent = CONFIG.HORARIO_RESUMO;
  }

  // 1. Renderiza os dias disponíveis da semana
  UIRenderer.renderizarDias();

  const { form, inputNome, inputTelefone, inputVeiculo, btnFecharModal, modal } = UIRenderer.elementos;

  // 2. Máscara amigável de telefone celular brasileiro (XX) XXXXX-XXXX
  inputTelefone.addEventListener('input', (e) => {
    let valor = e.target.value.replace(/\D/g, '');
    if (valor.length > 11) valor = valor.slice(0, 11);

    if (valor.length > 6) {
      valor = `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7)}`;
    } else if (valor.length > 2) {
      valor = `(${valor.slice(0, 2)}) ${valor.slice(2)}`;
    } else if (valor.length > 0) {
      valor = `(${valor}`;
    }
    e.target.value = valor;
    UIRenderer.validarFormulario();
  });

  // 3. Validação em tempo real ao digitar
  [inputNome, inputVeiculo].forEach(input => {
    input.addEventListener('input', () => UIRenderer.validarFormulario());
  });

  // 4. Submissão do Formulário de Agendamento (Assíncrona)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const validacao = UIRenderer.validarFormulario();
    if (!validacao.formValido) {
      UIRenderer.exibirErros(validacao);
      return;
    }

    const dia = Estado.diaSelecionado;

    // Desabilita botão durante o envio
    UIRenderer.elementos.btnConfirmar.disabled = true;
    UIRenderer.elementos.btnConfirmar.textContent = 'Enviando...';

    // Criação do objeto do agendamento
    const novoAgendamento = {
      data: dia.dataIso,
      diaSemana: dia.diaSemanaCompleto,
      nome: inputNome.value.trim(),
      telefone: inputTelefone.value.trim(),
      veiculo: inputVeiculo.value.trim(),
      criadoEm: new Date().toISOString()
    };

    // Persistência no Backend Central
    const resultado = await StorageService.salvar(novoAgendamento);

    // Restaura texto do botão
    UIRenderer.elementos.btnConfirmar.innerHTML = `
      <span>Confirmar Agendamento</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;

    if (resultado.sucesso) {
      UIRenderer.limparErros();
      UIRenderer.abrirModalSucesso(resultado.agendamento || novoAgendamento, dia);
      UIRenderer.renderizarDias();
    } else {
      alert(`Atenção: ${resultado.erro || 'Não foi possível confirmar o agendamento.'}`);
      UIRenderer.renderizarDias();
    }
  });

  // 5. Fechamento do Modal
  btnFecharModal.addEventListener('click', () => UIRenderer.fecharModal());

  // Fechar com tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      UIRenderer.fecharModal();
    }
  });

  // 6. Atalho Secreto do Dono (3 toques rápidos no logo do carro abrem o painel admin)
  let toquesLogo = 0;
  let timerToque;
  const logo = document.querySelector('.brand-icon');
  if (logo) {
    logo.addEventListener('click', () => {
      toquesLogo++;
      clearTimeout(timerToque);
      if (toquesLogo >= 3) {
        toquesLogo = 0;
        window.location.href = 'admin.html';
      } else {
        timerToque = setTimeout(() => { toquesLogo = 0; }, 700);
      }
    });
  }
}

// Inicializa a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', inicializarApp);
