// ==========================================
// INFRAESTRUTURA CORE, CHAVES & FIREBASE
// ==========================================
const TMDB_KEY = '17c56e3825d7fbae6581866083d0d778'; 
let itemSelecionado = null;
let debounceTimer; 
let currentUserUID = null;
let biblioteca = { watchlist: {}, reviews: {}, perfil: {} };
let isLoginMode = false;

const ADMIN_EMAIL = "roberci.azevedo@academico.ifpb.edu.br"; 

const firebaseConfig = {
  apiKey: "AIzaSyAfPWvnGdvPKZ_lrVwOuag14WHLY9AgML8",
  authDomain: "cinenet-ifpb.firebaseapp.com",
  databaseURL: "https://cinenet-ifpb-default-rtdb.firebaseio.com",
  projectId: "cinenet-ifpb",
  storageBucket: "cinenet-ifpb.firebasestorage.app",
  messagingSenderId: "1098247355110",
  appId: "1:1098247355110:web:c9f867826f26b0ef171927",
  measurementId: "G-73VPBQSWKM"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// ==========================================
// UTILITÁRIOS (TOAST & SKELETON)
// ==========================================
function showToast(message) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showSkeletons(containerId, count = 6) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    for(let i=0; i<count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        container.appendChild(skeleton);
    }
}

// ==========================================
// SISTEMA DE AUTENTICAÇÃO E PERFIL
// ==========================================
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchLink = document.getElementById('auth-switch-link');
const authSwitchText = document.getElementById('auth-switch-text');
const authErrorMsg = document.getElementById('auth-error');
const btnTogglePwd = document.getElementById('btn-toggle-password');

if(btnTogglePwd) {
    btnTogglePwd.onclick = () => {
        const pwdInput = document.getElementById('auth-password');
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            btnTogglePwd.textContent = '🙈';
        } else {
            pwdInput.type = 'password';
            btnTogglePwd.textContent = '👁️';
        }
    };
}

if(authSwitchLink) {
    authSwitchLink.onclick = (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        if(isLoginMode) {
            authTitle.textContent = "Iniciar Sessão";
            authSubmitBtn.textContent = "Entrar";
            authSwitchText.textContent = "Não tem conta?";
            authSwitchLink.textContent = "Registar";
        } else {
            authTitle.textContent = "Criar Conta";
            authSubmitBtn.textContent = "Criar Conta";
            authSwitchText.textContent = "Já tem conta?";
            authSwitchLink.textContent = "Entrar";
        }
        authErrorMsg.textContent = "";
    };
}

if(authForm) {
    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        authErrorMsg.textContent = "";

        try {
            if(isLoginMode) {
                await auth.signInWithEmailAndPassword(email, password);
            } else {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                await database.ref(`users/${user.uid}/profile`).set({
                    email: email,
                    avatar: '🔴',
                    createdAt: Date.now()
                });
            }
        } catch(error) {
            authErrorMsg.textContent = error.message;
        }
    };
}

auth.onAuthStateChanged((user) => {
    if(user) {
        currentUserUID = user.uid;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        carregarDadosUtilizador();
        inicializarApp();
        
        if(user.email === ADMIN_EMAIL) {
            document.getElementById('btn-admin-panel').style.display = 'block';
        }
    } else {
        currentUserUID = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
});

function fazerLogout() {
    auth.signOut();
}

function carregarDadosUtilizador() {
    if(!currentUserUID) return;
    database.ref(`users/${currentUserUID}`).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        biblioteca.watchlist = data.watchlist || {};
        biblioteca.reviews = data.reviews || {};
        biblioteca.perfil = data.profile || {};

        const avatarEl = document.getElementById('nav-avatar');
        if(avatarEl) avatarEl.textContent = biblioteca.perfil.avatar || 'U';
        
        const profileEmail = document.getElementById('profile-email-text');
        if(profileEmail) profileEmail.textContent = auth.currentUser ? auth.currentUser.email : '-';
    });
}

