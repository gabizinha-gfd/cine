// ==========================================
// CONFIGURAÇÃO FIREBASE E TMDB API
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
let selectedPlan = "";

// ==========================================
// UI & GESTÃO DE ECRÃS
// ==========================================
function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast'; t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

window.addEventListener('scroll', () => {
    const nav = document.getElementById('main-navbar');
    if (window.scrollY > 10) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
});

function resetViews() {
    ['hero-banner', 'search-results-section', 'watchlist-section', 'continue-watching-section', 'categories-container']
        .forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
}

function lockScroll(lock) {
    if (lock) document.body.classList.add('no-scroll');
    else document.body.classList.remove('no-scroll');
}

// ==========================================
// AUTENTICAÇÃO E SISTEMA DE PLANOS
// ==========================================
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Entrar' : 'Criar Conta';
    document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Entrar' : 'Registar';
    document.getElementById('auth-switch-text').innerText = isLoginMode ? 'Novo por aqui?' : 'Já tem conta?';
    document.getElementById('auth-switch-link').innerText = isLoginMode ? 'Registe-se agora.' : 'Entre agora.';
    document.getElementById('auth-error').innerText = '';
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const btn = document.getElementById('auth-submit-btn');
    const err = document.getElementById('auth-error');
    
    btn.disabled = true; err.innerText = 'A processar...';

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const userCred = await auth.createUserWithEmailAndPassword(email, password);
            await userCred.user.updateProfile({ displayName: "Utilizador CineNet", photoURL: "" });
            // Regista o user como sem plano inicialmente
            await db.collection('users').doc(userCred.user.uid).set({
                hasActivePlan: false, planType: null
            }, { merge: true });
        }
    } catch (error) {
        err.innerText = 'Dados incorretos. Verifique e tente novamente.';
        btn.disabled = false;
    }
});

function fazerLogout() { 
    auth.signOut().then(() => {
        fecharModalPerfil();
        window.location.reload();
    }); 
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        
        // VERIFICAR ASSINATURA NO FIRESTORE
        try {
            const docRef = await db.collection('users').doc(user.uid).get();
            const userData = docRef.data() || {};
            
            if (userData.hasActivePlan === true) {
                // Tem plano -> Mostrar App
                document.getElementById('subscription-screen').style.display = 'none';
                document.getElementById('app-screen').style.display = 'block';
                
                // Atualizar Perfil Visual
                const avatar = document.getElementById('user-avatar-img');
                if (avatar) avatar.src = user.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";
                
                const planBadge = document.getElementById('user-plan-badge');
                if(planBadge) planBadge.innerText = userData.planType || 'Premium';

                await carregarWatchlistIDs(user.uid);
                carregarInicio();
            } else {
                // Não tem plano -> Mostrar Paywall (Ecrã de Planos)
                document.getElementById('app-screen').style.display = 'none';
                document.getElementById('subscription-screen').style.display = 'block';
            }
        } catch(e) {
            console.error("Erro ao ler dados do utilizador", e);
        }

    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        document.getElementById('subscription-screen').style.display = 'none';
        minhaListaIDs.clear();
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
        const btn = document.getElementById('auth-submit-btn');
        if(btn) btn.disabled = false;
        lockScroll(false); 
    }
});

// ==========================================
// SIMULAÇÃO DE PAGAMENTO
// ==========================================
function abrirPagamento(planoNome, preco) {
    selectedPlan = planoNome;
    document.getElementById('selected-plan-name').innerText = planoNome;
    document.getElementById('selected-plan-price').innerText = preco;
    document.getElementById('payment-modal').style.display = 'flex';
    lockScroll(true);
}

function fecharPagamento() {
    document.getElementById('payment-modal').style.display = 'none';
    lockScroll(false);
}

