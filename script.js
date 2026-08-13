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
const EMAILS_CRIADORES = ["roberci.azevedo@academico.ifpb.edu.br"];

const avataresSeguros = [
    "https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e50914",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=1f1f1f",
    "https://api.dicebear.com/7.x/bottts/svg?seed=Robot1&backgroundColor=b20710"
];

let isLoginMode = true;
let currentUserUID = null;
let statusAssinatura = "inativo"; 
let planoAtual = null;
let debounceTimer;
let payTimeouts = []; // Para o Bot Anti-fraude
let biblioteca = { watchlist: {}, perfil: { nome: "Utilizador", avatar: avataresSeguros[0] } };
let itemDetalheAtual = null;
let avatarTemporario = avataresSeguros[0];

// ==========================================
// UTILITÁRIOS & SMART TV NAV
// ==========================================
function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast animate-fade-in'; t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
});

function lockScroll(lock) { document.body.classList.toggle('no-scroll', lock); }
function hojeStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }

// Permitir clicar usando a tecla "Enter" no comando da TV
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.tabIndex === 0) {
        document.activeElement.click();
    }
});

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
            db.ref('users/' + userCred.user.uid + '/assinatura').set({ status: 'inativo', plano: null });
            db.ref('users/' + userCred.user.uid + '/biblioteca/perfil').set({ nome: "Utilizador Novo", avatar: avataresSeguros[0] });
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
        
        const isCreator = EMAILS_CRIADORES.includes(user.email);
        if (isCreator) {
            db.ref('users/' + user.uid + '/assinatura').update({ status: 'ativo', plano: 'VIP Premium' });
        }

        db.ref('users/' + user.uid + '/assinatura').on('value', snapshot => {
            const data = snapshot.val() || { status: 'inativo' };
            statusAssinatura = data.status;
            planoAtual = data.plano;
            atualizarUIBaseadoNoStatus(statusAssinatura, planoAtual);
        });

        db.ref('users/' + user.uid + '/biblioteca').on('value', snapshot => {
            const data = snapshot.val() || {};
            biblioteca.watchlist = data.watchlist || {};
            biblioteca.perfil = data.perfil || { nome: "Utilizador", avatar: avataresSeguros[0] };
            
            const namePc = document.getElementById('user-name-pc');
            if(namePc) {
                namePc.innerText = biblioteca.perfil.nome;
                namePc.style.display = 'inline'; // TV support
            }
            document.getElementById('user-avatar-pc').src = biblioteca.perfil.avatar;
            
            if(document.getElementById('section-watchlist').style.display === 'block') renderizarWatchlist();
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
            badge.innerText = (plano === 'Grátis') ? '🆓 Grátis' : '⭐ VIP';
            badge.className = 'sub-badge ativo';
        } else {
            badge.innerText = '🔒 Sem Plano';
            badge.className = 'sub-badge inativo';
        }
    }

    if (status === 'ativo') {
        document.getElementById('subscription-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        if(document.getElementById('home-catalog').innerHTML === '') irParaHome();
    } else {
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('subscription-screen').style.display = 'flex';
    }
}

// ==========================================
// SIMULAÇÃO DO BOT ANTI-FRAUDE (PIX)
// ==========================================
function assinarPlanoGratis() {
    db.ref('users/' + currentUserUID + '/assinatura').set({ status: 'ativo', plano: 'Grátis' });
    showToast("Plano Grátis ativado!");
}

