(function () {
  'use strict';

  const state = {
    sources: [],
    src: localStorage.getItem('vb_src') || 'liangzi',
    cats: [],
    cat: '',
    kw: '',
    page: 1,
    total: 0,
    list: [],
    loading: false,
    hasMore: true,
    mode: 'browse',
    detail: null,
    plays: [],
    actFrom: 0,
    actEp: -1,
  };

  const HISTORY_KEY = 'vb_history_v1';
  const $ = (s) => document.querySelector(s);

  const PRO_MODE = /^\/aaa(\/|$)/.test(location.pathname);
  const API_QM = PRO_MODE ? '&mode=pro&pwd=' + encodeURIComponent(localStorage.getItem('vb_pro_pwd') || '') : '';
  const API_Q0 = PRO_MODE ? '?mode=pro&pwd=' + encodeURIComponent(localStorage.getItem('vb_pro_pwd') || '') : '';

  async function apiFetch(url) {
    const r = await fetch(url);
    if (r.status === 403 && PRO_MODE) {
      if (localStorage.getItem('vb_pro_ok')) {
        localStorage.removeItem('vb_pro_ok');
        localStorage.removeItem('vb_pro_pwd');
        location.reload();
      }
      throw new Error('访问密码错误');
    }
    if (!r.ok) throw new Error('bad');
    return r.json();
  }


  if (PRO_MODE && !localStorage.getItem('vb_pro_ok')) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:28px 24px;width:min(300px,84vw);text-align:center">' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:16px;color:#222">高级模式</div>' +
      '<input type="password" placeholder="请输入访问密码" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ccc;border-radius:8px;font-size:15px;outline:none;margin-bottom:14px">' +
      '<div style="font-size:13px;color:#e53935;height:18px;margin-bottom:6px"></div>' +
      '<button style="width:100%;padding:10px 0;border:0;border-radius:8px;background:#1a73e8;color:#fff;font-size:15px;cursor:pointer">进入</button>' +
      '</div>';
    document.body.appendChild(ov);
    const input = ov.querySelector('input');
    const tip = ov.querySelector('div[style*="e53935"]');
    const btn = ov.querySelector('button');
    const enter = async () => {
      if (btn.disabled) return;
      const p = input.value.trim();
      if (!p) return;
      btn.disabled = true;
      btn.textContent = '验证中…';
      try {
        const r = await fetch('/api/procheck?pwd=' + encodeURIComponent(p));
        if (r.ok) {
          localStorage.setItem('vb_pro_ok', '1');
          localStorage.setItem('vb_pro_pwd', p);
          location.reload();
          return;
        }
      } catch (e) {}
      btn.disabled = false;
      btn.textContent = '进入';
      tip.textContent = '密码错误，请重试';
      input.value = '';
      input.focus();
    };
    btn.onclick = enter;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
    input.focus();
  }

  const video = $('#video');

  // ---------- 页面内全屏（兼容系统控制条的全屏按钮）+ 亮度/音量手势 ----------
  const playerWrap = document.querySelector('.player-wrap');
  const fsBtn = document.getElementById('fsBtn');
  const fsHost = (typeof window.VodBoxFullscreen !== 'undefined') ? window.VodBoxFullscreen : null;
  let fsState = false;

  function fsCall(name, arg) {
    try {
      if (!fsHost || typeof fsHost[name] !== 'function') return null;
      return (arguments.length > 1) ? fsHost[name](arg) : fsHost[name]();
    } catch (e) {}
    return null;
  }
  function videoLandscape() {
    const w = video.videoWidth || 0, h = video.videoHeight || 0;
    if (!w || !h) return -1;
    return w > h ? 1 : 0;
  }
  function enterFs() {
    if (fsState) return;
    fsState = true;
    if (playerWrap) playerWrap.classList.add('fs');
    fsCall('enter', videoLandscape());
    if (fsBtn) fsBtn.textContent = '退出';
  }
  function exitFs() {
    if (!fsState) return;
    fsState = false;
    if (playerWrap) playerWrap.classList.remove('fs');
    fsCall('exit');
    if (fsBtn) fsBtn.textContent = '全屏';
  }
  function toggleFs() { fsState ? exitFs() : enterFs(); }
  // 供原生 onShowCustomView / 返回键调用
  window.__vbToggleFs = toggleFs;
  window.__vbExitFs = exitFs;
  if (fsBtn) {
    fsBtn.addEventListener('click', toggleFs);
    video.addEventListener('play', () => fsBtn.classList.add('show'));
    video.addEventListener('pause', () => fsBtn.classList.remove('show'));
  }

  // ---------- 播放手势：左右滑动快进/快退；全屏下左半屏调亮度、右半屏调音量 ----------
  (function () {
    const wrap = playerWrap || document.querySelector('.player-wrap');
    if (!wrap) return;
    const tip = document.createElement('div');
    tip.className = 'seek-tip';
    tip.style.display = 'none';
    wrap.appendChild(tip);
    const hud = document.createElement('div');
    hud.className = 'fs-hud';
    hud.style.display = 'none';
    wrap.appendChild(hud);

    let g = null;
    let hideTimer = null;
    function flash(el, text) {
      el.textContent = text;
      el.style.display = 'block';
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { tip.style.display = 'none'; hud.style.display = 'none'; }, 700);
    }

    video.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { g = null; return; }
      const t = e.touches[0];
      const r = video.getBoundingClientRect();
      // 底部 52px 让给原生控制条，避免误触
      if (t.clientY > r.bottom - 52) { g = null; return; }
      g = { x: t.clientX, y: t.clientY, mode: null, zone: null, base: video.currentTime, startVal: 0 };
    }, { passive: true });

    video.addEventListener('touchmove', (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (g.mode === null) {
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (!isFinite(video.duration) || video.duration <= 0) { g = null; return; }
          g.mode = 'seek';
        } else {
          // 竖向滑动只在全屏生效，非全屏时留给页面滚动
          if (!fsState) { g = null; return; }
          const r = video.getBoundingClientRect();
          g.zone = (g.x < r.left + r.width / 2) ? 'brightness' : 'volume';
          const v = (g.zone === 'brightness') ? fsCall('getBrightness') : fsCall('getVolume');
          g.startVal = (typeof v === 'number' && v >= 0) ? v : (g.zone === 'brightness' ? 0.5 : 50);
          g.mode = 'adjust';
        }
      }
      if (g.mode === 'seek') {
        if (e.cancelable) e.preventDefault();
        const dur = video.duration || 1;
        const w = wrap.clientWidth || video.clientWidth || 360;
        const sec = Math.max(0, Math.min(dur, g.base + dur * dx / w));
        if (isFinite(sec)) {
          try { video.currentTime = sec; } catch (err) {}
          flash(tip, fmtTime(sec) + ' / ' + fmtTime(dur));
        }
      } else if (g.mode === 'adjust') {
        if (e.cancelable) e.preventDefault();
        const H = wrap.clientHeight || video.clientHeight || 640;
        const delta = -dy / H;
        if (g.zone === 'brightness') {
          const v = Math.max(0, Math.min(1, g.startVal + delta));
          fsCall('setBrightness', v);
          flash(hud, '亮度 ' + Math.round(v * 100) + '%');
        } else {
          const p = Math.max(0, Math.min(100, g.startVal + delta * 100));
          fsCall('setVolume', Math.round(p));
          flash(hud, '音量 ' + Math.round(p) + '%');
        }
      }
    }, { passive: false });

    const end = () => {
      if (!g) return;
      g = null;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { tip.style.display = 'none'; hud.style.display = 'none'; }, 700);
    };
    video.addEventListener('touchend', end);
    video.addEventListener('touchcancel', end);
  })();
  let hls = null;
  let resumeSeek = null;   // 需要恢复的秒数
  let lastSave = 0;
  let saveTimer = null;
  // 顶部切换：普通区 / 高级区(/aaa)
  const proToggle = document.getElementById('proToggle');
  if (proToggle) {
    proToggle.textContent = PRO_MODE ? '普通' : '高级';
    proToggle.addEventListener('click', () => { location.href = PRO_MODE ? '/' : '/aaa'; });
  }

  const views = { home: $('#home'), detail: $('#detail'), history: $('#history'), favorites: $('#favorites') };

  // ---------- 历史 ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveHistoryList(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
  }
  function addHistory(rec) {
    const list = loadHistory().filter((h) => !(h.id === rec.id && h.src === rec.src && h.epIndex === rec.epIndex));
    list.unshift(Object.assign({ updatedAt: Date.now() }, rec));
    saveHistoryList(list);
  }
  function updateHistoryProgress(id, src, epIndex, time, duration) {
    const list = loadHistory();
    const it = list.find((h) => h.id === id && h.src === src && h.epIndex === epIndex);
    if (it) {
      it.time = Math.round(time);
      it.duration = Math.round(duration);
      it.updatedAt = Date.now();
      saveHistoryList(list);
    }
  }
  function findHistory(id, src) {
    const list = loadHistory().filter((h) => h.id === id && h.src === src);
    return list.length ? list[0] : null;
  }

  // ---------- 收藏 ----------
  const FAV_KEY = 'vb_favorites_v1';
  function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveFavorites(list) {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 200)));
  }
  function isFavorited(id, src) {
    return loadFavorites().some((f) => f.id === id && f.src === src);
  }
  function addFavorite(rec) {
    const list = loadFavorites().filter((f) => !(f.id === rec.id && f.src === rec.src));
    list.unshift(Object.assign({ addedAt: Date.now() }, rec));
    saveFavorites(list);
  }
  function removeFavorite(id, src) {
    saveFavorites(loadFavorites().filter((f) => !(f.id === id && f.src === src)));
  }

  // ---------- 视图 ----------
  let curView = null;          // 当前视图(home/history/detail)
  let detailNav = false;       // 详情页是否已压入浏览器历史
  let prevDetailView = null;   // 进入详情前的视图，供返回键回退

  function showView(name) {
    if (name !== 'detail') stopPlayback();
    curView = name;
    Object.keys(views).forEach((k) => views[k].classList.toggle('active', k === name));
  }

  // 手机/浏览器返回键：从播放页(详情)回到进入前的页面
  window.addEventListener('popstate', () => {
    if (detailNav) {
      detailNav = false;
      if (prevDetailView === 'history') {
        renderHistory();
        showView('history');
      } else {
        showView('home');
        renderGrid(state.list);
      }
    }
  });

  function stopPlayback() {
    destroyHls();
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    video.load();
    state.actEp = -1;
    $('#playerTip').classList.add('hide');
  }

  // ---------- 首页 ----------
  async function loadSources() {
    try {
      state.sources = await apiFetch('/api/sources' + API_Q0);
    } catch (e) {
      state.sources = [];
    }
    const sel = $('#srcSel');
    sel.innerHTML = state.sources.map((s) => `<option value="${s.key}">${s.name}</option>`).join('');
    sel.value = state.src;
    if (!sel.value && state.sources.length) state.src = state.sources[0].key;
    sel.addEventListener('change', () => {
      state.src = sel.value;
      localStorage.setItem('vb_src', state.src);
      state.cat = ''; state.kw = ''; $('#kw').value = '';
      loadCats();
      resetAndLoad();
    });
  }

  function loadCats() {
    const s = state.sources.find((x) => x.key === state.src);
    let cats = (s && s.cats) || [];
    const map = new Map();
    cats.forEach((c) => map.set(String(c.id), c.name));
    state.cats = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    renderCats();
  }

  function renderCats() {
    const box = $('#cats');
    box.innerHTML = `<button class="${state.cat === '' ? 'on' : ''}" data-cat="">全部</button>` +
      state.cats.map((c) => `<button class="${String(state.cat) === String(c.id) ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        state.cat = b.dataset.cat;
        state.kw = ''; $('#kw').value = '';
        renderCats();
        resetAndLoad();
      });
    });
  }

  function mergeCatsFromList(list) {
    if (!list || !list.length) return;
    const map = new Map(state.cats.map((c) => [String(c.id), c.name]));
    let changed = false;
    list.forEach((v) => {
      if (v.type_id && v.type_name && !map.has(String(v.type_id))) {
        map.set(String(v.type_id), v.type_name);
        changed = true;
      }
    });
    if (changed) {
      state.cats = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
      renderCats();
    }
  }

  async function fetchList(page, append) {
    if (state.loading) return;
    state.loading = true;
    const params = new URLSearchParams({ src: state.src, pg: page, limit: 24 });
    if (PRO_MODE) { params.set('mode', 'pro'); params.set('pwd', localStorage.getItem('vb_pro_pwd') || ''); }
    if (state.cat) params.set('t', state.cat);
    if (state.kw) params.set('wd', state.kw);
    try {
      const data = await apiFetch('/api/list?' + params.toString());
      state.total = data.total || 0;
      state.hasMore = data.page < data.pagecount;
      const list = data.list || [];
      if (append) state.list = state.list.concat(list);
      else { state.list = list; window.scrollTo(0, 0); }
      mergeCatsFromList(list);
      renderGrid(state.list);
    } catch (e) {
      state.hasMore = false;
      renderGrid(state.list);
    } finally {
      state.loading = false;
      renderMore();
    }
  }

  function renderMore() {
    const btn = $('#moreBtn');
    btn.hidden = !state.hasMore;
    btn.disabled = state.loading;
    btn.textContent = state.loading ? '加载中…' : '加载更多';
    $('#empty').hidden = state.list.length > 0;
  }

  function resetAndLoad() {
    state.page = 1;
    state.hasMore = true;
    state.mode = 'browse';
    fetchList(1, false);
  }

  async function searchAll() {
    state.mode = 'search';
    state.loading = true;
    try {
      const data = await apiFetch('/api/search?wd=' + encodeURIComponent(state.kw) + API_QM);
      state.list = data.list || [];
      state.hasMore = false;
      renderGrid(state.list);
    } catch (e) {
      state.list = [];
      renderGrid(state.list);
    } finally {
      state.loading = false;
      renderMore();
    }
  }

  function posterUrl(u) {
    if (!u) return '';
    return '/api/img?u=' + encodeURIComponent(u);
  }

  function renderGrid(list) {
    const g = $('#grid');
    g.innerHTML = list.map((v) => {
      const meta = [v.vod_year, v.vod_area, v.type_name].filter(Boolean).join(' · ');
      const srcTag = v.src_name ? `<span class="src-tag">${escapeHtml(v.src_name)}</span>` : '';
      return `<div class="card" data-id="${v.vod_id}" data-src="${v.src_key || ''}" data-name="${escapeHtml(v.vod_name)}">
        <div class="poster">${srcTag}<img src="${posterUrl(v.vod_pic)}" loading="lazy" alt="" onerror="this.remove()"></div>
        ${v.vod_remarks ? `<span class="badge">${escapeHtml(v.vod_remarks)}</span>` : ''}
        <div class="meta">
          <div class="name" title="${escapeHtml(v.vod_name)}">${escapeHtml(v.vod_name)}</div>
          ${meta ? `<div class="sub">${escapeHtml(meta)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    g.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => openDetail(el.dataset.id, { play: true }, el.dataset.src || state.src));
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- 详情 ----------
  function parsePlays(v) {
    const froms = (v.vod_play_from || '').split('$$$').filter(Boolean);
    const urls = (v.vod_play_url || '').split('$$$').filter(Boolean);
    if (!froms.length) return [];
    const result = froms.map((f, i) => {
      const eps = (urls[i] || '').split('#').map((ep) => {
        const idx = ep.indexOf('$');
        if (idx < 0) return null;
        return { name: ep.slice(0, idx).trim(), url: ep.slice(idx + 1).trim() };
      }).filter((e) => e && e.url);
      return { from: f, eps };
    }).filter((s) => s.eps.length);
    result.sort((a, b) => {
      const am = /m3u8/i.test(a.from);
      const bm = /m3u8/i.test(b.from);
      return (bm ? 1 : 0) - (am ? 1 : 0);
    });
    return result.length ? result : [{ from: froms[0] || '线路', eps: [] }];
  }

  async function openDetail(id, auto = {}, src) {
    if (src) {
      state.src = src;
      $('#srcSel').value = src;
      localStorage.setItem('vb_src', src);
    }
    if (curView !== 'detail') {
      prevDetailView = curView;
      detailNav = true;
      try { history.pushState({ vb: 'detail' }, '', location.href); } catch (e) {}
    }
    showView('detail');
    $('#dTitle').textContent = '加载中…';
    $('#dInfo').innerHTML = '';
    $('#epBlock').innerHTML = '';
    destroyHls();
    video.removeAttribute('src');
    video.load();
    $('#playerTip').classList.remove('hide');
    $('#playerTip').textContent = '加载影片信息…';
    try {
      const data = await apiFetch(`/api/detail?src=${state.src}&ids=${encodeURIComponent(id)}` + API_QM);
      if (!data.detail) throw new Error('no detail');
      state.detail = data.detail;
      state.plays = parsePlays(data.detail);
      state.actFrom = 0;
      state.actEp = -1;
      renderDetail();
      // 自动续播
      if (auto.play && state.plays.length) {
        const from = (auto.from >= 0 && auto.from < state.plays.length) ? auto.from : 0;
        if (state.plays[from].eps.length) {
          playEpisode(from, auto.epIndex >= 0 ? auto.epIndex : 0, auto.seek || 0, true);
        }
      }
    } catch (e) {
      $('#playerTip').textContent = '加载失败，请重试';
      $('#dTitle').textContent = '出错了';
    }
  }

  function renderDetail() {
    const v = state.detail;
    const h = findHistory(v.vod_id, state.src);
    $('#dTitle').textContent = v.vod_name;
    const resume = $('#resumeBtn');
    if (h && h.epIndex >= 0 && state.plays.length && state.plays[h.actFrom || 0] && state.plays[h.actFrom || 0].eps[h.epIndex]) {
      resume.hidden = false;
      resume.textContent = `▶ 继续播放 · ${state.plays[h.actFrom || 0].eps[h.epIndex].name}${h.time ? ' ' + fmtTime(h.time) : ''}`;
    } else {
      resume.hidden = true;
    }
    $('#dInfo').innerHTML = `
      <div class="row">
        <img class="poster-sm" src="${posterUrl(v.vod_pic)}" onerror="this.remove()">
        <div>
          <div class="tags">
            ${v.vod_year ? `<span>年份 <b>${escapeHtml(v.vod_year)}</b></span> &nbsp;` : ''}
            ${v.vod_area ? `<span>地区 <b>${escapeHtml(v.vod_area)}</b></span> &nbsp;` : ''}
            ${v.vod_remarks ? `<span>状态 <b>${escapeHtml(v.vod_remarks)}</b></span>` : ''}
          </div>
          <div class="tags">${v.vod_director ? `<span>导演 <b>${escapeHtml(v.vod_director)}</b></span>` : ''}</div>
          <div class="tags">${v.vod_actor ? `<span>主演 <b>${escapeHtml(v.vod_actor)}</b></span>` : ''}</div>
          ${v.vod_content ? `<div class="desc">${escapeHtml(v.vod_content)}</div>` : ''}
        </div>
      </div>`;
    renderEpBlock(h);
  }

  function renderEpBlock(h) {
    const box = $('#epBlock');
    if (!state.plays.length) { box.innerHTML = ''; return; }
    const faved = isFavorited(state.detail.vod_id, state.src);
    const srcBtns = state.plays.length > 1
      ? state.plays.map((p, i) =>
          `<button class="src-btn ${i === state.actFrom ? 'on' : ''}" data-from="${i}">${escapeHtml(p.from)}</button>`).join('')
      : '';
    const favBtnHtml = `<button id="favEpBtn" class="fav-btn ${faved ? 'on' : ''}">${faved ? '★ 已收藏' : '☆ 收藏'}</button>`;
    let html = `<div class="ep-srcs">${srcBtns}${favBtnHtml}</div>`;
    const eps = state.plays[state.actFrom].eps;
    html += `<h3>共 ${eps.length} 集</h3><div class="ep-list">` +
      eps.map((e, i) =>
        `<button class="${i === state.actEp ? 'on' : ''}" data-ep="${i}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</button>`).join('') +
      `</div>`;
    box.innerHTML = html;
    box.querySelectorAll('.ep-srcs .src-btn').forEach((b) => {
      b.addEventListener('click', () => {
        state.actFrom = +b.dataset.from;
        state.actEp = -1;
        renderEpBlock(h);
      });
    });
    const favEpBtn = box.querySelector('#favEpBtn');
    if (favEpBtn) favEpBtn.addEventListener('click', toggleCurrentFavorite);
    box.querySelectorAll('.ep-list button').forEach((b) => {
      b.addEventListener('click', () => playEpisode(state.actFrom, +b.dataset.ep, 0, false));
    });
  }

  // 收藏/取消收藏当前影片（含正在播放的线路与剧集地址）
  function toggleCurrentFavorite() {
    const v = state.detail;
    if (!v) return;
    const id = v.vod_id, src = state.src;
    if (isFavorited(id, src)) {
      removeFavorite(id, src);
    } else {
      const p = state.plays[state.actFrom];
      const ep = (p && state.actEp >= 0) ? p.eps[state.actEp] : null;
      addFavorite({
        id, src,
        name: v.vod_name, pic: v.vod_pic, remarks: v.vod_remarks,
        from: p ? p.from : '',
        actFrom: state.actFrom, epIndex: state.actEp,
        epName: ep ? ep.name : '', epUrl: ep ? ep.url : '',
      });
    }
    renderEpBlock(findHistory(id, src));
  }

  async function playEpisode(fromIdx, epIdx, seek, forceSeek) {
    const p = state.plays[fromIdx];
    if (!p || !p.eps[epIdx]) return;
    state.actFrom = fromIdx;
    state.actEp = epIdx;
    renderEpBlock(findHistory(state.detail.vod_id, state.src));
    const ep = p.eps[epIdx];
    $('#playerTip').classList.remove('hide');
    $('#playerTip').textContent = '解析播放地址…';
    try {
      const r = await fetch('/api/resolve?u=' + encodeURIComponent(ep.url));
      if (!r.ok) throw new Error('bad');
      const rv = await r.json();
      resumeSeek = forceSeek ? seek : 0;
      addHistory({
        id: state.detail.vod_id, src: state.src,
        name: state.detail.vod_name, pic: state.detail.vod_pic,
        remarks: state.detail.vod_remarks,
        from: p.from, actFrom: fromIdx, epIndex: epIdx, epName: ep.name,
        epUrl: ep.url, time: 0, duration: 0,
      });
      loadVideo(rv.url, rv.type, seek);
    } catch (e) {
      $('#playerTip').textContent = '解析失败，请换一个线路或剧集';
    }
  }

  function loadVideo(url, type, seek) {
    destroyHls();
    resumeSeek = seek > 0 ? seek : null;
    const streamUrl = '/api/stream?u=' + encodeURIComponent(url);
    $('#playerTip').classList.remove('hide');
    $('#playerTip').textContent = '加载播放地址…';
    if (type === 'hls') {
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, maxBufferLength: 60 });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          $('#playerTip').classList.add('hide');
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (e, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setTimeout(() => { if (hls) hls.startLoad(); }, 3000);
            } else if (hls) { destroyHls(); $('#playerTip').textContent = '播放出错，请重试'; }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => { $('#playerTip').classList.add('hide'); video.play().catch(() => {}); }, { once: true });
      } else {
        $('#playerTip').textContent = '当前浏览器不支持 HLS 播放';
      }
    } else {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => { $('#playerTip').classList.add('hide'); video.play().catch(() => {}); }, { once: true });
    }
  }

  function destroyHls() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  }

  // 恢复进度
  video.addEventListener('loadedmetadata', () => {
    if (resumeSeek && resumeSeek > 0 && resumeSeek < (video.duration - 5)) {
      video.currentTime = resumeSeek;
    }
    resumeSeek = null;
  });

  // 记录播放历史进度（节流）
  video.addEventListener('timeupdate', () => {
    if (!state.detail || state.actEp < 0) return;
    const now = Date.now();
    if (now - lastSave < 5000) return;
    lastSave = now;
    updateHistoryProgress(state.detail.vod_id, state.src, state.actEp, video.currentTime, video.duration);
  });
  window.addEventListener('beforeunload', () => {
    if (state.detail && state.actEp >= 0 && video.currentTime > 0) {
      updateHistoryProgress(state.detail.vod_id, state.src, state.actEp, video.currentTime, video.duration);
    }
  });

  // ---------- 历史视图 ----------
  function renderHistory() {
    const list = loadHistory();
    const g = $('#historyGrid');
    $('#historyEmpty').hidden = list.length > 0;
    g.innerHTML = list.map((h) => {
      const pct = h.duration ? Math.min(100, Math.round((h.time / h.duration) * 100)) : 0;
      return `<div class="card" data-i="${h.id}|${h.src}">
        <div class="poster"><img src="${posterUrl(h.pic)}" loading="lazy" onerror="this.remove()"></div>
        <div class="meta">
          <div class="name">${escapeHtml(h.name)}</div>
          <div class="sub">${escapeHtml(h.epName || '')}${h.time ? ' · ' + fmtTime(h.time) : ''}</div>
          <div class="progress"><i style="width:${pct}%"></i></div>
        </div>
      </div>`;
    }).join('');
    g.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => {
        const [id, src] = el.dataset.i.split('|');
        state.src = src;
        $('#srcSel').value = src;
        localStorage.setItem('vb_src', src);
        loadCats();
        const h = findHistory(id, src);
        openDetail(id, { play: true, from: h.actFrom || 0, epIndex: h.epIndex, seek: h.time });
      });
    });
  }

  // ---------- 收藏视图 ----------
  function renderFavorites() {
    const list = loadFavorites().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const g = $('#favGrid');
    $('#favEmpty').hidden = list.length > 0;
    g.innerHTML = list.map((f) => {
      const s = state.sources.find((x) => x.key === f.src);
      const srcName = (s && s.name) || f.src;
      return `<div class="card" data-i="${f.id}|${f.src}">
        <div class="poster"><span class="src-tag">${escapeHtml(srcName)}</span><img src="${posterUrl(f.pic)}" loading="lazy" onerror="this.remove()"></div>
        <button class="fav-del" data-del="${f.id}|${f.src}" title="取消收藏">✕</button>
        <div class="meta">
          <div class="name">${escapeHtml(f.name)}</div>
          <div class="sub">${escapeHtml(f.epName || '')}${f.remarks ? (f.epName ? ' · ' : '') + escapeHtml(f.remarks) : ''}</div>
        </div>
      </div>`;
    }).join('');
    g.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => {
        const [id, src] = el.dataset.i.split('|');
        state.src = src;
        $('#srcSel').value = src;
        localStorage.setItem('vb_src', src);
        loadCats();
        const f = loadFavorites().find((x) => x.id === id && x.src === src);
        openDetail(id, {
          play: true,
          from: f && f.actFrom >= 0 ? f.actFrom : 0,
          epIndex: f && f.epIndex >= 0 ? f.epIndex : 0,
        }, src);
      });
    });
    g.querySelectorAll('.fav-del').forEach((d) => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        const [id, src] = d.dataset.del.split('|');
        removeFavorite(id, src);
        renderFavorites();
      });
    });
  }

  function fmtTime(s) {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return m > 0 ? `${m}分${ss.toString().padStart(2, '0')}秒` : `${ss}秒`;
  }

  // ---------- 搜索记录 ----------
  const HIST_KEY_S = 'vb_search_hist';
  function getSearchHist() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY_S) || '[]'); } catch (e) { return []; }
  }
  function saveSearchHist(list) { localStorage.setItem(HIST_KEY_S, JSON.stringify(list)); }
  function addSearchHist(kw) {
    kw = (kw || '').trim();
    if (!kw) return;
    const list = getSearchHist().filter((x) => x.toLowerCase() !== kw.toLowerCase());
    list.unshift(kw);
    saveSearchHist(list.slice(0, 10));
  }
  function renderSearchHist() {
    const box = $('#searchHist');
    const list = getSearchHist();
    if (!list.length) { box.hidden = true; return; }
    box.innerHTML = list.map((k) =>
      `<li data-k="${escapeHtml(k)}"><span class="his-txt">${escapeHtml(k)}</span><span class="his-del" data-del="${escapeHtml(k)}">✕</span></li>`
    ).join('') + `<li class="his-clear">清空搜索记录</li>`;
    box.hidden = false;
    box.querySelectorAll('li[data-k]').forEach((li) => {
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('his-del')) return;
        const k = li.dataset.k;
        $('#kw').value = k;
        hideSearchHist();
        addSearchHist(k);
        state.kw = k; state.cat = '';
        renderCats();
        searchAll();
      });
    });
    box.querySelectorAll('.his-del').forEach((d) => {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        saveSearchHist(getSearchHist().filter((x) => x !== d.dataset.del));
        renderSearchHist();
      });
    });
    const clear = box.querySelector('.his-clear');
    if (clear) clear.addEventListener('click', () => { saveSearchHist([]); renderSearchHist(); });
  }
  function hideSearchHist() { $('#searchHist').hidden = true; }

  // ---------- 事件 ----------
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.kw = $('#kw').value.trim();
    state.cat = '';
    renderCats();
    if (state.kw) { addSearchHist(state.kw); searchAll(); }
    else resetAndLoad();
  });
  $('#kw').addEventListener('focus', renderSearchHist);
  $('#kw').addEventListener('blur', () => setTimeout(hideSearchHist, 150));
  $('#moreBtn').addEventListener('click', () => fetchList(++state.page, true));
  $('#backBtn').addEventListener('click', () => {
    if (detailNav && history.length > 1) { try { history.back(); } catch (e) { detailNav = false; showView('home'); renderGrid(state.list); } }
    else { showView('home'); renderGrid(state.list); }
  });
  $('#brand').addEventListener('click', () => { showView('home'); renderGrid(state.list); });
  $('#homeBtn').addEventListener('click', () => { showView('home'); renderGrid(state.list); });
  $('#backHistoryBtn').addEventListener('click', () => { showView('home'); renderGrid(state.list); });
  $('#historyBtn').addEventListener('click', () => { renderHistory(); showView('history'); });
  $('#clearHistoryBtn').addEventListener('click', () => {
    if (confirm('确定清空全部播放历史吗？')) { saveHistoryList([]); renderHistory(); }
  });
  $('#favBtn').addEventListener('click', () => { renderFavorites(); showView('favorites'); });
  $('#backFavBtn').addEventListener('click', () => { showView('home'); renderGrid(state.list); });
  $('#clearFavBtn').addEventListener('click', () => {
    if (confirm('确定清空全部收藏吗？')) { saveFavorites([]); renderFavorites(); }
  });
  $('#resumeBtn').addEventListener('click', () => {
    const h = findHistory(state.detail.vod_id, state.src);
    if (h && state.plays[h.actFrom || 0] && state.plays[h.actFrom || 0].eps[h.epIndex]) {
      state.actFrom = h.actFrom || 0;
      playEpisode(state.actFrom, h.epIndex, h.time || 0, true);
    }
  });

  // ---------- 启动 ----------
  async function init() {
    await loadSources();
    loadCats();
    renderMore();
    fetchList(1, false);
  }
  init();
})();
