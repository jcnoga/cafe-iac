// ======================================================
// CONFIGURAÇÃO DO FIREBASE (SUBSTITUA PELOS SEUS DADOS)
// ======================================================
const firebaseConfig = {
    apiKey: "AIzaSyAyl9gtX41SlfQADmUAXCYRnWIQyFUeX6s",
    authDomain: "cafe-iac.firebaseapp.com",
    projectId: "cafe-iac",
    storageBucket: "cafe-iac.firebasestorage.app",
    messagingSenderId: "754186773334",
    appId: "1:754186773334:web:2f49f6c17c326073c86cf7"
};

// Inicializa Firebase
let db, auth;
try {
    if(firebaseConfig.apiKey !== "SUA_API_KEY_AQUI") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
    } else {
        console.warn("Firebase não configurado.");
    }
} catch(e) { console.error("Erro Firebase:", e); }

// --- CONSTANTES ---
const CONST_ADICAO = 13;
const CONST_MULTIPLICACAO = 9;
const CONST_BASE = 1954;

// --- VARIÁVEIS GLOBAIS ---
let currentUser = null;
let licenseExpiration = 0; // Timestamp
let generatedRandomCode = 0;

// Controle de Dados de Teste vs Reais
let isTestData = false;
let isExpired = false;

let regioes = {
    "padrao": {
        id: "padrao",
        nome: "Padrão (Boletim 100)",
        fatores: { n: 1.0, p: 1.0, k: 1.0 },
        textos: {
            calagem: "Aplicar a lanço em área total e incorporar se possível.",
            gessagem: "O gesso agrícola fornece Cálcio e Enxofre.",
            organica: "Recomenda-se a utilização de adubação orgânica.",
            cob1: "",
            cob_demais: "",
            foliar: "Aplicar nos períodos frescos do dia."
        }
    }
};
let regiaoSelecionada = "padrao";
let regiaoEmEdicao = null;
let dadosRelatorio = {};

// --- INICIALIZAÇÃO ---
window.onload = function() {
    if(auth) {
        auth.onAuthStateChanged(user => {
            if(user) {
                currentUser = user;
                carregarDadosUsuario(user);
            } else {
                mostrarLogin();
            }
        });
    }
    carregarLocalStorage(); // Regiões locais
    atualizarSelectRegioes();
    
    // Listener para detectar edição manual (para invalidar "dados de teste" se a licença expirou)
    const inputs = document.querySelectorAll('#calcForm input, #calcForm select');
    inputs.forEach(el => {
        el.addEventListener('input', () => { isTestData = false; });
        el.addEventListener('change', () => { isTestData = false; });
    });
};

// --- SISTEMA DE AUTENTICAÇÃO ---
function mostrarLogin() {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('form-login').style.display = 'block';
    document.getElementById('form-cadastro').style.display = 'none';
    document.getElementById('form-recuperar').style.display = 'none';
    document.getElementById('app-content').style.display = 'none';
}
function mostrarCadastro() {
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-cadastro').style.display = 'block';
}
function mostrarRecuperar() {
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-recuperar').style.display = 'block';
}

function fazerLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const msg = document.getElementById('msg-login');
    
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => { msg.style.display = 'none'; })
        .catch(error => { msg.innerText = "Erro: " + error.message; msg.style.display = 'block'; });
}

function criarConta() {
    // CORREÇÃO: Captura do Nome do Usuário
    const nome = document.getElementById('reg-nome').value;
    const empresa = document.getElementById('reg-empresa').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const msg = document.getElementById('msg-cadastro');

    // CORREÇÃO: Validação do Nome e Empresa
    if(!nome || !empresa) { 
        msg.innerText = "Nome e Nome da Empresa são obrigatórios."; 
        msg.style.display = 'block'; 
        return; 
    }

    auth.createUserWithEmailAndPassword(email, pass)
        .then((cred) => {
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            const expirationDate = Date.now() + thirtyDaysInMs;

            return db.collection('users').doc(cred.user.uid).set({
                nome: nome, // CORREÇÃO: Salvando nome no banco
                empresa: empresa,
                email: email,
                licenseExpiration: expirationDate
            });
        })
        .then(() => { location.reload(); })
        .catch(error => { msg.innerText = error.message; msg.style.display = 'block'; });
}

function recuperarSenha() {
    const email = document.getElementById('rec-email').value;
    const msg = document.getElementById('msg-recuperar');
    if(!email) return;

    auth.sendPasswordResetEmail(email)
        .then(() => { alert("E-mail de recuperação enviado!"); mostrarLogin(); })
        .catch(error => { msg.innerText = error.message; msg.style.display = 'block'; });
}

