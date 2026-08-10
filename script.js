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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

const TMDB_API_KEY = "17c56e3825d7fbae6581866083d0d778";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

let minhaListaIDs = new Set();
let debounceSearchTimer;
let isLoginMode = true;

// ==========================================
// FUNÇÕES ÚTEIS (TOAST)
// ==========================================
function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ==========================================
// SISTEMA DE AUTENTICAÇÃO
// ==========================================
function toggleAuthMode(event) {
    if (event) event.preventDefault();
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
    errorEl.innerText = 'A processar...';

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, password);
            await userCred.user.updateProfile({
                displayName: "Novo Utilizador",
                photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80"
            });
        }
        errorEl.innerText = '';
    } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            errorEl.innerText = 'E-mail ou palavra-passe incorretos.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorEl.innerText = 'Este e-mail já está registado.';
        } else if (error.code === 'auth/weak-password') {
            errorEl.innerText = 'A palavra-passe precisa de pelo menos 6 caracteres.';
        } else {
            errorEl.innerText = 'Ocorreu um erro. Verifique a ligação.';
        }
    }
});

function fazerLogout() {
    auth.signOut().then(() => fecharModalPerfil());
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';

        atualizarUIPerfil(user.displayName, user.photoURL);
        await carregarWatchlistIDs(user.uid);
        carregarFilaContinueAVer(user.uid);
        carregarInicio();
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        
        minhaListaIDs.clear();
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
        document.getElementById('continue-watching-section').style.display = 'none';
    }
});

// ==========================================
// NAVEGAÇÃO E TMDb API
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
        if (!res.ok) throw new Error("Erro de rede TMDb");
        const data = await res.json();
        return data.results || [];
    } catch (e) {
        return [{ id: 1, title: 'Inception', poster_path: null, overview: 'Ação e Ficção Científica.' }];
    }
}

async function carregarInicio() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('watchlist-section').style.display = 'none';
    
    const container = document.getElementById('categories-container');
    container.style.display = 'block';
    container.innerHTML = '';

    const topMovies = await fetchTMDB('/movie/popular');
    if (topMovies.length > 0) configurarHeroBanner(topMovies[0]);

    for (const cat of CATEGORIAS_CONFIG) {
        const items = await fetchTMDB(cat.endpoint);
        renderizarCarrosselCategoria(cat.title, items);
    }
}