function selecionarAvatar(emoji) {
    if(!currentUserUID) return;
    database.ref(`users/${currentUserUID}/profile/avatar`).set(emoji);
    showToast("Avatar atualizado!");
    fecharModais();
}

function abrirPerfil() {
    fecharModais();
    document.getElementById('profile-modal').style.display = 'flex';
}

function abrirPainelAdmin() {
    fecharModais();
    document.getElementById('admin-modal').style.display = 'flex';
    
    database.ref('users').once('value', (snapshot) => {
        const users = snapshot.val() || {};
        let totalUsers = Object.keys(users).length;
        let totalWatchlist = 0;
        let totalReviews = 0;

        Object.values(users).forEach(u => {
            if(u.watchlist) totalWatchlist += Object.keys(u.watchlist).length;
            if(u.reviews) totalReviews += Object.keys(u.reviews).length;
        });

        document.getElementById('stat-total-users').textContent = totalUsers;
        document.getElementById('stat-total-watchlist').textContent = totalWatchlist;
        document.getElementById('stat-total-reviews').textContent = totalReviews;
    });
}

// ==========================================
// TMDB API & CARREGAMENTO DE CONTEÚDO
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const res = await fetch(`https://api.themoviedb.org/3${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=pt-PT`);
        return await res.json();
    } catch(e) {
        console.error("Erro na requisição TMDB:", e);
        return null;
    }
}

async function inicializarApp() {
    carregarHeroDestaque();
    carregarCarrossel('/movie/top_rated', 'row-top-rated', 'movie');
    carregarCarrossel('/discover/movie?with_genres=28', 'row-action', 'movie');
    carregarCarrossel('/discover/movie?with_genres=878', 'row-scifi', 'movie');
    carregarCarrossel('/discover/movie?with_genres=35', 'row-comedy', 'movie');
}

async function carregarHeroDestaque() {
    const data = await fetchTMDB('/movie/popular');
    if(!data || !data.results.length) return;
    const filme = data.results[0];
    itemSelecionado = { ...filme, media_type: 'movie' };

    const hero = document.getElementById('hero');
    hero.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${filme.backdrop_path})`;
    document.getElementById('hero-title').textContent = filme.title || filme.name;
    document.getElementById('hero-overview').textContent = filme.overview;

    document.getElementById('hero-play').onclick = () => abrirPlayer(filme.id, 'movie');
    document.getElementById('hero-info').onclick = () => abrirDetalhes(filme.id, 'movie');
}

async function carregarCarrossel(endpoint, containerId, mediaType) {
    showSkeletons(containerId, 8);
    const data = await fetchTMDB(endpoint);
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';

    if(!data || !data.results) return;

    data.results.forEach(item => {
        if(!item.poster_path) return;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.tabIndex = 0; // Permite navegação Smart TV
        card.innerHTML = `
            <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title || item.name}">
        `;
        card.onclick = () => abrirDetalhes(item.id, item.media_type || mediaType);
        container.appendChild(card);
    });
}

function scrollCarousel(containerId, direction) {
    const container = document.getElementById(containerId);
    if(container) {
        container.scrollBy({ left: direction * 500, behavior: 'smooth' });
    }
}

// ==========================================
// MODAL DE DETALHES, EPISÓDIOS & REVIEWS
// ==========================================
async function abrirDetalhes(id, type = 'movie') {
    fecharModais();
    const modal = document.getElementById('details-modal');
    modal.style.display = 'flex';

    const item = await fetchTMDB(`/${type}/${id}`);
    if(!item) return;

    itemSelecionado = { ...item, media_type: type };

    const banner = document.getElementById('modal-banner');
    banner.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path || item.poster_path})`;
    document.getElementById('modal-title').textContent = item.title || item.name;
    document.getElementById('modal-rating').textContent = `★ ${(item.vote_average || 0).toFixed(1)}`;
    document.getElementById('modal-year').textContent = (item.release_date || item.first_air_date || '').substring(0, 4);
    document.getElementById('modal-runtime').textContent = item.runtime ? `${item.runtime} min` : (item.number_of_seasons ? `${item.number_of_seasons} Temporada(s)` : '');
    document.getElementById('modal-overview').textContent = item.overview || "Sem sinopse disponível.";

    document.getElementById('modal-play-btn').onclick = () => abrirPlayer(item.id, type);
    
    const btnWatchlist = document.getElementById('modal-watchlist-btn');
    atualizarBotaoWatchlist(btnWatchlist, id);
    btnWatchlist.onclick = () => toggleWatchlist(item, type, btnWatchlist);

    // Lógica para Séries/Episódios
    const tvSection = document.getElementById('tv-episodes-section');
    if(type === 'tv' && item.number_of_seasons) {
        tvSection.style.display = 'block';
        carregarSeletorTemporadas(item.id, item.number_of_seasons);
    } else {
        tvSection.style.display = 'none';
    }

    carregarReviews(id);
}