function fazerLogout() {
    auth.signOut().then(() => location.reload());
}

// =================================================================
// FUNÇÃO MODIFICADA: Implementação de Listener em Tempo Real (onSnapshot)
// =================================================================
function carregarDadosUsuario(user) {
    // IMPLEMENTAÇÃO: Substituímos o .get() pelo .onSnapshot() para monitorar
    // alterações feitas pelo Administrador no Firebase Console em tempo real.
    // Isso garante que a atualização dos dias de crédito seja imediata.
    
    db.collection('users').doc(user.uid).onSnapshot((doc) => {
        try {
            if(doc.exists) {
                const data = doc.data();
                
                // Atualização dos dados de exibição na interface
                document.getElementById('user-display-nome').innerText = data.nome || user.email;
                document.getElementById('user-display-empresa').innerText = data.empresa;
                
                // Atualização da variável de controle da licença
                // Se o admin alterar este valor no console, o app recebe o novo valor instantaneamente
                licenseExpiration = data.licenseExpiration || 0;
                
                // Re-executa a verificação de licença com os novos dados
                verificarLicenca();
            } else {
                // CORREÇÃO PARA ERRO DE LOGIN (Lógica original preservada): 
                console.warn("Perfil de usuário não encontrado no Firestore. Iniciando sessão padrão.");
                document.getElementById('user-display-nome').innerText = user.email;
                document.getElementById('user-display-empresa').innerText = "Não informado";
                licenseExpiration = 0; // Assume expirado por segurança
                verificarLicenca();
            }
        } catch (e) {
            console.error("Erro ao processar atualização do perfil:", e);
        }
    }, (error) => {
        console.error("Erro no listener de dados do usuário:", error);
        alert("Erro de conexão. Verifique sua internet.");
    });
    
    // Liberação Admin
    if(user.email === 'jcnvap@gmail.com') {
        document.getElementById('btn-tab-admin').style.display = 'inline-block';
    }
}

// --- SISTEMA DE LICENÇA (AUTORIZAÇÃO) ---

function verificarLicenca() {
    const now = Date.now();
    const diff = licenseExpiration - now;
    const statusTxt = document.getElementById('status-licenca-texto');
    const timerTxt = document.getElementById('license-timer');
    const dataVal = document.getElementById('data-validade');
    const alertBar = document.getElementById('system-alert-bar');

    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';

    if(diff > 0) {
        // Licença Válida
        isExpired = false;
        const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
        statusTxt.innerText = "✅ APLICATIVO AUTORIZADO";
        statusTxt.style.color = "green";
        timerTxt.innerText = `${dias} dias restantes`;
        dataVal.innerText = "Válido até: " + new Date(licenseExpiration).toLocaleDateString();
        alertBar.style.display = 'none';
    } else {
        // Licença Expirada
        isExpired = true;
        statusTxt.innerText = "❌ BLOQUEADO - LICENÇA EXPIRADA";
        statusTxt.style.color = "red";
        timerTxt.innerText = "EXPIRADO";
        dataVal.innerText = "Expirou em: " + new Date(licenseExpiration).toLocaleDateString();
        
        // Mostra barra de alerta vermelha
        alertBar.style.display = 'block';
    }
}

// Geração de Código Automática e Mascarada
function gerarCodigoAleatorio() {
    generatedRandomCode = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
    // Exibe mascarado conforme solicitado
    document.getElementById('codigo-aleatorio').innerText = "******"; 
    // Garante que o botão de WhatsApp esteja visível
    document.getElementById('btn-whatsapp').style.display = 'block';
}

