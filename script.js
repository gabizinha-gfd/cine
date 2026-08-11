// ==========================================
// CONFIGURAÇÕES GERAIS E CHAVES
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
const PIX_KEY = "83993967296";

// AQUI: Os E-mails com acesso total e Painel Admin
const EMAILS_CRIADORES = ["roberci.azevedo@academico.ifpb.edu.br"];

let isLoginMode = true;
let currentUserUID = null;
let statusAssinatura = "inativo"; 
let planoAtual = null;
let debounceTimer;
let biblioteca = { watchlist: {} };

// ==========================================
// UTILITÁRIOS E TOASTS
// ==========================================
function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast animate-fade-in'; t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
});

function lockScroll(lock) { document.body.classList.toggle('no-scroll', lock); }

function hojeStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================
document.getElementById('auth-switch-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-switch-text').innerText = isLoginMode ? 'Novo por aqui?' : 'Já tem conta?';
    document.getElementById('auth-switch-btn').innerText = isLoginMode ? 'Assine agora.' : 'Entrar';
    document.getElementById('auth-error').style.display = 'none';
});

document.getElementById('btn-toggle-password')?.addEventListener('click', () => {
    const pwd = document.getElementById('auth-password');
    const btn = document.getElementById('btn-toggle-password');
    if (pwd.type === 'password') { pwd.type = 'text'; btn.innerText = '🙈'; } 
    else { pwd.type = 'password'; btn.innerText = '👁️'; }
});

document.getElementById('auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const err = document.getElementById('auth-error');
    err.innerText = "A processar...";
    err.style.display = 'block';

    if (isLoginMode) {
        auth.signInWithEmailAndPassword(email, password).catch(e => err.innerText = "Erro: " + e.message);
    } else {
        auth.createUserWithEmailAndPassword(email, password).then((userCred) => {
            // Inicializa inativo. Se for criador, a próxima função resolve
            db.ref('users/' + userCred.user.uid + '/assinatura').set({ status: 'inativo', plano: null });
        }).catch(e => err.innerText = "Erro: " + e.message);
    }
});

document.getElementById('btn-guest-auth')?.addEventListener('click', () => {
    auth.signInAnonymously().catch(e => console.log(e));
});

function logout() { auth.signOut().then(() => window.location.reload()); }

