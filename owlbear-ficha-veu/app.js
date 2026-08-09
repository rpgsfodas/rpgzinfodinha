/* ==========================================================================
   CONFIGURAÇÃO GERAL
   ========================================================================== */
const ID = "com.veurpg.ficha";
const META_KEY = `${ID}/dados`;          // chave na metadata do PRÓPRIO jogador
const CH_AJUSTE = `${ID}/ajuste-mestre`; // canal de broadcast: mestre -> jogador
const CHAVE_LOCAL = "ficha_rpg_dados_v1";

let myPlayerId = "";
let lockUpdate = false; // evita loop infinito ao repreencher a ficha via sync

const listaPericiasNomes = [
    "ACROBACIA", "ATUALIDADES", "ENGANAÇÃO", "INTIMIDAÇÃO", "MEDICINA", "PONTARIA",
    "SOBREVIVÊNCIA", "ADESTRAMENTO", "CIÊNCIAS", "FORTITUDE", "INTUIÇÃO", "OCULTISMO",
    "PROFISSÃO", "TÁTICA", "ARTES", "CRIME", "FURTIVIDADE", "INVESTIGAÇÃO",
    "PERCEPÇÃO", "REFLEXOS", "TECNOLOGIA", "ATLETISMO", "DIPLOMACIA", "INICIATIVA",
    "LUTA", "PILOTAGEM", "RELIGIÃO", "VONTADE"
];

/* ==========================================================================
   ROTEADOR: decide se mostra a Ficha (jogador) ou o Painel (mestre)
   ========================================================================== */