function atualizarBotaoWatchlist(btn, id) {
    if(biblioteca.watchlist && biblioteca.watchlist[id]) {
        btn.textContent = "✓ Na Minha Lista";
        btn.style.background = "rgba(225, 9, 20, 0.3)";
    } else {
        btn.textContent = "+ Minha Lista";
        btn.style.background = "rgba(255,255,255,0.1)";
    }
}

function toggleWatchlist(item, type, btn) {
    if(!currentUserUID) return showToast("Inicia sessão para guardar itens.");
    const id = item.id;
    const ref = database.ref(`users/${currentUserUID}/watchlist/${id}`);

    if(biblioteca.watchlist && biblioteca.watchlist[id]) {
        ref.remove();
        showToast("Removido da Minha Lista");
    } else {
        ref.set({
            id: id,
            title: item.title || item.name,
            poster_path: item.poster_path,
            media_type: type,
            addedAt: Date.now()
        });
        showToast("Adicionado à Minha Lista");
    }
    setTimeout(() => atualizarBotaoWatchlist(btn, id), 300);
}

async function carregarSeletorTemporadas(seriesId, totalSeasons) {
    const select = document.getElementById('season-select');
    select.innerHTML = '';
    for(let i=1; i<=totalSeasons; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Temporada ${i}`;
        select.appendChild(opt);
    }
    select.onchange = () => carregarEpisodios(seriesId, select.value);
    carregarEpisodios(seriesId, 1);
}

async function carregarEpisodios(seriesId, seasonNum) {
    const container = document.getElementById('episodes-list');
    container.innerHTML = 'A carregar episódios...';
    const data = await fetchTMDB(`/tv/${seriesId}/season/${seasonNum}`);
    container.innerHTML = '';

    if(!data || !data.episodes) return;

    data.episodes.forEach(ep => {
        const item = document.createElement('div');
        item.className = 'episode-item';
        const still = ep.still_path ? `https://image.tmdb.org/t/p/w200${ep.still_path}` : 'https://via.placeholder.com/100x60/222/fff?text=CineNet';
        item.innerHTML = `
            <img src="${still}" alt="${ep.name}">
            <div>
                <strong>E${ep.episode_number}: ${ep.name}</strong>
                <p style="font-size: 0.8em; color: #a3a3a3;">${ep.overview ? ep.overview.substring(0, 80) + '...' : ''}</p>
            </div>
        `;
        item.onclick = () => abrirPlayer(seriesId, 'tv', seasonNum, ep.episode_number);
        container.appendChild(item);
    });
}

