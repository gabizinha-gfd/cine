// ==========================================
// CONFIGURAÇÕES CORE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAfPWvnGdvPKZ_lrVwOuag14WHLY9AgML8",
    authDomain: "cinenet-ifpb.firebaseapp.com",
    databaseURL: "https://cinenet-ifpb-default-rtdb.firebaseio.com",
    projectId: "cinenet-ifpb",
    storageBucket: "cinenet-ifpb.firebasestorage.app",
    messagingSenderId: "1098247355110",
    appId: "1:1098247355110:web:c9f867826f26b0ef171927"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

const TMDB_KEY = "17c56e3825d7fbae6581866083d0d778";
const ADMIN_EMAIL = "roberci.azevedo@academico.ifpb.edu.br"; 
const PIX_KEY = "83993967296";

let isLoginMode = true;
let currentUserUID = null;
let statusAssinatura = "inativo"; // "inativo", "pendente", "ativo"

// ==========================================
// AUTENTICAÇÃO E CONTROLO DE ESTADO
// ==========================================
function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast animate-fade-in'; t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

document.getElementById('auth-switch-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-switch-btn').innerText = isLoginMode ? 'Assine agora.' : 'Entrar';
});

document.getElementById('auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const err = document.getElementById('auth-error');
    err.innerText = "Processando...";

    if (isLoginMode) {
        auth.signInWithEmailAndPassword(email, password).catch(e => err.innerText = "Erro: " + e.message);
    } else {
        auth.createUserWithEmailAndPassword(email, password).then((userCred) => {
            // Conta nova: Define como inativo
            db.ref('users/' + userCred.user.uid + '/assinatura').set({ status: 'inativo' });
        }).catch(e => err.innerText = "Erro: " + e.message);
    }
});

function logout() { auth.signOut().then(() => window.location.reload()); }

// ESCUTA O UTILIZADOR E O STATUS DE PAGAMENTO EM TEMPO REAL
auth.onAuthStateChanged(user => {
    if (user) {
        currentUserUID = user.uid;
        document.getElementById('auth-screen').style.display = 'none';
        
        // Verifica se é o Admin para mostrar o botão do painel
        if (user.email === ADMIN_EMAIL) {
            document.getElementById('nav-admin-btn').style.display = 'block';
        }

        // Listener em Tempo Real da Assinatura (Impede Fraudes e Atualiza a Tela Instantaneamente)
        db.ref('users/' + user.uid + '/assinatura').on('value', snapshot => {
            const data = snapshot.val();
            statusAssinatura = data ? data.status : "inativo";
            
            atualizarBadge(statusAssinatura);

            if (statusAssinatura === 'ativo') {
                // Pagamento Confirmado -> Libera a App
                document.getElementById('subscription-screen').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                carregarHome(); // Carrega os filmes
            } 
            else if (statusAssinatura === 'pendente') {
                // Pagamento Pendente -> Tela de Aguardar
                document.getElementById('app-content').style.display = 'none';
                document.getElementById('subscription-screen').style.display = 'flex';
                document.getElementById('plans-grid-container').style.display = 'none';
                document.getElementById('pending-payment-container').style.display = 'block';
            } 
            else {
                // Inativo/Recusado -> Mostrar Planos
                document.getElementById('app-content').style.display = 'none';
                document.getElementById('subscription-screen').style.display = 'flex';
                document.getElementById('plans-grid-container').style.display = 'block';
                document.getElementById('pending-payment-container').style.display = 'none';
            }
        });
    } else {
        currentUserUID = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('subscription-screen').style.display = 'none';
    }
});

function atualizarBadge(status) {
    const badge = document.getElementById('user-sub-badge');
    if (!badge) return;
    if (status === 'ativo') {
        badge.innerHTML = '⭐ VIP Premium';
        badge.className = 'sub-badge ativo';
    } else if (status === 'pendente') {
        badge.innerHTML = '⏳ Análise PIX';
        badge.className = 'sub-badge pendente';
    } else {
        badge.innerHTML = '🔒 Sem Assinatura';
        badge.className = 'sub-badge inativo';
    }
}

// ==========================================
// FLUXO DE PAGAMENTO (USUÁRIO)
// ==========================================

// Plano Grátis (Opção limitada - exemplo, aprova direto mas vc pode limitar no Player depois)
function assinarPlanoGratis() {
    db.ref('users/' + currentUserUID + '/assinatura').set({ status: 'ativo', plano: 'Grátis' });
    showToast("Plano Grátis ativado com sucesso!");
}

function abrirModalPagamento() {
    document.getElementById('paymentModal').style.display = 'flex';
}

function fecharModalPagamento() {
    document.getElementById('paymentModal').style.display = 'none';
}

function copiarChavePix() {
    navigator.clipboard.writeText(PIX_KEY).then(() => {
        showToast("Chave PIX copiada!");
    }).catch(() => {
        showToast("Selecione a chave e copie manualmente.");
    });
}