function abrirModalPagamento() {
    document.getElementById('paymentModal').style.display = 'flex'; 
    lockScroll(true); 

    // Reset Bot UI
    const box = document.getElementById('bot-verification-box');
    const text = document.getElementById('bot-status-text');
    box.className = 'bot-status-box';
    text.innerText = 'A aguardar o seu pagamento PIX...';
    
    // Clear previous intervals
    payTimeouts.forEach(clearTimeout);
    payTimeouts = [];

    // Simulate Anti-Fraud Bot logic
    payTimeouts.push(setTimeout(() => {
        if(document.getElementById('paymentModal').style.display !== 'none') {
            box.className = 'bot-status-box checking';
            text.innerText = '🤖 Bot Anti-Fraude: A verificar transação com o banco...';
        }
    }, 4000));

    payTimeouts.push(setTimeout(() => {
        if(document.getElementById('paymentModal').style.display !== 'none') {
            box.className = 'bot-status-box approved';
            text.innerText = '✅ Pagamento Confirmado com Segurança! A ativar VIP...';
        }
    }, 8000));

    payTimeouts.push(setTimeout(() => {
        const user = auth.currentUser;
        if(user && document.getElementById('paymentModal').style.display === 'flex') {
            db.ref('users/' + user.uid + '/assinatura').set({ status: 'ativo', plano: 'VIP Premium' });
            fecharModalPagamento();
            showToast("🎉 Bem-vindo(a) ao VIP Premium!");
        }
    }, 9500)); 
}

function fecharModalPagamento() { 
    payTimeouts.forEach(clearTimeout);
    document.getElementById('paymentModal').style.display = 'none'; 
    lockScroll(false); 
}

function copiarChavePix() {
    const inputPix = document.getElementById("pix-key-input");
    inputPix.select(); inputPix.setSelectionRange(0, 99999);
    try { navigator.clipboard.writeText(inputPix.value); showToast("Chave PIX copiada!"); } 
    catch(e) { document.execCommand("copy"); showToast("Chave copiada manualmente."); }
}

function abrirTelaPlanosDeUpgrade() {
    fecharModalPerfil();
    db.ref('users/' + currentUserUID + '/assinatura').update({ status: 'inativo' });
    document.getElementById('btn-cancel-upgrade').style.display = 'block';
}

function cancelarUpgrade() {
    db.ref('users/' + currentUserUID + '/assinatura').update({ status: 'ativo' });
}

// ==========================================
// PERFIL E EDIÇÃO
// ==========================================
function abrirModalPerfil() {
    document.getElementById('profile-plan-name').innerText = planoAtual || 'Nenhum';
    if(planoAtual === 'Grátis' || planoAtual === null) {
        document.getElementById('btn-upgrade-plan').style.display = 'block';
    } else {
        document.getElementById('btn-upgrade-plan').style.display = 'none';
    }
    
    document.getElementById('input-profile-name').value = biblioteca.perfil.nome;
    avatarTemporario = biblioteca.perfil.avatar;
    renderizarAvatares();

    document.getElementById('profileModal').style.display = 'flex';
    document.body.classList.add('modal-open');
}

function fecharModalPerfil() { 
    document.getElementById('profileModal').style.display = 'none'; 
    document.body.classList.remove('modal-open'); 
}

function renderizarAvatares() {
    const grid = document.getElementById('default-avatars-grid');
    grid.innerHTML = '';
    avataresSeguros.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'avatar-option';
        img.tabIndex = 0; // Smart TV
        if (url === avatarTemporario) img.classList.add('selected');
        
        const setAvatar = () => { avatarTemporario = url; renderizarAvatares(); };
        img.onclick = setAvatar;
        img.onkeydown = (e) => { if(e.key === 'Enter') setAvatar(); };
        
        grid.appendChild(img);
    });
}

function salvarPerfil() {
    const nome = document.getElementById('input-profile-name').value.trim() || "Utilizador";
    biblioteca.perfil.nome = nome;
    biblioteca.perfil.avatar = avatarTemporario;
    
    if(currentUserUID) {
        db.ref('users/' + currentUserUID + '/biblioteca/perfil').set(biblioteca.perfil);
    }
    fecharModalPerfil();
    showToast("Perfil atualizado com sucesso!");
}

// ==========================================
// MINHA LISTA (WATCHLIST)
// ==========================================
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
    
    if (currentUserUID) {
        db.ref('users/' + currentUserUID + '/biblioteca/watchlist').set(biblioteca.watchlist);
    }
    
    document.getElementById('modal-watchlist-btn').innerText = biblioteca.watchlist[id] ? "✔ Na Minha Lista" : "➕ A Minha Lista";
}

