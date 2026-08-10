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

// Configuração do Player de Vídeo
const PLAYER_CONFIG = {
    server: 'mgeb', // 'mgeb' ou 'nhdapi'
    color: 'e50914'
};

// ==========================================
// SUPORTE PARA COMANDOS DE SMART TV (D-PAD)
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.classList.contains('movie-card')) {
        document.activeElement.click();
    }
});

document.addEventListener('keydown', (e) => {
    const activeRow = document.activeElement.closest('.movie-row');
    if (activeRow) {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            activeRow.scrollBy({ left: 220, behavior: 'smooth' });
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            activeRow.scrollBy({ left: -220, behavior: 'smooth' });
        }
    }
});

// ==========================================
// INTEGRAÇÃO DE EMBEDS (mgeb.top / nhdapi.com)
// ==========================================
function gerarUrlEmbed(id, type = 'movie', season = 1, episode = 1) {
    if (PLAYER_CONFIG.server === 'mgeb') {
        if (type === 'movie') {
            return `https://mgeb.top/embed/${id}?player=vidstack#color:${PLAYER_CONFIG.color}`;
        } else {
            return `https://mgeb.top/embed/${id}/${season}/${episode}?player=vidstack#color:${PLAYER_CONFIG.color}`;
        }
    } else {
        if (type === 'movie') {
            return `https://nhdapi.com/embed/movie/${id}`;
        } else {
            return `https://nhdapi.com/embed/tv/${id}/${season}/${episode}`;
        }
    }
}

function assistirFilme(id, title = 'Filme', coverImage = '') {
    const embedUrl = gerarUrlEmbed(id, 'movie');
    abrirModalVideo(embedUrl, id, title, coverImage);
}

function assistirEpisodio(id, season, episode, title = 'Série', coverImage = '') {
    const embedUrl = gerarUrlEmbed(id, 'tv', season, episode);
    const tituloCompleto = `${title} - T${season}:E${episode}`;
    abrirModalVideo(embedUrl, id, tituloCompleto, coverImage);
}

function abrirModalVideo(embedUrl, id, title, coverImage) {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    const user = auth.currentUser;

    if (iframe) iframe.src = embedUrl;
    if (container) container.style.display = 'flex';

    if (user) {
        db.collection('users').doc(user.uid).collection('continueWatching').doc(String(id)).set({
            movieId: String(id),
            title: title,
            coverImage: coverImage,
            progress: 100,
            lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            carregarFilaContinueAVer(user.uid);
        }).catch(err => console.error("Erro ao guardar histórico:", err));
    }
}

function fecharPlayer() {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    
    if (iframe) iframe.src = '';
    if (container) container.style.display = 'none';

    if (auth.currentUser) {
        carregarFilaContinueAVer(auth.currentUser.uid);
    }
}

// ==========================================
// SELETOR DE TEMPORADAS E EPISÓDIOS (SÉRIES)
// ==========================================
async function abrirModalSerie(tvId, title, coverImage) {
    const modal = document.getElementById('episodes-modal');
    if (!modal) return;

    document.getElementById('modal-tv-title').innerText = title;
    
    try {
        const res = await fetch(`${TMDB_BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}&language=pt-PT`);
        const tvData = await res.json();
        
        const seasonSelect = document.getElementById('season-select');
        seasonSelect.innerHTML = '';

        tvData.seasons.forEach(season => {
            if (season.season_number > 0) {
                const option = document.createElement('option');
                option.value = season.season_number;
                option.innerText = `Temporada ${season.season_number} (${season.episode_count} eps)`;
                seasonSelect.appendChild(option);
            }
        });

        seasonSelect.onchange = (e) => carregarEpisodios(tvId, e.target.value, title, coverImage);
        carregarEpisodios(tvId, 1, title, coverImage);

        modal.style.display = 'flex';
    } catch (e) {
        console.error("Erro ao carregar episódios:", e);
    }
}