function mostrarView(id) {
    document.getElementById("tela-carregando").style.display = "none";
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

async function iniciar() {
    try {
        if (typeof OBR === "undefined") {
            // Fora do Owlbear (ex: abrindo o arquivo direto no navegador) -> modo ficha offline
            mostrarView("view-jogador");
            inicializarPericias();
            atualizarEspacosInventario();
            carregarDadosLocaisOffline();
            atualizarVisoresAnomalia();
            calcularPontosTotais();
            calcularPontosPericias();
            ordenarPericias();
            atualizarMachucado();
            return;
        }

        OBR.onReady(async () => {
            myPlayerId = OBR.player.id;
            const papel = await OBR.player.getRole();

            if (papel === "GM") {
                mostrarView("view-mestre");
                await renderizarPainelMestre();
                OBR.party.onChange(() => renderizarPainelMestre());
            } else {
                mostrarView("view-jogador");
                inicializarPericias();
                atualizarEspacosInventario();
                await carregarDadosDoJogador();
                atualizarVisoresAnomalia();
                calcularPontosTotais();
                calcularPontosPericias();
                ordenarPericias();
                atualizarMachucado();

                // Mantém a ficha em dia se algo mudar por fora (ex: mestre ajustou PV via painel)
                OBR.player.onChange((player) => {
                    const dados = player.metadata ? player.metadata[META_KEY] : undefined;
                    if (dados) preencherFichaComDados(dados);
                });
            }
        });
    } catch (e) {
        console.error("Ficha VEU RPG: erro ao iniciar", e);
        mostrarView("view-jogador");
    }
}

iniciar();

/* ==========================================================================
   NAVEGAÇÃO DE ABAS (UI)
   ========================================================================== */
function mudarAbaPrincipal(aba) {
    document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.main-tab-btn').forEach(el => el.classList.remove('active'));

    if (aba === 'principal') {
        document.getElementById('main-principal').classList.add('active');
        document.getElementById('btn-main-principal').classList.add('active');
    } else if (aba === 'inventario') {
        document.getElementById('main-inventario').classList.add('active');
        document.getElementById('btn-main-inventario').classList.add('active');
    }
}

function mudarAbaSecundaria(aba) {
    document.getElementById('tab-definicoes').classList.remove('active');
    document.getElementById('tab-pericias').classList.remove('active');
    document.getElementById('btn-tab-definicoes').classList.remove('active');
    document.getElementById('btn-tab-pericias').classList.remove('active');

    if (aba === 'definicoes') {
        document.getElementById('tab-definicoes').classList.add('active');
        document.getElementById('btn-tab-definicoes').classList.add('active');
    } else {
        document.getElementById('tab-pericias').classList.add('active');
        document.getElementById('btn-tab-pericias').classList.add('active');
    }
}

/* ==========================================================================
   CÁLCULOS DA FICHA
   ========================================================================== */
function atualizarMachucado() {
    const pvsMax = parseInt(document.getElementById('stat-pvs-max').value) || 0;
    document.getElementById('stat-machucado').value = Math.floor(pvsMax / 2);
}

function calcularPontosTotais() {
    const nivel = parseInt(document.getElementById('char-nivel').value) || 1;
    const pontosTotais = Math.floor(Math.pow(nivel, 1.5) + 9);
    const atributosBase = ['vigor', 'forca', 'agilidade', 'intelecto', 'presenca'];
    const atributosAnomalos = ['poder', 'defesa', 'alcance', 'velocidade', 'precisao'];
    let pontosGastos = 0;

    atributosBase.forEach(attr => { pontosGastos += parseInt(document.getElementById(`attr-${attr}`).value) || 0; });
    atributosAnomalos.forEach(attr => { pontosGastos += parseInt(document.getElementById(`anomalia-${attr}`).value) || 0; });

    const restantes = pontosTotais - pontosGastos;
    const visorPontos = document.getElementById('visor-pontos');
    if (visorPontos) {
        visorPontos.innerText = `Pontos: ${restantes} / ${pontosTotais}`;
        if (restantes < 0) visorPontos.style.color = 'var(--accent-vermelho)';
        else if (restantes === 0) visorPontos.style.color = 'var(--texto-mutado)';
        else visorPontos.style.color = 'var(--accent-verde)';
    }
}

function calcularPontosPericias() {
    const classe = document.getElementById('char-classe').value.toLowerCase();
    let limitePericias = 0;

    if (classe === "brutalista") limitePericias = 6;
    else if (classe === "vorpal") limitePericias = 8;
    else if (classe === "intelectual") limitePericias = 10;

    const intelecto = parseInt(document.getElementById('attr-intelecto').value) || 0;
    const modMestre = parseInt(document.getElementById('mod-pericias').value) || 0;

    if (classe) {
        limitePericias += intelecto;
        limitePericias += modMestre;
    }

    limitePericias = Math.max(0, limitePericias);
    const pontosTotais = limitePericias * 5;
    let pontosGastos = 0;

    document.querySelectorAll('.pericia-item input').forEach(input => {
        pontosGastos += parseInt(input.value) || 0;
    });

    const restantes = pontosTotais - pontosGastos;
    const visor = document.getElementById('visor-pericias');

    if (visor) {
        if (!classe) {
            visor.innerText = `Selecione uma Classe`;
            visor.style.color = 'var(--texto-mutado)';
        } else {
            visor.innerText = `Pontos: ${restantes} / ${pontosTotais}`;
            if (restantes < 0) visor.style.color = 'var(--accent-vermelho)';
            else if (restantes === 0) visor.style.color = 'var(--texto-mutado)';
            else visor.style.color = 'var(--accent-verde)';
        }
    }
}

function atualizarStatusClasse() {
    const classe = document.getElementById('char-classe').value.toLowerCase();
    const vigor = parseInt(document.getElementById('attr-vigor').value) || 0;
    const presenca = parseInt(document.getElementById('attr-presenca').value) || 0;
    const poderAnomalo = parseInt(document.getElementById('anomalia-poder').value) || 0;
    const defesaAnomala = parseInt(document.getElementById('anomalia-defesa').value) || 0;

    if (!classe) return;

    let pvmax = 0, pemax = 0, san = 0;
    const adicionalPE = poderAnomalo * 5;
    const bonusBarreira = 10 + (defesaAnomala * 5);

    if (classe === "brutalista") {
        pvmax = 10 + (vigor * 7) + bonusBarreira;
        pemax = 5 + (presenca * 2) + adicionalPE;
        san = 75;
    } else if (classe === "vorpal") {
        pvmax = 12 + (vigor * 4) + bonusBarreira;
        pemax = 8 + (presenca * 4) + adicionalPE;
        san = 85;
    } else if (classe === "intelectual") {
        pvmax = 12 + (vigor * 2) + bonusBarreira;
        pemax = 8 + (presenca * 6) + adicionalPE;
        san = 100;
    }

    const pvMaxInput = document.getElementById('stat-pvs-max');
    const peMaxInput = document.getElementById('stat-pes-max');
    const sanMaxInput = document.getElementById('stat-san-max');

    const pvAtualInput = document.getElementById('stat-pvs-atual');
    const peAtualInput = document.getElementById('stat-pes-atual');
    const sanAtualInput = document.getElementById('stat-san-atual');

    if (parseInt(pvAtualInput.value) === 0 || pvAtualInput.value === "") pvAtualInput.value = pvmax;
    if (parseInt(peAtualInput.value) === 0 || peAtualInput.value === "") peAtualInput.value = pemax;
    if (parseInt(sanAtualInput.value) === 0 || sanAtualInput.value === "") sanAtualInput.value = san;

    pvMaxInput.value = pvmax;
    peMaxInput.value = pemax;
    sanMaxInput.value = san;

    pvAtualInput.value = Math.max(0, Math.min(parseInt(pvAtualInput.value) || 0, pvmax));
    peAtualInput.value = Math.max(0, Math.min(parseInt(peAtualInput.value) || 0, pemax));
    sanAtualInput.value = Math.max(0, Math.min(parseInt(sanAtualInput.value) || 0, san));

    atualizarMachucado();
    calcularPontosPericias();
    salvarDados();
}

/* ==========================================================================
   INTERAÇÕES DE CAMPOS
   ========================================================================== */
function alterarValor(idElemento, quantidade) {
    const input = document.getElementById(idElemento);
    let novoValor = (parseInt(input.value) || 0) + quantidade;

    if (idElemento === 'stat-pvs-atual') novoValor = Math.max(0, Math.min(novoValor, parseInt(document.getElementById('stat-pvs-max').value) || 0));
    if (idElemento === 'stat-pes-atual') novoValor = Math.max(0, Math.min(novoValor, parseInt(document.getElementById('stat-pes-max').value) || 0));
    if (idElemento === 'stat-san-atual') novoValor = Math.max(0, Math.min(novoValor, parseInt(document.getElementById('stat-san-max').value) || 0));
    if (idElemento === 'char-nivel') novoValor = Math.max(1, Math.min(novoValor, 8));
    if (idElemento === 'stat-defesa') novoValor = Math.max(0, Math.min(novoValor, 27));
    if (idElemento === 'stat-esquiva') novoValor = Math.max(0, Math.min(novoValor, 30));
    if (idElemento === 'stat-bloqueio') novoValor = Math.max(0, Math.min(novoValor, 14));
    if (idElemento === 'stat-movimento') novoValor = Math.max(0, Math.min(novoValor, 16));

    if (!['stat-defesa', 'stat-esquiva', 'stat-bloqueio', 'stat-movimento', 'stat-pvs-atual', 'stat-pes-atual', 'stat-san-atual', 'char-nivel', 'mod-pericias'].includes(idElemento)) {
        novoValor = Math.max(0, novoValor);
    }

    input.value = novoValor;

    if (idElemento === 'attr-vigor' || idElemento === 'attr-presenca') atualizarStatusClasse();
    if (idElemento === 'attr-forca') atualizarEspacosInventario();
    if (idElemento === 'attr-intelecto') calcularPontosPericias();

    calcularPontosTotais();
    salvarDados();
}

function alterarAnomalia(idElemento, quantidade) {
    const input = document.getElementById(idElemento);
    let novoValor = Math.max(-1, Math.min((parseInt(input.value) || 0) + quantidade, 5));
    input.value = novoValor;
    atualizarVisoresAnomalia();
    calcularPontosTotais();

    if (idElemento === 'anomalia-poder' || idElemento === 'anomalia-defesa') atualizarStatusClasse();
    else salvarDados();
}

function atualizarVisoresAnomalia() {
    const valPoder = parseInt(document.getElementById(`anomalia-poder`).value) || 0;
    const visorPoder = document.getElementById(`visor-poder`);
    if (valPoder < 0) visorPoder.value = `Patamar 1D4 (Atrófico)`;
    else if (valPoder === 0) visorPoder.value = `Patamar D6 (Base)`;
    else if (valPoder === 1) visorPoder.value = `Patamar D6+2 (Amplificado)`;
    else if (valPoder === 2) visorPoder.value = `Patamar D8+3 (Amplificado)`;
    else if (valPoder === 3) visorPoder.value = `Patamar D10+5 (Amplificado)`;
    else if (valPoder === 4) visorPoder.value = `Patamar D12+6 (Amplificado)`;
    else visorPoder.value = `Patamar 2D12+8 (Sobrecarga)`;

    const valDefesa = parseInt(document.getElementById(`anomalia-defesa`).value) || 0;
    const visorDefesa = document.getElementById(`visor-defesa`);
    if (valDefesa < 0) visorDefesa.value = `Barreira: 5 PV / RD 0 (Atrófico)`;
    else if (valDefesa === 0) visorDefesa.value = `Barreira: 10 PV / RD 0 (Base)`;
    else if (valDefesa === 1) visorDefesa.value = `Barreira: 15 PV / RD 1 (Amplificado)`;
    else if (valDefesa === 2) visorDefesa.value = `Barreira: 20 PV / RD 1 (Amplificado)`;
    else if (valDefesa === 3) visorDefesa.value = `Barreira: 25 PV / RD 2 (Amplificado)`;
    else if (valDefesa === 4) visorDefesa.value = `Barreira: 30 PV / RD 3 (Amplificado)`;
    else visorDefesa.value = `Barreira: 35 PV / RD 4 (Sobrecarga)`;

    const valAlcance = parseInt(document.getElementById(`anomalia-alcance`).value) || 0;
    const visorAlcance = document.getElementById(`visor-alcance`);
    if (valAlcance < 0) visorAlcance.value = `Alcance: Pessoal`;
    else if (valAlcance === 0) visorAlcance.value = `Alcance: mínimo 3m / Área 1x1`;
    else if (valAlcance === 1) visorAlcance.value = `Alcance: Curto 6m / Área 2x2`;
    else if (valAlcance === 2) visorAlcance.value = `Alcance: Médio 9m / Área 3x3`;
    else if (valAlcance === 3) visorAlcance.value = `Alcance: Longo 12m / Área 4x4`;
    else if (valAlcance === 4) visorAlcance.value = `Alcance: Extremo 15m / Área 5x5`;
    else visorAlcance.value = `Alcance: Campo Visual 20m / Área 6x6`;

    const valVelocidade = parseInt(document.getElementById(`anomalia-velocidade`).value) || 0;
    const visorVelocidade = document.getElementById(`visor-velocidade`);
    if (valVelocidade < 0) visorVelocidade.value = `-1D dano (Atrófico)`;
    else if (valVelocidade === 0) visorVelocidade.value = `1D Dano (Base)`;
    else if (valVelocidade === 1) visorVelocidade.value = `2D Dano (Amplificado)`;
    else if (valVelocidade === 2) visorVelocidade.value = `3D Dano (Amplificado)`;
    else if (valVelocidade === 3) visorVelocidade.value = `4D Dano (Amplificado)`;
    else if (valVelocidade === 4) visorVelocidade.value = `5D Dano (Amplificado)`;
    else visorVelocidade.value = `6D Dano (Sobrecarga)`;

    const valPrecisao = parseInt(document.getElementById(`anomalia-precisao`).value) || 0;
    const visorPrecisao = document.getElementById(`visor-precisao`);
    if (valPrecisao < 0) visorPrecisao.value = `-1D rolagem / DT -2 (Atrófico)`;
    else if (valPrecisao === 0) visorPrecisao.value = `1D rolagem / DT Base`;
    else if (valPrecisao === 1) visorPrecisao.value = `2D rolagem / DT +1 (Amplificado)`;
    else if (valPrecisao === 2) visorPrecisao.value = `3D rolagem / DT +2 (Amplificado)`;
    else if (valPrecisao === 3) visorPrecisao.value = `4D rolagem / DT +3 (Amplificado)`;
    else if (valPrecisao === 4) visorPrecisao.value = `5D rolagem / DT +4 (Amplificado)`;
    else visorPrecisao.value = `6D rolagem / DT +5 (Sobrecarga)`;
}

function alterarPericia(btn, quantidade) {
    const input = btn.parentElement.querySelector('input');
    let novoValor = (parseInt(input.value) || 0) + quantidade;
    novoValor = Math.max(0, Math.min(novoValor, 10));
    input.value = novoValor;
    ordenarPericias();
    calcularPontosPericias();
    salvarDados();
}

function alterarValorInv(idElemento, quantidade) {
    const input = document.getElementById(idElemento);
    input.value = Math.max(0, (parseInt(input.value) || 0) + quantidade);
    salvarDados();
}

function obterCorVerde(valor) {
    if (valor <= 0) return '#2f3136';
    const percentual = Math.min(valor / 20, 1);
    const r = Math.round(47 + (67 - 47) * percentual);
    const g = Math.round(49 + (181 - 49) * percentual);
    const b = Math.round(54 + (129 - 54) * percentual);
    return `rgb(${r}, ${g}, ${b})`;
}

/* ==========================================================================
   SALVAMENTO: metadata do jogador (Owlbear) + cópia local (offline/backup)
   ========================================================================== */
function coletarDadosFicha() {
    const dadosFicha = {
        nome: document.getElementById('char-nome').value,
        classe: document.getElementById('char-classe').value,
        nivel: document.getElementById('char-nivel').value,
        idade: document.getElementById('char-idade').value,
        tamanho: document.getElementById('char-tamanho').value,
        vinculo: document.getElementById('char-vinculo').value,
        atributos: {
            vigor: document.getElementById('attr-vigor').value,
            forca: document.getElementById('attr-forca').value,
            agilidade: document.getElementById('attr-agilidade').value,
            intelecto: document.getElementById('attr-intelecto').value,
            presenca: document.getElementById('attr-presenca').value,
        },
        status: {
            pvs_atual: document.getElementById('stat-pvs-atual').value,
            pvs_max: document.getElementById('stat-pvs-max').value,
            pes_atual: document.getElementById('stat-pes-atual').value,
            pes_max: document.getElementById('stat-pes-max').value,
            san_atual: document.getElementById('stat-san-atual').value,
            san_max: document.getElementById('stat-san-max').value,
            defesa: document.getElementById('stat-defesa').value,
            esquiva: document.getElementById('stat-esquiva').value,
            bloqueio: document.getElementById('stat-bloqueio').value,
            movimento: document.getElementById('stat-movimento').value,
            mod_pericias: document.getElementById('mod-pericias').value
        },
        anomalias: {
            poder: document.getElementById('anomalia-poder').value,
            defesa: document.getElementById('anomalia-defesa').value,
            alcance: document.getElementById('anomalia-alcance').value,
            velocidade: document.getElementById('anomalia-velocidade').value,
            precisao: document.getElementById('anomalia-precisao').value
        },
        textos: {
            resistencias: document.getElementById('text-resistencias').value,
            habilidades: document.getElementById('text-habilidades').value
        },
        pericias: {},
        inventario: []
    };

    document.querySelectorAll('.pericia-item').forEach(item => {
        const nome = item.dataset.nome;
        dadosFicha.pericias[nome] = parseInt(item.querySelector('input').value) || 0;
    });

    document.querySelectorAll('.inventario-item').forEach((item, index) => {
        const i = index + 1;
        const elNome = document.getElementById(`inv-nome-${i}`);
        const elVal = document.getElementById(`inv-val-${i}`);
        if (elNome && elVal) dadosFicha.inventario.push({ nome: elNome.value, valor: elVal.value });
    });

    return dadosFicha;
}

let timeoutSalvamentoRemoto;
function salvarDados() {
    if (lockUpdate) return;

    const dadosFicha = coletarDadosFicha();

    // Backup local tradicional (funciona mesmo fora do Owlbear)
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(dadosFicha));

    // Sincronização em tempo real: grava na metadata do PRÓPRIO jogador.
    // É isso que faz o painel do mestre enxergar a ficha automaticamente.
    if (typeof OBR !== "undefined") {
        clearTimeout(timeoutSalvamentoRemoto);
        timeoutSalvamentoRemoto = setTimeout(() => {
            OBR.player.setMetadata({ [META_KEY]: dadosFicha }).catch(err => {
                console.error("Ficha VEU RPG: falha ao sincronizar com a sala", err);
            });
        }, 300); // pequeno debounce para não disparar uma chamada por tecla digitada
    }

    mostrarAvisoSalvo();
}

