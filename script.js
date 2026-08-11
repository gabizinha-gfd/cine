// ==========================================
// INFRAESTRUTURA CORE & CHAVES
// ==========================================
const TMDB_KEY = '17c56e3825d7fbae6581866083d0d778'; 
let itemSelecionado = null;
let debounceTimer; 
let currentUserUID = null;
let biblioteca = { watchlist: {}, reviews: {}, perfil: {} };
let isLoginMode = false;

const ADMIN_EMAIL = "roberci.azevedo@academico.ifpb.edu.br"; 

// CONFIGURAÇÃO DO FIREBASE
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

window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) {
        if (window.scrollY > 50) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
    }
});

// ==========================================
// AUTENTICAÇÃO E SESSÃO
// ==========================================
document.getElementById('auth-switch-btn').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    ocultarErroAuth();
    
    document.getElementById('auth-title').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-switch-text').innerText = isLoginMode ? 'Novo por aqui?' : 'Já tem uma conta?';
    document.getElementById('auth-switch-btn').innerText = isLoginMode ? 'Registe-se agora.' : 'Entrar';
});

document.getElementById('btn-toggle-password').addEventListener('click', () => {
    const pwdInput = document.getElementById('auth-password');
    const btnToggle = document.getElementById('btn-toggle-password');
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        btnToggle.innerText = '🙈';
    } else {
        pwdInput.type = 'password';
        btnToggle.innerText = '👁️';
    }
});

document.getElementById('auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    ocultarErroAuth();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (isLoginMode) {
        firebase.auth().signInWithEmailAndPassword(email, password)
            .catch(err => exibirErroAuth(err));
    } else {
        firebase.auth().createUserWithEmailAndPassword(email, password)
            .catch(err => exibirErroAuth(err));
    }
});

document.getElementById('btn-guest-auth').addEventListener('click', () => {
    ocultarErroAuth();
    firebase.auth().signInAnonymously().catch(err => {
        console.warn("Entrando no modo convidado local.", err);
        iniciarSessaoConvidadoLocal();
    });
});

function iniciarSessaoConvidadoLocal() {
    currentUserUID = "guest_" + Math.random().toString(36).substring(2, 9);
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    carregarDadosUsuario(true);
    irParaHome();
}

function exibirErroAuth(err) {
    const errorEl = document.getElementById('auth-error');
    let mensagem = "Ocorreu um erro ao processar. Tente novamente.";
    switch(err.code) {
        case 'auth/user-not-found': mensagem = "⚠️ Esta conta não existe."; break;
        case 'auth/wrong-password': mensagem = "⚠️ Senha incorreta."; break;
        case 'auth/invalid-email': mensagem = "⚠️ Digite um e-mail válido."; break;
        case 'auth/email-already-in-use': mensagem = "⚠️ Este e-mail já está em uso."; break;
        case 'auth/weak-password': mensagem = "⚠️ A senha deve ter pelo menos 6 caracteres."; break;
        default: mensagem = "⚠️ " + (err.message || mensagem);
    }
    errorEl.innerText = mensagem;
    errorEl.style.display = 'block';
}

function ocultarErroAuth() {
    const errorEl = document.getElementById('auth-error');
    errorEl.style.display = 'none';
    errorEl.innerText = '';
}

firebase.auth().onAuthStateChanged(user => {
    if (user) {
        currentUserUID = user.uid;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        carregarDadosUsuario(user.isAnonymous);
        irParaHome();
    } else {
        currentUserUID = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    }
});

function logout() { 
    if (firebase.auth().currentUser) firebase.auth().signOut(); 
    else {
        currentUserUID = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    }
}

function carregarDadosUsuario(isAnonymous = false) {
    if (isAnonymous) {
        biblioteca = { watchlist: {}, reviews: {}, perfil: { nome: "Convidado 👤", avatar: avataresSeguros[0] } };
        atualizarNavBar();
        return;
    }
    firebase.database().ref('users/' + currentUserUID + '/biblioteca').once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) biblioteca = data;
        if (!biblioteca.watchlist) biblioteca.watchlist = {};
        if (!biblioteca.reviews) biblioteca.reviews = {};
        if (!biblioteca.perfil) biblioteca.perfil = { nome: "Utilizador", avatar: avataresSeguros[0] };
        atualizarNavBar();
    });
}

function salvarDados() {
    if (currentUserUID && (!firebase.auth().currentUser || !firebase.auth().currentUser.isAnonymous)) {
        firebase.database().ref('users/' + currentUserUID + '/biblioteca').set(biblioteca);
    }
}

// ==========================================
// PERFIL DE UTILIZADOR
// ==========================================
const avataresSeguros = [
    "https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e50914",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=1f1f1f",
    "https://api.dicebear.com/7.x/bottts/svg?seed=Robot1&backgroundColor=b20710"
];
let avatarTemporario = "";

