// ==========================================
// CONFIGURAÇÃO FIREBASE & TMDB API
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
const db = firebase.firestore();
const auth = firebase.auth();

const TMDB_API_KEY = "17c56e3825d7fbae6581866083d0d778";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

const PLAYER_CONFIG = { server: 'mgeb', color: 'e50914' };
let minhaListaIDs = new Set();
let debounceSearchTimer;
let isLoginMode = true;

// ==========================================
// TOAST E UTILITÁRIOS
// ==========================================
function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast'; t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ==========================================
// AUTENTICAÇÃO E PERFIL
// ==========================================
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Iniciar Sessão' : 'Criar Conta';
    document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Entrar' : 'Registar';
    document.getElementById('auth-switch-text').innerText = isLoginMode ? 'Novo no CineNet?' : 'Já tem conta?';
    document.getElementById('auth-switch-link').innerText = isLoginMode ? 'Registe-se agora' : 'Entre agora';
    document.getElementById('auth-error').innerText = '';
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    document.getElementById('auth-error').innerText = 'A processar...';

    try {
        if (isLoginMode) await auth.signInWithEmailAndPassword(email, password);
        else {
            const userCred = await auth.createUserWithEmailAndPassword(email, password);
            await userCred.user.updateProfile({ displayName: "Utilizador", photoURL: "" });
        }
    } catch (err) {
        document.getElementById('auth-error').innerText = 'Erro nas credenciais. Tente de novo.';
    }
});

function fazerLogout() { auth.signOut().then(() => fecharModalPerfil()); }

auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        
        const avatar = document.getElementById('user-avatar-img');
        if (avatar) avatar.src = user.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";

        await carregarWatchlistIDs(user.uid);
        carregarFilaContinueAVer(user.uid);
        carregarInicio();
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        minhaListaIDs.clear();
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
    }
});

function abrirModalPerfil() {
    const user = auth.currentUser;
    if (user) {
        document.getElementById('edit-display-name').value = user.displayName || '';
        document.getElementById('edit-avatar-url').value = user.photoURL || '';
    }
    document.getElementById('profile-modal').style.display = 'flex';
}

function fecharModalPerfil() { document.getElementById('profile-modal').style.display = 'none'; }

async function guardarPerfil(e) {
    e.preventDefault();
    const user = auth.currentUser;
    const name = document.getElementById('edit-display-name').value;
    const photo = document.getElementById('edit-avatar-url').value;
    
    if (user) {
        await user.updateProfile({ displayName: name, photoURL: photo });
        document.getElementById('user-avatar-img').src = photo || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";
        fecharModalPerfil();
        showToast('Perfil atualizado.');
    }
}

// ==========================================
// CINEBOT (CHAT IA BÁSICO)
// ==========================================
function abrirChat() { document.getElementById('chat-modal').style.display = 'flex'; }
function fecharChat() { document.getElementById('chat-modal').style.display = 'none'; }