// Envio via WhatsApp com formato específico
function enviarWhatsApp() {
    if(generatedRandomCode === 0) return alert("Erro no código. Tente reabrir a configuração.");
    
    const dias = document.getElementById('select-dias-solicita').value;
    const numero = "5534997824990";
    
    // Formato Obrigatório: Código + Dias + Palavra-chave "café"
    const msg = `Olá! Solicito liberação.\nCódigo: ${generatedRandomCode}\nDias: ${dias}\ncafé`;
    
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

// Validação com Fórmula Específica
function validarContraSenha() {
    // Pega valores dos dois inputs
    const contraSenhaInput = parseInt(document.getElementById('input-contra-senha-val').value);
    const diasInput = parseInt(document.getElementById('input-dias-liberados').value);

    if(isNaN(contraSenhaInput) || isNaN(diasInput)) {
        alert("Por favor, preencha a Contra-Senha e os Dias Liberados.");
        return;
    }

    // Fórmula Solicitada: (código_gerado + 13) × 9 + 1954 + número_de_dias_solicitados
    // Nota: A variável global 'generatedRandomCode' contém o valor real, enquanto a tela mostra mascarado.
    const valorEsperado = ((generatedRandomCode + 13) * 9) + 1954 + diasInput;

    if(contraSenhaInput === valorEsperado) {
        adicionarDiasLicenca(diasInput);
    } else {
        alert("Contra-senha inválida. Verifique os dados com o administrador.");
    }
}

function adicionarDiasLicenca(dias) {
    const now = Date.now();
    let baseTime = (licenseExpiration > now) ? licenseExpiration : now;
    const newExpiration = baseTime + (dias * 24 * 60 * 60 * 1000);

    db.collection('users').doc(currentUser.uid).update({
        licenseExpiration: newExpiration
    }).then(() => {
        alert(`Sucesso! Adicionados ${dias} dias.`);
        // Não é necessário reload devido ao listener, mas mantém UX de feedback
        // O listener cuidará da atualização da UI.
    });
}

function adminZerarDias() {
    if(!confirm("Tem certeza que deseja ZERAR a licença deste usuário?")) return;
    db.collection('users').doc(currentUser.uid).update({ licenseExpiration: 0 });
    // Reload removido pois onSnapshot atualiza automaticamente
}

function adminSetarUmDia() {
    const oneDay = Date.now() + (24 * 60 * 60 * 1000);
    db.collection('users').doc(currentUser.uid).update({ licenseExpiration: oneDay })
      .then(() => { alert("Configurado para 1 dia."); });
}

// --- MODAIS ---
function abrirModalConfig(abaInicial = 'licenca') {
    document.getElementById('modal-settings').style.display = "block";
    mudarAbaConfig(abaInicial);
    renderizarListaRegioes();
    
    // Geração Automática ao abrir o modal/configurações
    gerarCodigoAleatorio();
}
function fecharModalConfig() {
    document.getElementById('modal-settings').style.display = "none";
    atualizarSelectRegioes();
}
function mudarAbaConfig(aba) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-bar .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + aba).classList.add('active');
    const btns = document.querySelectorAll('.tab-bar .tab-btn');
    if(aba==='licenca') btns[0].classList.add('active');
    if(aba==='regioes') btns[1].classList.add('active');
    if(aba==='admin') btns[2].classList.add('active');
}
function mudarSubAba(subaba) {
    document.getElementById('subaba-fatores').style.display = (subaba==='fatores') ? 'block' : 'none';
    document.getElementById('subaba-textos').style.display = (subaba==='textos') ? 'block' : 'none';
    const btns = document.querySelectorAll('.subtab-btn');
    btns[0].classList.toggle('active', subaba==='fatores');
    btns[1].classList.toggle('active', subaba==='textos');
}

// --- REGIÕES ---
function carregarLocalStorage() {
    const salvo = localStorage.getItem('appCafeRegioes');
    if (salvo) {
        const regioesSalvas = JSON.parse(salvo);
        regioes = { ...regioes, ...regioesSalvas };
        regioes["padrao"].fatores = { n: 1.0, p: 1.0, k: 1.0 };
    }
}
function salvarLocalStorage() { localStorage.setItem('appCafeRegioes', JSON.stringify(regioes)); }

function renderizarListaRegioes() {
    const tbody = document.getElementById('lista-regioes-body');
    tbody.innerHTML = "";
    for (let id in regioes) {
        const r = regioes[id];
        const tr = document.createElement('tr');
        const tdNome = document.createElement('td');
        tdNome.innerHTML = `<strong>${r.nome}</strong>` + (id==="padrao"?" <small>(Sistema)</small>":"");
        const tdFatores = document.createElement('td');
        tdFatores.innerHTML = `<span class="tag-factor">N:${r.fatores.n}</span><span class="tag-factor">P:${r.fatores.p}</span><span class="tag-factor">K:${r.fatores.k}</span>`;
        const tdAcoes = document.createElement('td');
        tdAcoes.style.textAlign = "right";
        tdAcoes.innerHTML = `<button class="btn-icon btn-edit" onclick="iniciarEdicao('${id}')">✏️</button>`;
        if(id !== "padrao") tdAcoes.innerHTML += `<button class="btn-icon btn-delete" onclick="excluirRegiao('${id}')">🗑️</button>`;
        tr.appendChild(tdNome); tr.appendChild(tdFatores); tr.appendChild(tdAcoes);
        tbody.appendChild(tr);
    }
}

