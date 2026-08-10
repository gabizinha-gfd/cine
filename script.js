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

// Armazena em memória os IDs dos itens guardados na Lista do Utilizador
let minhaListaIDs = new Set();

// ==========================================
// NOTIFICAÇÕES TOAST
// ==========================================
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
// INTEGRAÇÃO COM TMDB API (CATÁLOGOS)
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
        if (!res.ok) throw new Error("Erro na requisição TMDb");
        const data = await res.json();
        return data.results || [];
    } catch (e) {
        console.warn("Falha ao carregar TMDb, a carregar catálogo de contingência:", e);
        return getFallbackData();
    }
}

function getFallbackData() {
    return [
        { id: 'f1', title: 'Inception', poster_path: null, backdrop_path: null, overview: 'Um ladrão que rouba segredos corporativos através do mundo dos sonhos.' },
        { id: 'f2', title: 'Cyberpunk Neon', poster_path: null, backdrop_path: null, overview: 'Futuro distópico repleto de tecnologia.' },
        { id: 'f3', title: 'Anime Academy', poster_path: null, backdrop_path: null, overview: 'Aventura épica de guerreiros místico-urbanos.' },
        { id: 'f4', title: 'Comédia da Vida', poster_path: null, backdrop_path: null, overview: 'Risadas garantidas para toda a família.' },
        { id: 'f5', title: 'Dorama de Verão', poster_path: null, backdrop_path: null, overview: 'Um romance apaixonante nas ruas de Seul.' }
    ];
}

async function carregarInicio() {
    // Reset da barra de pesquisa e visibilidade das secções
    document.getElementById('search-input').value = '';
    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('watchlist-section').style.display = 'none';

    const container = document.getElementById('categories-container');
    if (!container) return;
    container.innerHTML = '';

    const topMovies = await fetchTMDB('/movie/popular');
    if (topMovies.length > 0) {
        configurarHeroBanner(topMovies[0]);
    }

    for (const cat of CATEGORIAS_CONFIG) {
        const items = await fetchTMDB(cat.endpoint);
        renderizarCarrosselCategoria(cat.title, items);
    }
}

function configurarHeroBanner(item) {
    const title = item.title || item.name || 'Destaque CineNet';
    const desc = item.overview || 'Assista agora aos melhores conteúdos em alta definição no CineNet.';
    const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1600&q=80';
    const poster = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : backdrop;

    document.getElementById('hero-banner').style.backgroundImage = `url('${backdrop}')`;
    document.getElementById('hero-title').innerText = title;
    document.getElementById('hero-desc').innerText = desc.length > 180 ? desc.substring(0, 180) + '...' : desc;

    const playBtn = document.getElementById('hero-play-btn');
    playBtn.onclick = () => iniciarFilmeSimulado(item.id, title, poster);

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
        cardsHTML += criarCardHTML(item);
    });

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
                    title="${isSaved ? 'Remover da Lista' : 'Guardar na Lista'}" 
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

// ==========================================
// SISTEMA DE PESQUISA EM TEMPO REAL
// ==========================================

let debounceSearchTimer;

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
        searchTitle.innerText = `Resultados da Pesquisa: "${query}"`;
        searchRow.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">A pesquisar...</p>';
        searchSection.style.display = 'block';
        categoriesContainer.style.display = 'none';

        const results = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
        
        if (results.length === 0) {
            searchRow.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">Nenhum resultado encontrado.</p>';
            return;
        }

        let cardsHTML = '';
        results.forEach(item => {
            if (item.poster_path || item.backdrop_path) {
                cardsHTML += criarCardHTML(item);
            }
        });
        searchRow.innerHTML = cardsHTML;
    }, 300);
}

// ==========================================
// NAVEGAÇÃO POR CATEGORIAS & A MINHA LISTA
// ==========================================

async function filtrarCategoria(categoria, element) {
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

    container.innerHTML = '<p style="padding: 40px; color: #a3a3a3;">A carregar catálogo...</p>';

    let endpoint = '';
    let titulo = '';

    switch(categoria) {
        case 'movie':
            endpoint = '/movie/popular';
            titulo = '🎬 Filmes';
            break;
        case 'tv':
            endpoint = '/tv/popular';
            titulo = '📺 Séries';
            break;
        case 'anime':
            endpoint = '/discover/tv?with_genres=16&with_original_language=ja';
            titulo = '⛩️ Animes';
            break;
        case 'comedy':
            endpoint = '/discover/movie?with_genres=35';
            titulo = '😂 Comédia';
            break;
        case 'dorama':
            endpoint = '/discover/tv?with_original_language=ko';
            titulo = '🌸 Doramas';
            break;
    }

    const items = await fetchTMDB(endpoint);
    container.innerHTML = '';
    if (items.length > 0) {
        configurarHeroBanner(items[0]);
    }
    renderizarCarrosselCategoria(titulo, items);
}