function atualizarNavBar() {
    document.getElementById('user-name-pc').innerText = biblioteca.perfil.nome || "Utilizador";
    document.getElementById('user-avatar-pc').src = biblioteca.perfil.avatar || avataresSeguros[0];
}

function abrirModalPerfil() {
    document.getElementById('input-profile-name').value = biblioteca.perfil.nome || "Utilizador";
    document.getElementById('input-profile-url').value = "";
    avatarTemporario = biblioteca.perfil.avatar || avataresSeguros[0];
    renderizarGrelhaAvatares();
    document.getElementById('profileModal').style.display = 'flex';
    document.body.classList.add('modal-open');
}

function fecharModalPerfil() {
    document.getElementById('profileModal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

function renderizarGrelhaAvatares() {
    const grid = document.getElementById('default-avatars-grid');
    grid.innerHTML = '';
    avataresSeguros.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'avatar-option';
        if (url === avatarTemporario) img.classList.add('selected');
        img.onclick = () => {
            avatarTemporario = url;
            document.getElementById('input-profile-url').value = "";
            renderizarGrelhaAvatares();
        };
        grid.appendChild(img);
    });
}

function salvarPerfil() {
    const novoNome = document.getElementById('input-profile-name').value.trim();
    const customUrl = document.getElementById('input-profile-url').value.trim();
    biblioteca.perfil.nome = novoNome || "Utilizador";
    biblioteca.perfil.avatar = customUrl !== "" ? customUrl : avatarTemporario;
    atualizarNavBar();
    salvarDados();
    fecharModalPerfil();
}

// ==========================================
// NAVEGAÇÃO
// ==========================================
function toggleSubmenu() {
    const submenu = document.getElementById('mobile-submenu');
    if(submenu) submenu.classList.toggle('ativa');
}

function setNavActive(idDesktop, idMobile) {
    document.querySelectorAll('.nav-menu a, .mobile-bottom-nav a').forEach(el => el.classList.remove('active', 'active-nav'));
    if(idDesktop && document.getElementById(idDesktop)) document.getElementById(idDesktop).classList.add('active');
    if(idMobile && document.getElementById(idMobile)) document.getElementById(idMobile).classList.add('active-nav');
}

function esconderTodasSessoes() {
    const sessoes = ['main-content', 'movies-section', 'series-section', 'animes-section', 'doramas-section', 'search-results-section', 'watchlist-section', 'chat-section'];
    sessoes.forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).style.display = 'none';
    });
}

function irParaHome() { setNavActive('nav-home', 'mob-nav-home'); esconderTodasSessoes(); document.getElementById('main-content').style.display = 'block'; carregarHome(); }
function irParaFilmes() { setNavActive('nav-movies', 'mob-nav-titulos'); esconderTodasSessoes(); document.getElementById('movies-section').style.display = 'block'; carregarFilmes(); }
function irParaSeries() { setNavActive('nav-series', 'mob-nav-titulos'); esconderTodasSessoes(); document.getElementById('series-section').style.display = 'block'; carregarSeries(); }
function irParaAnimes() { setNavActive('nav-animes', 'mob-nav-titulos'); esconderTodasSessoes(); document.getElementById('animes-section').style.display = 'block'; carregarAnimes(); }
function irParaDoramas() { setNavActive('nav-doramas', 'mob-nav-titulos'); esconderTodasSessoes(); document.getElementById('doramas-section').style.display = 'block'; carregarDoramas(); }
function irParaBusca() { setNavActive('nav-search', 'mob-nav-search'); esconderTodasSessoes(); document.getElementById('search-results-section').style.display = 'block'; }
function irParaWatchlist() { setNavActive('nav-watchlist', 'mob-nav-titulos'); esconderTodasSessoes(); document.getElementById('watchlist-section').style.display = 'block'; renderizarWatchlist(); }
function irParaChat() { setNavActive(null, 'mob-nav-chat'); esconderTodasSessoes(); document.getElementById('chat-section').style.display = 'block'; }

if(document.getElementById('nav-home')) document.getElementById('nav-home').onclick = irParaHome;
if(document.getElementById('mob-nav-home')) document.getElementById('mob-nav-home').onclick = irParaHome;
if(document.getElementById('nav-movies')) document.getElementById('nav-movies').onclick = irParaFilmes;
if(document.getElementById('nav-series')) document.getElementById('nav-series').onclick = irParaSeries;
if(document.getElementById('nav-animes')) document.getElementById('nav-animes').onclick = irParaAnimes;
if(document.getElementById('nav-doramas')) document.getElementById('nav-doramas').onclick = irParaDoramas;
if(document.getElementById('nav-search')) document.getElementById('nav-search').onclick = irParaBusca;
if(document.getElementById('nav-watchlist')) document.getElementById('nav-watchlist').onclick = irParaWatchlist;
if(document.getElementById('nav-chat')) document.getElementById('nav-chat').onclick = irParaChat;
if(document.getElementById('mob-nav-chat')) document.getElementById('mob-nav-chat').onclick = irParaChat;