async function carregarDadosDoJogador() {
    try {
        const metadata = await OBR.player.getMetadata();
        const dados = metadata[META_KEY];
        if (dados) {
            preencherFichaComDados(dados);
            return;
        }
    } catch (e) {
        console.error("Ficha VEU RPG: erro ao ler metadata do jogador", e);
    }
    // Sem dados salvos na sala ainda: tenta o backup local e sobe para a sala
    carregarDadosLocaisOffline();
    salvarDados();
}

function carregarDadosLocaisOffline() {
    const salvo = localStorage.getItem(CHAVE_LOCAL);
    if (salvo) {
        try { preencherFichaComDados(JSON.parse(salvo)); }
        catch (e) { console.error("Erro ao ler dados salvos localmente."); }
    }
}

let timeoutAviso;
function mostrarAvisoSalvo() {
    const msg = document.getElementById('save-msg');
    if (!msg) return;
    msg.style.opacity = 1;
    clearTimeout(timeoutAviso);
    timeoutAviso = setTimeout(() => { msg.style.opacity = 0; }, 1500);
}

/* ==========================================================================
   LISTENERS DE INPUT (validação ao digitar diretamente)
   ========================================================================== */
document.body.addEventListener('input', (event) => {
    if (lockUpdate) return;
    const id = event.target.id;

    if (id === 'stat-pvs-atual' || id === 'stat-pes-atual' || id === 'stat-san-atual') {
        const maxVal = parseInt(document.getElementById(id.replace('-atual', '-max')).value) || 0;
        let val = Math.max(0, Math.min(parseInt(event.target.value) || 0, maxVal));
        event.target.value = val;
    }

    if (id === 'stat-defesa' || id === 'stat-esquiva' || id === 'stat-bloqueio' || id === 'stat-movimento' || id === 'char-nivel') {
        let maxVal = { 'stat-defesa': 27, 'stat-esquiva': 30, 'stat-bloqueio': 14, 'stat-movimento': 16, 'char-nivel': 8 }[id];
        let minVal = id === 'char-nivel' ? 1 : 0;
        let val = Math.max(minVal, Math.min(parseInt(event.target.value) || minVal, maxVal));
        event.target.value = val;
        if (id === 'char-nivel') calcularPontosTotais();
    }

    if (id && id.startsWith('anomalia-')) {
        let val = Math.max(-1, Math.min(parseInt(event.target.value) || 0, 5));
        event.target.value = val;
        atualizarVisoresAnomalia();
        if (id === 'anomalia-poder' || id === 'anomalia-defesa') atualizarStatusClasse();
    }

    if (event.target.closest('.pericia-stepper')) {
        let val = parseInt(event.target.value) || 0;
        event.target.value = Math.max(0, Math.min(val, 10));
        calcularPontosPericias();
    }

    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
        if (id === 'attr-forca') atualizarEspacosInventario();
        if (id && (id.startsWith('attr-') || id.startsWith('anomalia-') || id === 'char-nivel')) calcularPontosTotais();
        if (id === 'attr-intelecto') calcularPontosPericias();
        salvarDados();
    }
});