async function processarAssinatura(e) {
    e.preventDefault();
    const btn = document.getElementById('payment-submit-btn');
    btn.innerText = 'A processar pagamento...';
    btn.disabled = true;

    // Simular delay de processamento (2 segundos)
    setTimeout(async () => {
        try {
            const user = auth.currentUser;
            if(user) {
                await db.collection('users').doc(user.uid).set({
                    hasActivePlan: true,
                    planType: selectedPlan,
                    subscriptionDate: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                fecharPagamento();
                showToast(`Bem-vindo ao CineNet ${selectedPlan}!`);
                
                // Recarrega o estado para mostrar a App
                window.location.reload(); 
            }
        } catch(error) {
            btn.innerText = 'Tentar Novamente';
            btn.disabled = false;
            showToast('Erro ao processar assinatura.');
        }
    }, 2000);
}

// ==========================================
// PERFIL
// ==========================================
function abrirModalPerfil() {
    const user = auth.currentUser;
    if (user) {
        document.getElementById('edit-display-name').value = user.displayName || '';
        document.getElementById('edit-avatar-url').value = user.photoURL || '';
    }
    document.getElementById('profile-modal').style.display = 'flex';
    lockScroll(true);
}

function fecharModalPerfil() { 
    document.getElementById('profile-modal').style.display = 'none'; 
    lockScroll(false);
}

async function guardarPerfil(e) {
    e.preventDefault();
    const user = auth.currentUser;
    const name = document.getElementById('edit-display-name').value;
    const photo = document.getElementById('edit-avatar-url').value;
    if (user) {
        await user.updateProfile({ displayName: name, photoURL: photo });
        const avatar = document.getElementById('user-avatar-img');
        if(avatar) avatar.src = photo || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80";
        fecharModalPerfil();
        showToast('Perfil atualizado com sucesso.');
    }
}

// ==========================================
// CINEBOT (CHAT IA)
// ==========================================
function abrirChat() { document.getElementById('chat-modal').style.display = 'flex'; lockScroll(true); }
function fecharChat() { document.getElementById('chat-modal').style.display = 'none'; lockScroll(false); }

function adicionarMsgChat(texto, remetente) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message ${remetente} fade-in-up`;
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
            
            const html = `Recomendo este título para si:
                <div style="display:flex;gap:12px;margin-top:10px;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.1); transition: 0.2s;" onclick="fecharChat(); assistirFilme('${item.id}', '${title.replace(/'/g, "\\'")}', '${img}')">
                    <img src="${img}" style="width:50px; height: 75px; border-radius:4px; object-fit:cover;" />
                    <div style="font-size:0.9rem;"><strong>${title}</strong><p style="color:var(--primary);margin-top:6px;font-size:0.8rem;font-weight:600;">▶ Assistir Agora</p></div>
                </div>`;
            setTimeout(() => adicionarMsgChat(html, 'bot'), 600);
        }
    } catch(e) {}
}

// ==========================================
// TMDB E NAVEGAÇÃO
// ==========================================
async function fetchTMDB(endpoint) {
    try {
        const s = endpoint.includes('?') ? '&' : '?';
        const res = await fetch(`${TMDB_BASE_URL}${endpoint}${s}api_key=${TMDB_API_KEY}&language=pt-PT`);
        if (!res.ok) throw new Error("Erro API");
        const json = await res.json();
        return json.results || [];
    } catch { return []; }
}

const CATEGORIAS = [
    { t: 'Filmes Populares', e: '/movie/popular', type: 'movie' },
    { t: 'Séries Aclamadas', e: '/tv/popular', type: 'tv' },
    { t: 'Animes em Alta', e: '/discover/tv?with_genres=16&with_original_language=ja', type: 'tv' },
    { t: 'Doramas Asiáticos', e: '/discover/tv?with_original_language=ko', type: 'tv' }
];

async function carregarInicio() {
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.value = '';
    
    resetViews();
    document.getElementById('hero-banner').style.display = 'flex';
    document.getElementById('categories-container').style.display = 'block';

    try {
        const top = await fetchTMDB('/movie/popular');
        if (top.length > 0) configurarHero(top[0]);

        document.getElementById('categories-container').innerHTML = '';
        for (const cat of CATEGORIAS) {
            const items = await fetchTMDB(cat.e);
            if(items.length > 0) renderizarCarrossel(cat.t, items, cat.type);
        }

        if (auth.currentUser) carregarFilaContinueAVer(auth.currentUser.uid);
    } catch(e) {}
}

function configurarHero(item) {
    const title = (item.title || item.name).replace(/'/g, "\\'");
    const bg = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1600&q=80';
    const poster = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : bg;

    document.getElementById('hero-banner').style.backgroundImage = `url('${bg}')`;
    document.getElementById('hero-title').innerText = title;
    document.getElementById('hero-desc').innerText = item.overview ? item.overview.substring(0, 180) + '...' : 'Assista já em HD na CineNet.';
    
    document.getElementById('hero-play-btn').onclick = () => assistirFilme(item.id, title, poster);
    
    const isSaved = minhaListaIDs.has(String(item.id));
    const wlBtn = document.getElementById('hero-watchlist-btn');
    if(wlBtn) {
        wlBtn.innerHTML = isSaved 
            ? `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Guardado` 
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M12 5v14M5 12h14"/></svg> Guardar`;
        wlBtn.onclick = () => toggleMinhaLista({ id: item.id, title: title, coverImage: poster });
    }
}