function criarNovaRegiao() {
    const nome = document.getElementById('novo_nome_regiao').value;
    if (!nome) return alert("Digite um nome.");
    const id = "reg_" + new Date().getTime();
    regioes[id] = JSON.parse(JSON.stringify(regioes["padrao"]));
    regioes[id].id = id; regioes[id].nome = nome;
    document.getElementById('novo_nome_regiao').value = "";
    salvarLocalStorage(); renderizarListaRegioes(); iniciarEdicao(id);
}

function iniciarEdicao(id) {
    regiaoEmEdicao = id;
    const r = regioes[id];
    document.getElementById('editor-regiao').style.display = "block";
    document.getElementById('editando-nome').innerText = r.nome;
    document.getElementById('fator_n').value = r.fatores.n;
    document.getElementById('fator_p').value = r.fatores.p;
    document.getElementById('fator_k').value = r.fatores.k;
    document.getElementById('txt_calagem').value = r.textos.calagem;
    document.getElementById('txt_gessagem').value = r.textos.gessagem;
    document.getElementById('txt_organica').value = r.textos.organica;
    document.getElementById('txt_cob1').value = r.textos.cob1;
    document.getElementById('txt_cob_demais').value = r.textos.cob_demais;
    document.getElementById('txt_foliar').value = r.textos.foliar;
}

function salvarRegiaoAtual() {
    if(!regiaoEmEdicao) return;
    const id = regiaoEmEdicao;
    if(id === "padrao") {
       const n = parseFloat(document.getElementById('fator_n').value);
       if(n !== 1) { alert("Padrão deve manter fatores 1.0"); return; }
    }
    regioes[id].fatores.n = parseFloat(document.getElementById('fator_n').value);
    regioes[id].fatores.p = parseFloat(document.getElementById('fator_p').value);
    regioes[id].fatores.k = parseFloat(document.getElementById('fator_k').value);
    regioes[id].textos.calagem = document.getElementById('txt_calagem').value;
    regioes[id].textos.gessagem = document.getElementById('txt_gessagem').value;
    regioes[id].textos.organica = document.getElementById('txt_organica').value;
    regioes[id].textos.cob1 = document.getElementById('txt_cob1').value;
    regioes[id].textos.cob_demais = document.getElementById('txt_cob_demais').value;
    regioes[id].textos.foliar = document.getElementById('txt_foliar').value;
    salvarLocalStorage(); renderizarListaRegioes(); cancelarEdicao();
}

function cancelarEdicao() { document.getElementById('editor-regiao').style.display = "none"; regiaoEmEdicao = null; }
function excluirRegiao(id) { delete regioes[id]; salvarLocalStorage(); renderizarListaRegioes(); }
function atualizarSelectRegioes() {
    const select = document.getElementById('regiao_select');
    select.innerHTML = "";
    for(let key in regioes) {
        let opt = document.createElement('option'); opt.value = key; opt.innerText = regioes[key].nome;
        if(key === regiaoSelecionada) opt.selected = true;
        select.appendChild(opt);
    }
    regiaoSelecionada = select.value;
}
function carregarRegiaoSelecionada() { regiaoSelecionada = document.getElementById('regiao_select').value; }

// --- CÁLCULO E RELATÓRIO ---
function preencherDadosTeste() {
    document.getElementById('produtor').value = "Fazenda Teste";
    document.getElementById('produtividade').value = 45;
    document.getElementById('textura').value = "media";
    document.getElementById('v_atual').value = 45;
    document.getElementById('ctc').value = 90;
    document.getElementById('prnt').value = 85;
    document.getElementById('p_resina').value = 15;
    document.getElementById('k_solo').value = 1.4;
    document.getElementById('ca_solo').value = 25;
    document.getElementById('mg_solo').value = 6;
    document.getElementById('aviso-teste').style.display = 'block';
    
    // Ativa flag de teste
    isTestData = true;
    // Alerta visual de sucesso
    alert("Dados de teste carregados. Você pode gerar a recomendação.");
}