// ==========================================
// GESTÃO DE SESSÃO E ASSINATURA EM TEMPO REAL
// ==========================================
auth.onAuthStateChanged(user => {
    if (user) {
        currentUserUID = user.uid;
        document.getElementById('auth-screen').style.display = 'none';
        
        // Verifica se é Conta de Criador (Admin)
        const isCreator = EMAILS_CRIADORES.includes(user.email);
        
        if (isCreator) {
            document.getElementById('nav-admin-btn').style.display = 'inline-block';
            db.ref('users/' + user.uid + '/assinatura').update({ status: 'ativo', plano: 'Criador VIP' });
        } else {
            document.getElementById('nav-admin-btn').style.display = 'none';
        }

        // Listener da Assinatura
        db.ref('users/' + user.uid + '/assinatura').on('value', snapshot => {
            const data = snapshot.val() || { status: 'inativo' };
            statusAssinatura = data.status;
            planoAtual = data.plano;
            atualizarUIBaseadoNoStatus(statusAssinatura, planoAtual);
        });

        // Listener da Watchlist (Minha Lista)
        db.ref('users/' + user.uid + '/biblioteca').on('value', snapshot => {
            biblioteca = snapshot.val() || { watchlist: {} };
            if(!biblioteca.watchlist) biblioteca.watchlist = {};
            
            if(document.getElementById('section-watchlist').style.display === 'block') {
                renderizarWatchlist();
            }
        });

    } else {
        currentUserUID = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('subscription-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'none';
    }
});

function atualizarUIBaseadoNoStatus(status, plano) {
    const badge = document.getElementById('user-sub-badge');
    if (badge) {
        if (status === 'ativo') {
            badge.innerText = (plano === 'Grátis') ? '🆓 Grátis' : '⭐ VIP Premium';
            badge.className = 'sub-badge ativo';
        } else if (status === 'pendente') {
            badge.innerText = '⏳ Análise PIX';
            badge.className = 'sub-badge pendente';
        } else {
            badge.innerText = '🔒 Sem Plano';
            badge.className = 'sub-badge inativo';
        }
    }

    if (status === 'ativo') {
        document.getElementById('subscription-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        if(document.getElementById('home-catalog').innerHTML === '') irParaHome();
    } 
    else if (status === 'pendente') {
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('subscription-screen').style.display = 'flex';
        document.getElementById('plans-grid-container').style.display = 'none';
        document.getElementById('pending-payment-container').style.display = 'block';
    } 
    else {
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('subscription-screen').style.display = 'flex';
        document.getElementById('plans-grid-container').style.display = 'block';
        document.getElementById('pending-payment-container').style.display = 'none';
    }
}

// ==========================================
// FLUXO DE COMPRA & MUDAR PLANO
// ==========================================
function assinarPlanoGratis() {
    db.ref('users/' + currentUserUID + '/assinatura').set({ status: 'ativo', plano: 'Grátis' });
    showToast("Plano Grátis ativado!");
}

function abrirModalPagamento() { 
    document.getElementById('paymentModal').style.display = 'flex'; 
    lockScroll(true); 
}

function fecharModalPagamento() { 
    document.getElementById('paymentModal').style.display = 'none'; 
    lockScroll(false); 
}

function copiarChavePix() {
    const inputPix = document.getElementById("pix-key-input");
    inputPix.select(); inputPix.setSelectionRange(0, 99999);
    try { navigator.clipboard.writeText(inputPix.value); showToast("Chave PIX copiada!"); } 
    catch(e) { document.execCommand("copy"); showToast("Chave PIX copiada!"); }
}

function solicitarConfirmacaoPix() {
    const user = auth.currentUser;
    const btn = document.getElementById('payment-submit-btn');
    btn.disabled = true; btn.innerText = "A Enviar...";

    const pedido = { 
        uid: user.uid, 
        email: user.email || 'Convidado', 
        data: new Date().toLocaleString('pt-BR'), 
        status: "pendente" 
    };

    db.ref('users/' + user.uid + '/assinatura').set({ status: 'pendente' }).then(() => {
        return db.ref('pagamentos_pendentes/' + user.uid).set(pedido);
    }).then(() => {
        fecharModalPagamento();
        btn.disabled = false; btn.innerText = "Já fiz a transferência";
        showToast("Pedido enviado! O Admin irá aprovar.");
    }).catch(err => {
        showToast("Erro.");
        btn.disabled = false; btn.innerText = "Já fiz a transferência";
    });
}

function abrirTelaPlanosDeUpgrade() {
    fecharModalPerfil();
    // Coloca status inativo para forçar tela de planos
    db.ref('users/' + currentUserUID + '/assinatura').update({ status: 'inativo' });
    document.getElementById('btn-cancel-upgrade').style.display = 'block';
}

function cancelarUpgrade() {
    // Retorna ao grátis se cancelar o upgrade
    db.ref('users/' + currentUserUID + '/assinatura').update({ status: 'ativo' });
}

// ==========================================
// PAINEL DE ADMINISTRAÇÃO (ANTI-FRAUDE)
// ==========================================
function abrirPainelAdmin() { 
    document.getElementById('adminModal').style.display = 'flex'; 
    lockScroll(true); 
    carregarPagamentosPendentes(); 
}

function fecharPainelAdmin() { 
    document.getElementById('adminModal').style.display = 'none'; 
    lockScroll(false); 
}

function carregarPagamentosPendentes() {
    const lista = document.getElementById('admin-payments-list');
    lista.innerHTML = '<p style="text-align:center; color:#aaa;">A carregar...</p>';

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
                            </div>
                            <div class="admin-actions">
                                <button class="btn-approve" onclick="aprovarPix('${uid}')">✅ Aprovar</button>
                                <button class="btn-reject" onclick="rejeitarPix('${uid}')">❌</button>
                            </div>
                        </div>`;
                }
            });
        }
        if (!temPendente) lista.innerHTML = '<p style="text-align:center; color:#2ecc71;">Tudo limpo! Nenhum pagamento pendente.</p>';
    });
}

function aprovarPix(uid) {
    if(confirm("Confirmar que o dinheiro entrou na conta PIX?")) {
        db.ref('pagamentos_pendentes/' + uid).update({ status: 'aprovado' });
        db.ref('users/' + uid + '/assinatura').set({ status: 'ativo', plano: 'VIP Premium' });
        showToast("Usuário Aprovado!");
    }
}

function rejeitarPix(uid) {
    if(confirm("Rejeitar pagamento?")) {
        db.ref('pagamentos_pendentes/' + uid).update({ status: 'rejeitado' });
        db.ref('users/' + uid + '/assinatura').set({ status: 'inativo' });
        showToast("Pagamento rejeitado.");
    }
}

// ==========================================
// ABAS E NAVEGAÇÃO
// ==========================================
function esconderSeccoes() {
    const seccoes = ['section-home', 'section-movies', 'section-series', 'section-animes', 'section-doramas', 'section-search', 'section-watchlist', 'section-chat'];
    seccoes.forEach(s => { const el = document.getElementById(s); if(el) el.style.display = 'none'; });
}

function setNavActive(id) {
    document.querySelectorAll('.nav-menu a').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mobile-bottom-nav a').forEach(el => el.classList.remove('active-nav'));
    
    if(document.getElementById(id)) document.getElementById(id).classList.add('active');
    
    if(id === 'nav-home') document.getElementById('mob-nav-home').classList.add('active-nav');
    else if(['nav-movies', 'nav-series', 'nav-animes', 'nav-doramas'].includes(id)) document.getElementById('mob-nav-titulos').classList.add('active-nav');
    else if(id === 'section-search') document.getElementById('mob-nav-search').classList.add('active-nav');
    else if(id === 'section-chat') document.getElementById('mob-nav-chat').classList.add('active-nav');
}

function toggleSubmenu() {
    const sub = document.getElementById('mobile-submenu');
    sub.classList.toggle('open');
}

function irParaHome() { esconderSeccoes(); setNavActive('nav-home'); document.getElementById('section-home').style.display = 'block'; carregarHome(); }
function irParaFilmes() { esconderSeccoes(); setNavActive('nav-movies'); document.getElementById('section-movies').style.display = 'block'; carregarAbaFilmes(); }
function irParaSeries() { esconderSeccoes(); setNavActive('nav-series'); document.getElementById('section-series').style.display = 'block'; carregarAbaSeries(); }
function irParaAnimes() { esconderSeccoes(); setNavActive('nav-animes'); document.getElementById('section-animes').style.display = 'block'; carregarAbaAnimes(); }
function irParaDoramas() { esconderSeccoes(); setNavActive('nav-doramas'); document.getElementById('section-doramas').style.display = 'block'; carregarAbaDoramas(); }
function irParaWatchlist() { esconderSeccoes(); setNavActive(''); document.getElementById('section-watchlist').style.display = 'block'; renderizarWatchlist(); }
function irParaChat() { esconderSeccoes(); setNavActive('section-chat'); document.getElementById('section-chat').style.display = 'block'; }

// ==========================================
// LIMITES DA VERSÃO GRÁTIS (PESQUISA)
// ==========================================
function podePesquisar() {
    if (planoAtual === 'VIP Premium' || planoAtual === 'Criador VIP') return true;
    
    const h = hojeStr();
    let contagens = JSON.parse(localStorage.getItem('cine_buscas') || '{}');
    if (contagens.data !== h) contagens = { data: h, count: 0 };
    
    if (contagens.count >= 3) {
        document.getElementById('search-limit-info').innerHTML = `<p style="color:#f1c40f; padding: 10px; background:#333; border-radius:8px;">Limite de 3 buscas grátis atingido hoje. <a href="#" onclick="abrirTelaPlanosDeUpgrade()" style="color:#fff;">Seja VIP</a></p>`;
        return false;
    }
    
    contagens.count++;
    localStorage.setItem('cine_buscas', JSON.stringify(contagens));
    const restam = 3 - contagens.count;
    document.getElementById('search-limit-info').innerHTML = `<p style="color:#aaa; font-size:0.9em;">Plano Grátis: Restam ${restam} buscas hoje.</p>`;
    return true;
}

function irParaBusca() { 
    esconderSeccoes(); setNavActive('section-search'); 
    document.getElementById('section-search').style.display = 'block'; 
    document.getElementById('search-limit-info').innerHTML = ''; 
}

document.getElementById('main-search-input')?.addEventListener('input', (e) => iniciarBusca(e.target.value));
document.getElementById('mobile-search-input')?.addEventListener('input', (e) => iniciarBusca(e.target.value));

function iniciarBusca(query) {
    if(document.getElementById('section-search').style.display === 'none') irParaBusca();
    
    clearTimeout(debounceTimer);
    if (query.length < 2) return;

    debounceTimer = setTimeout(async () => {
        if (!podePesquisar()) return;
        
        const container = document.getElementById('search-grid');
        container.innerHTML = '<p style="color:#aaa;">Buscando...</p>';
        const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
        
        if (res.results && res.results.length > 0) {
            renderizar(res.results.filter(i => i.poster_path), 'search-grid');
        } else {
            container.innerHTML = '<p style="color:#aaa;">Nada encontrado.</p>';
        }
    }, 800);
}

// ==========================================
// MINHA LISTA (WATCHLIST) 100% FUNCIONAL
// ==========================================
let itemDetalheAtual = null;

function alternarWatchlist() {
    if(!itemDetalheAtual) return;
    const id = itemDetalheAtual.id;
    
    if (biblioteca.watchlist[id]) {
        delete biblioteca.watchlist[id];
        showToast("Removido da Lista.");
    } else {
        biblioteca.watchlist[id] = itemDetalheAtual;
        showToast("Adicionado à Lista!");
    }
    
    // Grava no Firebase
    if (currentUserUID) {
        db.ref('users/' + currentUserUID + '/biblioteca/watchlist').set(biblioteca.watchlist);
    }
    
    // Atualiza o botão no modal
    document.getElementById('modal-watchlist-btn').innerText = biblioteca.watchlist[id] ? "✔ Na Minha Lista" : "➕ Minha Lista";
}

function renderizarWatchlist() {
    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const items = Object.values(biblioteca.watchlist);
    if(items.length === 0) {
        grid.innerHTML = '<p style="color:#aaa; grid-column:1/-1;">A sua lista está vazia.</p>';
    } else {
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.innerHTML = `<img src="https://image.tmdb.org/t/p/w200${item.poster_path}">`;
            card.onclick = () => abrirDetalhes(item.id, item.type || item.media_type);
            grid.appendChild(card);
        });
    }
}

// ==========================================
// TMDB E RENDERIZAÇÃO
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const url = `https://api.themoviedb.org/3${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=pt-BR`;
        const res = await fetch(url);
        return await res.json();
    } catch { return { results: [] }; }
}

function renderizar(items, containerId, forceType = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
        if(!item.poster_path) return;
        const div = document.createElement('div');
        div.className = 'movie-card';
        div.innerHTML = `<img src="https://image.tmdb.org/t/p/w200${item.poster_path}" loading="lazy">`;
        div.onclick = () => abrirDetalhes(item.id, forceType || item.media_type || (item.first_air_date ? 'tv' : 'movie'));
        container.appendChild(div);
    });
}