function adicionarMsgChat(texto, remetente) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message ${remetente}`;
    div.innerHTML = texto;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function enviarChatInput() {
    const input = document.getElementById('chat-input');
    const txt = input.value.trim();
    if (txt) enviarMensagemBot(txt);
    input.value = '';
}

async function enviarMensagemBot(txt) {
    adicionarMsgChat(txt, 'user');
    
    let endpoint = '/movie/popular'; // default surpresa
    let type = 'movie';
    const l = txt.toLowerCase();

    if (l.includes('ação') || l.includes('acao')) endpoint = '/discover/movie?with_genres=28';
    else if (l.includes('comédia') || l.includes('comedia')) endpoint = '/discover/movie?with_genres=35';

    const data = await fetchTMDB(endpoint);
    if (data.length > 0) {
        const item = data[Math.floor(Math.random() * data.length)];
        const img = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : '';
        const title = item.title || item.name;
        
        const html = `Aqui está uma recomendação:
            <div class="bot-card" onclick="assistirFilme('${item.id}', '${title.replace(/'/g, "\\'")}', '${img}')">
                <img src="${img}" />
                <div><h4>${title}</h4><p>Clique para assistir!</p></div>
            </div>`;
        setTimeout(() => adicionarMsgChat(html, 'bot'), 500);
    }
}

// ==========================================
// TMDB, CATÁLOGOS E FILTROS
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const s = endpoint.includes('?') ? '&' : '?';
        const res = await fetch(`${TMDB_BASE_URL}${endpoint}${s}api_key=${TMDB_API_KEY}&language=pt-PT`);
        const json = await res.json();
        return json.results || [];
    } catch { return []; }
}

const CATEGORIAS = [
    { t: '🎬 Filmes Populares', e: '/movie/popular', type: 'movie' },
    { t: '📺 Séries Populares', e: '/tv/popular', type: 'tv' },
    { t: '⛩️ Animes', e: '/discover/tv?with_genres=16&with_original_language=ja', type: 'tv' },
    { t: '🌸 Doramas', e: '/discover/tv?with_original_language=ko', type: 'tv' }
];

async function carregarInicio() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('watchlist-section').style.display = 'none';
    const c = document.getElementById('categories-container');
    c.style.display = 'block'; c.innerHTML = '';

    const top = await fetchTMDB('/movie/popular');
    if (top.length > 0) configurarHero(top[0]);

    for (const cat of CATEGORIAS) {
        const items = await fetchTMDB(cat.e);
        renderizarCarrossel(cat.t, items, cat.type);
    }
}

function configurarHero(item) {
    const title = (item.title || item.name).replace(/'/g, "\\'");
    const bg = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : '';
    const poster = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : bg;

    document.getElementById('hero-banner').style.backgroundImage = `url('${bg}')`;
    document.getElementById('hero-title').innerText = title;
    document.getElementById('hero-desc').innerText = item.overview ? item.overview.substring(0, 150) + '...' : 'Assista já.';
    
    document.getElementById('hero-play-btn').onclick = () => assistirFilme(item.id, title, poster);
    
    const isSaved = minhaListaIDs.has(String(item.id));
    const wlBtn = document.getElementById('hero-watchlist-btn');
    wlBtn.innerText = isSaved ? '✓ Na Minha Lista' : '+ A minha Lista';
    wlBtn.onclick = () => toggleMinhaLista({ id: item.id, title: title, coverImage: poster });
}

function renderizarCarrossel(titulo, items, type = 'movie') {
    const c = document.getElementById('categories-container');
    const s = document.createElement('section'); s.className = 'section-container';
    let html = `<h2>${titulo}</h2><div class="movie-row">`;
    items.forEach(i => { if (i.poster_path) html += criarCardHTML(i, type); });
    s.innerHTML = html + `</div>`;
    c.appendChild(s);
}

function criarCardHTML(item, type = 'movie') {
    const id = String(item.id);
    const title = (item.title || item.name).replace(/'/g, "\\'");
    const img = `${TMDB_IMAGE_BASE}${item.poster_path}`;
    const isSaved = minhaListaIDs.has(id);
    const action = type === 'tv' ? `abrirModalSerie('${id}','${title}','${img}')` : `assistirFilme('${id}','${title}','${img}')`;

    return `
        <div class="movie-card" tabindex="0">
            <button class="card-watchlist-btn ${isSaved ? 'active' : ''}" onclick="event.stopPropagation(); toggleMinhaLista({id:'${id}',title:'${title}',coverImage:'${img}'})">${isSaved ? '✓' : '+'}</button>
            <div onclick="${action}">
                <img src="${img}" loading="lazy" />
                <div class="card-info"><span class="card-title">${title}</span></div>
            </div>
        </div>`;
}

// ==========================================
// PESQUISA EM TEMPO REAL
// ==========================================
async function pesquisarTitulos(e) {
    const q = e.target.value.trim();
    clearTimeout(debounceSearchTimer);

    if (q.length < 2) {
        document.getElementById('search-results-section').style.display = 'none';
        document.getElementById('categories-container').style.display = 'block';
        return;
    }

    debounceSearchTimer = setTimeout(async () => {
        document.getElementById('search-results-title').innerText = `Resultados: "${q}"`;
        document.getElementById('search-results-section').style.display = 'block';
        document.getElementById('categories-container').style.display = 'none';

        const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}`);
        const row = document.getElementById('search-results-row');
        row.innerHTML = '';
        res.forEach(i => { if (i.poster_path) row.innerHTML += criarCardHTML(i, i.media_type || 'movie'); });
    }, 400);
}

