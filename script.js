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

// Configuração do Servidor de Embeds
const PLAYER_CONFIG = {
    server: 'mgeb', // 'mgeb' ou 'nhdapi'
    color: 'e50914'  // Cor da barra de progresso do player
};

// ==========================================
// SUPORTE PARA COMANDOS DE SMART TV (D-PAD)
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.classList.contains('movie-card')) {
        document.activeElement.click();
    }
});

document.querySelectorAll('.movie-row').forEach(row => {
    row.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            row.scrollBy({ left: 220, behavior: 'smooth' });
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            row.scrollBy({ left: -220, behavior: 'smooth' });
        }
    });
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

// Iniciar Filme no Player
function assistirFilme(id, title = 'Filme', coverImage = '') {
    const embedUrl = gerarUrlEmbed(id, 'movie');
    abrirModalVideo(embedUrl, id, title, coverImage);
}

// Iniciar Episódio no Player
function assistirEpisodio(id, season, episode, title = 'Série', coverImage = '') {
    const embedUrl = gerarUrlEmbed(id, 'tv', season, episode);
    const tituloCompleto = `${title} (T${season}:E${episode})`;
    abrirModalVideo(embedUrl, id, tituloCompleto, coverImage);
}

function abrirModalVideo(embedUrl, id, title, coverImage) {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    const currentUser = auth.currentUser;

    if (iframe) iframe.src = embedUrl;
    if (container) container.style.display = 'block';

    // Grava item no "Continuar a Ver"
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).collection('continueWatching').doc(String(id)).set({
            movieId: String(id),
            title: title,
            coverImage: coverImage,
            progress: 80, // Progresso estimado visual
            lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            carregarFilaContinueAVer(currentUser.uid);
        }).catch(err => console.error("Erro ao guardar histórico:", err));
    }
}

function fecharPlayer() {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    
    if (iframe) iframe.src = ''; // Corta o áudio/vídeo imediatamente
    if (container) container.style.display = 'none';

    if (auth.currentUser) {
        carregarFilaContinueAVer(auth.currentUser.uid);
    }
}

// ==========================================
// MODAL DE TEMPORADAS E EPISÓDIOS
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
        console.error("Erro ao carregar série:", e);
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
                <div class="episode-item" onclick="assistirEpisodio('${tvId}', ${seasonNumber}, ${ep.episode_number}, '${titleClean}', '${coverImage}'); fecharModalEpisodios();">
                    <img src="${epImg}" alt="Episódio ${ep.episode_number}">
                    <div class="episode-item-info">
                        <h4>Ep ${ep.episode_number}: ${ep.name}</h4>
                        <p>${ep.overview ? ep.overview.substring(0, 60) + '...' : 'Sem sinopse.'}</p>
                    </div>
                </div>
            `;
        });
        episodesList.innerHTML = html;
    } catch (e) {
        episodesList.innerHTML = '<p style="color: #e50914;">Erro ao carregar episódios.</p>';
    }
}

function fecharModalEpisodios() {
    const modal = document.getElementById('episodes-modal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// SISTEMA DE "CONTINUAR A VER" (FIREBASE)
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
            
            // Renderiza o card idêntico à estrutura original
            const movieCard = `
                <div class="movie-card" tabindex="0" onclick="assistirFilme('${movie.movieId}', '${titleClean}', '${movie.coverImage}')">
                    <img src="${movie.coverImage}" alt="${movie.title}">
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${movie.progress || 80}%;"></div>
                    </div>
                </div>
            `;
            container.innerHTML += movieCard;
        });
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
    }
}

// ==========================================
// CARREGAR CATÁLOGOS AUTOMÁTICOS (TMDB)
// ==========================================
async function carregarCatalogos() {
    // 1. Filmes Populares
    try {
        const resMovies = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=pt-PT`);
        const moviesData = await resMovies.json();
        const moviesRow = document.getElementById('popular-movies-row');
        
        if (moviesRow && moviesData.results) {
            moviesRow.innerHTML = '';
            moviesData.results.forEach(movie => {
                if (movie.poster_path) {
                    const imgUrl = `${TMDB_IMAGE_BASE}${movie.poster_path}`;
                    const titleClean = (movie.title || '').replace(/'/g, "\\'");
                    moviesRow.innerHTML += `
                        <div class="movie-card" tabindex="0" onclick="assistirFilme('${movie.id}', '${titleClean}', '${imgUrl}')">
                            <img src="${imgUrl}" alt="${titleClean}">
                        </div>
                    `;
                }
            });
        }
    } catch (e) {
        console.error("Erro ao carregar filmes:", e);
    }

    // 2. Séries Populares
    try {
        const resSeries = await fetch(`${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=pt-PT`);
        const seriesData = await resSeries.json();
        const seriesRow = document.getElementById('popular-series-row');

        if (seriesRow && seriesData.results) {
            seriesRow.innerHTML = '';
            seriesData.results.forEach(series => {
                if (series.poster_path) {
                    const imgUrl = `${TMDB_IMAGE_BASE}${series.poster_path}`;
                    const titleClean = (series.name || '').replace(/'/g, "\\'");
                    seriesRow.innerHTML += `
                        <div class="movie-card" tabindex="0" onclick="abrirModalSerie('${series.id}', '${titleClean}', '${imgUrl}')">
                            <img src="${imgUrl}" alt="${titleClean}">
                        </div>
                    `;
                }
            });
        }
    } catch (e) {
        console.error("Erro ao carregar séries:", e);
    }
}

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
auth.onAuthStateChanged(user => {
    if (user) {
        carregarFilaContinueAVer(user.uid);
    }
});

// Carrega os filmes e séries ao iniciar a página
document.addEventListener('DOMContentLoaded', () => {
    carregarCatalogos();
});