async function renderizarRow(titulo, endpoint, containerMaster, type) {
    const master = document.getElementById(containerMaster);
    const rowId = 'row_' + Math.random().toString(36).substr(2, 9);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'catalog-row';
    wrapper.innerHTML = `
        <h3>${titulo}</h3>
        <div class="carousel-container">
            <button class="carousel-btn left-btn" onclick="scrollCarousel('${rowId}', -1)">&#10094;</button>
            <div id="${rowId}" class="movie-row"></div>
            <button class="carousel-btn right-btn" onclick="scrollCarousel('${rowId}', 1)">&#10095;</button>
        </div>`;
    master.appendChild(wrapper);

    const data = await fetchTMDB(endpoint);
    renderizar(data.results, rowId, type);
}

function scrollCarousel(id, dir) {
    const el = document.getElementById(id);
    if(el) el.scrollBy({ left: (el.clientWidth * 0.8) * dir, behavior: 'smooth' });
}

async function carregarHome() {
    const heroData = await fetchTMDB('/trending/all/day');
    if(heroData.results && heroData.results.length > 0) {
        const item = heroData.results[0];
        document.getElementById('hero-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path})`;
        document.getElementById('hero-title').innerText = item.title || item.name;
        document.getElementById('hero-desc').innerText = item.overview;
        document.getElementById('hero-play-btn').onclick = () => abrirPlayer(item.id, item.media_type || 'movie');
        document.getElementById('hero-info-btn').onclick = () => abrirDetalhes(item.id, item.media_type || 'movie');
    }
    
    document.getElementById('home-catalog').innerHTML = '';
    renderizarRow("Destaques", "/trending/all/week", 'home-catalog');
    renderizarRow("Filmes de Ação", "/discover/movie?with_genres=28", 'home-catalog', 'movie');
    renderizarRow("Séries Populares", "/tv/popular", 'home-catalog', 'tv');
}

function carregarAbaFilmes() {
    document.getElementById('movies-catalog').innerHTML = '';
    renderizarRow("Populares", "/movie/popular", 'movies-catalog', 'movie');
    renderizarRow("Terror", "/discover/movie?with_genres=27", 'movies-catalog', 'movie');
    renderizarRow("Comédia", "/discover/movie?with_genres=35", 'movies-catalog', 'movie');
}

function carregarAbaSeries() {
    document.getElementById('series-catalog').innerHTML = '';
    renderizarRow("Em Alta", "/tv/popular", 'series-catalog', 'tv');
    renderizarRow("Drama", "/discover/tv?with_genres=18", 'series-catalog', 'tv');
    renderizarRow("Ficção Científica", "/discover/tv?with_genres=10765", 'series-catalog', 'tv');
}

function carregarAbaAnimes() {
    document.getElementById('animes-catalog').innerHTML = '';
    renderizarRow("Populares", "/discover/tv?with_genres=16&with_original_language=ja", 'animes-catalog', 'tv');
    renderizarRow("Ação Anime", "/discover/tv?with_genres=16,10759&with_original_language=ja", 'animes-catalog', 'tv');
}

function carregarAbaDoramas() {
    document.getElementById('doramas-catalog').innerHTML = '';
    renderizarRow("Doramas Populares", "/discover/tv?with_original_language=ko", 'doramas-catalog', 'tv');
    renderizarRow("Romance Coreano", "/discover/tv?with_original_language=ko&with_genres=10749", 'doramas-catalog', 'tv');
}

// ==========================================
// MODAL DE DETALHES E PLAYER
// ==========================================
async function abrirDetalhes(id, type) {
    const data = await fetchTMDB(`/${type}/${id}`);
    itemDetalheAtual = { id, type, poster_path: data.poster_path, title: data.title || data.name }; // Guarda para a Watchlist
    
    document.getElementById('modal-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/w780${data.backdrop_path || data.poster_path})`;
    document.getElementById('modal-title').innerText = data.title || data.name;
    document.getElementById('modal-year').innerText = (data.release_date || data.first_air_date || '').substring(0,4);
    document.getElementById('modal-rating').innerText = data.vote_average ? data.vote_average.toFixed(1) : '';
    document.getElementById('modal-overview').innerText = data.overview;
    
    // Atualiza botão Watchlist
    document.getElementById('modal-watchlist-btn').innerText = biblioteca.watchlist[id] ? "✔ Na Minha Lista" : "➕ Minha Lista";

    document.getElementById('modal-play-btn').onclick = () => abrirPlayer(id, type);

    const epContainer = document.getElementById('episodes-container');
    if (type === 'tv' && data.seasons) {
        epContainer.style.display = 'block';
        const sel = document.getElementById('modal-season-select');
        sel.innerHTML = '';
        data.seasons.filter(s => s.season_number > 0).forEach(s => {
            sel.innerHTML += `<option value="${s.season_number}">${s.name}</option>`;
        });
        sel.onchange = () => carregarEpsLista(id, sel.value);
        if(data.seasons.length > 0) carregarEpsLista(id, data.seasons[data.seasons[0].season_number === 0 && data.seasons.length > 1 ? 1 : 0].season_number);
    } else {
        epContainer.style.display = 'none';
    }

    document.getElementById('modal-details').style.display = 'flex';
    document.body.classList.add('modal-open');
}

async function carregarEpsLista(tvId, season) {
    const lista = document.getElementById('modal-episodes-list');
    lista.innerHTML = '<p style="color:#aaa;">Carregando...</p>';
    const data = await fetchTMDB(`/tv/${tvId}/season/${season}`);
    lista.innerHTML = '';
    if (data.episodes) {
        data.episodes.forEach(ep => {
            const img = ep.still_path ? `https://image.tmdb.org/t/p/w200${ep.still_path}` : '';
            lista.innerHTML += `
                <div class="episode-item" onclick="abrirPlayerEp('${tvId}', '${season}', '${ep.episode_number}')" style="display:flex; gap:15px; margin-bottom:10px; cursor:pointer;">
                    ${img ? `<img src="${img}" style="width:120px; border-radius:4px;">` : ''}
                    <div>
                        <h4 style="font-size:0.9em; margin-bottom:5px; color:#fff;">${ep.episode_number}. ${ep.name}</h4>
                        <p style="font-size:0.8em; color:#888;">▶ Assistir</p>
                    </div>
                </div>`;
        });
    }
}

function fecharDetalhes() { document.getElementById('modal-details').style.display = 'none'; document.body.classList.remove('modal-open'); }

// Todos podem assistir 
function abrirPlayer(id, type) {
    const iframe = document.getElementById('videoPlayer');
    iframe.src = `https://mgeb.top/embed/${type === 'tv' ? 'tv/'+id+'/1/1' : 'movie/'+id}?player=vidstack#color=e50914`;
    document.getElementById('streaming-player-screen').style.display = 'flex';
}
function abrirPlayerEp(id, s, e) {
    const iframe = document.getElementById('videoPlayer');
    iframe.src = `https://mgeb.top/embed/tv/${id}/${s}/${e}?player=vidstack#color=e50914`;
    document.getElementById('streaming-player-screen').style.display = 'flex';
}

document.getElementById('close-player-btn')?.addEventListener('click', () => {
    document.getElementById('videoPlayer').src = '';
    document.getElementById('streaming-player-screen').style.display = 'none';
});

// ==========================================
// CINEBOT CHAT E PERFIL
// ==========================================
function enviarChat() {
    const input = document.getElementById('chat-input');
    const txt = input.value.trim();
    if(!txt) return;
    
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML += `<div class="message user-message">${txt}</div>`;
    input.value = '';
    
    setTimeout(async () => {
        const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(txt)}`);
        if(res.results && res.results.length > 0 && res.results[0].poster_path) {
            const item = res.results[0];
            msgs.innerHTML += `
                <div class="message bot-message" style="display:flex; gap:10px; cursor:pointer;" onclick="abrirDetalhes(${item.id}, '${item.media_type || 'movie'}')">
                    <img src="https://image.tmdb.org/t/p/w92${item.poster_path}" style="border-radius:4px; width:50px;">
                    <div>
                        <strong style="color:var(--primary)">${item.title || item.name}</strong>
                        <p style="font-size:0.8em; margin-top:5px; color:#aaa;">Clique para ver mais.</p>
                    </div>
                </div>`;
        } else {
            msgs.innerHTML += `<div class="message bot-message">Desculpa, não encontrei nada.</div>`;
        }
        msgs.scrollTop = msgs.scrollHeight;
    }, 600);
}

function abrirModalPerfil() {
    document.getElementById('profile-plan-name').innerText = planoAtual || 'Nenhum';
    document.getElementById('profileModal').style.display = 'flex';
    document.body.classList.add('modal-open');
}

function fecharModalPerfil() { document.getElementById('profileModal').style.display = 'none'; document.body.classList.remove('modal-open'); }