function gerarRecomendacao() {
    // Lógica de Expiração: Bloqueia se expirado E não for dados de teste
    if(isExpired && !isTestData) {
        alert("SUA LICENÇA EXPIROU.\n\nVocê só pode gerar recomendações utilizando a opção 'Dados de Teste'.\nPara utilizar dados reais, renove sua licença nas Configurações.");
        return;
    }

    const config = regioes[regiaoSelecionada];
    const fatores = config.fatores;
    const textos = config.textos;

    const produtor = document.getElementById('produtor').value || "Não informado";
    const meta = parseFloat(document.getElementById('produtividade').value) || 0;
    const textura = document.getElementById('textura').value;
    const vAtual = parseFloat(document.getElementById('v_atual').value) || 0;
    const ctc = parseFloat(document.getElementById('ctc').value) || 0;
    const prnt = parseFloat(document.getElementById('prnt').value) || 0;
    const pResina = parseFloat(document.getElementById('p_resina').value) || 0;
    const kSolo = parseFloat(document.getElementById('k_solo').value) || 0;
    
    const bSolo = parseFloat(document.getElementById('b_solo').value);
    const znSolo = parseFloat(document.getElementById('zn_solo').value);
    const cuSolo = parseFloat(document.getElementById('cu_solo').value);

    if (meta === 0) { alert("Informe a produtividade."); return; }

    document.getElementById('data-atual').innerText = new Date().toLocaleDateString('pt-BR');
    document.getElementById('rep-produtor').innerText = produtor;
    document.getElementById('rep-meta').innerText = meta;

    // Cálculos
    let nc = 0;
    if (vAtual < 70) nc = ((70 - vAtual) * (ctc / 10)) * (100 / prnt);
    let maxCalc = (textura==='arenosa'?2:(textura==='argilosa'?4:3));
    let doseCalc = (nc > maxCalc) ? maxCalc : (nc > 0 ? nc : 0);
    let obsCal = (doseCalc > 0) ? textos.calagem : "Sem necessidade.";
    if(doseCalc === maxCalc && nc > maxCalc) obsCal += " (Dose máxima aplicada, parcelar restante).";

    let htmlCal = `<tr><td>Calagem</td><td><strong>${doseCalc.toFixed(1)} t/ha</strong></td><td>${obsCal}</td></tr>`;
    const caSolo = parseFloat(document.getElementById('ca_solo').value)||0;
    if(caSolo < 20 && doseCalc < 1) htmlCal += `<tr><td>Gessagem</td><td>700 kg/ha</td><td>${textos.gessagem}</td></tr>`;
    
    document.getElementById('table-calagem-body').innerHTML = htmlCal;
    document.getElementById('text-calagem').innerText = doseCalc>0 ? `Necessidade de correção identificada (V% atual: ${vAtual}).` : "Saturação de bases em nível adequado.";
    document.getElementById('text-organica').innerText = textos.organica;

    // NPK + Fatores
    let dN=0, dK=0, dP=0;
    if(meta<=20){dN=200;dK=200;} else if(meta<=30){dN=300;dK=250;} else if(meta<=40){dN=400;dK=300;} else if(meta<=50){dN=500;dK=350;} else{dN=600;dK=400;}
    if(kSolo>=1.6 && kSolo<=3.0) dK*=0.75; else if(kSolo>3.0) dK*=0.50;
    if(pResina<=10) dP=200; else if(pResina<=20) dP=150; else if(pResina<=30) dP=100; else dP=50;

    dN *= fatores.n; dP *= fatores.p; dK *= fatores.k;

    // Frases Padronizadas e Técnicas
    const frase1 = `Aplicação técnica recomendada para Setembro/Outubro, utilizando Ureia Agrícola e Cloreto de Potássio, visando o início das chuvas e retomada vegetativa.`;
    const frase2 = `Aplicação técnica recomendada para Dezembro, utilizando Ureia Agrícola e Cloreto de Potássio, para suporte à fase de chumbinho e expansão dos frutos.`;
    const frase3 = `Aplicação técnica recomendada para Março, utilizando Ureia Agrícola e Cloreto de Potássio, visando a fase de granação final e maturação dos frutos.`;

    const parc = [
        {ep:"1ª Cobertura", n:dN*0.3, p:dP*0.5, k:dK*0.3, phrase: frase1},
        {ep:"2ª Cobertura", n:dN*0.4, p:dP*0.5, k:dK*0.4, phrase: frase2},
        {ep:"3ª Cobertura", n:dN*0.3, p:0,      k:dK*0.3, phrase: frase3}
    ];
    
    let htmlNut = "";
    parc.forEach(p => {
            let u = (p.n/0.45).toFixed(0), ss = p.p>0?(p.p/0.18).toFixed(0):0, kcl = (p.k/0.60).toFixed(0);
            let prodStr = `<strong>Ureia Agrícola:</strong> ${u} kg/ha`;
            if(ss>0) prodStr += `<br><strong>Superfosfato Simples:</strong> ${ss} kg/ha`;
            prodStr += `<br><strong>Cloreto de Potássio:</strong> ${kcl} kg/ha`;
            
            htmlNut += `<tr>
            <td><strong>${p.ep}</strong></td>
            <td>N: ${p.n.toFixed(0)} kg/ha<br>P₂O₅: ${p.p.toFixed(0)} kg/ha<br>K₂O: ${p.k.toFixed(0)} kg/ha</td>
            <td>${prodStr}<br><br><em style="font-size:0.85rem; color:#444;">${p.phrase}</em></td>
            </tr>`;
    });
    document.getElementById('table-adubacao-body').innerHTML = htmlNut;
    document.getElementById('text-mineral').innerText = `Doses calculadas conforme meta de produtividade e ajustadas pelos teores do solo.`;

    // Micro
    let hMic = "";
    if(bSolo<=0.2) hMic+="<p>Boro baixo. Aplicar 2kg/ha B.</p>";
    if(znSolo<=0.5) hMic+="<p>Zinco baixo. Aplicar 6kg/ha Zn.</p>";
    if(cuSolo<=0.3) hMic+="<p>Cobre baixo. Aplicar 3kg/ha Cu.</p>";
    document.getElementById('text-micro-solo').innerHTML = hMic||"<p>Teores de micronutrientes adequados no solo.</p>";
    document.getElementById('text-foliar').innerText = textos.foliar;

    dadosRelatorio = { produtor };
    document.getElementById('report-output').style.display = 'block';
    document.getElementById('actions-div').style.display = 'flex';
    document.getElementById('report-output').scrollIntoView({behavior:'smooth'});
}

