// ==========================================
// CONFIGURAÇÃO FIREBASE E TMDB
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

// =============== ATENÇÃO: CONTAS CRIADORES =============== 
// Coloque aqui o(s) email(s) que terão acesso VIP Ilimitado GRÁTIS
const EMAILS_CRIADORES = [
    "roberci.azevedo@academico.ifpb.edu.br",
    "seu_outro_email@exemplo.com"
];
// =========================================================

let minhaListaIDs = new Set();
let debounceSearchTimer;
let isLoginMode = true;
let selectedPlan = "";
let currentUserData = null; 

// ==========================================
// UI E MOBILE NAV
// ==========================================
function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast animate-fade-in'; t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

window.addEventListener('scroll', () => {
    const nav = document.getElementById('main-navbar');
    if(nav) nav.classList.toggle('scrolled', window.scrollY > 10);
});

function lockScroll(lock) { document.body.classList.toggle('no-scroll', lock); }

function resetViews() {
    ['hero-banner', 'search-results-section', 'watchlist-section', 'continue-watching-section', 'categories-container']
        .forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
}

function setActiveNav(navId) {
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if(navId) {
        const el = document.getElementById(navId);
        if(el) el.classList.add('active');
    }
    document.querySelectorAll('.mobile-bottom-nav a').forEach(el => el.classList.remove('active-nav'));
    if(navId === 'nav-inicio') document.getElementById('mob-nav-home').classList.add('active-nav');
    else if(navId && navId !== 'nav-inicio') document.getElementById('mob-nav-titulos').classList.add('active-nav');
}

function toggleSubmenu() {
    const submenu = document.getElementById('mobile-submenu');
    if(submenu.style.display === 'flex' || submenu.classList.contains('open')) {
        submenu.classList.remove('open');
        setTimeout(() => submenu.style.display = 'none', 300);
    } else {
        submenu.style.display = 'flex';
        setTimeout(() => submenu.classList.add('open'), 10);
    }
}

function irParaBuscaMobile() {
    document.querySelectorAll('.mobile-bottom-nav a').forEach(el => el.classList.remove('active-nav'));
    document.getElementById('mob-nav-search').classList.add('active-nav');
    resetViews();
    const searchSection = document.getElementById('search-results-section');
    searchSection.style.display = 'block';
    
    const row = document.getElementById('search-results-row');
    row.innerHTML = `
        <div style="grid-column: 1/-1; padding: 20px;">
            <input type="text" placeholder="O que deseja buscar?" 
                   style="width: 100%; padding: 15px; border-radius: 20px; background: #222; color: #fff; border: 1px solid #444; outline: none;"
                   oninput="pesquisarTitulos(event)">
        </div>`;
    document.getElementById('search-results-title').innerText = "Buscar";
}

function togglePasswordVisibility() {
    const passInput = document.getElementById('auth-password');
    const btn = document.getElementById('btn-toggle-password');
    if (passInput.type === 'password') {
        passInput.type = 'text'; btn.innerText = '🙈';
    } else {
        passInput.type = 'password'; btn.innerText = '👁️';
    }
}

// ==========================================
// AUTENTICAÇÃO E SISTEMAS
// ==========================================
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Entrar' : 'Assinar agora';
    document.getElementById('auth-switch-text').innerText = isLoginMode ? 'Novo por aqui?' : 'Já tem conta?';
    document.getElementById('auth-switch-link').innerText = isLoginMode ? 'Assine agora.' : 'Entre agora.';
    document.getElementById('auth-error').innerText = '';
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const btn = document.getElementById('auth-submit-btn');
    const err = document.getElementById('auth-error');
    
    btn.disabled = true; err.innerText = 'Verificando...';

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, password);
            await userCred.user.updateProfile({ displayName: "Usuário CineNet" });
            
            // Check Criador VIP no registo
            let isCreator = EMAILS_CRIADORES.includes(email);
            await db.collection('users').doc(userCred.user.uid).set({ 
                hasActivePlan: isCreator, 
                planType: isCreator ? 'Criador VIP' : null, 
                freeViewsLeft: isCreator ? 999999 : 0
            }, { merge: true });
        }
    } catch (error) {
        err.innerText = 'Dados incorretos. Verifique e tente de novo.';
        btn.disabled = false;
    }
});