// Filtros Navegação
async function filtrarCategoria(cat, element, event) {
    if (event) event.preventDefault();
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    if (cat === 'inicio') return carregarInicio();

    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('watchlist-section').style.display = 'none';
    const c = document.getElementById('categories-container');
    c.style.display = 'block'; c.innerHTML = '<p style="padding: 20px 4%;">A carregar...</p>';

    const map = {
        'movie': {e: '/movie/popular', t: '🎬 Filmes', type: 'movie'},
        'tv': {e: '/tv/popular', t: '📺 Séries', type: 'tv'},
        'anime': {e: '/discover/tv?with_genres=16&with_original_language=ja', t: '⛩️ Animes', type: 'tv'},
        'comedy': {e: '/discover/movie?with_genres=35', t: '😂 Comédia', type: 'movie'}
    };

    const d = map[cat];
    const items = await fetchTMDB(d.e);
    c.innerHTML = '';
    renderizarCarrossel(d.t, items, d.type);
}

// ==========================================
// MINHA LISTA & HISTÓRICO
// ==========================================
async function toggleMinhaLista(data) {
    const user = auth.currentUser;
    if (!user) return showToast("Faça login.");
    const id = String(data.id);
    const ref = db.collection('users').doc(user.uid).collection('watchlist').doc(id);

    if (minhaListaIDs.has(id)) {
        await ref.delete(); minhaListaIDs.delete(id); showToast("Removido.");
    } else {
        await ref.set({ id: id, title: data.title, coverImage: data.coverImage, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
        minhaListaIDs.add(id); showToast("Guardado!");
    }
    document.querySelectorAll(`[onclick*="id:'${id}'"]`).forEach(b => {
        b.className = `card-watchlist-btn ${minhaListaIDs.has(id) ? 'active' : ''}`;
        b.innerText = minhaListaIDs.has(id) ? '✓' : '+';
    });
    if (document.getElementById('watchlist-section').style.display === 'block') carregarSecaoMinhaLista(user.uid);
}

async function carregarWatchlistIDs(uid) {
    const s = await db.collection('users').doc(uid).collection('watchlist').get();
    minhaListaIDs.clear(); s.forEach(d => minhaListaIDs.add(d.id));
}

async function mostrarMinhaLista(el, e) {
    if (e) e.preventDefault();
    document.querySelectorAll('.nav-links .nav-item').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('categories-container').style.display = 'none';
    if (auth.currentUser) carregarSecaoMinhaLista(auth.currentUser.uid);
}

async function carregarSecaoMinhaLista(uid) {
    const s = document.getElementById('watchlist-section');
    const r = document.getElementById('watchlist-row');
    s.style.display = 'block'; r.innerHTML = '';
    const snap = await db.collection('users').doc(uid).collection('watchlist').orderBy('addedAt','desc').get();
    snap.forEach(d => r.innerHTML += criarCardHTML(d.data(), 'movie'));
}

async function carregarFilaContinueAVer(uid) {
    const s = document.getElementById('continue-watching-section');
    const r = document.getElementById('continue-watching-row');
    const snap = await db.collection('users').doc(uid).collection('continueWatching').orderBy('lastWatched','desc').limit(10).get();
    if (snap.empty) { s.style.display = 'none'; return; }
    
    s.style.display = 'block'; r.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        r.innerHTML += `
            <div class="movie-card" tabindex="0" onclick="assistirFilme('${d.movieId}','${d.title.replace(/'/g, "\\'")}','${d.coverImage}')">
                <img src="${d.coverImage}" />
                <div class="progress-bar-container"><div class="progress-bar" style="width:100%"></div></div>
            </div>`;
    });
}