// ==========================================
// REVIEWS E AVALIAÇÕES
// ==========================================
function carregarReviews(itemId) {
    const container = document.getElementById('reviews-list');
    container.innerHTML = '';

    database.ref(`reviews/${itemId}`).on('value', (snapshot) => {
        container.innerHTML = '';
        const reviews = snapshot.val();
        if(!reviews) {
            container.innerHTML = '<p style="color: #a3a3a3; font-size: 0.85em;">Ainda não há avaliações. Sé o primeiro a avaliar!</p>';
            return;
        }

        Object.values(reviews).forEach(r => {
            const card = document.createElement('div');
            card.className = 'review-card';
            card.innerHTML = `
                <header>
                    <strong>${r.userEmail || 'Utilizador'}</strong>
                    <span style="color:#ffd700;">${'★'.repeat(r.score)}</span>
                </header>
                <p>${r.comment}</p>
            `;
            container.appendChild(card);
        });
    });

    document.getElementById('submit-review-btn').onclick = () => {
        if(!currentUserUID) return showToast("Inicia sessão para comentar.");
        const score = parseInt(document.getElementById('review-score').value);
        const comment = document.getElementById('review-comment').value.trim();
        if(!comment) return showToast("Escreve uma opinião.");

        database.ref(`reviews/${itemId}`).push({
            uid: currentUserUID,
            userEmail: auth.currentUser.email,
            score: score,
            comment: comment,
            createdAt: Date.now()
        });

        document.getElementById('review-comment').value = '';
        showToast("Avaliação publicada!");
    };
}

// ==========================================
// STREAMING PLAYER
// ==========================================
function abrirPlayer(id, type = 'movie', season = 1, episode = 1) {
    const screen = document.getElementById('streaming-player-screen');
    const iframe = document.getElementById('videoPlayer');
    
    let embedUrl = '';
    if(type === 'movie') {
        embedUrl = `https://vidsrc.to/embed/movie/${id}`;
    } else {
        embedUrl = `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
    }

    iframe.src = embedUrl;
    screen.style.display = 'block';
}

document.getElementById('close-player-btn').onclick = () => {
    const screen = document.getElementById('streaming-player-screen');
    const iframe = document.getElementById('videoPlayer');
    iframe.src = '';
    screen.style.display = 'none';
};

// ==========================================
// NAVEGAÇÃO & VISTAS (FILMES, SÉRIES, SEARCH)
// ==========================================
function ocultarTodasSeccoes() {
    document.getElementById('catalog-section').style.display = 'none';
    document.getElementById('grid-view-section').style.display = 'none';
    document.getElementById('continue-watching-section').style.display = 'none';
}

function irParaHome() {
    ocultarTodasSeccoes();
    document.getElementById('catalog-section').style.display = 'block';
    document.getElementById('hero').style.display = 'flex';
}

function irParaFilmes() {
    carregarGridConteudo('/discover/movie', 'Filmes Populares', 'movie');
}

function irParaSeries() {
    carregarGridConteudo('/discover/tv', 'Séries Populares', 'tv');
}

function irParaAnimes() {
    carregarGridConteudo('/discover/tv?with_keywords=210024|287501', 'Animes', 'tv');
}

function irParaDoramas() {
    carregarGridConteudo('/discover/tv?with_original_language=ko', 'Doramas', 'tv');
}

function irParaWatchlist() {
    ocultarTodasSeccoes();
    document.getElementById('hero').style.display = 'none';
    document.getElementById('grid-view-section').style.display = 'block';
    document.getElementById('grid-view-title').textContent = "Minha Lista";

    const container = document.getElementById('grid-view-container');
    container.innerHTML = '';

    if(!biblioteca.watchlist || !Object.keys(biblioteca.watchlist).length) {
        container.innerHTML = '<p>A tua lista está vazia.</p>';
        return;
    }

    Object.values(biblioteca.watchlist).forEach(item => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title}">`;
        card.onclick = () => abrirDetalhes(item.id, item.media_type);
        container.appendChild(card);
    });
}

async function carregarGridConteudo(endpoint, titulo, mediaType) {
    ocultarTodasSeccoes();
    document.getElementById('hero').style.display = 'none';
    document.getElementById('grid-view-section').style.display = 'block';
    document.getElementById('grid-view-title').textContent = titulo;

    showSkeletons('grid-view-container', 12);
    const data = await fetchTMDB(endpoint);
    const container = document.getElementById('grid-view-container');
    container.innerHTML = '';

    if(!data || !data.results) return;

    data.results.forEach(item => {
        if(!item.poster_path) return;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title || item.name}">`;
        card.onclick = () => abrirDetalhes(item.id, item.media_type || mediaType);
        container.appendChild(card);
    });
}