function fazerLogout() { auth.signOut().then(() => { lockScroll(false); window.location.reload(); }); }

auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        
        db.collection('users').doc(user.uid).onSnapshot(async (doc) => {
            currentUserData = doc.data() || {};
            const btnUpgrade = document.getElementById('btn-upgrade-plan');
            const txtLimit = document.getElementById('user-free-limit-txt');

            // Proteção extra: Força o estatuto VIP se o email estiver na lista de Criadores
            if (EMAILS_CRIADORES.includes(user.email) && currentUserData.planType !== 'Criador VIP') {
                await db.collection('users').doc(user.uid).set({
                    hasActivePlan: true, planType: 'Criador VIP', freeViewsLeft: 999999
                }, { merge: true });
                return; // O snapshot vai disparar novamente
            }

            if (currentUserData.hasActivePlan === true) {
                document.getElementById('subscription-screen').style.display = 'none';
                document.getElementById('app-screen').style.display = 'block';
                
                const planBadge = document.getElementById('user-plan-badge');
                if(planBadge) planBadge.innerText = currentUserData.planType;
                
                if(currentUserData.planType === 'Grátis') {
                    if(btnUpgrade) btnUpgrade.style.display = 'block';
                    if(txtLimit) { txtLimit.style.display = 'block'; txtLimit.innerText = `Restam: ${currentUserData.freeViewsLeft} filmes`; }
                } else {
                    if(btnUpgrade) btnUpgrade.style.display = 'none';
                    if(txtLimit) txtLimit.style.display = 'none';
                }

                await carregarWatchlistIDs(user.uid);
                if(document.getElementById('categories-container').innerHTML === '') carregarAba('inicio');
            } else {
                document.getElementById('app-screen').style.display = 'none';
                document.getElementById('subscription-screen').style.display = 'flex';
                const btnCancel = document.getElementById('btn-cancel-upgrade');
                if(btnCancel) btnCancel.style.display = 'none'; 
            }
        });
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        document.getElementById('subscription-screen').style.display = 'none';
        minhaListaIDs.clear(); currentUserData = null;
        const btn = document.getElementById('auth-submit-btn');
        if(btn) btn.disabled = false;
        lockScroll(false); 
    }
});

// ==========================================
// PAGAMENTO PIX E QR CODE
// ==========================================
function escolherPlano(planoNome, precoStr) {
    if (planoNome === 'Grátis') processarPlanoGratis();
    else abrirPagamentoPIX(planoNome, precoStr);
}