function renderizarWatchlist() {
    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const items = Object.values(biblioteca.watchlist);
    if(items.length === 0) {
        grid.innerHTML = '<p style="color:#aaa; grid-column:1/-1; font-size: 1.2rem;" tabindex="0">A sua lista está vazia.</p>';
    } else {
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.tabIndex = 0; // TV
            card.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}">`;
            card.onclick = () => abrirDetalhes(item.id, item.type || item.media_type);
            card.onkeydown = (e) => { if(e.key === 'Enter') abrirDetalhes(item.id, item.type || item.media_type); };
            grid.appendChild(card);
        });
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

function toggleSubmenu() { document.getElementById('mobile-submenu').classList.toggle('open'); }

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
        document.getElementById('search-limit-info').innerHTML = `<p style="color:#f1c40f; padding: 15px; background:#222; border-radius:8px; font-size:1.1rem;" tabindex="0">Limite de 3 buscas grátis atingido hoje. <a href="#" onclick="abrirTelaPlanosDeUpgrade()" style="color:#fff;">Seja VIP</a></p>`;
        return false;
    }
    
    contagens.count++;
    localStorage.setItem('cine_buscas', JSON.stringify(contagens));
    const restam = 3 - contagens.count;
    document.getElementById('search-limit-info').innerHTML = `<p style="color:#aaa; font-size:1.1em;" tabindex="0">Plano Grátis: Restam ${restam} buscas hoje.</p>`;
    return true;
}

function irParaBusca() { 
    esconderSeccoes(); setNavActive('section-search'); 
    document.getElementById('section-search').style.display = 'block'; 
    document.getElementById('search-limit-info').innerHTML = ''; 
    document.getElementById('mobile-search-input').focus();
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
        container.innerHTML = '<div class="video-loader"></div>';
        const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
        
        if (res.results && res.results.length > 0) {
            renderizar(res.results.filter(i => i.poster_path), 'search-grid');
        } else {
            container.innerHTML = '<p style="color:#aaa; font-size: 1.2rem;" tabindex="0">Nenhum resultado encontrado.</p>';
        }
    }, 800);
}

// ==========================================
// TMDB E RENDERIZAÇÃO DE CATÁLOGOS
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
        div.tabIndex = 0; // Smart TV
        div.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" loading="lazy">`;
        
        const action = () => abrirDetalhes(item.id, forceType || item.media_type || (item.first_air_date ? 'tv' : 'movie'));
        div.onclick = action;
        div.onkeydown = (e) => { if(e.key === 'Enter') action(); };
        
        container.appendChild(div);
    });
}

async function renderizarRow(titulo, endpoint, containerMaster, type) {
    const master = document.getElementById(containerMaster);
    const rowId = 'row_' + Math.random().toString(36).substr(2, 9);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'catalog-row';
    wrapper.innerHTML = `
        <h3 tabindex="0">${titulo}</h3>
        <div class="carousel-container">
            <button class="carousel-btn left-btn" onclick="scrollCarousel('${rowId}', -1)" tabindex="-1">&#10094;</button>
            <div id="${rowId}" class="movie-row"></div>
            <button class="carousel-btn right-btn" onclick="scrollCarousel('${rowId}', 1)" tabindex="-1">&#10095;</button>
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
        
        itemDetalheAtual = { id: item.id, type: item.media_type || 'movie', poster_path: item.poster_path, title: item.title || item.name };
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
    itemDetalheAtual = { id, type, poster_path: data.poster_path, title: data.title || data.name }; 
    
    document.getElementById('modal-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/w1280${data.backdrop_path || data.poster_path})`;
    document.getElementById('modal-title').innerText = data.title || data.name;
    document.getElementById('modal-year').innerText = (data.release_date || data.first_air_date || '').substring(0,4);
    document.getElementById('modal-rating').innerText = data.vote_average ? data.vote_average.toFixed(1) : '';
    document.getElementById('modal-overview').innerText = data.overview;
    
    document.getElementById('modal-watchlist-btn').innerText = biblioteca.watchlist[id] ? "✔ Na Minha Lista" : "➕ A Minha Lista";
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
    document.getElementById('modal-play-btn').focus(); // Foco automático na TV
}