// ==========================================
// GESTÃO DE "A MINHA LISTA" (WATCHLIST) NO FIRESTORE
// ==========================================

async function toggleMinhaLista(movieData) {
    const user = auth.currentUser;
    if (!user) {
        showToast("Inicie sessão para guardar conteúdos.");
        return;
    }

    const movieIdStr = String(movieData.id);
    const itemRef = db.collection('users').doc(user.uid).collection('watchlist').doc(movieIdStr);

    try {
        if (minhaListaIDs.has(movieIdStr)) {
            // Remover da Lista
            await itemRef.delete();
            minhaListaIDs.delete(movieIdStr);
            showToast(`Removido de A minha Lista`);
        } else {
            // Adicionar à Lista
            await itemRef.set({
                id: movieIdStr,
                title: movieData.title,
                coverImage: movieData.coverImage,
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            minhaListaIDs.add(movieIdStr);
            showToast(`Adicionado a A minha Lista!`);
        }

        // Atualizar os botões visíveis na interface
        atualizarBotoesWatchlist();
        
        // Se a secção da Minha Lista estiver visível, recarrega-a
        if (document.getElementById('watchlist-section').style.display !== 'none') {
            carregarSecaoMinhaLista(user.uid);
        }
    } catch (e) {
        console.error("Erro ao gerir a Minha Lista:", e);
        showToast("Erro ao atualizar a lista.");
    }
}

async function carregarWatchlistIDs(userId) {
    try {
        const snapshot = await db.collection('users').doc(userId).collection('watchlist').get();
        minhaListaIDs.clear();
        snapshot.forEach(doc => minhaListaIDs.add(doc.id));
        atualizarBotoesWatchlist();
    } catch (e) {
        console.error("Erro ao carregar IDs da Lista:", e);
    }
}

function atualizarBotoesWatchlist() {
    document.querySelectorAll('.card-watchlist-btn').forEach(btn => {
        const parentCard = btn.closest('.movie-card');
        if (parentCard) {
            const onclickAttr = btn.getAttribute('onclick') || '';
            const match = onclickAttr.match(/id:\s*'([^']+)'/);
            if (match && match[1]) {
                const id = match[1];
                const isSaved = minhaListaIDs.has(id);
                btn.className = `card-watchlist-btn ${isSaved ? 'active' : ''}`;
                btn.innerText = isSaved ? '✓' : '+';
            }
        }
    });
}

async function mostrarMinhaLista(element) {
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('search-results-section').style.display = 'none';
    document.getElementById('categories-container').style.display = 'none';

    const user = auth.currentUser;
    if (user) {
        await carregarSecaoMinhaLista(user.uid);
    } else {
        showToast("Inicie sessão para aceder à sua lista.");
    }
}

async function carregarSecaoMinhaLista(userId) {
    const watchlistSection = document.getElementById('watchlist-section');
    const watchlistRow = document.getElementById('watchlist-row');
    
    watchlistSection.style.display = 'block';
    watchlistRow.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">A carregar a sua lista...</p>';

    try {
        const snapshot = await db.collection('users').doc(userId).collection('watchlist').orderBy('addedAt', 'desc').get();

        if (snapshot.empty) {
            watchlistRow.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">A sua lista está vazia. Adicione filmes e séries para assistir mais tarde!</p>';
            return;
        }

        let cardsHTML = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            cardsHTML += criarCardHTML(item);
        });

        watchlistRow.innerHTML = cardsHTML;
    } catch (e) {
        console.error("Erro ao carregar a secção Minha Lista:", e);
        watchlistRow.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">Erro ao carregar os itens salvos.</p>';
    }
}

// ==========================================
// EDITAR PERFIL (MODAL)
// ==========================================

