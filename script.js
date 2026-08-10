// ==========================================
// CONFIGURAÇÃO FIREBASE
// (Cole as suas credenciais aqui, caso ainda não tenha num ficheiro separado)
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
    // Se o utilizador apertar Enter num filme focado (com o comando ou teclado)
    if (e.key === 'Enter' && document.activeElement.classList.contains('movie-card')) {
        document.activeElement.click();
    }
});

// Navegação horizontal (Setas Direita/Esquerda)
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
const INTERVALO_GRAVACAO = 10; 

// Função para gravar no Firebase
async function guardarProgressoFirebase(userId, movieData, currentTime, duration) {
    if (!userId || isNaN(duration) || duration === 0) return;
    
    // Evita gravação excessiva (Throttling)
    if (currentTime - ultimaGravacao < INTERVALO_GRAVACAO && currentTime !== duration) return;

    try {
        const movieRef = db.collection('users').doc(userId).collection('continueWatching').doc(movieData.id);
        const percentagem = (currentTime / duration) * 100;
        
        // Se viu mais de 95%, apaga da lista de "Continuar a Ver"
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
        });

        ultimaGravacao = currentTime;
    } catch (error) {
        console.error("Erro ao guardar:", error);
    }
}

// Carregar fila de filmes na página inicial
async function carregarFilaContinueAVer(userId) {
    const section = document.getElementById('continue-watching-section');
    const container = document.getElementById('continue-watching-row');
    
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
        
        // Criação do card com a estrutura de barra de progresso vermelha
        const movieCard = `
            <div class="movie-card" tabindex="0" onclick="iniciarFilmeSimulado('${movie.movieId}')">
                <img src="${movie.coverImage}" alt="${movie.title}">
                
                <!-- Barra de Progresso UI -->
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${movie.progress}%;"></div>
                </div>
            </div>
        `;
        container.innerHTML += movieCard;
    });
}

// ==========================================
// INTEGRAÇÃO COM O PLAYER DE VÍDEO
// ==========================================
let filmeAAtualInfo = {}; // Guarda a info do filme aberto

async function iniciarFilmeSimulado(movieId) {
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('meu-player-video');
    const currentUser = auth.currentUser;

    // Dados fictícios (No seu código, você busca da sua API ou Base de Dados)
    filmeAAtualInfo = {
        id: movieId,
        title: "Nome do Filme",
        coverImage: "https://via.placeholder.com/200x300/333/fff?text=" + movieId
    };

    videoContainer.style.display = 'block';

    // 1. Verifica de onde o utilizador parou
    if (currentUser) {
        const docSnap = await db.collection('users').doc(currentUser.uid).collection('continueWatching').doc(movieId).get();
        if (docSnap.exists && docSnap.data().currentTime > 0) {
            videoPlayer.currentTime = docSnap.data().currentTime;
            console.log("A retomar de:", docSnap.data().currentTime);
        }
    }

    videoPlayer.play();
}

// Ouve o vídeo a reproduzir e guarda de 10 em 10 segundos
document.getElementById('meu-player-video').addEventListener('timeupdate', function() {
    const currentUser = auth.currentUser;
    if (currentUser) {
        guardarProgressoFirebase(currentUser.uid, filmeAAtualInfo, this.currentTime, this.duration);
    }
});

// Guarda imediatamente quando o vídeo é pausado
document.getElementById('meu-player-video').addEventListener('pause', function() {
    const currentUser = auth.currentUser;
    if (currentUser) {
        ultimaGravacao = 0; // Força gravação
        guardarProgressoFirebase(currentUser.uid, filmeAAtualInfo, this.currentTime, this.duration);
    }
});

function fecharPlayer() {
    const videoContainer = document.getElementById('video-container');
    const videoPlayer = document.getElementById('meu-player-video');
    videoPlayer.pause();
    videoContainer.style.display = 'none';
    
    // Atualiza a Home page para mostrar a barra de progresso atualizada
    if (auth.currentUser) {
        carregarFilaContinueAVer(auth.currentUser.uid);
    }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
auth.onAuthStateChanged(user => {
    if (user) {
        carregarFilaContinueAVer(user.uid);
    }
});