// Pesquisa com Debounce
const searchInput = document.getElementById('search-input');
if(searchInput) {
    searchInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if(!query) {
            irParaHome();
            return;
        }
        debounceTimer = setTimeout(() => {
            carregarGridConteudo(`/search/multi?query=${encodeURIComponent(query)}`, `Resultados para: "${query}"`, 'movie');
        }, 500);
    };
}

function irParaBusca() {
    const query = prompt("O que pretendes pesquisar?");
    if(query) {
        carregarGridConteudo(`/search/multi?query=${encodeURIComponent(query)}`, `Resultados para: "${query}"`, 'movie');
    }
}

// Mobile Submenu Toggle
function toggleSubmenu() {
    const sub = document.getElementById('mobile-submenu');
    sub.style.display = sub.style.display === 'flex' ? 'none' : 'flex';
}

// ==========================================
// CINEBOT (CHAT IA)
// ==========================================
function abrirChat() {
    document.getElementById('chat-modal').style.display = 'flex';
}

const btnChatToggle = document.getElementById('btn-chat-toggle');
if(btnChatToggle) btnChatToggle.onclick = abrirChat;

const closeChatBtn = document.getElementById('close-chat-btn');
if(closeChatBtn) closeChatBtn.onclick = () => document.getElementById('chat-modal').style.display = 'none';

function fecharModais() {
    document.querySelectorAll('.modal-bg').forEach(m => m.style.display = 'none');
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.onclick = fecharModais;
});

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send-btn');

function addMessage(text, sender = 'bot') {
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.innerHTML = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function enviarAcaoRapida(texto) {
    addMessage(texto, 'user');
    processarMensagemBot(texto);
}

async function processarMensagemBot(text) {
    const textLower = text.toLowerCase();

    if(textLower.includes('ação') || textLower.includes('acao')) {
        await recomendarBot('/discover/movie?with_genres=28', 'movie');
    } else if(textLower.includes('comédia') || textLower.includes('comedia')) {
        await recomendarBot('/discover/movie?with_genres=35', 'movie');
    } else if(textLower.includes('surpreende') || textLower.includes('recomend')) {
        await recomendarBot('/movie/top_rated', 'movie');
    } else {
        setTimeout(() => {
            addMessage("Posso recomendar-te filmes de Ação, Comédia ou Surpreender-te! Escolha uma das opções abaixo ou digite o género que procura.");
        }, 500);
    }
}

async function recomendarBot(endpoint, tipoPadrao) {
    const data = await fetchTMDB(endpoint);
    if(!data || !data.results.length) return;
    const item = data.results[Math.floor(Math.random() * data.results.length)];

    const mediaType = item.media_type || tipoPadrao;
    const titulo = item.title || item.name;
    const sinopse = item.overview ? item.overview : "Sem sinopse disponível.";
    const poster = `https://image.tmdb.org/t/p/w200${item.poster_path}`;

    const cardHTML = `
        <div class="bot-card-recommendation">
            <img src="${poster}" alt="${titulo}">
            <div class="bot-card-info">
                <h4>${titulo}</h4>
                <p>${sinopse}</p>
                <div class="bot-card-actions">
                    <button class="btn-play-sm" onclick="abrirPlayer(${item.id}, '${mediaType}')">▶ Assistir</button>
                    <button class="btn-info-sm" onclick="abrirDetalhes(${item.id}, '${mediaType}')">ℹ Detalhes</button>
                </div>
            </div>
        </div>
    `;

    addMessage(`Com certeza! Aqui tens uma recomendação para ti:<br>${cardHTML}`, 'bot');
}

function enviarChat() {
    const text = chatInput.value.trim();
    if(!text) return;
    addMessage(text, 'user');
    chatInput.value = '';
    setTimeout(() => processarMensagemBot(text), 600);
}

if(sendBtn) sendBtn.onclick = enviarChat;
if(chatInput) chatInput.onkeypress = (e) => { if(e.key === 'Enter') enviarChat(); };

// ==========================================
// NAVEGAÇÃO SMART TV (TECLADO / D-PAD)
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.classList.contains('movie-card')) {
        document.activeElement.click();
    }
});