function configurarHeroBanner(item) {
    const title = (item.title || item.name || 'Destaque CineNet').replace(/'/g, "\\'");
    const desc = item.overview || 'Assista em alta definição no CineNet.';
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
    items.forEach(item => {
        if (item.poster_path || item.backdrop_path) cardsHTML += criarCardHTML(item);
    });
    cardsHTML += `</div>`;
    
    section.innerHTML = cardsHTML;
    container.appendChild(section);
}

function criarCardHTML(item) {
    const idStr = String(item.id);
    const title = (item.title || item.name || 'Título').replace(/'/g, "\\'");
    const imgUrl = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&q=80';
    const isSaved = minhaListaIDs.has(idStr);

    return `
        <div class="movie-card" tabindex="0">
            <button class="card-watchlist-btn ${isSaved ? 'active' : ''}" 
                    title="${isSaved ? 'Remover' : 'Guardar'}" 
                    onclick="event.stopPropagation(); toggleMinhaLista({id: '${idStr}', title: '${title}', coverImage: '${imgUrl}'})">
                ${isSaved ? '✓' : '+'}
            </button>
            <div onclick="iniciarFilmeSimulado('${idStr}', '${title}', '${imgUrl}')">
                <img src="${imgUrl}" alt="${title}" loading="lazy">
                <div class="card-info"><span class="card-title">${title}</span></div>
            </div>
        </div>
    `;
}

// ==========================================
// PESQUISA EM TEMPO REAL & FILTROS
// ==========================================
async function pesquisarTitulos(e) {
    const query = e.target.value.trim();
    const searchSection = document.getElementById('search-results-section');
    const searchRow = document.getElementById('search-results-row');
    const searchTitle = document.getElementById('search-results-title');
    const categoriesContainer = document.getElementById('categories-container');

    clearTimeout(debounceSearchTimer);

    if (query.length < 2) {
        searchSection.style.display = 'none';
        categoriesContainer.style.display = 'block';
        return;
    }

    debounceSearchTimer = setTimeout(async () => {
        searchTitle.innerText = `Resultados para: "${query}"`;
        searchRow.innerHTML = '<p style="color: var(--text-muted); padding: 10px;">A pesquisar...</p>';
        searchSection.style.display = 'block';
        categoriesContainer.style.display = 'none';

        const results = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
        
        if (results.length === 0) {
            searchRow.innerHTML = '<p style="color: var(--text-muted); padding: 10px;">Nenhum resultado encontrado.</p>';
            return;
        }

        let cardsHTML = '';
        results.forEach(item => {
            if (item.poster_path) cardsHTML += criarCardHTML(item);
        });
        searchRow.innerHTML = cardsHTML;
    }, 400); 
}

async function filtrarCategoria(categoria, element, event) {
    if(event) event.preventDefault();
    
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('watchlist-section').style.display = 'none';
    
    const container = document.getElementById('categories-container');
    container.style.display = 'block';

    if (categoria === 'inicio') {
        carregarInicio();
        return;
    }

    container.innerHTML = '<p style="padding: 40px; color: #a3a3a3; text-align: center;">A carregar catálogo...</p>';

    let endpoint = '', titulo = '';
    switch(categoria) {
        case 'movie': endpoint = '/movie/popular'; titulo = '🎬 Filmes'; break;
        case 'tv': endpoint = '/tv/popular'; titulo = '📺 Séries'; break;
        case 'anime': endpoint = '/discover/tv?with_genres=16&with_original_language=ja'; titulo = '⛩️ Animes'; break;
        case 'comedy': endpoint = '/discover/movie?with_genres=35'; titulo = '😂 Comédia'; break;
        case 'dorama': endpoint = '/discover/tv?with_original_language=ko'; titulo = '🌸 Doramas'; break;
    }

    const items = await fetchTMDB(endpoint);
    container.innerHTML = '';
    if (items.length > 0) configurarHeroBanner(items[0]);
    renderizarCarrosselCategoria(titulo, items);
}

// ==========================================
// A MINHA LISTA (WATCHLIST)
// ==========================================
async function toggleMinhaLista(movieData) {
    const user = auth.currentUser;
    if (!user) return showToast("Sessão expirou. Faça login.");

    const movieIdStr = String(movieData.id);
    const itemRef = db.collection('users').doc(user.uid).collection('watchlist').doc(movieIdStr);

    try {
        if (minhaListaIDs.has(movieIdStr)) {
            await itemRef.delete();
            minhaListaIDs.delete(movieIdStr);
            showToast("Removido da Lista");
        } else {
            await itemRef.set({
                id: movieIdStr, title: movieData.title, coverImage: movieData.coverImage,
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            minhaListaIDs.add(movieIdStr);
            showToast("Adicionado à Lista!");
        }

        atualizarBotoesWatchlist();
        if (document.getElementById('watchlist-section').style.display === 'block') {
            carregarSecaoMinhaLista(user.uid);
        }
    } catch (e) {
        showToast("Erro ao sincronizar com a nuvem.");
    }
}

async function carregarWatchlistIDs(userId) {
    try {
        const snapshot = await db.collection('users').doc(userId).collection('watchlist').get();
        minhaListaIDs.clear();
        snapshot.forEach(doc => minhaListaIDs.add(doc.id));
        atualizarBotoesWatchlist();
    } catch (e) { }
}

function atualizarBotoesWatchlist() {
    document.querySelectorAll('.card-watchlist-btn').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        const match = onclickAttr.match(/id:\s*'([^']+)'/);
        if (match && match[1]) {
            const isSaved = minhaListaIDs.has(match[1]);
            btn.className = `card-watchlist-btn ${isSaved ? 'active' : ''}`;
            btn.innerText = isSaved ? '✓' : '+';
        }
    });
}

async function mostrarMinhaLista(element, event) {
    if(event) event.preventDefault();
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('categories-container').style.display = 'none';

    const user = auth.currentUser;
    if (user) await carregarSecaoMinhaLista(user.uid);
}

async function carregarSecaoMinhaLista(userId) {
    const section = document.getElementById('watchlist-section');
    const row = document.getElementById('watchlist-row');
    section.style.display = 'block';
    row.innerHTML = '<p style="color: #a3a3a3;">A carregar os seus filmes...</p>';

    try {
        const snapshot = await db.collection('users').doc(userId).collection('watchlist').orderBy('addedAt', 'desc').get();
        if (snapshot.empty) {
            row.innerHTML = '<p style="color: #a3a3a3;">A sua lista está vazia.</p>';
            return;
        }

        let cardsHTML = '';
        snapshot.forEach(doc => cardsHTML += criarCardHTML(doc.data()));
        row.innerHTML = cardsHTML;
    } catch (e) {
        row.innerHTML = '<p style="color: #E50914;">Falha ao carregar a lista.</p>';
    }
}

// ==========================================
// MODAL DE PERFIL
// ==========================================
function abrirModalPerfil() {
    const user = auth.currentUser;
    if (user) {
        document.getElementById('edit-display-name').value = user.displayName || 'Utilizador';
        document.getElementById('edit-avatar-url').value = user.photoURL || '';
    }
    document.getElementById('profile-modal').style.display = 'flex';
}

function fecharModalPerfil() {
    document.getElementById('profile-modal').style.display = 'none';
}

function selecionarPresetAvatar(imgElement) {
    document.querySelectorAll('.preset-avatar').forEach(img => img.classList.remove('active'));
    imgElement.classList.add('active');
    document.getElementById('edit-avatar-url').value = imgElement.src;
}

async function guardarPerfil(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const novoNome = document.getElementById('edit-display-name').value.trim();
    const novoAvatar = document.getElementById('edit-avatar-url').value.trim() || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";

    try {
        await user.updateProfile({ displayName: novoNome, photoURL: novoAvatar });
        await db.collection('users').doc(user.uid).set({
            displayName: novoNome, photoURL: novoAvatar, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        atualizarUIPerfil(novoNome, novoAvatar);
        fecharModalPerfil();
        showToast("Perfil atualizado com sucesso!");
    } catch (error) {
        showToast("Falha ao atualizar perfil.");
    }
}

function atualizarUIPerfil(nome, photoUrl) {
    const avatar = document.getElementById('user-avatar-img');
    const nameSpan = document.getElementById('user-display-name');
    if (avatar) avatar.src = photoUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";
    if (nameSpan) nameSpan.innerText = nome || "Perfil";
}

// ==========================================
// PLAYER DE VÍDEO MEGAEMBEDAPI & HISTÓRICO
// ==========================================
async function iniciarFilmeSimulado(movieId, title = 'Filme', coverImage = '') {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    const user = auth.currentUser;

    // Constrói o link com a MegaEmbedAPI
    iframe.src = `https://megaembedapi.site/embed/${movieId}`;
    container.style.display = 'flex';

    // Salva no "Histórico (Vistos Recentemente)"
    if (user) {
        try {
            const movieRef = db.collection('users').doc(user.uid).collection('continueWatching').doc(String(movieId));
            await movieRef.set({
                movieId: String(movieId),
                title: title,
                coverImage: coverImage,
                progress: 100, // Marcamos como 100% no iframe
                lastWatched: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Recarrega o carrossel do histórico
            carregarFilaContinueAVer(user.uid);
        } catch (e) {
            console.log("Erro ao salvar no histórico");
        }
    }
}

async function carregarFilaContinueAVer(userId) {
    const section = document.getElementById('continue-watching-section');
    const row = document.getElementById('continue-watching-row');
    if (!section || !row) return;

    try {
        const snapshot = await db.collection('users').doc(userId).collection('continueWatching').orderBy('lastWatched', 'desc').limit(10).get();
        if (snapshot.empty) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        let cardsHTML = '';
        snapshot.forEach(doc => {
            const movie = doc.data();
            const titleEscaped = (movie.title || '').replace(/'/g, "\\'");
            cardsHTML += `
                <div class="movie-card" tabindex="0" onclick="iniciarFilmeSimulado('${movie.movieId}', '${titleEscaped}', '${movie.coverImage}')">
                    <img src="${movie.coverImage}" alt="${movie.title}">
                    <div class="card-info"><span class="card-title">${movie.title}</span></div>
                    <div class="progress-bar-container"><div class="progress-bar" style="width: 100%;"></div></div>
                </div>
            `;
        });
        row.innerHTML = cardsHTML;
    } catch (e) {
        section.style.display = 'none';
    }
}

function fecharPlayer() {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    
    // Esvazia o src do Iframe para parar imediatamente a reprodução / som do filme
    iframe.src = ''; 
    container.style.display = 'none';
}