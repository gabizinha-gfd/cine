// ==========================================
// CONFIGURAÇÃO E INICIALIZAÇÃO FIREBASE
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

// ==========================================
// SUPORTE PARA COMANDOS DE SMART TV (D-PAD)
// ==========================================
document.addEventListener('keydown', (e) => {
    // Permite acionar botões/cards com a tecla Enter do comando
    if (e.key === 'Enter' && document.activeElement.classList.contains('movie-card')) {
        document.activeElement.click();
    }
});

// Navegação horizontal suave
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
// SISTEMA DE "CONTINUAR A VER"
// ==========================================
let ultimaGravacao = 0;
const INTERVALO_GRAVACAO = 5; // Registo efetuado a cada 5 segundos
let filmeAtualInfo = null;

/**
 * Grava o progresso do utilizador no Firestore
 */
async function guardarProgressoFirebase(userId, movieData, currentTime, duration) {
    if (!userId || !movieData || isNaN(duration) || duration === 0) return;
    
    // Evita chamadas repetidas à base de dados (Throttling)
    if (currentTime - ultimaGravacao < INTERVALO_GRAVACAO && currentTime !== duration) return;

    try {
        const movieRef = db.collection('users').doc(userId).collection('continueWatching').doc(movieData.id);
        const percentagem = (currentTime / duration) * 100;
        
        // Se visualizou mais de 95%, remove da lista "Continuar a Ver"
        if (percentagem > 95) {
            await movieRef.delete();
            return;
        }

        await movieRef.set({
            movieId: movieData.id,
            title: movieData.title,
            coverImage: movieData.coverImage,
            currentTime: currentTime,
            duration: duration,
            progress: percentagem,
            lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        ultimaGravacao = currentTime;
    } catch (error) {
        console.error("Erro ao guardar progresso no Firebase:", error);
    }
}

/**
 * Carrega e exibe os filmes guardados na secção "Continuar a Ver"
 */
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
        
        // Renderização otimizada em bloco único
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
        console.error("Erro ao carregar lista 'Continuar a Ver':", error);
    }
}

// ==========================================
// INTEGRACÃO COM O PLAYER DE VÍDEO
// ==========================================

/**
 * Inicia a reprodução e retoma exatamente onde o utilizador parou
 */
async function iniciarFilmeSimulado(movieId, title = 'Filme em Destaque', coverImage = '') {
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('meu-player-video');
    const currentUser = auth.currentUser;

    filmeAtualInfo = {
        id: movieId,
        title: title,
        coverImage: coverImage || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&q=80"
    };

    videoContainer.style.display = 'flex';

    let tempoSalvo = 0;

    // 1. Procura a posição salva no Firestore
    if (currentUser) {
        try {
            const docSnap = await db.collection('users')
                                    .doc(currentUser.uid)
                                    .collection('continueWatching')
                                    .doc(movieId)
                                    .get();

            if (docSnap.exists && docSnap.data().currentTime > 0) {
                tempoSalvo = docSnap.data().currentTime;
            }
        } catch (e) {
            console.warn("Erro ao pesquisar tempo salvo:", e);
        }
    }

    // 2. Transição segura de tempo após carregamento dos metadados
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

// Monitoriza o vídeo e grava o progresso periodicamente
const videoElement = document.getElementById('meu-player-video');

if (videoElement) {
    videoElement.addEventListener('timeupdate', function() {
        const currentUser = auth.currentUser;
        if (currentUser && filmeAtualInfo) {
            guardarProgressoFirebase(currentUser.uid, filmeAtualInfo, this.currentTime, this.duration);
        }
    });

    // Grava imediatamente ao pausar
    videoElement.addEventListener('pause', function() {
        const currentUser = auth.currentUser;
        if (currentUser && filmeAtualInfo) {
            ultimaGravacao = 0; // Força gravação instantânea
            guardarProgressoFirebase(currentUser.uid, filmeAtualInfo, this.currentTime, this.duration);
        }
    });
}

/**
 * Fecha o player e atualiza a interface inicial
 */
function fecharPlayer() {
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('meu-player-video');
    
    if (videoPlayer) {
        videoPlayer.pause();
    }
    
    if (videoContainer) {
        videoContainer.style.display = 'none';
    }

    // Recarrega a fila "Continuar a Ver"
    if (auth.currentUser) {
        carregarFilaContinueAVer(auth.currentUser.uid);
    }
}

// ==========================================
// INICIALIZAÇÃO DE AUTENTICAÇÃO
// ==========================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        carregarFilaContinueAVer(user.uid);
    } else {
        // Fallback de login anónimo para testes de funcionamento imediatos
        try {
            await auth.signInAnonymously();
        } catch (error) {
            console.error("Erro no login anónimo:", error);
        }
    }
});