// Quando o usuário clica em "Já fiz a transferência"
function solicitarConfirmacaoPix() {
    const user = auth.currentUser;
    const btn = document.getElementById('payment-submit-btn');
    btn.disabled = true;
    btn.innerText = "Enviando solicitação...";

    const pedido = {
        uid: user.uid,
        email: user.email,
        status: "pendente",
        data: new Date().toLocaleString('pt-BR'),
        plano: "VIP Premium",
        valor: "R$ 14,90"
    };

    // Atualiza o perfil do usuário para Pendente
    db.ref('users/' + user.uid + '/assinatura').set({ status: 'pendente' }).then(() => {
        // Envia para a fila do Administrador
        return db.ref('pagamentos_pendentes/' + user.uid).set(pedido);
    }).then(() => {
        fecharModalPagamento();
        showToast("Solicitação enviada! O administrador irá analisar o seu PIX.");
        btn.disabled = false;
        btn.innerText = "Já fiz a transferência";
    }).catch(err => {
        showToast("Erro de conexão. Tente novamente.");
        btn.disabled = false;
        btn.innerText = "Já fiz a transferência";
    });
}

// ==========================================
// PAINEL DO ADMINISTRADOR (ANTI-FRAUDE)
// ==========================================

function abrirPainelAdmin() {
    document.getElementById('adminModal').style.display = 'flex';
    carregarPagamentosPendentes();
}

function fecharPainelAdmin() {
    document.getElementById('adminModal').style.display = 'none';
}

function carregarPagamentosPendentes() {
    const lista = document.getElementById('admin-payments-list');
    lista.innerHTML = '<p style="text-align:center; color:#aaa;">Carregando...</p>';

    db.ref('pagamentos_pendentes').on('value', snapshot => {
        lista.innerHTML = '';
        const dados = snapshot.val();
        let temPendente = false;

        if (dados) {
            Object.keys(dados).forEach(uid => {
                const p = dados[uid];
                if (p.status === 'pendente') {
                    temPendente = true;
                    lista.innerHTML += `
                        <div class="admin-row">
                            <div class="admin-info">
                                <p><strong>Email:</strong> ${p.email}</p>
                                <p><strong>Data:</strong> ${p.data}</p>
                                <p><strong>Valor:</strong> ${p.valor}</p>
                            </div>
                            <div class="admin-actions">
                                <button class="btn-approve" onclick="aprovarPix('${p.uid}')">✅ Aprovar</button>
                                <button class="btn-reject" onclick="rejeitarPix('${p.uid}')">❌ Rejeitar</button>
                            </div>
                        </div>
                    `;
                }
            });
        }

        if (!temPendente) {
            lista.innerHTML = '<p style="text-align:center; color:#2ecc71; padding: 20px;">Nenhum pagamento pendente!</p>';
        }
    });
}

function aprovarPix(uid) {
    if(confirm("Confirmar que o dinheiro caiu na conta? O acesso será libertado imediatamente.")) {
        // Atualiza a fila
        db.ref('pagamentos_pendentes/' + uid).update({ status: 'aprovado' });
        // Libera o utilizador (Isto ativa o OnSnapshot na tela dele em tempo real!)
        db.ref('users/' + uid + '/assinatura').set({ status: 'ativo', plano: 'VIP Premium' });
        showToast("Pagamento Aprovado! Usuário libertado.");
    }
}

function rejeitarPix(uid) {
    if(confirm("Tem a certeza que deseja rejeitar este pagamento? O utilizador voltará para a tela de planos.")) {
        db.ref('pagamentos_pendentes/' + uid).update({ status: 'rejeitado' });
        db.ref('users/' + uid + '/assinatura').set({ status: 'inativo' });
        showToast("Pagamento rejeitado.");
    }
}

// ==========================================
// REPRODUTOR DE VÍDEO (BLINDADO)
// ==========================================
function abrirPlayer(id, tipo) {
    const user = auth.currentUser;
    const eAdmin = user && user.email === ADMIN_EMAIL;

    // A BARREIRA FINAL ANTI-FRAUDE
    if (statusAssinatura !== 'ativo' && !eAdmin) {
        showToast("⚠️ Assinatura necessária para reproduzir este título.");
        return; // BLOQUEIA A EXECUÇÃO DO VÍDEO
    }

    const container = document.getElementById('streaming-player-screen');
    const iframe = document.getElementById('videoPlayer');
    
    if (tipo === 'tv') {
        iframe.src = `https://mgeb.top/embed/tv/${id}/1/1`;
    } else {
        iframe.src = `https://mgeb.top/embed/movie/${id}`;
    }
    
    container.style.display = 'flex';
}

document.getElementById('close-player-btn')?.addEventListener('click', () => {
    document.getElementById('streaming-player-screen').style.display = 'none';
    document.getElementById('videoPlayer').src = '';
});

// ==========================================
// TMDB FETCH DATA (Mantido do seu sistema)
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const res = await fetch(`https://api.themoviedb.org/3${endpoint}?api_key=${TMDB_KEY}&language=pt-BR`);
        return await res.json();
    } catch { return { results: [] }; }
}

function carregarHome() {
    // Apenas um exemplo de carregamento na tela principal
    fetchTMDB('/movie/popular').then(data => {
        const container = document.getElementById('row-trending');
        if(!container) return;
        container.innerHTML = '';
        data.results.forEach(item => {
            if(!item.poster_path) return;
            const div = document.createElement('div');
            div.className = 'movie-card';
            div.innerHTML = `<img src="https://image.tmdb.org/t/p/w200${item.poster_path}" alt="Poster">`;
            div.onclick = () => abrirPlayer(item.id, 'movie');
            container.appendChild(div);
        });
    });
}
function irParaHome() { document.getElementById('main-content').style.display = 'block'; }