function renderizarCarrossel(titulo, items, type = 'movie') {
    const c = document.getElementById('categories-container');
    const s = document.createElement('section'); s.className = 'section-container fade-in-up';
    let html = `<h2 class="section-title">${titulo}</h2><div class="movie-row">`;
    items.forEach(i => { if (i.poster_path) html += criarCardHTML(i, type); });
    s.innerHTML = html + `</div>`;
    c.appendChild(s);
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
                <img src="${img}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80'" />
                <div class="card-info"><span class="card-title">${title}</span></div>
            </div>
        </div>`;
}

// ==========================================
// PESQUISA E NAVEGAÇÃO
// ==========================================
async function pesquisarTitulos(e) {
    const q = e.target.value.trim();
    clearTimeout(debounceSearchTimer);

    if (q.length < 2) {
        carregarInicio();
        return;
    }

    debounceSearchTimer = setTimeout(async () => {
        resetViews(); 
        document.getElementById('search-results-section').style.display = 'block';
        document.getElementById('search-results-title').innerText = `Resultados para: "${q}"`;
        
        try {
            const res = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}`);
            const row = document.getElementById('search-results-row');
            row.innerHTML = '';
            
            if(res.length === 0) {
                row.innerHTML = '<p style="color: #aaa; grid-column: 1/-1;">Nenhum título encontrado.</p>';
                return;
            }
            res.forEach(i => { if (i.poster_path) row.innerHTML += criarCardHTML(i, i.media_type || 'movie'); });
        } catch(e) {}
    }, 400);
}

async function filtrarCategoria(cat, element, event) {
    if (event) event.preventDefault();
    document.querySelectorAll('.nav-links .nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    if (cat === 'inicio') return carregarInicio();

    resetViews();
    document.getElementById('hero-banner').style.display = 'flex';
    document.getElementById('categories-container').style.display = 'block';
    
    const c = document.getElementById('categories-container');
    c.innerHTML = '<div style="padding: 100px 0; text-align: center; color: var(--primary);">A carregar o catálogo...</div>';

    const map = {
        'movie': {e: '/movie/popular', t: 'Filmes em Alta', type: 'movie'},
        'tv': {e: '/tv/popular', t: 'Séries do Momento', type: 'tv'},
        'anime': {e: '/discover/tv?with_genres=16&with_original_language=ja', t: 'Animes Populares', type: 'tv'}
    };

    const d = map[cat];
    try {
        const items = await fetchTMDB(d.e);
        c.innerHTML = '';
        
        if(items.length > 0) configurarHero(items[0]);
        renderizarCarrossel(d.t, items, d.type);
    } catch(e) {}
}

// ==========================================
// A MINHA LISTA & HISTÓRICO
// ==========================================
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

        const wlBtn = document.getElementById('hero-watchlist-btn');
        if (wlBtn && document.getElementById('hero-play-btn').onclick.toString().includes(id)) {
            wlBtn.innerHTML = minhaListaIDs.has(id) 
                ? `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Guardado` 
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M12 5v14M5 12h14"/></svg> Guardar`;
        }

        if (document.getElementById('watchlist-section').style.display === 'block') carregarSecaoMinhaLista(user.uid);
    } catch(e) {
        showToast("Erro na sincronização.");
    }
}

async function carregarWatchlistIDs(uid) {
    try {
        const s = await db.collection('users').doc(uid).collection('watchlist').get();
        minhaListaIDs.clear(); s.forEach(d => minhaListaIDs.add(d.id));
    } catch (e) { }
}

async function mostrarMinhaLista(el, e) {
    if (e) e.preventDefault();
    document.querySelectorAll('.nav-links .nav-item').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
    
    resetViews(); 
    if (auth.currentUser) carregarSecaoMinhaLista(auth.currentUser.uid);
}