function scrollCarousel(rowId, direction) {
    const row = document.getElementById(rowId);
    if(row) {
        const scrollAmount = row.clientWidth * 0.8;
        row.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
    }
}

// ==========================================
// REQUISIÇÕES E RENDERIZAÇÃO DE CATÁLOGO
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const res = await fetch(`https://api.themoviedb.org/3${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=pt-BR`);
        return await res.json();
    } catch {
        return { results: [] };
    }
}

function renderCards(items, containerId, forceType = null) {
    const container = document.getElementById(containerId);
    if(!container || !items) return;
    container.innerHTML = '';
    items.forEach(item => {
        if (!item.poster_path) return;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `<img src="https://image.tmdb.org/t/p/w500${item.poster_path}" alt="${item.title || item.name}" loading="lazy">`;
        card.onclick = () => abrirDetalhes(item.id, forceType || item.media_type || 'movie');
        container.appendChild(card);
    });
}

async function carregarHome() {
    const dataTrending = await fetchTMDB('/trending/all/day');
    if (dataTrending.results && dataTrending.results.length > 0) {
        const hero = dataTrending.results[0];
        document.getElementById('hero-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${hero.backdrop_path})`;
        document.getElementById('hero-title').innerText = hero.title || hero.name;
        document.getElementById('hero-desc').innerText = hero.overview;
        document.getElementById('hero-play-btn').onclick = () => abrirPlayer(hero.id, hero.media_type || 'movie');
        document.getElementById('hero-info-btn').onclick = () => abrirDetalhes(hero.id, hero.media_type || 'movie');
    }
    renderCards(dataTrending.results, 'row-trending');
    const dataAcao = await fetchTMDB('/discover/movie?with_genres=28');
    renderCards(dataAcao.results, 'row-acao', 'movie');
    const dataFiccao = await fetchTMDB('/discover/movie?with_genres=878');
    renderCards(dataFiccao.results, 'row-ficcao', 'movie');
    const dataTerror = await fetchTMDB('/discover/movie?with_genres=27');
    renderCards(dataTerror.results, 'row-terror', 'movie');
    const dataRomance = await fetchTMDB('/discover/movie?with_genres=10749');
    renderCards(dataRomance.results, 'row-romance', 'movie');
}

async function carregarFilmes() {
    const pop = await fetchTMDB('/movie/popular');
    renderCards(pop.results, 'row-filmes-populares', 'movie');
    const acao = await fetchTMDB('/discover/movie?with_genres=28');
    renderCards(acao.results, 'row-filmes-acao', 'movie');
}

async function carregarSeries() {
    const pop = await fetchTMDB('/tv/popular');
    renderCards(pop.results, 'row-series-populares', 'tv');
}

async function carregarAnimes() {
    const animes = await fetchTMDB('/discover/tv?with_genres=16&with_original_language=ja');
    renderCards(animes.results, 'row-animes-populares', 'tv');
}

async function carregarDoramas() {
    const doramas = await fetchTMDB('/discover/tv?with_original_language=ko');
    renderCards(doramas.results, 'row-doramas-populares', 'tv');
}

function abrirDetalhes(id, type = 'movie') {
    fetchTMDB(`/${type}/${id}`).then(item => {
        itemSelecionado = { ...item, type };
        document.getElementById('modal-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/w1280${item.backdrop_path || item.poster_path})`;
        document.getElementById('modal-title').innerText = item.title || item.name;
        document.getElementById('modal-rating').innerText = item.vote_average ? `${item.vote_average.toFixed(1)} ★` : 'N/A';
        document.getElementById('modal-year').innerText = (item.release_date || item.first_air_date || '').substring(0, 4);
        document.getElementById('modal-overview').innerText = item.overview || "Sem sinopse disponível.";
        document.getElementById('modal-play-btn').onclick = () => abrirPlayer(item.id, type);
        document.getElementById('modal-details').style.display = 'flex';
        document.body.classList.add('modal-open');
    });
}

function fecharDetalhes() {
    document.getElementById('modal-details').style.display = 'none';
    document.body.classList.remove('modal-open');
}

function abrirPlayer(id, type = 'movie') {
    const playerScreen = document.getElementById('streaming-player-screen');
    const iframe = document.getElementById('videoPlayer');
    iframe.src = `https://vidsrc.to/embed/${type}/${id}`;
    playerScreen.style.display = 'flex';
}

document.getElementById('close-player-btn').onclick = () => {
    const playerScreen = document.getElementById('streaming-player-screen');
    const iframe = document.getElementById('videoPlayer');
    iframe.src = '';
    playerScreen.style.display = 'none';
};