/* ==========================================================================
   RESET / BACKUP / RESTAURAÇÃO
   ========================================================================== */
function reiniciarFicha(silent = false) {
    if (silent || confirm("Atenção! Você tem certeza que deseja zerar a ficha? Todos os dados serão perdidos.")) {
        lockUpdate = true;

        ['char-nome', 'char-tamanho', 'char-vinculo', 'text-resistencias', 'text-habilidades'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('char-classe').value = '';
        document.getElementById('char-nivel').value = '1';
        ['char-idade', 'attr-vigor', 'attr-forca', 'attr-agilidade', 'attr-intelecto', 'attr-presenca', 'stat-pvs-atual', 'stat-pvs-max', 'stat-pes-atual', 'stat-pes-max', 'stat-san-atual', 'stat-san-max', 'stat-defesa', 'stat-esquiva', 'stat-bloqueio', 'stat-movimento', 'mod-pericias'].forEach(id => document.getElementById(id).value = '0');
        ['anomalia-poder', 'anomalia-defesa', 'anomalia-alcance', 'anomalia-velocidade', 'anomalia-precisao'].forEach(id => document.getElementById(id).value = '0');
        document.querySelectorAll('.pericia-item input').forEach(input => input.value = '0');

        atualizarEspacosInventario();
        atualizarMachucado();
        atualizarVisoresAnomalia();
        calcularPontosTotais();
        calcularPontosPericias();
        ordenarPericias();

        lockUpdate = false;

        if (!silent) {
            localStorage.removeItem(CHAVE_LOCAL);
            salvarDados();
            alert("A ficha foi reiniciada.");
        }
    }
}

function inicializarPericias() {
    const container = document.getElementById('pericias-box');
    if (!container) return;
    container.innerHTML = '';

    listaPericiasNomes.forEach(nome => {
        const item = document.createElement('div');
        item.className = 'pericia-item';
        item.dataset.nome = nome;
        item.innerHTML = `
            <label>${nome}</label>
            <div class="stepper pericia-stepper">
                <button type="button" class="btn-stepper" onclick="alterarPericia(this, -5)">-</button>
                <input type="number" value="0" oninput="ordenarPericias()">
                <button type="button" class="btn-stepper" onclick="alterarPericia(this, 5)">+</button>
            </div>
        `;
        container.appendChild(item);
    });
}

function atualizarEspacosInventario() {
    const container = document.getElementById('inventario-box');
    if (!container) return;

    const forca = parseInt(document.getElementById('attr-forca').value) || 0;
    const totalEspacos = 5 + (forca * 2);
    const dadosTemporarios = [];

    container.querySelectorAll('.inventario-item').forEach(item => {
        dadosTemporarios.push({
            nome: item.querySelector('input[type="text"]').value,
            valor: item.querySelector('input[type="number"]').value
        });
    });

    container.innerHTML = '';
    for (let i = 1; i <= totalEspacos; i++) {
        const item = document.createElement('div');
        item.className = 'inventario-item';
        const nomeSalvo = dadosTemporarios[i - 1] ? dadosTemporarios[i - 1].nome : '';
        const valorSalvo = dadosTemporarios[i - 1] ? dadosTemporarios[i - 1].valor : '0';

        item.innerHTML = `
            <input type="text" id="inv-nome-${i}" placeholder="Espaço ${i}..." value="${nomeSalvo}" oninput="salvarDados()">
            <div class="stepper inventario-stepper">
                <button type="button" class="btn-stepper" onclick="alterarValorInv('inv-val-${i}', -1)">-</button>
                <input type="number" id="inv-val-${i}" value="${valorSalvo}" oninput="salvarDados()">
                <button type="button" class="btn-stepper" onclick="alterarValorInv('inv-val-${i}', 1)">+</button>
            </div>
        `;
        container.appendChild(item);
    }
}

function ordenarPericias() {
    const container = document.getElementById('pericias-box');
    if (!container) return;
    const itens = Array.from(container.querySelectorAll('.pericia-item'));

    itens.sort((a, b) => (parseInt(b.querySelector('input').value) || 0) - (parseInt(a.querySelector('input').value) || 0));
    itens.forEach(item => {
        item.style.backgroundColor = obterCorVerde(parseInt(item.querySelector('input').value) || 0);
        container.appendChild(item);
    });
}

function exportarFicha() {
    salvarDados();
    const dados = coletarDadosFicha();
    const nomeDoArquivo = dados.nome ? `ficha_${dados.nome.toLowerCase().replace(/\s+/g, '_')}.json` : 'ficha_personagem.json';
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dados));

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", nomeDoArquivo);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function cortarAntigoOuDef(atual, max, legado) {
    if (atual !== undefined) return atual;
    if (legado !== undefined) return legado;
    return max || 0;
}