async function processarPlanoGratis() {
    const user = auth.currentUser;
    if(user) {
        showToast("Ativando Plano Grátis...");
        try {
            await db.collection('users').doc(user.uid).set({
                hasActivePlan: true, planType: 'Grátis', freeViewsLeft: 3,
                subscriptionDate: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch(e) {}
    }
}

function abrirPagamentoPIX(planoNome, preco) {
    selectedPlan = planoNome;
    document.getElementById('selected-plan-name').innerText = planoNome;
    document.getElementById('selected-plan-price').innerText = preco.replace('.', ',');
    document.getElementById('payment-modal').style.display = 'flex';
    lockScroll(true);
}

function fecharPagamento() { 
    document.getElementById('payment-modal').style.display = 'none'; 
    lockScroll(false); 
}

function copiarPIX() {
    const inputPix = document.getElementById("pix-key-input");
    inputPix.select();
    inputPix.setSelectionRange(0, 99999); // Mobile
    try {
        navigator.clipboard.writeText(inputPix.value);
        showToast("Chave PIX copiada!");
    } catch (e) {
        document.execCommand("copy"); // Fallback
        showToast("Chave PIX copiada!");
    }
}

function confirmarPagamentoPIX() {
    const btn = document.getElementById('payment-submit-btn');
    btn.innerText = 'Validando PIX...';
    btn.disabled = true;

    // Simulação do sistema validando o PIX
    setTimeout(async () => {
        try {
            await db.collection('users').doc(auth.currentUser.uid).set({
                hasActivePlan: true, planType: selectedPlan, freeViewsLeft: 999999,
                subscriptionDate: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            fecharPagamento();
            btn.innerText = 'Já fiz o pagamento';
            btn.disabled = false;
            showToast(`Sucesso! Bem-vindo ao plano ${selectedPlan}.`);
        } catch(e) {
            btn.innerText = 'Já fiz o pagamento';
            btn.disabled = false;
            showToast("Aguardando confirmação do banco...");
        }
    }, 2000);
}

function abrirTelaPlanos() {
    fecharModalPerfil();
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('subscription-screen').style.display = 'flex';
    document.getElementById('btn-cancel-upgrade').style.display = 'block';
}
function cancelarUpgrade() {
    document.getElementById('subscription-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
}

// ==========================================
// CINEBOT
// ==========================================
function abrirChat() { 
    document.getElementById('chat-modal').style.display = 'flex'; lockScroll(true); 
    document.querySelectorAll('.mobile-bottom-nav a').forEach(el => el.classList.remove('active-nav'));
    document.getElementById('mob-nav-chat').classList.add('active-nav');
}
function fecharChat() { 
    document.getElementById('chat-modal').style.display = 'none'; lockScroll(false); 
    document.getElementById('mob-nav-chat').classList.remove('active-nav');
    document.getElementById('mob-nav-home').classList.add('active-nav');
}

function adicionarMsgChat(texto, remetente) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message ${remetente} animate-fade-in`;
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
    let endpoint = '/movie/popular'; 
    const l = txt.toLowerCase();
    if (l.includes('ação') || l.includes('acao')) endpoint = '/discover/movie?with_genres=28';
    else if (l.includes('comédia') || l.includes('comedia')) endpoint = '/discover/movie?with_genres=35';
    else if (l.includes('ficção') || l.includes('sci-fi')) endpoint = '/discover/movie?with_genres=878';

    try {
        const data = await fetchTMDB(endpoint);
        const validData = data.filter(i => i.poster_path);
        if (validData.length > 0) {
            const item = validData[Math.floor(Math.random() * validData.length)];
            const img = `${TMDB_IMAGE_BASE}${item.poster_path}`;
            const title = item.title || item.name;
            const html = `Recomendação para si:
                <div style="display:flex;gap:12px;margin-top:10px;background:var(--secondary-bg);padding:10px;border-radius:8px;cursor:pointer;border:1px solid var(--border-color);" onclick="fecharChat(); assistirFilme('${item.id}', '${title.replace(/'/g, "\\'")}', '${img}')">
                    <img src="${img}" style="width:50px; height: 75px; border-radius:4px; object-fit:cover;" />
                    <div style="font-size:0.9rem; color:#fff;"><strong>${title}</strong><p style="color:var(--primary);margin-top:6px;font-size:0.8rem;font-weight:600;">▶ Assistir Agora</p></div>
                </div>`;
            setTimeout(() => adicionarMsgChat(html, 'bot'), 600);
        }
    } catch(e) {}
}

// ==========================================
// ABAS TMDB
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const s = endpoint.includes('?') ? '&' : '?';
        const res = await fetch(`${TMDB_BASE_URL}${endpoint}${s}api_key=${TMDB_API_KEY}&language=pt-BR`);
        const json = await res.json();
        return json.results || [];
    } catch { return []; }
}

async function carregarAba(abaId, event) {
    if(event) event.preventDefault();
    resetViews(); setActiveNav('nav-' + abaId);
    
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.value = '';

    const container = document.getElementById('categories-container');
    container.style.display = 'block';
    container.innerHTML = '<div style="padding: 100px 0; text-align: center; color: #aaa;">A carregar...</div>';
    document.getElementById('hero-banner').style.display = 'flex';

    try {
        if (abaId === 'inicio') {
            await carregarHeroTop('/movie/popular', 'movie');
            await renderizarListas([
                { t: 'Filmes Populares', e: '/movie/popular', type: 'movie' },
                { t: 'Séries Aclamadas', e: '/tv/popular', type: 'tv' },
                { t: 'Animes em Alta', e: '/discover/tv?with_genres=16&with_original_language=ja', type: 'tv' }
            ]);
            if (auth.currentUser) carregarFilaContinueAVer(auth.currentUser.uid);
        } 
        else if (abaId === 'movie') {
            document.getElementById('continue-watching-section').style.display = 'none';
            await carregarHeroTop('/discover/movie?with_genres=28', 'movie'); 
            await renderizarListas([
                { t: 'Ação e Aventura', e: '/discover/movie?with_genres=28', type: 'movie' },
                { t: 'Comédia', e: '/discover/movie?with_genres=35', type: 'movie' },
                { t: 'Terror', e: '/discover/movie?with_genres=27', type: 'movie' }
            ]);
        } 
        else if (abaId === 'tv') {
            document.getElementById('continue-watching-section').style.display = 'none';
            await carregarHeroTop('/tv/top_rated', 'tv');
            await renderizarListas([
                { t: 'Séries Mais Vistas', e: '/tv/popular', type: 'tv' },
                { t: 'Drama', e: '/discover/tv?with_genres=18', type: 'tv' },
                { t: 'Mistério e Sci-Fi', e: '/discover/tv?with_genres=10765', type: 'tv' }
            ]);
        } 
        else if (abaId === 'anime') {
            document.getElementById('continue-watching-section').style.display = 'none';
            await carregarHeroTop('/discover/tv?with_genres=16&with_original_language=ja', 'tv');
            await renderizarListas([
                { t: 'Animes Populares', e: '/discover/tv?with_genres=16&with_original_language=ja', type: 'tv' },
                { t: 'Ação Shonen', e: '/discover/tv?with_genres=16,10759&with_original_language=ja', type: 'tv' }
            ]);
        }
        else if (abaId === 'desenho') {
            document.getElementById('continue-watching-section').style.display = 'none';
            await carregarHeroTop('/discover/movie?with_genres=16', 'movie');
            await renderizarListas([
                { t: 'Filmes de Animação', e: '/discover/movie?with_genres=16', type: 'movie' },
                { t: 'Séries Animadas', e: '/discover/tv?with_genres=16', type: 'tv' }
            ]);
        }
    } catch(e) { container.innerHTML = ''; }
}

function carregarInicio() { carregarAba('inicio'); }

async function carregarHeroTop(endpoint, mediaType) {
    const items = await fetchTMDB(endpoint);
    if(items.length > 0) configurarHero(items[0], mediaType);
}

async function renderizarListas(categorias) {
    const container = document.getElementById('categories-container');
    container.innerHTML = '';
    for (const cat of categorias) {
        const items = await fetchTMDB(cat.e);
        if(items.length > 0) {
            const s = document.createElement('section'); s.className = 'section-container animate-fade-in';
            let html = `<h2 class="section-title">${cat.t}</h2><div class="movie-row">`;
            items.forEach(i => { if (i.poster_path) html += criarCardHTML(i, cat.type); });
            s.innerHTML = html + `</div>`;
            container.appendChild(s);
        }
    }
}

function configurarHero(item, mediaType) {
    const title = (item.title || item.name).replace(/'/g, "\\'");
    const bg = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1600&q=80';
    const poster = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : bg;

    document.getElementById('hero-banner').style.backgroundImage = `url('${bg}')`;
    document.getElementById('hero-title').innerText = title;
    
    document.getElementById('hero-play-btn').onclick = () => {
        if(mediaType === 'tv') abrirModalSerie(item.id, title, poster);
        else assistirFilme(item.id, title, poster);
    };
    
    const isSaved = minhaListaIDs.has(String(item.id));
    const wlBtn = document.getElementById('hero-watchlist-btn');
    if(wlBtn) {
        wlBtn.innerHTML = isSaved ? `✔️ Guardado` : `➕ Guardar`;
        wlBtn.onclick = () => toggleMinhaLista({ id: item.id, title: title, coverImage: poster });
    }
}

function criarCardHTML(item, type = 'movie') {
    const id = String(item.id);
    const title = (item.title || item.name || 'Sem Título').replace(/'/g, "\\'");
    const img = `${TMDB_IMAGE_BASE}${item.poster_path}`;
    const isSaved = minhaListaIDs.has(id);
    const action = type === 'tv' ? `abrirModalSerie('${id}','${title}','${img}')` : `assistirFilme('${id}','${title}','${img}')`;

    return `
        <div class="movie-card" tabindex="0">
            <button class="card-watchlist-btn ${isSaved ? 'active' : ''}" onclick="event.stopPropagation(); toggleMinhaLista({id:'${id}',title:'${title}',coverImage:'${img}'})">${isSaved ? '✓' : '+'}</button>
            <div onclick="${action}" style="height:100%;">
                <img src="${img}" loading="lazy" />
                <div class="card-info"><span class="card-title">${title}</span></div>
            </div>
        </div>`;
}

// ==========================================
// PESQUISA, LISTA E HISTÓRICO
// ==========================================
async function pesquisarTitulos(e) {
    const q = e.target.value.trim();
    clearTimeout(debounceSearchTimer);
    if (q.length < 2) return;

    debounceSearchTimer = setTimeout(async () => {
        resetViews(); setActiveNav(null);
        document.getElementById('search-results-section').style.display = 'block';
        
        try {
            const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}`);
            const row = document.getElementById('search-results-row');
            row.innerHTML = '';
            
            if(res.length === 0) { row.innerHTML = '<p style="grid-column: 1/-1;">Nenhum título encontrado.</p>'; return; }
            res.forEach(i => { if (i.poster_path) row.innerHTML += criarCardHTML(i, i.media_type || 'movie'); });
        } catch(e) {}
    }, 400);
}