async function carregarEpsLista(tvId, season) {
    const lista = document.getElementById('modal-episodes-list');
    lista.innerHTML = '<div class="video-loader"></div>';
    const data = await fetchTMDB(`/tv/${tvId}/season/${season}`);
    lista.innerHTML = '';
    if (data.episodes) {
        data.episodes.forEach(ep => {
            const img = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : '';
            
            const div = document.createElement('div');
            div.className = 'episode-item';
            div.tabIndex = 0; // Smart TV
            div.innerHTML = `
                ${img ? `<img src="${img}">` : ''}
                <div>
                    <h4 style="font-size:1.1em; margin-bottom:5px; color:#fff;">${ep.episode_number}. ${ep.name}</h4>
                    <p style="font-size:0.9em; color:#888;">▶ Assistir Agora</p>
                </div>`;
            
            const action = () => abrirPlayerEp(tvId, season, ep.episode_number);
            div.onclick = action;
            div.onkeydown = (e) => { if(e.key === 'Enter') action(); };
            
            lista.appendChild(div);
        });
    }
}

function fecharDetalhes() { document.getElementById('modal-details').style.display = 'none'; document.body.classList.remove('modal-open'); }

function abrirPlayer(id, type) {
    const iframe = document.getElementById('videoPlayer');
    document.getElementById('video-loader').style.display = 'block';
    iframe.src = `https://mgeb.top/embed/${type === 'tv' ? 'tv/'+id+'/1/1' : 'movie/'+id}?player=vidstack#color=e50914`;
    document.getElementById('streaming-player-screen').style.display = 'flex';
    document.getElementById('close-player-btn').focus();
}
function abrirPlayerEp(id, s, e) {
    const iframe = document.getElementById('videoPlayer');
    document.getElementById('video-loader').style.display = 'block';
    iframe.src = `https://mgeb.top/embed/tv/${id}/${s}/${e}?player=vidstack#color=e50914`;
    document.getElementById('streaming-player-screen').style.display = 'flex';
    document.getElementById('close-player-btn').focus();
}

document.getElementById('close-player-btn')?.addEventListener('click', () => {
    document.getElementById('videoPlayer').src = '';
    document.getElementById('streaming-player-screen').style.display = 'none';
});

// ==========================================
// CINEBOT CHAT
// ==========================================
function enviarChat() {
    const input = document.getElementById('chat-input');
    const txt = input.value.trim();
    if(!txt) return;
    
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML += `<div class="message user-message" tabindex="0">${txt}</div>`;
    input.value = '';
    
    setTimeout(async () => {
        const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(txt)}`);
        if(res.results && res.results.length > 0 && res.results[0].poster_path) {
            const item = res.results[0];
            const div = document.createElement('div');
            div.className = 'message bot-message';
            div.style.cssText = 'display:flex; gap:15px; cursor:pointer; align-items: center;';
            div.tabIndex = 0;
            div.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w92${item.poster_path}" style="border-radius:4px; width:60px;">
                <div>
                    <strong style="color:var(--primary); font-size:1.1rem;">${item.title || item.name}</strong>
                    <p style="font-size:0.9em; margin-top:5px; color:#aaa;">Clique ou prima Enter para ver mais.</p>
                </div>`;
            
            const action = () => abrirDetalhes(item.id, item.media_type || 'movie');
            div.onclick = action;
            div.onkeydown = (e) => { if(e.key === 'Enter') action(); };
            msgs.appendChild(div);
            
        } else {
            msgs.innerHTML += `<div class="message bot-message" tabindex="0">Desculpa, não encontrei nada. Tente outro título!</div>`;
        }
        msgs.scrollTop = msgs.scrollHeight;
    }, 600);
}