function importarFicha(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            preencherFichaComDados(JSON.parse(e.target.result));
            salvarDados();
            alert("Backup carregado com sucesso!");
        } catch (err) { alert("Erro ao processar o arquivo."); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function preencherFichaComDados(dados) {
    lockUpdate = true;

    if (dados.nome !== undefined) document.getElementById('char-nome').value = dados.nome;
    if (dados.classe !== undefined) document.getElementById('char-classe').value = dados.classe;
    if (dados.nivel !== undefined) document.getElementById('char-nivel').value = dados.nivel;
    if (dados.idade !== undefined) document.getElementById('char-idade').value = dados.idade;
    if (dados.tamanho !== undefined) document.getElementById('char-tamanho').value = dados.tamanho;
    if (dados.vinculo !== undefined) document.getElementById('char-vinculo').value = dados.vinculo;

    if (dados.atributos) {
        if (dados.atributos.vigor !== undefined) document.getElementById('attr-vigor').value = dados.atributos.vigor;
        if (dados.atributos.forca !== undefined) document.getElementById('attr-forca').value = dados.atributos.forca;
        if (dados.atributos.agilidade !== undefined) document.getElementById('attr-agilidade').value = dados.atributos.agilidade;
        if (dados.atributos.intelecto !== undefined) document.getElementById('attr-intelecto').value = dados.atributos.intelecto;
        if (dados.atributos.presenca !== undefined) document.getElementById('attr-presenca').value = dados.atributos.presenca;
    }

    atualizarEspacosInventario();

    if (dados.status) {
        document.getElementById('stat-pvs-max').value = dados.status.pvs_max !== undefined ? dados.status.pvs_max : (dados.status.pvs || 0);
        document.getElementById('stat-pes-max').value = dados.status.pes_max !== undefined ? dados.status.pes_max : (dados.status.pes || 0);
        document.getElementById('stat-san-max').value = dados.status.san_max !== undefined ? dados.status.san_max : (dados.status.san || 0);

        document.getElementById('stat-pvs-atual').value = cortarAntigoOuDef(dados.status.pvs_atual, dados.status.pvs_max, dados.status.pvs);
        document.getElementById('stat-pes-atual').value = cortarAntigoOuDef(dados.status.pes_atual, dados.status.pes_max, dados.status.pes);
        document.getElementById('stat-san-atual').value = cortarAntigoOuDef(dados.status.san_atual, dados.status.san_max, dados.status.san);

        if (dados.status.defesa !== undefined) document.getElementById('stat-defesa').value = dados.status.defesa;
        if (dados.status.esquiva !== undefined) document.getElementById('stat-esquiva').value = dados.status.esquiva;
        if (dados.status.bloqueio !== undefined) document.getElementById('stat-bloqueio').value = dados.status.bloqueio;
        if (dados.status.movimento !== undefined) document.getElementById('stat-movimento').value = dados.status.movimento;
        if (dados.status.mod_pericias !== undefined) document.getElementById('mod-pericias').value = dados.status.mod_pericias;
    }

    if (dados.anomalias) {
        if (dados.anomalias.poder !== undefined) document.getElementById('anomalia-poder').value = dados.anomalias.poder;
        if (dados.anomalias.defesa !== undefined) document.getElementById('anomalia-defesa').value = dados.anomalias.defesa;
        if (dados.anomalias.alcance !== undefined) document.getElementById('anomalia-alcance').value = dados.anomalias.alcance;
        if (dados.anomalias.velocidade !== undefined) document.getElementById('anomalia-velocidade').value = dados.anomalias.velocidade;
        if (dados.anomalias.precisao !== undefined) document.getElementById('anomalia-precisao').value = dados.anomalias.precisao;
    }

    if (dados.textos) {
        if (dados.textos.resistencias !== undefined) document.getElementById('text-resistencias').value = dados.textos.resistencias;
        if (dados.textos.habilidades !== undefined) document.getElementById('text-habilidades').value = dados.textos.habilidades;
    }

    if (dados.pericias) {
        document.querySelectorAll('.pericia-item').forEach(item => {
            const nome = item.dataset.nome;
            if (dados.pericias[nome] !== undefined) item.querySelector('input').value = dados.pericias[nome];
        });
    }

    if (dados.inventario && Array.isArray(dados.inventario)) {
        dados.inventario.forEach((item, index) => {
            const i = index + 1;
            const elNome = document.getElementById(`inv-nome-${i}`);
            const elVal = document.getElementById(`inv-val-${i}`);
            if (elNome && elVal) {
                elNome.value = item.nome || '';
                elVal.value = item.valor || '0';
            }
        });
    }

    atualizarMachucado();
    atualizarVisoresAnomalia();
    calcularPontosTotais();
    calcularPontosPericias();
    ordenarPericias();

    lockUpdate = false;
}

/* ==========================================================================
   PAINEL DO MESTRE
   ========================================================================== */
function enviarAjusteMestre(targetId, chave, delta) {
    if (typeof OBR === "undefined") return;
    OBR.broadcast.sendMessage(CH_AJUSTE, { targetId, chave, delta }, { destination: "ALL" })
        .catch(err => console.error("Ficha VEU RPG: falha ao enviar ajuste", err));
}

function corBarra(percentual) {
    if (percentual <= 0.25) return getComputedStyle(document.documentElement).getPropertyValue('--accent-vermelho').trim();
    if (percentual <= 0.5) return getComputedStyle(document.documentElement).getPropertyValue('--accent-amarelo').trim();
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-verde').trim();
}

function montarBarraStatus(label, atual, max) {
    const a = parseInt(atual, 10) || 0;
    const m = parseInt(max, 10) || 0;
    const perc = m > 0 ? Math.max(0, Math.min(1, a / m)) : 0;
    return `
        <div class="gm-barra-linha">
            <span class="gm-barra-label">${label}</span>
            <div class="gm-barra-trilho"><div class="gm-barra-fill" style="width:${perc * 100}%; background:${corBarra(perc)};"></div></div>
            <span class="gm-barra-valor">${a} / ${m}</span>
        </div>
    `;
}

function montarLinhaModPericias(player, ficha) {
    const valor = parseInt(ficha.status && ficha.status.mod_pericias, 10) || 0;
    return `
        <div class="gm-mod-linha">
            <label>Mod. Perícias (Mestre)</label>
            <div class="gm-mod-stepper">
                <button type="button" onclick="event.stopPropagation(); enviarAjusteMestre('${player.id}','mod_pericias',-1); this.closest('.gm-card').dataset.pendente='1';">-</button>
                <span class="gm-mod-valor">${valor}</span>
                <button type="button" onclick="event.stopPropagation(); enviarAjusteMestre('${player.id}','mod_pericias',1); this.closest('.gm-card').dataset.pendente='1';">+</button>
            </div>
        </div>
    `;
}

function melhoresPericias(ficha, quantidade = 4) {
    if (!ficha.pericias) return [];
    return Object.entries(ficha.pericias)
        .filter(([, v]) => (parseInt(v, 10) || 0) > 0)
        .sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))
        .slice(0, quantidade);
}