async function toggleMinhaLista(data) {
    const user = auth.currentUser;
    if (!user) return showToast("Faça login primeiro.");
    const id = String(data.id);
    const ref = db.collection('users').doc(user.uid).collection('watchlist').doc(id);

    try {
        if (minhaListaIDs.has(id)) {
            await ref.delete(); minhaListaIDs.delete(id); showToast("Removido da Lista.");
        } else {
            await ref.set({ id: id, title: data.title, coverImage: data.coverImage, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
            minhaListaIDs.add(id); showToast("Guardado na Lista!");
        }
        
        document.querySelectorAll(`[onclick*="id:'${id}'"]`).forEach(b => {
            b.className = `card-watchlist-btn ${minhaListaIDs.has(id) ? 'active' : ''}`;
            b.innerText = minhaListaIDs.has(id) ? '✓' : '+';
        });
        if (document.getElementById('watchlist-section').style.display === 'block') carregarSecaoMinhaLista(user.uid);
    } catch(e) { }
}

async function carregarWatchlistIDs(uid) {
    try {
        const s = await db.collection('users').doc(uid).collection('watchlist').get();
        minhaListaIDs.clear(); s.forEach(d => minhaListaIDs.add(d.id));
    } catch (e) { }
}

async function mostrarMinhaLista(e) {
    if (e) e.preventDefault();
    resetViews(); setActiveNav('nav-watchlist');
    if (auth.currentUser) carregarSecaoMinhaLista(auth.currentUser.uid);
}

async function carregarSecaoMinhaLista(uid) {
    const s = document.getElementById('watchlist-section');
    const r = document.getElementById('watchlist-row');
    s.style.display = 'block'; r.innerHTML = '<div style="grid-column: 1/-1;">Carregando...</div>';
    
    try {
        const snap = await db.collection('users').doc(uid).collection('watchlist').orderBy('addedAt','desc').get();
        if (snap.empty) { r.innerHTML = '<div style="grid-column: 1/-1;">Sua lista está vazia.</div>'; return; }
        r.innerHTML = '';
        snap.forEach(d => r.innerHTML += criarCardHTML(d.data(), 'movie'));
    } catch (e) {}
}

async function carregarFilaContinueAVer(uid) {
    const s = document.getElementById('continue-watching-section');
    const r = document.getElementById('continue-watching-row');
    try {
        const snap = await db.collection('users').doc(uid).collection('continueWatching').orderBy('lastWatched','desc').limit(10).get();
        if (snap.empty || document.getElementById('hero-banner').style.display === 'none') { s.style.display = 'none'; return; } 

        s.style.display = 'block'; r.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            r.innerHTML += `
                <div class="movie-card" tabindex="0" onclick="assistirFilme('${d.movieId}','${d.title.replace(/'/g, "\\'")}','${d.coverImage}')">
                    <img src="${d.coverImage}" />
                    <div class="card-info"><span class="card-title">${d.title}</span></div>
                    <div class="progress-bar-container"><div class="progress-bar" style="width:100%"></div></div>
                </div>`;
        });
    } catch (e) { }
}