async function carregarEpisodios(tvId, seasonNumber, title, coverImage) {
    const episodesList = document.getElementById('episodes-list');
    episodesList.innerHTML = '<p style="color: #888;">A carregar episódios...</p>';

    try {
        const res = await fetch(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=pt-PT`);
        const seasonData = await res.json();

        let html = '';
        seasonData.episodes.forEach(ep => {
            const epImg = ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : coverImage;
            const titleClean = title.replace(/'/g, "\\'");
            html += `
                <div class="episode-card" onclick="assistirEpisodio('${tvId}', ${seasonNumber}, ${ep.episode_number}, '${titleClean}', '${coverImage}'); fecharModalEpisodios();">
                    <img src="${epImg}" alt="Episódio ${ep.episode_number}">
                    <div class="ep-info">
                        <h4>Ep ${ep.episode_number}: ${ep.name}</h4>
                        <p>${ep.overview ? ep.overview.substring(0, 80) + '...' : 'Sem sinopse.'}</p>
                    </div>
                </div>
            `;
        });
        episodesList.innerHTML = html;
    } catch (e) {
        episodesList.innerHTML = '<p style="color: #e50914;">Erro ao carregar lista de episódios.</p>';
    }
}

function fecharModalEpisodios() {
    const modal = document.getElementById('episodes-modal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// BUSCA DE CATÁLOGO (TMDB API)
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${TMDB_BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}&language=pt-PT`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Erro de rede TMDb");
        const data = await res.json();
        return data.results || [];
    } catch (e) {
        return [];
    }
}

async function carregarInicio() {
    const container = document.getElementById('categories-container');
    container.innerHTML = '';

    const categorias = [
        { title: '🎬 Filmes Populares', endpoint: '/movie/popular', type: 'movie' },
        { title: '📺 Séries Populares', endpoint: '/tv/popular', type: 'tv' },
        { title: '⛩️ Animes em Destaque', endpoint: '/discover/tv?with_genres=16&with_original_language=ja', type: 'tv' }
    ];

    for (const cat of categorias) {
        const items = await fetchTMDB(cat.endpoint);
        renderizarCarrossel(cat.title, items, cat.type);
    }
}

function renderizarCarrossel(titulo, items, type) {
    const container = document.getElementById('categories-container');
    const section = document.createElement('section');
    section.className = 'section-container';

    let cardsHTML = `<h2>${titulo}</h2><div class="movie-row">`;
    items.forEach(item => {
        if (item.poster_path) {
            const titleClean = (item.title || item.name || 'Título').replace(/'/g, "\\'");
            const imgUrl = `${TMDB_IMAGE_BASE}${item.poster_path}`;
            const clickAction = type === 'movie' 
                ? `assistirFilme('${item.id}', '${titleClean}', '${imgUrl}')` 
                : `abrirModalSerie('${item.id}', '${titleClean}', '${imgUrl}')`;

            cardsHTML += `
                <div class="movie-card" tabindex="0" onclick="${clickAction}">
                    <img src="${imgUrl}" alt="${titleClean}">
                    <div class="card-info"><span class="card-title">${titleClean}</span></div>
                </div>
            `;
        }
    });
    cardsHTML += `</div>`;
    
    section.innerHTML = cardsHTML;
    container.appendChild(section);
}

async function filtrarCategoria(categoria, element, event) {
    if (event) event.preventDefault();
    
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    const container = document.getElementById('categories-container');
    
    if (categoria === 'inicio') {
        carregarInicio();
        return;
    }

    container.innerHTML = '<p style="padding: 20px 4%; color: #a3a3a3;">A carregar...</p>';

    let endpoint = '', titulo = '', type = 'movie';
    switch(categoria) {
        case 'movie': endpoint = '/movie/popular'; titulo = '🎬 Filmes Populares'; type = 'movie'; break;
        case 'tv': endpoint = '/tv/popular'; titulo = '📺 Séries Populares'; type = 'tv'; break;
        case 'anime': endpoint = '/discover/tv?with_genres=16&with_original_language=ja'; titulo = '⛩️ Animes em Destaque'; type = 'tv'; break;
    }

    const items = await fetchTMDB(endpoint);
    container.innerHTML = '';
    renderizarCarrossel(titulo, items, type);
}

// ==========================================
// HISTÓRICO "CONTINUAR A VER" (FIREBASE)
// ==========================================
async function carregarFilaContinueAVer(userId) {
    const section = document.getElementById('continue-watching-section');
    const container = document.getElementById('continue-watching-row');
    
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
        container.innerHTML = '';

        snapshot.forEach(doc => {
            const movie = doc.data();
            const titleClean = (movie.title || '').replace(/'/g, "\\'");
            
            const movieCard = `
                <div class="movie-card" tabindex="0" onclick="assistirFilme('${movie.movieId}', '${titleClean}', '${movie.coverImage}')">
                    <img src="${movie.coverImage}" alt="${movie.title}">
                    <div class="card-info"><span class="card-title">${movie.title}</span></div>
                    <div class="progress-bar-container">
                        <div class="progress-bar"></div>
                    </div>
                </div>
            `;
            container.innerHTML += movieCard;
        });
    } catch (e) {
        section.style.display = 'none';
    }
}

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
auth.onAuthStateChanged(user => {
    if (user) {
        carregarFilaContinueAVer(user.uid);
    }
    carregarInicio();
});