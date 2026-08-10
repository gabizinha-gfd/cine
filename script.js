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
const db = firebase.firestore();
const auth = firebase.auth();

const TMDB_API_KEY = "17c56e3825d7fbae6581866083d0d778";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

let filmeAtualInfo = null;
let ultimaGravacao = 0;
const INTERVALO_GRAVACAO = 5;
let minhaListaIDs = new Set();
let debounceSearchTimer;

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// SISTEMA DE AUTENTICAÇÃO (LOGIN / REGISTO)
// ==========================================
let isLoginMode = true;

function toggleAuthMode() {
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
    const errorEl = document.getElementById('auth-error');
    errorEl.innerText = '';

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, password);
            // Definir perfil padrão
            await userCred.user.updateProfile({
                displayName: "Novo Utilizador",
                photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80"
            });
        }
    } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            errorEl.innerText = 'E-mail ou palavra-passe incorretos.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorEl.innerText = 'Este e-mail já se encontra registado.';
        } else if (error.code === 'auth/weak-password') {
            errorEl.innerText = 'A palavra-passe deve ter pelo menos 6 caracteres.';
        } else {
            errorEl.innerText = 'Ocorreu um erro. Tente novamente.';
        }
    }
});

function fazerLogout() {
    auth.signOut();
    fecharModalPerfil();
}

// Observador de Estado da Sessão
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Ocultar Login, Mostrar App
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';

        atualizarUIPerfil(user.displayName, user.photoURL);
        await carregarWatchlistIDs(user.uid);
        carregarFilaContinueAVer(user.uid);
        carregarInicio(); // Carrega os filmes
    } else {
        // Mostrar Login, Ocultar App
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        
        // Limpar dados em memória
        minhaListaIDs.clear();
        document.getElementById('continue-watching-section').style.display = 'none';
        
        // Limpar formulário de login
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
    }
});

// ==========================================
// INTEGRAÇÃO COM TMDB API E LÓGICA DE UI 
// ==========================================
const CATEGORIAS_CONFIG = [
    { id: 'popular-movies', title: '🎬 Filmes Populares', endpoint: '/movie/popular' },
    { id: 'popular-series', title: '📺 Séries Populares', endpoint: '/tv/popular' },
    { id: 'animes', title: '⛩️ Animes em Destaque', endpoint: '/discover/tv?with_genres=16&with_original_language=ja' },
    { id: 'comedy', title: '😂 Comédia', endpoint: '/discover/movie?with_genres=35' },
    { id: 'doramas', title: '🌸 Doramas Asiáticos', endpoint: '/discover/tv?with_original_language=ko' }
];

async function fetchTMDB(endpoint) {
    try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${TMDB_BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}&language=pt-PT`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Erro TMDb");
        const data = await res.json();
        return data.results || [];
    } catch (e) {
        return getFallbackData(); // O seu catálogo de reserva (ver no código anterior)
    }
}

function getFallbackData() {
    return [
        { id: 'f1', title: 'Inception', coverImage: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80', overview: 'Ação e Ficção Científica.' },
        { id: 'f2', title: 'Cyberpunk', coverImage: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&q=80', overview: 'Futuro Neon.' }
    ];
}

async function carregarInicio() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('watchlist-section').style.display = 'none';

    const container = document.getElementById('categories-container');
    if (!container) return;
    container.innerHTML = '';

    const topMovies = await fetchTMDB('/movie/popular');
    if (topMovies.length > 0) configurarHeroBanner(topMovies[0]);

    for (const cat of CATEGORIAS_CONFIG) {
        const items = await fetchTMDB(cat.endpoint);
        renderizarCarrosselCategoria(cat.title, items);
    }
}

function configurarHeroBanner(item) {
    const title = item.title || item.name || 'Destaque CineNet';
    const desc = item.overview || 'Assista em alta definição.';
    const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1600&q=80';
    const poster = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : backdrop;

    document.getElementById('hero-banner').style.backgroundImage = `url('${backdrop}')`;
    document.getElementById('hero-title').innerText = title;
    document.getElementById('hero-desc').innerText = desc.length > 180 ? desc.substring(0, 180) + '...' : desc;

    document.getElementById('hero-play-btn').onclick = () => iniciarFilmeSimulado(item.id, title, poster);

    const watchlistBtn = document.getElementById('hero-watchlist-btn');
    const naLista = minhaListaIDs.has(String(item.id));
    watchlistBtn.innerText = naLista ? '✓ Na Minha Lista' : '+ A minha Lista';
    watchlistBtn.onclick = () => toggleMinhaLista({ id: item.id, title: title, coverImage: poster });
}

function renderizarCarrosselCategoria(tituloSecao, items) {
    const container = document.getElementById('categories-container');
    const section = document.createElement('section');
    section.className = 'section-container';

    let cardsHTML = `<h2 class="section-title">${tituloSecao}</h2><div class="movie-row">`;
    items.forEach(item => cardsHTML += criarCardHTML(item));
    cardsHTML += `</div>`;
    
    section.innerHTML = cardsHTML;
    container.appendChild(section);
}

function criarCardHTML(item) {
    const idStr = String(item.id);
    const title = (item.title || item.name || 'Título').replace(/'/g, "\\'");
    const imgUrl = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : (item.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&q=80');
    const isSaved = minhaListaIDs.has(idStr);

    return `
        <div class="movie-card" tabindex="0">
            <button class="card-watchlist-btn ${isSaved ? 'active' : ''}" 
                    title="${isSaved ? 'Remover' : 'Guardar'}" 
                    onclick="event.stopPropagation(); toggleMinhaLista({id: '${idStr}', title: '${title}', coverImage: '${imgUrl}'})">
                ${isSaved ? '✓' : '+'}
            </button>
            <div onclick="iniciarFilmeSimulado('${idStr}', '${title}', '${imgUrl}')">
                <img src="${imgUrl}" alt="${title}">
                <div class="card-info">
                    <span class="card-title">${title}</span>
                </div>
            </div>
        </div>
    `;
}