function abrirModalPerfil() {
    const user = auth.currentUser;
    const modal = document.getElementById('profile-modal');
    if (user) {
        document.getElementById('edit-display-name').value = user.displayName || 'Utilizador CineNet';
        document.getElementById('edit-avatar-url').value = user.photoURL || '';
    }
    modal.style.display = 'flex';
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
    if (!user) {
        showToast("É necessário estar ligado para guardar o perfil.");
        return;
    }

    const novoNome = document.getElementById('edit-display-name').value.trim();
    const novoAvatar = document.getElementById('edit-avatar-url').value.trim() || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";

    try {
        await user.updateProfile({ displayName: novoNome, photoURL: novoAvatar });
        await db.collection('users').doc(user.uid).set({
            displayName: novoNome,
            photoURL: novoAvatar,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        atualizarUIPerfil(novoNome, novoAvatar);
        fecharModalPerfil();
        showToast("Perfil atualizado com sucesso!");
    } catch (error) {
        console.error("Erro ao guardar perfil:", error);
        showToast("Erro ao guardar perfil.");
    }
}

function atualizarUIPerfil(nome, photoUrl) {
    const avatarImg = document.getElementById('user-avatar-img');
    const nameSpan = document.getElementById('user-display-name');
    
    if (avatarImg) avatarImg.src = photoUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";
    if (nameSpan) nameSpan.innerText = nome || "Perfil";
}

// ==========================================
// CONTINUAR A VER (PROGRESSO DO VÍDEO)
// ==========================================

async function guardarProgressoFirebase(userId, movieData, currentTime, duration) {
    if (!userId || !movieData || isNaN(duration) || duration === 0) return;
    if (currentTime - ultimaGravacao < INTERVALO_GRAVACAO && currentTime !== duration) return;

    try {
        const movieRef = db.collection('users').doc(userId).collection('continueWatching').doc(String(movieData.id));
        const percentagem = (currentTime / duration) * 100;
        
        if (percentagem > 95) {
            await movieRef.delete();
            return;
        }

        await movieRef.set({
            movieId: String(movieData.id),
            title: movieData.title,
            coverImage: movieData.coverImage,
            currentTime: currentTime,
            duration: duration,
            progress: percentagem,
            lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        ultimaGravacao = currentTime;
    } catch (error) {
        console.error("Erro ao guardar progresso:", error);
    }
}

async function carregarFilaContinueAVer(userId) {
    const section = document.getElementById('continue-watching-section');
    const container = document.getElementById('continue-watching-row');
    if (!section || !container) return;

    try {
        const snapshot = await db.collection('users')
                                 .doc(userId)
                                 .collection('continueWatching')
                                 .orderBy('lastWatched', 'desc')
                                 .limit(10)
                                 .get();

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
                    <div class="card-info">
                        <span class="card-title">${movie.title}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${Math.min(movie.progress, 100)}%;"></div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = cardsHTML;
    } catch (error) {
        console.error("Erro ao carregar 'Continuar a Ver':", error);
    }
}

// ==========================================
// REPRODUTOR DE VÍDEO
// ==========================================

async function iniciarFilmeSimulado(movieId, title = 'Título', coverImage = '') {
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('meu-player-video');
    const currentUser = auth.currentUser;

    filmeAtualInfo = {
        id: String(movieId),
        title: title,
        coverImage: coverImage || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&q=80"
    };

    videoContainer.style.display = 'flex';
    let tempoSalvo = 0;

    if (currentUser) {
        try {
            const docSnap = await db.collection('users')
                                    .doc(currentUser.uid)
                                    .collection('continueWatching')
                                    .doc(String(movieId))
                                    .get();

            if (docSnap.exists && docSnap.data().currentTime > 0) {
                tempoSalvo = docSnap.data().currentTime;
            }
        } catch (e) {
            console.warn("Sem histórico prévio de reprodução:", e);
        }
    }

    const aplicarTempoSalvo = () => {
        if (tempoSalvo > 0 && tempoSalvo < videoPlayer.duration) {
            videoPlayer.currentTime = tempoSalvo;
        }
        videoPlayer.play().catch(err => console.log("Aviso de auto-play:", err));
        videoPlayer.removeEventListener('loadedmetadata', aplicarTempoSalvo);
    };

    if (videoPlayer.readyState >= 1) {
        aplicarTempoSalvo();
    } else {
        videoPlayer.addEventListener('loadedmetadata', aplicarTempoSalvo);
    }
}

const videoElement = document.getElementById('meu-player-video');
if (videoElement) {
    videoElement.addEventListener('timeupdate', function() {
        const currentUser = auth.currentUser;
        if (currentUser && filmeAtualInfo) {
            guardarProgressoFirebase(currentUser.uid, filmeAtualInfo, this.currentTime, this.duration);
        }
    });

    videoElement.addEventListener('pause', function() {
        const currentUser = auth.currentUser;
        if (currentUser && filmeAtualInfo) {
            ultimaGravacao = 0;
            guardarProgressoFirebase(currentUser.uid, filmeAtualInfo, this.currentTime, this.duration);
        }
    });
}

function fecharPlayer() {
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('meu-player-video');
    if (videoPlayer) videoPlayer.pause();
    if (videoContainer) videoContainer.style.display = 'none';

    if (auth.currentUser) {
        carregarFilaContinueAVer(auth.currentUser.uid);
    }
}

// ==========================================
// INICIALIZAÇÃO DE SESSÃO & APP
// ==========================================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        atualizarUIPerfil(user.displayName, user.photoURL);
        await carregarWatchlistIDs(user.uid);
        carregarFilaContinueAVer(user.uid);
    } else {
        try {
            const userCred = await auth.signInAnonymously();
            if (userCred.user) {
                atualizarUIPerfil("Visitante", "");
            }
        } catch (error) {
            console.error("Erro no arranque da sessão:", error);
        }
    }
    carregarInicio();
});