async function carregarSecaoMinhaLista(uid) {
    const s = document.getElementById('watchlist-section');
    const r = document.getElementById('watchlist-row');
    s.style.display = 'block'; r.innerHTML = '<div style="grid-column: 1/-1; padding: 50px 0; color: #aaa;">A carregar...</div>';
    
    try {
        const snap = await db.collection('users').doc(uid).collection('watchlist').orderBy('addedAt','desc').get();
        if (snap.empty) { r.innerHTML = '<div style="grid-column: 1/-1; color: #aaa;">A sua lista está vazia. Explore e adicione títulos!</div>'; return; }
        
        r.innerHTML = '';
        snap.forEach(d => r.innerHTML += criarCardHTML(d.data(), 'movie'));
    } catch (e) {
        r.innerHTML = '<div style="grid-column: 1/-1; color: #E50914;">Erro ao carregar lista.</div>';
    }
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
                    <img src="${d.coverImage}" onerror="this.src='https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80'" />
                    <div class="card-info"><span class="card-title">${d.title}</span></div>
                    <div class="progress-bar-container"><div class="progress-bar" style="width:100%"></div></div>
                </div>`;
        });
    } catch (e) { }
}

// ==========================================
// PLAYER & MODAL SÉRIES (FULLSCREEN BLINDADO)
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
    const loader = document.getElementById('video-loader');
    
    if(loader) loader.style.display = 'block';
    iframe.src = url;
    container.style.display = 'flex';
    lockScroll(true);

    // Cross-browser Fullscreen seguro
    try {
        if (container.requestFullscreen) {
            container.requestFullscreen().catch(() => {});
        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen(); // Safari/iOS
        } else if (container.msRequestFullscreen) {
            container.msRequestFullscreen(); // Edge Legacy
        } else if (container.mozRequestFullScreen) {
            container.mozRequestFullScreen(); // Firefox
        }
        
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { }

    const user = auth.currentUser;
    if (user) {
        db.collection('users').doc(user.uid).collection('continueWatching').doc(String(id)).set({
            movieId: String(id), title: title, coverImage: img, lastWatched: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true}).then(() => carregarFilaContinueAVer(user.uid)).catch(()=>{});
    }
}

function fecharPlayer() {
    const container = document.getElementById('video-container');
    const iframe = document.getElementById('mega-player-iframe');
    
    iframe.src = '';
    container.style.display = 'none';
    lockScroll(false);

    try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        }
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
}

async function abrirModalSerie(id, title, img) {
    document.getElementById('modal-tv-title').innerText = title;
    try {
        const res = await fetch(`${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=pt-PT`);
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
    } catch (e) { showToast("Não foi possível carregar as temporadas."); }
}

async function carregarEpisodios(id, season, title, img) {
    const list = document.getElementById('episodes-list'); list.innerHTML = '<div style="padding: 20px 0; color: #aaa;">A carregar...</div>';
    try {
        const res = await fetch(`${TMDB_BASE_URL}/tv/${id}/season/${season}?api_key=${TMDB_API_KEY}&language=pt-PT`);
        const data = await res.json();
        list.innerHTML = '';
        if(!data.episodes || data.episodes.length === 0) { list.innerHTML = '<div style="color: #aaa;">Sem episódios disponíveis.</div>'; return; }
        
        data.episodes.forEach(ep => {
            const epImg = ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : img;
            list.innerHTML += `
                <div class="episode-card fade-in-up" onclick="assistirEpisodio('${id}', ${season}, ${ep.episode_number}, '${title.replace(/'/g,"\\'")}', '${img}'); fecharModalEpisodios();">
                    <img src="${epImg}" onerror="this.src='https://images.unsplash.com/photo-1578632767115-351597cf2477?w=200&q=80'" />
                    <div class="ep-info"><h4>Ep ${ep.episode_number}: ${ep.name}</h4><p>${ep.overview ? ep.overview.substring(0,60)+'...' : 'Reproduzir episódio'}</p></div>
                </div>`;
        });
    } catch(e) { list.innerHTML = '<div style="color: #E50914;">Erro a carregar episódios.</div>'; }
}

function fecharModalEpisodios() { 
    document.getElementById('episodes-modal').style.display = 'none'; 
    lockScroll(false);
}