// ==========================================
// PLAYER (ECRÃ COMPLETO NATIVO) E SÉRIES
// ==========================================
function assistirFilme(id, title, img) {
    abrirVideo(`https://mgeb.top/embed/${id}?player=vidstack#color:${PLAYER_CONFIG.color}`, id, title, img);
}

function assistirEpisodio(id, s, e, title, img) {
    abrirVideo(`https://mgeb.top/embed/${id}/${s}/${e}?player=vidstack#color:${PLAYER_CONFIG.color}`, id, `${title} T${s}:E${e}`, img);
}

function abrirVideo(url, id, title, img) {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    
    iframe.src = url;
    container.style.display = 'flex';

    // 1. FORÇA ECRÃ COMPLETO AUTOMÁTICO
    try {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) { /* Safari/iOS */
            container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) { /* IE/Edge */
            container.msRequestFullscreen();
        }
        
        // 2. FORÇA ROTAÇÃO HORIZONTAL NO TELEMÓVEL
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(err => console.log("Rotação automática bloqueada:", err));
        }
    } catch (e) {
        console.log("O ecrã completo automático requer interação prévia no dispositivo.");
    }

    // Gravar no histórico "Vistos Recentemente"
    const user = auth.currentUser;
    if (user) {
        db.collection('users').doc(user.uid).collection('continueWatching').doc(String(id)).set({
            movieId: String(id), title: title, coverImage: img, lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true}).then(() => carregarFilaContinueAVer(user.uid));
    }
}

function fecharPlayer() {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    
    iframe.src = '';
    container.style.display = 'none';

    // SAI DO ECRÃ COMPLETO E DESTRAVA ROTAÇÃO DO TELEMÓVEL
    try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    } catch (e) { console.log(e); }
}

async function abrirModalSerie(id, title, img) {
    document.getElementById('modal-tv-title').innerText = title;
    const res = await fetch(`${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=pt-PT`);
    const data = await res.json();
    const sel = document.getElementById('season-select'); sel.innerHTML = '';
    data.seasons.forEach(s => {
        if (s.season_number > 0) sel.innerHTML += `<option value="${s.season_number}">Temporada ${s.season_number}</option>`;
    });
    sel.onchange = (e) => carregarEpisodios(id, e.target.value, title, img);
    carregarEpisodios(id, 1, title, img);
    document.getElementById('episodes-modal').style.display = 'flex';
}

async function carregarEpisodios(id, season, title, img) {
    const list = document.getElementById('episodes-list'); list.innerHTML = 'A carregar...';
    const res = await fetch(`${TMDB_BASE_URL}/tv/${id}/season/${season}?api_key=${TMDB_API_KEY}&language=pt-PT`);
    const data = await res.json();
    list.innerHTML = '';
    data.episodes.forEach(ep => {
        const epImg = ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : img;
        list.innerHTML += `
            <div class="episode-card" onclick="assistirEpisodio('${id}', ${season}, ${ep.episode_number}, '${title.replace(/'/g,"\\'")}', '${img}'); fecharModalEpisodios();">
                <img src="${epImg}" />
                <div class="ep-info"><h4>Ep ${ep.episode_number}: ${ep.name}</h4><p>${ep.overview ? ep.overview.substring(0,50)+'...' : ''}</p></div>
            </div>`;
    });
}

function fecharModalEpisodios() { document.getElementById('episodes-modal').style.display = 'none'; }