function montarCardJogador(player, ficha) {
    const nomePersonagem = ficha.nome || "(sem nome)";
    const classe = ficha.classe || "Sem classe";
    const nivel = ficha.nivel || 1;
    const status = ficha.status || {};
    const anomalias = ficha.anomalias || {};
    const atributos = ficha.atributos || {};
    const inventarioOcupado = (ficha.inventario || []).filter(i => i.nome && i.nome.trim() !== "").length;
    const inventarioTotal = (ficha.inventario || []).length;
    const top = melhoresPericias(ficha);

    return `
    <div class="gm-card" id="gm-card-${player.id}">
        <div class="gm-card-topo" onclick="this.closest('.gm-card').classList.toggle('aberto')">
            <span class="gm-dot" style="background:${player.color || '#888'};"></span>
            <div class="gm-nomes">
                <div class="gm-nome-personagem">${nomePersonagem}</div>
                <div class="gm-nome-jogador">${player.name || 'Jogador'}</div>
            </div>
            <span class="gm-badge-classe">${classe} • Nv ${nivel}</span>
            <span class="gm-chevron">▾</span>
        </div>

        <div class="gm-barras">
            ${montarBarraStatus('PV', status.pvs_atual, status.pvs_max)}
            ${montarBarraStatus('PE', status.pes_atual, status.pes_max)}
            ${montarBarraStatus('SAN', status.san_atual, status.san_max)}
        </div>

        <div class="gm-acoes-rapidas">
            <button type="button" class="gm-btn-rapido dano" onclick="event.stopPropagation(); enviarAjusteMestre('${player.id}','pvs_atual',-5)">PV -5</button>
            <button type="button" class="gm-btn-rapido dano" onclick="event.stopPropagation(); enviarAjusteMestre('${player.id}','pvs_atual',-1)">PV -1</button>
            <button type="button" class="gm-btn-rapido cura" onclick="event.stopPropagation(); enviarAjusteMestre('${player.id}','pvs_atual',1)">PV +1</button>
            <button type="button" class="gm-btn-rapido cura" onclick="event.stopPropagation(); enviarAjusteMestre('${player.id}','pvs_atual',5)">PV +5</button>
        </div>

        <div class="gm-detalhes">
            <div class="gm-grid-detalhe">
                <div class="gm-mini-stat"><span class="gm-mini-label">Defesa</span><span class="gm-mini-valor">${status.defesa || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Esquiva</span><span class="gm-mini-valor">${status.esquiva || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Bloqueio</span><span class="gm-mini-valor">${status.bloqueio || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Movimento</span><span class="gm-mini-valor">${status.movimento || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Machucado</span><span class="gm-mini-valor">${Math.floor((parseInt(status.pvs_max, 10) || 0) / 2)}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Inventário</span><span class="gm-mini-valor">${inventarioOcupado}/${inventarioTotal}</span></div>
            </div>

            <div class="gm-grid-detalhe">
                <div class="gm-mini-stat"><span class="gm-mini-label">Vigor</span><span class="gm-mini-valor">${atributos.vigor || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Força</span><span class="gm-mini-valor">${atributos.forca || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Agilidade</span><span class="gm-mini-valor">${atributos.agilidade || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Intelecto</span><span class="gm-mini-valor">${atributos.intelecto || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Presença</span><span class="gm-mini-valor">${atributos.presenca || 0}</span></div>
                <div class="gm-mini-stat"><span class="gm-mini-label">Poder</span><span class="gm-mini-valor">${anomalias.poder || 0}</span></div>
            </div>

            ${top.length ? `<div class="gm-pericias-destaque">${top.map(([n, v]) => `<span class="gm-pericia-tag">${n} ${v}</span>`).join('')}</div>` : ''}

            ${montarLinhaModPericias(player, ficha)}
        </div>
    </div>
    `;
}

async function renderizarPainelMestre() {
    const lista = document.getElementById('gm-lista');
    const vazio = document.getElementById('gm-vazio');
    if (!lista) return;

    try {
        const jogadores = await OBR.party.getPlayers();
        const comFicha = jogadores
            .filter(p => p.role === "PLAYER")
            .map(p => ({ player: p, ficha: p.metadata ? p.metadata[META_KEY] : undefined }))
            .filter(x => !!x.ficha);

        if (comFicha.length === 0) {
            lista.innerHTML = '';
            vazio.style.display = 'block';
            return;
        }

        vazio.style.display = 'none';

        // preserva quais cards estavam abertos entre atualizações
        const abertos = new Set(
            Array.from(lista.querySelectorAll('.gm-card.aberto')).map(el => el.id)
        );

        lista.innerHTML = comFicha
            .sort((a, b) => (a.ficha.nome || '').localeCompare(b.ficha.nome || ''))
            .map(x => montarCardJogador(x.player, x.ficha))
            .join('');

        abertos.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('aberto');
        });
    } catch (e) {
        console.error("Ficha VEU RPG: erro ao montar painel do mestre", e);
    }
}