// ==========================================
// PLAYER COM BARREIRA (CRIAÇÃO VIP IGNORA)
// ==========================================
async function podeAssistir() {
    if (!currentUserData) return false;
    
    if (currentUserData.planType === 'Criador VIP') return true; // Criador não tem limite nenhum

    if (currentUserData.planType === 'Grátis') {
        if (currentUserData.freeViewsLeft > 0) {
            try {
                await db.collection('users').doc(auth.currentUser.uid).update({ freeViewsLeft: firebase.firestore.FieldValue.increment(-1) });
                return true;
            } catch(e) { return false; }
        } else {
            showToast("Limite atingido! Faça o Upgrade para continuar a assistir.");
            fecharPlayer(); fecharModalEpisodios(); abrirTelaPlanos();
            return false;
        }
    }
    return true; 
}

async function assistirFilme(id, title, img) {
    const block = await podeAssistir();
    if(block) abrirVideo(`https://mgeb.top/embed/${id}?player=vidstack#color:${PLAYER_CONFIG.color}`, id, title, img);
}

async function assistirEpisodio(id, s, e, title, img) {
    const block = await podeAssistir();
    if(block) abrirVideo(`https://mgeb.top/embed/${id}/${s}/${e}?player=vidstack#color:${PLAYER_CONFIG.color}`, id, `${title} T${s}:E${e}`, img);
}