// --- DOWNLOAD DOCX CORRIGIDO ---
function baixarDOCX() {
    if(!dadosRelatorio.produtor) { alert("Gere o relatório primeiro."); return; }

    // Verifica se FileSaver carregou (Prevenção de erro "saveAs is not defined")
    if (typeof saveAs === 'undefined') {
        alert("Erro: A biblioteca de salvamento não foi carregada. Verifique sua conexão com a internet.");
        return;
    }

    // Captura o HTML do relatório
    const reportContent = document.getElementById('report-output').innerHTML;

    // Estrutura completa para melhor compatibilidade com MS Word
    const fullHTML = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>Recomendação Técnica</title>
            <style>
                body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; }
                h2 { color: #2c5e2e; font-size: 16pt; margin-bottom: 10px; border-bottom: 2px solid #ccc; padding-bottom: 5px; text-align: center; }
                h3 { color: #2c5e2e; font-size: 14pt; margin-top: 20px; margin-bottom: 10px; background-color: #f0f0f0; padding: 5px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                th { background-color: #e0e0e0; font-weight: bold; border: 1px solid #000000; padding: 8px; text-align: left; }
                td { border: 1px solid #000000; padding: 8px; vertical-align: top; }
                .recommendation-text { margin-bottom: 15px; text-align: justify; white-space: pre-wrap; }
            </style>
        </head>
        <body>
            ${reportContent}
        </body>
        </html>
    `;

    try {
        const converted = htmlDocx.asBlob(fullHTML, { 
            orientation: 'portrait', 
            margins: { top: 720, bottom: 720, left: 720, right: 720 } 
        });
        saveAs(converted, `Recomendacao_${dadosRelatorio.produtor}.docx`);
    } catch (e) {
        alert("Erro ao gerar DOCX: " + e.message);
    }
}

// --- DOWNLOAD PDF CORRIGIDO ---
function baixarPDF() {
    if(!dadosRelatorio.produtor) { alert("Gere o relatório primeiro."); return; }
    
    // Garante que a página esteja no topo para evitar cortes no Canvas
    window.scrollTo(0, 0);

    const element = document.getElementById('report-output');
    
    // Opções otimizadas para PDF robusto
    const opt = {
        margin:       10, // Margem em mm
        filename:     `Recomendacao_${dadosRelatorio.produtor}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 }, // Scale 2 melhora qualidade sem pesar tanto
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        enableLinks:  false // Evita erros de referência cruzada
    };

    html2pdf().set(opt).from(element).save().catch(err => {
        console.error(err);
        alert("Erro ao gerar PDF. Tente novamente.");
    });
}