function abrirVideo(url, id, title, img) {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    const loader = document.getElementById('video-loader');
    
    if(loader) loader.style.display = 'block';
    iframe.src = url;
    container.style.display = 'flex';
    lockScroll(true);

    try {
        if (container.requestFullscreen) container.requestFullscreen().catch(()=>{});
        else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
        else if (container.msRequestFullscreen) container.msRequestFullscreen();
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{});
    } catch (e) { }

    const user = auth.currentUser;
    if (user) {
        db.collection('users').doc(user.uid).collection('continueWatching').doc(String(id)).set({
            movieId: String(id), title: title, coverImage: img, lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true}).then(() => {
            if(document.getElementById('hero-banner').style.display !== 'none') carregarFilaContinueAVer(user.uid);
        }).catch(()=>{});
    }
}

function fecharPlayer() {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    iframe.src = ''; container.style.display = 'none'; lockScroll(false);

    try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        }
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
}

async function abrirModalSerie(id, title, img) {
    document.getElementById('modal-tv-title').innerText = title;
    try {
        const res = await fetch(`${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=pt-BR`);
        if (!res.ok) throw new Error("Erro");
        const data = await res.json();
        const sel = document.getElementById('season-select'); sel.innerHTML = '';
        data.seasons.forEach(s => {
            if (s.season_number > 0) sel.innerHTML += `<option value="${s.season_number}">Temporada ${s.season_number}</option>`;
        });
        sel.onchange = (e) => carregarEpisodios(id, e.target.value, title, img);
        carregarEpisodios(id, 1, title, img);
        document.getElementById('episodes-modal').style.display = 'flex';
        lockScroll(true);
    } catch (e) { showToast("Erro ao carregar temporadas."); }
}

async function carregarEpisodios(id, season, title, img) {
    const list = document.getElementById('episodes-list'); list.innerHTML = '<div style="padding: 20px 0;">Carregando episódios...</div>';
    try {
        const res = await fetch(`${TMDB_BASE_URL}/tv/${id}/season/${season}?api_key=${TMDB_API_KEY}&language=pt-BR`);
        const data = await res.json();
        list.innerHTML = '';
        if(!data.episodes || data.episodes.length === 0) { list.innerHTML = '<div>Sem episódios.</div>'; return; }
        
        data.episodes.forEach(ep => {
            const epImg = ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : img;
            list.innerHTML += `
                <div class="episode-card animate-fade-in" onclick="assistirEpisodio('${id}', ${season}, ${ep.episode_number}, '${title.replace(/'/g,"\\'")}', '${img}'); fecharModalEpisodios();">
                    <img src="${epImg}" />
                    <div class="ep-info"><h4>Ep ${ep.episode_number}: ${ep.name}</h4><p>${ep.overview ? ep.overview.substring(0,60)+'...' : 'Assistir episódio'}</p></div>
                </div>`;
        });
    } catch(e) {}
}

function fecharModalEpisodios() { document.getElementById('episodes-modal').style.display = 'none'; lockScroll(false); }

function abrirModalPerfil() {
    const user = auth.currentUser;
    if (user) {
        document.getElementById('edit-display-name').value = user.displayName || '';
        document.getElementById('edit-avatar-url').value = user.photoURL || '';
    }
    document.getElementById('profile-modal').style.display = 'flex';
    lockScroll(true);
}
function fecharModalPerfil() { document.getElementById('profile-modal').style.display = 'none'; lockScroll(false); }