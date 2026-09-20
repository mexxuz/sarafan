(function () {
  'use strict';
  const KEY = 'sarafan-demo-v1';
  const qs = new URLSearchParams(location.search);
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  if (tg) { tg.ready(); tg.expand(); }

  // ——— Состояние ———
  const load = () => {
    if (!qs.has('reset')) {
      try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* нет хранилища */ }
    }
    const s = window.buildSeed();
    if (qs.has('demo')) s.onboarded = true;
    return s;
  };
  const LIVE = window.API && window.API.live && !qs.has('demo');
  let S = LIVE ? null : load();
  let G = LIVE ? null : window.Graph(S);
  const save = () => { if (LIVE) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* пусть живёт в памяти */ } };
  const commit = () => { G = window.Graph(S); save(); render(); };

  // Настоящие данные: забираем состояние сети с сервера
  const refresh = async () => {
    S = await window.API.bootstrap();
    S.pendingInvites = S.pendingInvites || [];
    G = window.Graph(S);
    render();
  };
  // Действие: в демо меняем данные на месте, вживую — просим сервер и перечитываем
  const mutate = async (demoFn, path, body, okMsg) => {
    if (!LIVE) { demoFn && demoFn(); commit(); if (okMsg) toast(okMsg); return; }
    try {
      await window.API.post(path, body);
      await refresh();
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e.message);
    }
  };

  // ——— Мелочи ———
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const pl = (n, a, b, c) => n + ' ' + plural(n, a, b, c);
  const U = (id) => S.users[id];
  const first = (id) => (id === S.me ? 'Вы' : U(id).name.split(' ')[0]);
  const full = (id) => (id === S.me ? 'Вы' : U(id).name);
  const cat = (id) => G.catById[id] || { name: 'Другое', who: '' };
  const who = (id) => { const c = G.catsOf(id); return c.length ? c.map((x) => cat(x).who).slice(0, 3).join(' · ') : 'Участник сети'; };
  const uid = () => Math.random().toString(36).slice(2, 8);
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const when = (t) => {
    const d = (Date.now() - t) / 6e4;
    if (d < 1) return 'только что';
    if (d < 60) return Math.round(d) + ' мин назад';
    if (d < 1440) return Math.round(d / 60) + ' ч назад';
    if (d < 2880) return 'вчера';
    if (d < 10080) return pl(Math.floor(d / 1440), 'день', 'дня', 'дней') + ' назад';
    const dt = new Date(t); return dt.getDate() + ' ' + MONTHS[dt.getMonth()];
  };
  const hue = (id) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; return (h * 7) % 360; };
  const initials = (id) => U(id).name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  // Фото-заглушки: пока нет настоящих аватаров из Telegram, берём портреты randomuser.me
  const FEM = ['гузаль', 'айгуль', 'нигора'];
  const isFem = (id) => { const n = U(id).name.split(' ')[0].toLowerCase(); return /[ая]$/.test(n) || FEM.includes(n); };
  const photo = (id) => (U(id) && U(id).photo)
    ? U(id).photo
    : (LIVE ? '' : `https://randomuser.me/api/portraits/${isFem(id) ? 'women' : 'men'}/${hue(id) % 100}.jpg`);
  const av = (id, size = '', ring = '') => `<span class="av ${size} ${ring} ${id === S.me ? 'mine' : ''}" style="--h:${hue(id)}" aria-hidden="true">${esc(initials(id))}${photo(id) ? `<img src="${photo(id)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
  const ringOf = (id) => { const d = G.dist[id]; return d === 1 ? 'r1' : d === 2 ? 'r2' : d === undefined ? '' : 'r3'; };

  // Примеры занятий на свободных местах орбиты — показывают, кого тут находят
  const GHOST_IN = ['Юрист', 'Педиатр', 'Бухгалтер', 'Репетитор', 'Психолог', 'Программист'];
  const GHOST_OUT = ['Стоматолог', 'Фотограф', 'Риелтор', 'Автомеханик', 'Дизайнер', 'Кардиолог',
                     'Маркетолог', 'Электрик', 'Кондитер'];

  // ——— Орбита: вы в центре, 1-й круг рядом, 2-й круг дальше ———
  const orbit = (o) => {
    const box = Math.min(o.size || 320, window.innerWidth - (o.big ? 76 : 44), 400);
    const inner = o.inner || [], outer = o.outer || [];
    let k = 0;
    const ring = (ids, rPct, size, cls, label) => ids.map((id, i) => {
      const step = 360 / Math.max(ids.length, 1);
      const a = -90 + step * i + (cls === 'out' ? step / 2 : 0);
      const via = '';
      return `<button class="orb ${cls} ${o.dim && o.dim !== cls ? 'dim' : ''}" style="--a:${a}deg;--r:${Math.round(box * rPct)}px;--i:${k++}" data-act="peek" data-id="${id}" aria-label="${esc(U(id).name)}">${av(id, size, cls === 'in' ? 'r1' : 'r2')}${label ? `<i>${esc(first(id))}${via}</i>` : ''}</button>`;
    }).join('');
    // Пустые места на орбите: медленно вращаются, показывают, как сеть будет выглядеть.
    // У каждого — пример занятия, чтобы было понятно, кого тут находят.
    const ghosts = (count, rPct, size, cls) => {
      if (!count) return '';
      const roles = cls === 'in' ? GHOST_IN : GHOST_OUT;
      const step = 360 / count;
      return Array.from({ length: count }, (_, i) => {
        const a = -90 + step * i + (cls === 'out' ? step / 2 : 0);
        return `<span class="orb ghost ${cls}" style="--a:${a}deg;--r:${Math.round(box * rPct)}px">
          <span class="ghost-in"><span class="ghost-av ${size}">${ic('user')}</span>
          <i class="ghost-tip">${esc(roles[i % roles.length])}</i></span></span>`;
      }).join('');
    };
    const gIn = Math.max(0, (o.ghost ? o.ghost.inner : 0) - inner.length);
    const gOut = Math.max(0, (o.ghost ? o.ghost.outer : 0) - outer.length);
    const spin = (gIn || gOut)
      ? `<div class="spin slow">${ghosts(gIn, 0.295, o.big ? 's' : 'xs', 'in')}</div>
         <div class="spin rev">${ghosts(gOut, 0.47, 'xs', 'out')}</div>`
      : '';

    return `<div class="orbit" style="width:${box}px;height:${box}px">
      <div class="ring r-in"></div><div class="ring r-out"></div>
      ${spin}
      <div class="core">${av(S.me, 'l', 'r1')}${o.cap ? `<span class="cap">${esc(o.cap)}</span>` : ''}</div>
      ${ring(inner, 0.295, o.big ? 's' : 'xs', 'in', o.labels !== false)}
      ${ring(outer, 0.47, 'xs', 'out', !!o.big)}</div>`;
  };
  const orbitPeople = (n1, n2) => {
    const c1 = myContacts();
    const c2 = Object.keys(G.dist).filter((x) => G.dist[x] === 2)
      .sort((a, b) => G.recsTo(b).length - G.recsTo(a).length);
    return { inner: c1.slice(0, n1), outer: c2.slice(0, n2), total1: c1.length, total2: c2.length };
  };
  const names = (ids, max = 2) => {
    const n = ids.map(first);
    return n.length <= max ? n.join(' и ') : n.slice(0, max).join(', ') + ' и ещё ' + (n.length - max);
  };
  const stack = (ids, max = 4) => {
    if (!ids.length) return '';
    const shown = ids.slice(0, max), rest = ids.length - shown.length;
    return `<span class="av-stack">${shown.map((id) => av(id, 'xs')).join('')}${rest ? `<span class="more-n">+${rest}</span>` : ''}</span>`;
  };
  const trustMark = (rep) => (rep && rep.independent >= 3 && !rep.suspicious
    ? `<span class="trust">${ic('seal')}надёжно</span>` : '');

  const REL = { client: 'Опыт клиента', together: 'Работали вместе', colleague: 'Коллеги по цеху', friend: 'Знаю лично', other: 'Другое' };
  const circleName = (c) => (c === 0 ? 'Это вы' : c === 1 ? 'Ваш контакт' : c === 2 ? '2-й круг' : c === 3 ? '3-й круг' : 'Вне вашей сети');
  const circleTag = (c) => `<span class="tag circle-${Math.min(c, 3)}">${circleName(c)}</span>`;
  const myContacts = () => [...(G.adj[S.me] || [])].sort((a, b) => U(a).name.localeCompare(U(b).name));

  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    ask: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4.5A1.5 1.5 0 0 1 4 14.5z"/><path d="M9.8 8.4a2.3 2.3 0 1 1 3 2.2c-.5.2-.8.6-.8 1.1v.3"/><path d="M12 13.9h.01"/>',
    net: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M10.8 7.2 6.3 15.8M13.2 7.2l4.5 8.6M7.5 18h9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    send: '<path d="M4 11.5 20 4l-7.5 16-2.3-6.2z"/><path d="m10.2 13.8 4.3-4.3"/>',
    chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    seal: '<path d="M12 3l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 21l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    bell: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-1.6 2.2c-.3.4 0 .9.5.9h14.2c.5 0 .8-.5.5-.9z"/><path d="M10 21h4"/>',
    hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.1L4 15.5a1.5 1.5 0 0 1 2.2-2L7 14.3"/>',
  };
  const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const logoMark = `<svg class="logo-mark" viewBox="0 0 28 28" aria-hidden="true" fill="none"><path d="M8 5v18" stroke="var(--line)" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="7" r="3" fill="none" stroke="var(--blue)" stroke-width="2"/><circle cx="8" cy="15.5" r="3.5" fill="var(--blue)"/><circle cx="8" cy="23" r="3" fill="none" stroke="var(--line)" stroke-width="2"/><path d="M14 15.5h9" stroke="var(--blue)" stroke-width="2" stroke-linecap="round"/></svg>`;

  // Цепочка одной строкой: Вы → Иван → Алексей
  const chainLine = (chain) => {
    if (!chain) return '';
    return `<div class="stitch">${chain.map((id, i) => {
      const t = id === S.me ? '<span class="you">Вы</span>' : i === chain.length - 1 ? `<b>${esc(first(id))}</b>` : esc(first(id));
      return (i ? '<span class="thr"></span>' : '') + t;
    }).join('')}</div>`;
  };
  // Цепочка крупно: вертикальная лента, кружок у каждого человека
  const chainBig = (chain, recAuthor, catId) => {
    const steps = chain.map((id, i) => {
      const prevId = chain[i - 1];
      const isRec = i === chain.length - 1 && prevId === recAuthor;
      const role = i === 0 ? 'начало цепочки'
        : isRec ? (prevId === S.me ? 'вы за него ручаетесь' : `${esc(first(prevId))} ручается${catId ? ' · ' + esc(cat(catId).who.toLowerCase()) : ''}`)
          : i === 1 ? 'ваш контакт' : `знакомый: ${esc(first(prevId))}`;
      const last = i === chain.length - 1;
      return `<a class="step ${last ? 'now' : ''}" href="#/p/${id}" style="--k:${i}">
        <span class="mark"><span class="dot"></span><span class="line"></span></span>
        <span class="body">${av(id, 's', last ? 'r1' : '')}<span class="grow"><span class="who">${esc(id === S.me ? 'Вы' : U(id).name)}</span><span class="role">${role}</span></span></span></a>`;
    }).join('');
    return `<div class="rail">${steps}</div>`;
  };

  // ——— Маршруты ———
  const route = () => {
    const [p, q] = (location.hash.slice(2) || '').split('?');
    return { path: p.split('/').filter(Boolean), params: new URLSearchParams(q || '') };
  };
  const go = (h) => { location.hash = h; };
  let F = {}; // состояние форм на странице
  let lastHash = null;

  function render() {
    const { path, params } = route();
    const hashChanged = location.hash !== lastHash;
    if (hashChanged) { F = {}; lastHash = location.hash; }
    let html, nav = true, active = '';
    const [name, id] = path;
    if (!S.onboarded) { html = Onboarding(); nav = false; }
    else if (name === 'search') { html = Search(params); active = 'search'; }
    else if (name === 'p' && id && U(id)) {
      if (id === S.me) { go('#/me'); return; }
      html = Profile(id, params); nav = false;
    }
    else if (name === 'ask') { html = Ask(); active = 'ask'; }
    else if (name === 'q' && id) { html = Request(id); nav = false; }
    else if (name === 'net') { html = Network(params); active = 'net'; }
    else if (name === 'me') { html = Me(params); active = 'me'; }
    else { html = Home(); active = 'home'; }
    const app = $('#app');
    app.innerHTML = `<div class="${hashChanged ? 'fade-in' : ''}">${html}</div>`;
    app.classList.toggle('no-nav', !nav);
    drawNav(nav, active);
    if (hashChanged) window.scrollTo(0, 0);
    const af = $('[autofocus]', app); if (af && hashChanged) { af.focus(); const v = af.value; af.value = ''; af.value = v; }
  }

  function drawNav(show, active) {
    const n = $('#nav');
    n.hidden = !show;
    if (!show) return;
    const incoming = S.requests.filter((q) => q.from !== S.me && G.connected(q.from, S.me) && !q.answers.some((a) => a.from === S.me) && !(q.skip || []).includes(S.me)).length;
    const pendingIn = S.conns.filter((c) => c.b === S.me && c.status === 'pending').length;
    const item = (key, href, icon, label, badge) => `<a href="${href}" class="${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span>${badge ? `<i class="badge">${badge}</i>` : ''}</a>`;
    n.innerHTML = item('home', '#/', 'home', 'Главная') + item('search', '#/search', 'search', 'Поиск') +
      `<a href="#/ask" class="ask ${active === 'ask' ? 'on' : ''}" aria-label="Спросить сеть">${ic('ask')}<span>Спросить</span>${incoming ? `<i class="badge">${incoming}</i>` : ''}</a>` +
      item('net', '#/net', 'net', 'Сеть', pendingIn) + item('me', '#/me', 'user', 'Профиль');
  }

  // ——— Общие куски ———
  const personMini = (id, sub, tag = 'a') => `<${tag} class="person" ${tag === 'a' ? `href="#/p/${id}"` : ''}>${av(id, 's')}<div class="grow"><div class="name ellip">${esc(full(id))}</div><div class="sub ellip">${esc(sub ?? who(id))}</div></div>${tag === 'a' ? ic('chev', 'chev') : ''}</${tag}>`;

  const repRows = (id, onlyCat) => {
    const cats = G.catsOf(id).filter((c) => !onlyCat || c === onlyCat);
    if (!cats.length) return '<p class="muted small" style="margin:0">Пока нет рекомендаций. Здесь репутация появляется только тогда, когда за человека ручаются другие.</p>';
    return cats.map((c) => {
      const r = G.reputation(id, c);
      const nearOthers = r.near.filter((a) => a !== S.me);
      const sub = r.count
        ? [pl(r.independent, 'независимый источник', 'независимых источника', 'независимых источников'),
          r.near.includes(S.me) ? 'в том числе вы' : nearOthers.length ? pl(nearOthers.length, 'из вашей сети', 'из вашей сети', 'из вашей сети') : '',
          r.recent ? pl(r.recent, 'новая за месяц', 'новые за месяц', 'новых за месяц') : ''].filter(Boolean).join(' · ')
        : 'Указано в профиле, рекомендаций пока нет';
      const other = r.count - (r.suspicious ? r.bigGroup : 0);
      const bar = r.count ? `<div class="bar-meter">${r.suspicious ? `<i class="grp" style="flex:${r.bigGroup}"></i>` : ''}<i style="flex:${other}"></i><span style="flex:${Math.max(0, 20 - r.count)}"></span></div>` : '';
      const warn = r.suspicious ? `<div class="warn">${ic('alert')}<div>${r.bigGroup} из ${r.count} рекомендаций пришли от людей, которые знакомы между собой и появились в сети в одно время. Мы считаем их одним источником.</div></div>` : '';
      return `<div class="rep-row ${r.count ? 'on' : ''}"><div class="num">${r.count}</div><div class="grow"><div class="h3">${esc(cat(c).name)}</div><div class="small muted">${sub}</div>${bar}${warn}</div></div>`;
    }).join('');
  };

  const recItem = (r, showTarget) => {
    const author = r.from;
    const d = G.dist[author];
    const tag = author === S.me ? '<span class="tag brand">Вы</span>' : d === 1 ? circleTag(1) : d === 2 ? circleTag(2) : '';
    const target = showTarget ? `<div class="small muted" style="margin-top:8px">→ <a href="#/p/${r.to}"><b style="color:var(--ink)">${esc(full(r.to))}</b></a></div>` : '';
    return `<div class="rec"><div class="row"><a href="#/p/${author}">${av(author, 's')}</a><div class="grow"><div class="row" style="gap:8px"><a href="#/p/${author}" class="h3 ellip" style="text-decoration:none">${esc(full(author))}</a>${tag}</div><div class="tiny muted">${when(r.at)}${r.edited ? ' · изменена' : ''}</div></div></div>
      <div class="chips" style="gap:6px;margin-top:10px"><span class="tag brand">${esc(cat(r.cat).name)}</span><span class="tag">${esc(REL[r.rel] || REL.other)}</span></div>
      <p class="txt">${esc(r.text)}</p>${target}</div>`;
  };

  const resultCard = (r, accent) => {
    const u = r.user;
    const iRec = r.rep.near.includes(S.me);
    const others = r.rep.near.filter((a) => a !== S.me);
    const authors = [...new Set(r.rep.recs ? r.rep.recs.map((x) => x.from) : [])]
      .sort((a, b) => (G.dist[a] ?? 9) - (G.dist[b] ?? 9));
    let reason;
    if (iRec) reason = 'Вы рекомендуете' + (others.length ? ', и ещё ' + names(others) : '');
    else if (others.length) reason = 'Рекомендуют: ' + names(others);
    else if (r.via) reason = 'Рекомендует: ' + esc(U(r.via).name);
    else if (r.circle === 1) reason = 'Ваш контакт';
    else reason = 'Нет общих знакомых';
    const otherCats = G.catsOf(u.id).filter((c) => c !== r.cat).length;
    return `<a class="card tap pcard ${accent ? 'accent' : ''}" href="#/p/${u.id}?cat=${r.cat}">
      <div class="head">${av(u.id, '', r.circle === 1 ? 'r1' : r.circle === 2 ? 'r2' : '')}
        <div class="grow"><div class="name">${esc(u.name)} ${trustMark(r.rep)}</div>
          <div class="sub ellip">${reason}</div></div>
        ${circleTag(r.circle)}</div>
      <div class="role">${esc(cat(r.cat).name)}</div>
      ${r.chain && r.circle > 1 ? `<div style="margin:0 0 10px">${chainLine(r.chain)}</div>` : ''}
      <div class="meta">${r.rep.count
        ? `<span class="tag">${pl(r.rep.count, 'рекомендация', 'рекомендации', 'рекомендаций')}</span><span class="tag">${pl(r.rep.independent, 'источник', 'источника', 'источников')}</span>`
        : '<span class="tag">рекомендаций пока нет</span>'}${otherCats ? `<span class="tag">+${otherCats}</span>` : ''}
        ${r.rep.suspicious ? '<span class="tag warm">одна тесная группа</span>' : ''}</div>
      <div class="foot">${stack(authors)}<span class="grow"></span>
        <span class="go">Открыть ${ic('arrow')}</span></div></a>`;
  };

  const incomingRequests = () => S.requests.filter((q) => q.from !== S.me && G.connected(q.from, S.me) && !(q.skip || []).includes(S.me))
    .sort((a, b) => b.at - a.at);

  const requestCard = (q, compact, accent) => {
    const mine = q.from === S.me;
    const answered = q.answers.some((a) => a.from === S.me);
    const head = mine
      ? `<div class="row"><span class="tag brand">Ваш запрос</span><span class="grow"></span><span class="tiny muted">${when(q.at)}</span></div>`
      : `<div class="row">${av(q.from, 's')}<div class="grow"><div class="h3 ellip">${esc(U(q.from).name)}</div><div class="tiny muted">спрашивает · ${when(q.at)}</div></div></div>`;
    const foot = mine
      ? `<div class="row"><span class="small">${q.answers.length ? `<b>${pl(q.answers.length, 'ответ', 'ответа', 'ответов')}</b>` : '<span class="muted">Ответов пока нет</span>'}</span><span class="grow"></span>${q.closed ? '<span class="tag">Закрыт</span>' : ''}${ic('chev', 'chev').replace('class="chev"', 'class="chev" style="width:18px;height:18px;color:var(--muted)"')}</div>`
      : answered
        ? `<div class="row"><span class="tag brand">${ic('check').replace('<svg', '<svg style="width:13px;height:13px"')} Вы ответили</span><span class="grow"></span><span class="tiny muted">${pl(q.answers.length, 'ответ', 'ответа', 'ответов')}</span></div>`
        : `<div class="btn-row"><button class="btn primary sm" data-act="answer" data-id="${q.id}">Посоветовать</button><button class="btn ghost sm" data-act="skipReq" data-id="${q.id}">Не знаю</button></div>`;
    return `<div class="card ask-card ${accent ? 'accent' : ''} ${mine ? 'tap' : ''}" ${mine ? `data-act="goto" data-h="#/q/${q.id}" role="link" tabindex="0"` : ''}>${head}
      <p class="q">${esc(q.text)}</p>${compact ? '' : `<div class="chips" style="margin-bottom:12px"><span class="tag brand">${esc(cat(q.cat).name)}</span></div>`}${foot}</div>`;
  };

  // ——— Лента: движение доверия вокруг вас ———
  const feed = () => {
    const c1 = new Set(G.adj[S.me] || []);
    const ev = [];
    S.recs.forEach((r) => {
      if (r.to === S.me) ev.push({ at: r.at, html: `<div class="txt"><b>${esc(U(r.from).name)}</b> рекомендует вас · ${esc(cat(r.cat).name)}</div><div class="quote sm">${esc(r.text)}</div>`, who: r.from, link: '#/me' });
      else if (c1.has(r.from) && r.from !== S.me) ev.push({ at: r.at, html: `<div class="txt"><b>${esc(U(r.from).name)}</b> рекомендует · ${esc(cat(r.cat).name)}</div><div class="mini">${chainLine([S.me, r.from, r.to])}</div>`, who: r.from, link: `#/p/${r.to}?cat=${r.cat}` });
      else if (c1.has(r.to) && r.from !== S.me && Date.now() - r.at < 30 * 864e5) ev.push({ at: r.at, html: `<div class="txt"><b>${esc(U(r.to).name)}</b> · новая рекомендация: ${esc(cat(r.cat).name)}</div>`, who: r.to, link: `#/p/${r.to}?cat=${r.cat}` });
    });
    S.shares.filter((s) => s.to === S.me).forEach((s) => ev.push({ at: s.at, html: `<div class="txt"><b>${esc(U(s.from).name)}</b> делится с вами контактом</div><div class="mini person-box">${personMini(s.person, undefined, 'div')}</div>${s.note ? `<div class="quote sm">${esc(s.note)}</div>` : ''}`, who: s.from, link: `#/p/${s.person}?share=${s.id}` }));
    S.requests.filter((q) => q.from === S.me).forEach((q) => q.answers.forEach((a) => ev.push({ at: a.at, html: `<div class="txt">Ответ на ваш запрос · <b>${esc(U(a.from).name)}</b> советует</div><div class="mini">${chainLine([S.me, a.from, a.person])}</div>`, who: a.from, link: `#/q/${q.id}` })));
    Object.values(S.users).forEach((u) => {
      if (u.id !== S.me && u.invitedBy && (c1.has(u.invitedBy) || u.invitedBy === S.me) && Date.now() - u.joined < 14 * 864e5)
        ev.push({ at: u.joined, html: `<div class="txt"><b>${esc(u.name)}</b> теперь в сети · по приглашению: ${esc(full(u.invitedBy))}</div>`, who: u.id, link: `#/p/${u.id}` });
    });
    return ev.sort((a, b) => b.at - a.at).slice(0, 14);
  };

  // Пока сеть маленькая — главный экран объясняет, что делать, а не показывает пустоту
  const starter = () => {
    const c1 = myContacts();
    const myRecs = G.recsFrom(S.me).length;
    const asked = S.requests.filter((q) => q.from === S.me).length;
    const steps = [
      {
        done: c1.length > 0, num: 1,
        title: 'Позовите тех, кому доверяете',
        text: c1.length ? `В вашей сети ${pl(c1.length, 'человек', 'человека', 'человек')}. Чем больше знакомых, тем чаще сеть выручает.`
          : 'Сарафан работает только через ваших знакомых. Начните с трёх-пяти человек: коллеги, друзья, родственники.',
        btn: c1.length ? 'Позвать ещё' : 'Позвать знакомых', act: 'goto', href: '#/net',
      },
      {
        done: myRecs > 0, num: 2,
        title: 'Поручитесь за тех, кого знаете',
        text: c1.length
          ? (myRecs ? `Вы поручились за ${pl(myRecs, 'человека', 'человек', 'человек')}. Так вас находят через ваших знакомых.`
            : 'Напишите, за что вы ручаетесь: «делал мне сайт», «лечил зуб». Это и есть рекомендация, из них растёт сеть.')
          : 'Станет доступно, когда в сети появится хотя бы один знакомый.',
        btn: c1.length ? 'Кого рекомендовать' : '', act: 'goto', href: '#/net',
      },
      {
        done: asked > 0, num: 3,
        title: 'Спросите сеть, когда нужен человек',
        text: c1.length
          ? 'Юрист, врач, бухгалтер, автосервис, репетитор — опишите задачу, и знакомые посоветуют тех, кому доверяют сами.'
          : 'Запрос уходит вашему кругу. Пока круга нет, спрашивать некого.',
        btn: c1.length ? 'Спросить сеть' : '', act: 'goto', href: '#/ask',
      },
    ];
    return `<div class="card starter">
      <div class="eyebrow">с чего начать</div>
      <h2 class="h2" style="margin:6px 0 4px">Сеть начинается с людей</h2>
      <p class="small muted" style="margin:0 0 4px">Здесь находят людей, которые в чём-то разбираются, — не по рейтингу, а через знакомых: видно, кто за человека ручается и через кого вы на него вышли.</p>
      ${steps.map((st) => `<div class="step-row ${st.done ? 'done' : ''} ${!st.btn ? 'locked' : ''}">
        <span class="mark">${st.done ? ic('check') : st.num}</span>
        <div class="grow"><div class="h3">${st.title}</div><div class="small muted" style="margin-top:2px">${st.text}</div>
        ${st.btn ? `<button class="btn ${st.done ? 'soft' : 'primary'} sm" style="margin-top:10px" data-act="${st.act}" ${st.href ? `data-h="${st.href}"` : ''}>${st.btn}</button>` : ''}</div>
      </div>`).join('')}
    </div>`;
  };

  // ——— Главная ———
  function Home() {
    const c1 = myContacts();
    const near = new Set(Object.keys(G.dist).filter((k) => G.dist[k] >= 1 && G.dist[k] <= 2));
    const catCount = {};
    near.forEach((id) => G.catsOf(id).forEach((c) => { catCount[c] = (catCount[c] || 0) + 1; }));
    const topCats = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a]).slice(0, 8);
    const inc = incomingRequests().filter((q) => !q.answers.some((a) => a.from === S.me)).slice(0, 2);
    const near2 = Object.keys(G.dist).filter((id) => id !== S.me && G.dist[id] >= 1 && G.dist[id] <= 2)
      .map((id) => { const c = G.catsOf(id)[0]; if (!c) return null; const rep = G.reputation(id, c); return rep.count ? { user: U(id), cat: c, rep, ...G.trust(id, c) } : null; })
      .filter(Boolean)
      .sort((a, b) => a.circle - b.circle || b.rep.independent - a.rep.independent)
      .slice(0, 6);
    const mine = S.requests.filter((q) => q.from === S.me && !q.closed).sort((a, b) => b.at - a.at).slice(0, 2);
    const pend = S.conns.filter((c) => c.b === S.me && c.status === 'pending');
    const asks = S.intros.filter((i) => i.via === S.me && i.status === 'wait');
    const ev = feed();
    const op = orbitPeople(6, 8);
    const small = op.total1 < 3;
    return `
      <div class="place"><a href="#/me" aria-label="Профиль">${av(S.me, '', 'r1')}</a>
        <div class="grow"><div class="lbl">Ваша сеть</div><div class="val">${ic('pin')}${esc(U(S.me).city)} · ${pl(op.total1 + op.total2, 'человек', 'человека', 'человек')}</div></div>
        <button class="icon-btn bell" data-act="goto" data-h="#/ask" aria-label="Что нового">${ic('bell')}${inc.length ? `<i class="badge">${inc.length}</i>` : ''}</button></div>
      ${small ? starter() : ''}
      <a href="#/net" style="display:block">${orbit({ inner: op.inner, outer: op.outer, cap: 'ваша сеть', size: small ? 290 : 320, ghost: small ? { inner: 5, outer: 9 } : null })}</a>
      <div class="orbit-legend"><span><i class="dot-1"></i>${pl(op.total1, 'контакт', 'контакта', 'контактов')}</span><span><i class="dot-2"></i>ещё ${pl(op.total2, 'человек', 'человека', 'человек')} через них</span></div>
      ${small ? '<p class="small muted" style="text-align:center;margin:10px auto 0;max-width:290px">Серые места ждут ваших знакомых: ближний круг — те, кого позвали вы, дальний — их знакомые</p>' : ''}
      <a class="search" href="#/search" style="margin-top:18px;text-decoration:none">${ic('search')}<span class="muted ellip" style="font-size:16px">Юрист, врач, репетитор, дизайнер…</span></a>
      <div class="chips scroll" style="margin-top:12px">${topCats.map((c) => `<a class="chip" href="#/search?c=${c}">${esc(cat(c).who)}<span class="n">${catCount[c]}</span></a>`).join('')}</div>
      ${near2.length ? `<div class="sec-title"><h2 class="h2">Рядом с вами</h2><a class="link" href="#/search">Все</a></div>
      <div class="rail-x">${near2.map((r, i) => resultCard(r, i === 0)).join('')}</div>` : ''}
      ${op.total1 ? `<div style="margin-top:16px"><a class="ask-hero" href="#/ask" style="text-decoration:none"><span class="ic">${ic('ask')}</span><span class="grow"><div class="t1">Спросить сеть</div><div class="t2">Запрос получат ${pl(c1.length, 'человек', 'человека', 'человек')} из вашего круга</div></span>${ic('chev').replace('<svg', '<svg style="width:20px;height:20px;opacity:.7"')}</a></div>` : ''}
      ${asks.length ? `<div class="sec-title"><h2 class="h2">Просят познакомить</h2><span class="badge">${asks.length}</span></div>${asks.map(introAskCard).join('')}` : ''}
      ${pend.length ? `<div class="sec-title"><h2 class="h2">Хотят в вашу сеть</h2></div>${pend.map(connRequestCard).join('')}` : ''}
      ${inc.length ? `<div class="sec-title"><h2 class="h2">Вас спрашивают</h2><a class="link" href="#/ask">Все</a></div><div class="stack">${inc.map((q, i) => requestCard(q, false, i === 0)).join('')}</div>` : ''}
      ${mine.length ? `<div class="sec-title"><h2 class="h2">Ваши запросы</h2></div><div class="stack">${mine.map((q) => requestCard(q, true)).join('')}</div>` : ''}
      <div class="sec-title"><h2 class="h2">В вашей сети</h2></div>
      <div class="card">${ev.length ? ev.map((e) => `<div class="feed-item" data-act="goto" data-h="${e.link}" role="link" tabindex="0">${av(e.who, 's')}<div class="grow" style="min-width:0">${e.html}<div class="when">${when(e.at)}</div></div></div>`).join('') : `<div class="empty" style="padding:var(--s-4) 0"><p style="margin:0">Здесь появится движение доверия: кто кого рекомендует, кто вошёл в сеть, кто чем поделился.<br><b style="color:var(--ink)">Пока вы один — начните с приглашения.</b></p></div>`}</div>`;
  }

  // Просьба познакомить: решает посредник, и только он
  const introAskCard = (i) => `<div class="card accent">
    <div class="row">${av(i.from, 's')}<div class="grow"><div class="h3">${esc(full(i.from))}</div>
      <div class="tiny" style="opacity:.85">просит познакомить · ${when(i.at)}</div></div></div>
    <div style="margin:12px 0"><div class="stitch"><b>${esc(first(i.from))}</b><span class="thr"></span><span class="you">Вы</span><span class="thr"></span><b>${esc(first(i.to))}</b></div></div>
    <p class="q" style="margin:0 0 12px">«${esc(i.text)}»</p>
    <div class="small" style="opacity:.85;margin-bottom:12px">${esc(full(i.to))} ничего не узнает, пока вы не согласитесь.</div>
    <div class="btn-row"><button class="btn primary sm" data-act="introYes" data-id="${i.id}">Познакомить</button><button class="btn sm" data-act="introNo" data-id="${i.id}">Не сейчас</button></div></div>`;

  const connRequestCard = (c) => {
    const common = [...(G.adj[c.a] || [])].filter((x) => G.connected(x, S.me));
    return `<div class="card"><div class="row">${av(c.a)}<div class="grow"><a href="#/p/${c.a}" class="h3" style="text-decoration:none">${esc(U(c.a).name)}</a><div class="small muted">${common.length ? 'Общие знакомые: ' + esc(names(common)) : 'Общих знакомых нет'}</div></div></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-act="acceptConn" data-id="${c.a}">Это мой знакомый</button><button class="btn ghost sm" data-act="declineConn" data-id="${c.a}">Не знаю</button></div></div>`;
  };

  // ——— Поиск ———
  const FILTERS = [['all', 'Все'], ['1', '1-й круг'], ['2', '2-й круг'], ['far', 'Дальше']];
  function Search(params) {
    if (F.q === undefined) { F.q = params.get('q') || ''; F.c = params.get('c') || ''; F.f = params.get('f') || 'all'; }
    return `<div class="top"><h1 class="h1 grow">Поиск</h1></div>
      <label class="search">${ic('search')}<input data-bind="q" value="${esc(F.q)}" placeholder="${F.c ? esc(cat(F.c).name) : 'Юрист, врач, репетитор, дизайнер…'}" autocomplete="off" enterkeyhint="search" ${F.c ? '' : 'autofocus'} aria-label="Кого ищете">${F.q || F.c ? `<button class="clear" data-act="clearSearch" aria-label="Очистить">${ic('x')}</button>` : ''}</label>
      <div id="results">${searchResults()}</div>`;
  }
  function searchResults() {
    const q = (F.q || '').trim();
    if (!q && !F.c) {
      const near = Object.keys(G.dist).filter((k) => G.dist[k] >= 1);
      const byCat = {};
      Object.values(S.users).forEach((u) => { if (u.id !== S.me) G.catsOf(u.id).forEach((c) => { (byCat[c] = byCat[c] || []).push(u.id); }); });
      const tiles = S.cats.map((c) => {
        const all = byCat[c.id] || [];
        const close = all.filter((id) => { const t = G.trust(id, c.id); return t.circle <= 2; });
        return { c, all, close };
      }).filter((x) => x.all.length).sort((a, b) => b.close.length - a.close.length || b.all.length - a.all.length);
      return `<div class="sec-title"><h2 class="h2">Области</h2><span class="small muted">${pl(near.length, 'человек', 'человека', 'человек')} в вашей сети</span></div>
        <div class="cat-grid">${tiles.map((x) => `<a class="cat-tile" href="#/search?c=${x.c.id}" style="text-decoration:none"><b>${esc(x.c.name)}</b>${x.close.length ? `<div class="av-stack">${x.close.slice(0, 3).map((id) => av(id, 'xs')).join('')}</div><span>${pl(x.close.length, 'человек', 'человека', 'человек')} через ваших знакомых</span>` : `<span>${pl(x.all.length, 'человек', 'человека', 'человек')}, но не через вашу сеть</span>`}</a>`).join('')}</div>`;
    }
    const all = G.search(q, F.c);
    const bucket = (r) => (r.circle <= 1 ? '1' : r.circle === 2 ? '2' : 'far');
    const counts = { all: all.length, 1: 0, 2: 0, far: 0 };
    all.forEach((r) => counts[bucket(r)]++);
    const list = F.f === 'all' ? all : all.filter((r) => bucket(r) === F.f);
    const catsFound = F.c ? [F.c] : G.matchCats(q);
    const filt = `<div class="chips scroll" style="margin-top:12px">${F.c ? `<button class="chip on" data-act="clearCat">${esc(cat(F.c).name)} ${ic('x').replace('<svg', '<svg style="width:14px;height:14px"')}</button>` : ''}${FILTERS.map(([k, l]) => `<button class="chip ${F.f === k ? 'on' : ''}" data-act="filter" data-v="${k}" ${counts[k] ? '' : 'disabled style="opacity:.45"'}>${l}<span class="n">${counts[k]}</span></button>`).join('')}</div>`;
    const askPrefill = encodeURIComponent(q || (F.c ? cat(F.c).who : ''));
    const askCard = `<div class="card" style="margin-top:16px;text-align:center"><div class="h3">${list.length ? 'Хотите мнение знакомых?' : 'Через вашу сеть пока никого'}</div><p class="small muted" style="margin:6px 0 14px">Запрос получат ${pl(myContacts().length, 'человек', 'человека', 'человек')} из вашего круга — посоветуют тех, кому доверяют сами.</p><a class="btn primary" href="#/ask?t=${askPrefill}&c=${catsFound[0] || ''}">${ic('ask')}Спросить сеть</a></div>`;
    if (!all.length) {
      return filt + `<div class="empty"><h2 class="h2">${catsFound.length ? 'Никого не нашли' : 'Не понимаем запрос'}</h2><p>${catsFound.length ? 'В этой области пока нет людей с рекомендациями.' : 'Попробуйте иначе: «юрист», «стоматолог», «бухгалтер», «репетитор».'}</p></div>` + askCard;
    }
    const groups = [['1', 'Ваши контакты'], ['2', 'Через ваших знакомых'], ['far', 'Дальше от вас']];
    let html = filt + `<div class="count-line"><b>${pl(list.length, 'человек найден', 'человека найдено', 'человек найдено')}</b>${F.f !== 'all' ? '<button class="link" data-act="filter" data-v="all">Показать всех</button>' : ''}</div>`;
    groups.forEach(([k, label]) => {
      const g = list.filter((r) => bucket(r) === k);
      if (!g.length) return;
      html += `<div class="group-label">${label}</div><div class="stack">${g.map(resultCard).join('')}</div>`;
    });
    return html + askCard;
  }

  // ——— Профиль человека ———
  function Profile(id, params) {
    const u = U(id);
    const cats = G.catsOf(id);
    const focus = params.get('cat') && cats.includes(params.get('cat')) ? params.get('cat') : cats[0];
    const t = G.trust(id, focus);
    const direct = G.connected(S.me, id);
    const share = S.shares.find((s) => s.id === params.get('share')) || S.shares.find((s) => s.to === S.me && s.person === id);
    const allRecs = G.recsTo(id);
    const indep = G.groupsOf([...new Set(allRecs.map((r) => r.from))]).length;
    const repFocus = focus ? G.reputation(id, focus) : null;
    const extra = repFocus ? repFocus.near.filter((a) => a !== t.via && a !== S.me) : [];
    if (F.rc === undefined) { F.rc = 'all'; F.more = false; }

    let how;
    if (direct) how = `${chainBig([S.me, id], null)}<p class="small muted" style="margin:8px 0 0">Вы знакомы напрямую${G.recsFrom(S.me).some((r) => r.to === id) ? ' и уже рекомендуете этого человека' : ''}.</p>`;
    else if (t.chain) how = `${chainBig(t.chain, t.via, focus)}${extra.length ? `<p class="small" style="margin:12px 0 0;color:var(--ink-3)">Ещё из вашей сети рекомендуют: <b>${esc(extra.map(full).join(', '))}</b></p>` : ''}`;
    else how = '<p class="small muted" style="margin:0">Пока нет пути через вашу сеть. Ниже — рекомендации людей, которых вы не знаете: смотрите, кто они и насколько независимы.</p>';

    const recs = allRecs.filter((r) => F.rc === 'all' || r.cat === F.rc)
      .sort((a, b) => ((G.dist[a.from] ?? 9) - (G.dist[b.from] ?? 9)) || b.at - a.at);
    const shown = F.more ? recs : recs.slice(0, 5);
    const rs = G.recommenderStats(id);
    const given = G.recsFrom(id);
    const intro = S.intros.find((x) => x.to === id);
    const pendingOut = S.conns.find((c) => c.a === S.me && c.b === id && c.status === 'pending');
    const pendingIn = S.conns.find((c) => c.a === id && c.b === S.me && c.status === 'pending');

    let actions;
    if (pendingIn) actions = `<button class="btn primary" data-act="acceptConn" data-id="${id}">${ic('check')}Это мой знакомый</button><button class="btn ghost" data-act="declineConn" data-id="${id}">Не знаю</button>`;
    else if (direct) actions = `<button class="btn soft" data-act="write" data-id="${id}">${ic('chat')}Написать</button><button class="btn primary" data-act="recommend" data-id="${id}" data-cat="${focus || ''}">${ic('seal')}Рекомендовать</button><button class="btn ghost icon" data-act="share" data-id="${id}" aria-label="Поделиться">${ic('share')}</button>`;
    else if (intro && intro.status === 'ok') actions = `<button class="btn soft" data-act="write" data-id="${id}">${ic('chat')}Написать</button>${pendingOut ? '<button class="btn ghost" disabled>Заявка отправлена</button>' : `<button class="btn primary" data-act="addConn" data-id="${id}">${ic('plus')}В мою сеть</button>`}`;
    else if (intro) actions = `<button class="btn ghost" disabled>Ждём ответа: ${esc(first(intro.via))}</button><button class="btn ghost icon" data-act="share" data-id="${id}" aria-label="Поделиться">${ic('share')}</button>`;
    else if (t.chain && t.chain.length > 2) actions = `<button class="btn primary" data-act="intro" data-id="${id}" data-cat="${focus || ''}">${ic('hand')}Попросить знакомство</button><button class="btn ghost icon" data-act="share" data-id="${id}" aria-label="Поделиться">${ic('share')}</button>`;
    else actions = `<button class="btn primary" data-act="share" data-id="${id}">${ic('share')}Поделиться контактом</button>`;

    return `<div class="top"><button class="back" data-act="back" aria-label="Назад">${ic('back')}</button><div class="grow"></div><button class="icon-btn" data-act="share" data-id="${id}" aria-label="Поделиться">${ic('share')}</button></div>
      ${share ? `<div class="shared-banner">${av(share.from, 's')}<div><div>Контакт прислали вам: <b>${esc(U(share.from).name)}</b></div>${share.note ? `<div style="margin-top:4px;color:var(--ink-2)">«${esc(share.note)}»</div>` : ''}</div></div>` : ''}
      <div class="p-head">${av(id, 'xl', ringOf(id))}<div><div class="who">${esc(who(id))} · ${esc(u.city)}</div><h1 class="h1" style="margin-top:4px">${esc(u.name)}</h1></div>${u.about ? `<p class="about">${esc(u.about)}</p>` : ''}</div>
      <div class="stat-grid" style="margin-top:18px"><div class="stat"><b>${allRecs.length}</b><span>${plural(allRecs.length, 'рекомендация', 'рекомендации', 'рекомендаций')}</span></div><div class="stat"><b>${indep}</b><span>${plural(indep, 'независимый источник', 'независимых источника', 'независимых источников')}</span></div><div class="stat"><b>${(G.adj[id] || new Set()).size}</b><span>${plural((G.adj[id] || new Set()).size, 'связь', 'связи', 'связей')} в сети</span></div></div>
      <div class="sec-title"><h2 class="h2">Как вы связаны</h2>${t.circle && t.circle < Infinity ? circleTag(t.circle) : ''}</div>
      <div class="card">${how}</div>
      <div class="sec-title"><h2 class="h2">За что рекомендуют</h2></div>
      <div class="card">${repRows(id)}</div>
      ${allRecs.length ? `<div class="sec-title"><h2 class="h2">Рекомендации</h2></div>
      ${cats.length > 1 ? `<div class="chips scroll" style="margin-bottom:10px"><button class="chip ${F.rc === 'all' ? 'on' : ''}" data-act="rc" data-v="all">Все<span class="n">${allRecs.length}</span></button>${cats.filter((c) => G.recsTo(id, c).length).map((c) => `<button class="chip ${F.rc === c ? 'on' : ''}" data-act="rc" data-v="${c}">${esc(cat(c).name)}<span class="n">${G.recsTo(id, c).length}</span></button>`).join('')}</div>` : ''}
      <div class="card">${shown.map((r) => recItem(r)).join('')}${recs.length > shown.length ? `<button class="btn ghost block" style="margin-top:12px" data-act="more">Показать все ${recs.length}</button>` : ''}</div>` : ''}
      ${given.length ? `<div class="sec-title"><h2 class="h2">Кого рекомендует</h2><span class="small muted">${pl(rs.people, 'человек', 'человека', 'человек')} · ${pl(rs.cats, 'область', 'области', 'областей')}</span></div>
      <div class="card">${[...new Map(given.map((r) => [r.to, r])).values()].slice(0, 6).map((r) => personMini(r.to, cat(r.cat).who)).join('')}</div>` : ''}
      <div class="actions"><div class="inner">${actions}</div></div>`;
  }

  // ——— Спросить сеть ———
  function Ask() {
    const { params } = route();
    if (F.t === undefined) { F.t = params.get('t') || ''; F.cat = params.get('c') || G.matchCats(F.t)[0] || ''; F.catTouched = !!params.get('c'); }
    const c1 = myContacts();
    const mine = S.requests.filter((q) => q.from === S.me).sort((a, b) => b.at - a.at);
    const inc = incomingRequests();
    return `<div class="top"><h1 class="h1 grow">Спросить сеть</h1></div>
      <div class="card">
        <label class="field" style="margin-top:0"><span>Кого ищете</span><textarea class="textarea" data-bind="t" placeholder="Например: нужен юрист по трудовому спору — уволили, хочу разобраться" maxlength="300">${esc(F.t)}</textarea></label>
        <div id="askcats">${askCats()}</div>
        <div class="row" style="margin-top:14px"><div class="av-stack">${c1.slice(0, 5).map((id) => av(id, 'xs')).join('')}</div><div class="grow small muted">Получат ${pl(c1.length, 'человек', 'человека', 'человек')} из 1-го круга. Они посоветуют своих — с цепочкой, через кого.</div></div>
        <button class="btn primary block" style="margin-top:14px" data-act="postAsk" data-submit ${askValid() ? '' : 'disabled'}>${ic('send')}Отправить запрос</button>
      </div>
      ${inc.length ? `<div class="sec-title"><h2 class="h2">Вас спрашивают</h2><span class="small muted">${pl(inc.length, 'запрос', 'запроса', 'запросов')}</span></div><div class="stack">${inc.map((q) => requestCard(q)).join('')}</div>` : ''}
      ${mine.length ? `<div class="sec-title"><h2 class="h2">Ваши запросы</h2></div><div class="stack">${mine.map((q) => requestCard(q, true)).join('')}</div>` : ''}`;
  }
  const askValid = () => (F.t || '').trim().length >= 10 && !!F.cat;
  function askCats() {
    const auto = G.matchCats(F.t || '');
    if (!F.catTouched) F.cat = auto[0] || '';
    const list = F.allCats ? S.cats.map((c) => c.id) : [...new Set([...(F.cat ? [F.cat] : []), ...auto])].slice(0, 5);
    return `<div class="field"><span>Область</span>
      <div class="chips">${list.map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" data-act="askCat" data-v="${c}">${esc(cat(c).name)}</button>`).join('')}${F.allCats ? '' : `<button class="chip" data-act="askAllCats">${list.length ? 'Другая…' : 'Выбрать область'}</button>`}</div><p class="hint">${F.cat ? 'Ответ попадёт в рекомендации по этой области' : 'Выберите область — так ответ станет рекомендацией'}</p></div>`;
  }

  // ——— Запрос: ответы ———
  function Request(id) {
    const q = S.requests.find((x) => x.id === id);
    if (!q) return '<div class="empty"><h2 class="h2">Запрос не найден</h2><a class="btn" href="#/">На главную</a></div>';
    const mine = q.from === S.me;
    const answered = q.answers.some((a) => a.from === S.me);
    const answers = q.answers.map((a, i) => {
      const t = G.trust(a.person, q.cat);
      const direct = G.connected(S.me, a.person);
      const intro = S.intros.find((x) => x.to === a.person);
      const act = a.person === S.me ? '' : direct ? `<a class="btn soft sm" href="#/p/${a.person}?cat=${q.cat}">Профиль</a>`
        : intro ? `<a class="btn ghost sm" href="#/p/${a.person}?cat=${q.cat}">${intro.status === 'ok' ? 'Знакомство состоялось' : 'Ждём ответа'}</a>`
          : `<button class="btn primary sm" data-act="intro" data-id="${a.person}" data-via="${a.from}" data-cat="${q.cat}">Попросить знакомство</button>`;
      const thanks = mine ? (a.thanked ? `<span class="tag brand">${ic('check').replace('<svg', '<svg style="width:13px;height:13px"')} Спасибо отправлено</span>` : `<button class="btn ghost sm" data-act="thank" data-q="${q.id}" data-i="${i}">Спасибо</button>`) : '';
      return `<div class="answer"><div class="row">${av(a.from, 'xs')}<div class="grow small"><b>${esc(full(a.from))}</b> <span class="muted">советует · ${when(a.at)}</span></div></div>
        <a href="#/p/${a.person}?cat=${q.cat}" style="text-decoration:none;display:block;margin-top:10px"><div class="row">${av(a.person)}<div class="grow"><div class="h3">${esc(full(a.person))}</div><div class="small muted">${esc(cat(q.cat).who)} · ${pl(G.recsTo(a.person, q.cat).length, 'рекомендация', 'рекомендации', 'рекомендаций')}</div></div></div></a>
        <div style="margin-top:10px">${chainLine(direct ? [S.me, a.person] : [S.me, a.from, a.person].filter((x, k, arr) => arr.indexOf(x) === k))}</div>
        <p class="txt">«${esc(a.text)}»</p><div class="btn-row">${act}${thanks}</div></div>`;
    }).join('');
    return `<div class="top"><button class="back" data-act="back" aria-label="Назад">${ic('back')}</button><h1 class="h2 grow">${mine ? 'Ваш запрос' : 'Запрос'}</h1></div>
      <div class="card">${mine ? '' : `<div class="row">${av(q.from, 's')}<div class="grow"><div class="h3">${esc(U(q.from).name)}</div><div class="tiny muted">${when(q.at)}</div></div></div>`}
        <p style="font-size:17px;margin:${mine ? 0 : '12px'} 0 12px">${esc(q.text)}</p>
        <div class="row"><span class="tag brand">${esc(cat(q.cat).name)}</span><span class="grow"></span><span class="tiny muted">${mine ? 'отправлен ' + when(q.at) : ''}</span></div></div>
      <div class="sec-title"><h2 class="h2">${q.answers.length ? pl(q.answers.length, 'ответ', 'ответа', 'ответов') : 'Ответов пока нет'}</h2></div>
      ${answers ? `<div class="card" style="padding:6px 10px 10px">${answers}</div>` : `<div class="card"><p class="small muted" style="margin:0">${mine ? 'Мы сообщим в Telegram, как только кто-то посоветует человека.' : 'Будьте первым, кто поможет.'}</p></div>`}
      <div style="margin-top:16px">${mine
        ? (q.closed ? '<p class="small muted" style="text-align:center">Запрос закрыт</p>' : `<button class="btn ghost block" data-act="closeReq" data-id="${q.id}">${ic('check')}Нашёл, закрыть запрос</button>`)
        : answered ? '' : `<button class="btn primary block" data-act="answer" data-id="${q.id}">Посоветовать человека</button>`}</div>`;
  }

  // ——— Моя сеть ———
  function Network(params) {
    if (F.tab === undefined) F.tab = params.get('tab') || 'c1';
    const c1 = myContacts();
    const c2 = Object.keys(G.dist).filter((k) => G.dist[k] === 2).sort((a, b) => U(a).name.localeCompare(U(b).name));
    const pend = S.conns.filter((c) => c.b === S.me && c.status === 'pending');
    const inv = S.invite;
    const bot = S.bot || 'sarafanibot';
    const link = `t.me/${bot}?start=${inv.code}`;
    const left = inv.max - inv.used;
    const empty = c1.length === 0;
    const myRecTo = (id) => G.recsFrom(S.me).filter((r) => r.to === id).map((r) => cat(r.cat).who);
    const dim = F.tab === 'c1' ? 'in' : F.tab === 'c2' ? 'out' : null;

    const invite = `
      <div class="card accent invite-strong">
        <div class="eyebrow">сильное приглашение</div>
        <h2 class="h2" style="margin:6px 0 8px">Позовите и сразу поручитесь</h2>
        <p class="small" style="margin:0 0 4px;color:rgba(255,255,255,.88)">Напишите рекомендацию заранее — человек войдёт по вашей ссылке, и она уже будет ждать у него в профиле. Так сеть с первого дня наполняется доверием, а не просто людьми.</p>
        <button class="btn primary block" style="margin-top:14px" data-act="outsider">${ic('seal')}Написать рекомендацию</button>
      </div>

      <div class="card" style="margin-top:10px">
        <div class="eyebrow">просто позвать</div>
        <div class="row" style="margin-top:8px"><div class="grow"><div class="h3">Ваша личная ссылка</div>
          <div class="small muted" style="margin-top:2px">Осталось мест: ${left} из ${inv.max}</div></div></div>
        <div class="link-box plain">${ic('link').replace('<svg', '<svg style="width:17px;height:17px;flex:none;opacity:.6"')}<span>${link}</span></div>
        <div class="btn-row"><button class="btn sm" data-act="sendInvite">${ic('send')}Отправить</button><button class="btn ghost sm" data-act="copy" data-v="https://${link}">${ic('copy')}Скопировать</button></div>
        <div class="dots plain">${Array.from({ length: inv.max }, (_, i) => `<i class="${i < inv.used ? 'on' : ''}"></i>`).join('')}</div>
        <p class="small muted" style="margin:12px 0 0">Кто войдёт по ссылке — сразу ваш контакт. Но приглашение не значит, что вы за человека ручаетесь: это отдельное действие.</p>
      </div>`;

    const howto = `<div class="card" style="margin-top:10px">
      <div class="eyebrow">как это работает</div>
      <div class="rail" style="margin-top:10px">
        ${[['Вы отправляете ссылку', 'в Telegram, любым знакомым'],
           ['Человек открывает её', 'и нажимает «Открыть Сарафан»'],
           ['Он в сети и он ваш контакт', 'дальше вы можете поручиться друг за друга']]
          .map(([t, d], i, all) => `<div class="step ${i === all.length - 1 ? 'now' : ''}" style="--k:${i}">
            <span class="mark"><span class="dot"></span><span class="line"></span></span>
            <span class="body"><span class="grow"><span class="who">${t}</span><span class="role">${d}</span></span></span></div>`).join('')}
      </div></div>`;

    const people = F.tab === 'c1'
      ? c1.map((id) => { const r = myRecTo(id); return personMini(id, r.length ? 'Вы рекомендуете: ' + r.join(', ') : who(id)); }).join('')
      : c2.map((id) => personMini(id, who(id) + ' · через ' + first(G.pathTo(id)[1]))).join('');

    return `<div class="top"><div class="grow"><h1 class="h1">Моя сеть</h1>
        <div class="small muted" style="margin-top:4px">${empty ? 'Пока только вы' : `${pl(c1.length, 'контакт', 'контакта', 'контактов')} · ещё ${pl(c2.length, 'человек', 'человека', 'человек')} через них`}</div></div></div>
      ${pend.length ? `<div class="sec-title" style="margin-top:var(--s-4)"><h2 class="h2">Хотят в вашу сеть</h2><span class="badge">${pend.length}</span></div>${pend.map(connRequestCard).join('')}` : ''}
      ${invite}
      ${empty ? howto : ''}
      ${S.pendingInvites.length ? `<div class="sec-title"><h2 class="h2">Ждут приглашения</h2></div><div class="card">${S.pendingInvites.map((p) => `<div class="person"><span class="av s" style="background:var(--mist-2)">${esc(p.name.slice(0, 1).toUpperCase())}</span><div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${esc(cat(p.cat).who)} · ссылка отправлена ${when(p.at)}</div></div><span class="tag">ждём</span></div>`).join('')}</div>` : ''}
      ${empty ? '' : `
      <div class="sec-title"><h2 class="h2">Круги знакомых</h2></div>
      ${orbit({ inner: c1.slice(0, 8), outer: c2.slice(0, 8), cap: 'вы', size: 360, big: true, dim })}
      <div class="orbit-legend" style="margin-bottom:var(--s-5)"><span><i class="dot-1"></i>1-й круг</span><span><i class="dot-2"></i>2-й круг</span></div>
      <div class="tabs" role="tablist"><button class="${F.tab === 'c1' ? 'on' : ''}" data-act="tab" data-v="c1">Мои контакты · ${c1.length}</button><button class="${F.tab === 'c2' ? 'on' : ''}" data-act="tab" data-v="c2">2-й круг · ${c2.length}</button></div>
      <div class="card">${people || '<p class="muted small" style="margin:0">Здесь пока пусто</p>'}</div>`}`;
  }

  // ——— Мой профиль ———
  function Me(params) {
    if (F.tab === undefined) F.tab = params.get('tab') || 'in';
    const me = U(S.me);
    const inRecs = G.recsTo(S.me).sort((a, b) => b.at - a.at);
    const outRecs = G.recsFrom(S.me).sort((a, b) => b.at - a.at);
    const rs = G.recommenderStats(S.me);
    const thanks = S.requests.flatMap((q) => q.answers).filter((a) => a.from === S.me && a.thanked).length;
    const indep = G.groupsOf([...new Set(inRecs.map((r) => r.from))]).length;
    return `<div class="top"><h1 class="h2 grow">Профиль</h1><button class="btn sm" data-act="editMe">Изменить</button></div>
      <div class="p-head">${av(S.me, 'xl')}<div><div class="who">${esc(who(S.me))} · ${esc(me.city)}</div><h1 class="h1" style="margin-top:6px">${esc(me.name)}</h1></div>${me.about ? `<p class="about">${esc(me.about)}</p>` : ''}</div>
      <div class="stat-grid" style="margin-top:18px"><div class="stat"><b>${inRecs.length}</b><span>${plural(inRecs.length, 'рекомендация', 'рекомендации', 'рекомендаций')} вам</span></div><div class="stat"><b>${indep}</b><span>${plural(indep, 'независимый источник', 'независимых источника', 'независимых источников')}</span></div><div class="stat"><b>${myContacts().length}</b><span>${plural(myContacts().length, 'контакт', 'контакта', 'контактов')}</span></div></div>
      <div class="sec-title"><h2 class="h2">Вас рекомендуют</h2></div>
      <div class="card">${repRows(S.me)}</div>
      <div class="sec-title"><h2 class="h2">Вы как рекомендатель</h2></div>
      <div class="card"><div class="stat-grid"><div class="stat"><b>${rs.people}</b><span>${plural(rs.people, 'человек', 'человека', 'человек')} рекомендуете</span></div><div class="stat"><b>${rs.answers}</b><span>${plural(rs.answers, 'ответ', 'ответа', 'ответов')} на запросы</span></div><div class="stat"><b>${thanks}</b><span>${plural(thanks, 'спасибо', 'спасибо', 'спасибо')}</span></div></div>
        <p class="small muted" style="margin:12px 0 0">Это вторая репутация: насколько хорошо вы советуете людей. Её видят все, кто смотрит ваши рекомендации.</p></div>
      <div class="sec-title"><h2 class="h2">Рекомендации</h2></div>
      <div class="tabs" role="tablist"><button class="${F.tab === 'in' ? 'on' : ''}" data-act="tab" data-v="in">Вам · ${inRecs.length}</button><button class="${F.tab === 'out' ? 'on' : ''}" data-act="tab" data-v="out">От вас · ${outRecs.length}</button></div>
      <div class="card">${(F.tab === 'in' ? inRecs.map((r) => recItem(r)) : outRecs.map((r) => recItem(r, true))).join('') || '<p class="small muted" style="margin:0">Пока пусто</p>'}</div>
      <p style="text-align:center;margin-top:24px"><button class="btn ghost sm" data-act="resetDemo">Начать демо заново</button></p>`;
  }

  // ——— Первый вход ———
  function Onboarding() {
    const inviter = U(S.me).invitedBy && U(U(S.me).invitedBy) ? U(S.me).invitedBy : null;
    if (F.name === undefined) { F.name = (tg && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || U(S.me).name; F.cats = [...U(S.me).cats]; }
    const ring = inviter ? [inviter, ...[...(G.adj[inviter] || [])].filter((x) => x !== S.me)] : [...(G.adj[S.me] || [])];
    const rule = (icon, t, d) => `<div class="rule"><span class="ic">${ic(icon)}</span><div><b>${t}</b>${d}</div></div>`;
    return `<div class="onb">
      <div class="top"><div class="logo grow">${logoMark}сарафан</div></div>
      ${orbit({ inner: ring.slice(0, 6), outer: ring.slice(6, 14), cap: 'вы', size: 300, labels: false })}
      <h1 class="h1" style="text-align:center;font-size:29px;line-height:1.1;margin-top:6px">Люди, за которых<br>ручаются знакомые</h1>
      <p class="muted" style="text-align:center;margin:12px auto 20px;max-width:310px">Юрист, врач, бухгалтер, репетитор, автомеханик — кто угодно, в чём-то разбирающийся. Вы видите не рейтинг, а живую цепочку: кто из ваших знакомых его знает.</p>
      ${inviter ? `<div class="inviter">${av(inviter, '', 'r1')}<div class="grow"><div class="small muted">Вас пригласили</div><div class="h3">${esc(U(inviter).name)}</div></div><span class="tag brand">1-й круг</span></div>` : '<div class="inviter"><div class="grow"><div class="small muted">Вы первый в сети</div><div class="h3">Пригласите тех, кому доверяете</div></div></div>'}
      <div class="card onb" style="margin-top:10px"><div class="rules">
        ${rule('seal', 'Знакомство — ещё не рекомендация', 'Добавить человека в сеть и поручиться за него — два разных действия.')}
        ${rule('net', 'Видно, кто ручается', 'У каждого человека — цепочка: Вы → Иван → Алексей.')}
        ${rule('ask', 'Сначала спросите сеть', 'Не нашли — знакомые посоветуют своих.')}
      </div></div>
      <div class="card" style="margin-top:10px">
        <label class="field" style="margin-top:0"><span>Как вас зовут</span><input class="input" data-bind="name" value="${esc(F.name)}" maxlength="40" autocomplete="given-name"></label>
        <div class="field"><span>Чем занимаетесь</span>
          <div class="chips">${S.cats.map((c) => `<button class="chip ${F.cats.includes(c.id) ? 'on' : ''}" data-act="toggleCat" data-v="${c.id}">${esc(c.who)}</button>`).join('')}</div>
          <p class="hint">Можно пропустить: в чём вы сильны, решат рекомендации знакомых</p></div>
        <button class="btn primary block" style="margin-top:18px" data-act="finishOnb" data-submit ${F.name.trim() ? '' : 'disabled'}>Войти в сеть</button>
      </div></div>`;
  }

  // ——— Шторка ———
  let SH = null;
  function openSheet(obj) {
    SH = obj;
    const el = $('#sheet');
    el.hidden = false;
    el.innerHTML = '<div class="shade" data-act="closeSheet"></div><div class="panel" role="dialog" aria-modal="true"><div class="grab"></div><div class="body"></div></div>';
    drawSheet();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  }
  function drawSheet() {
    const p = $('#sheet .panel'); const st = p.scrollTop;
    $('#sheet .body').innerHTML = SH.render();
    p.scrollTop = st;
    syncForm();
  }
  function closeSheet() {
    const el = $('#sheet'); el.classList.remove('open');
    setTimeout(() => { if (!el.classList.contains('open')) { el.hidden = true; el.innerHTML = ''; } }, 300);
    SH = null;
  }
  function syncForm() {
    const scope = SH ? $('#sheet') : $('#app');
    const data = SH ? SH.F : F;
    $$('[data-count]', scope).forEach((el) => {
      const n = (data[el.dataset.count] || '').trim().length, min = +el.dataset.min;
      el.textContent = n < min ? `${min - n} до минимума · конкретика помогает другим` : 'Так понятно, за что вы ручаетесь';
      el.classList.toggle('ok', n >= min);
    });
    const valid = SH ? (SH.valid ? SH.valid() : true) : route().path[0] === 'ask' ? askValid() : !S.onboarded ? !!(F.name || '').trim() : true;
    $$('[data-submit]', scope).forEach((b) => { b.disabled = !valid; });
  }
  const sheetHead = (id, title, sub) => `<div class="s-head">${id ? av(id) : ''}<div class="grow"><h2 class="h2">${title}</h2>${sub ? `<div class="small muted" style="margin-top:4px">${sub}</div>` : ''}</div><button class="icon-btn" data-act="closeSheet" aria-label="Закрыть" style="box-shadow:none;background:var(--card-2)">${ic('x')}</button></div>`;
  const relChips = (F) => `<div class="field"><span>Откуда знаете</span><div class="chips">${Object.entries(REL).map(([k, v]) => `<button class="chip ${F.rel === k ? 'on' : ''}" data-act="set" data-k="rel" data-v="${k}">${v}</button>`).join('')}</div></div>`;
  const catChips = (F, preferred) => {
    const list = F.allCats ? S.cats.map((c) => c.id) : [...new Set([...(preferred || []), ...(F.cat ? [F.cat] : [])])];
    return `<div class="field"><span>В какой области</span><div class="chips">${list.map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" data-act="set" data-k="cat" data-v="${c}">${esc(cat(c).name)}</button>`).join('')}${F.allCats ? '' : `<button class="chip" data-act="set" data-k="allCats" data-v="1">${list.length ? 'Другая…' : 'Выбрать'}</button>`}</div></div>`;
  };
  const recsToday = () => G.recsFrom(S.me).filter((r) => Date.now() - r.at < 864e5).length;
  const REC_LIMIT = 5, MIN_TEXT = 40;

  // Рекомендовать знакомого
  function sheetRecommend(id, catId) {
    const prefer = G.catsOf(id);
    const f = { cat: catId || prefer[0] || '', rel: '', text: '', allCats: !prefer.length };
    const existing = () => G.recsFrom(S.me).find((r) => r.to === id && r.cat === f.cat);
    const fillFromExisting = () => { const e = existing(); if (e) { f.text = e.text; f.rel = e.rel; } };
    fillFromExisting();
    openSheet({
      F: f,
      onSet: (k) => { if (k === 'cat') { f.text = ''; f.rel = ''; fillFromExisting(); } },
      valid: () => f.cat && f.rel && f.text.trim().length >= MIN_TEXT && (existing() || recsToday() < REC_LIMIT),
      render: () => {
        const e = existing();
        const limit = !e && recsToday() >= REC_LIMIT;
        return `${sheetHead(id, 'Рекомендовать', esc(U(id).name))}
          ${catChips(f, prefer)}${relChips(f)}
          <label class="field"><span>Почему рекомендуете</span><textarea class="textarea" data-bind="text" maxlength="600" placeholder="Что человек сделал, как работал, какой был результат. Например: «Сделал логотип за неделю, сам предложил три варианта»">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="${MIN_TEXT}"></p></label>
          ${e ? `<div class="note">Вы уже рекомендовали в этой области ${when(e.at)}. Изменения сохранятся с пометкой «изменена» — старую версию мы храним.</div>` : ''}
          ${limit ? `<div class="warn">${ic('alert')}<div>Сегодня вы уже дали ${REC_LIMIT} рекомендаций. Лимит защищает сеть от накруток — продолжить можно завтра.</div></div>` : ''}
          <div class="note">Рекомендация подписана вашим именем, и её видят все. Звёзд здесь нет — только ваши слова.</div>
          <div class="s-foot"><button class="btn primary block" data-act="submitRec" data-id="${id}" data-submit>${ic('seal')}${e ? 'Сохранить изменения' : 'Отправить рекомендацию'}</button></div>`;
      },
      submit: () => {
        const e = existing();
        closeSheet();
        mutate(() => {
          if (e) { (e.history = e.history || []).push({ text: e.text, rel: e.rel, at: e.at }); e.text = f.text.trim(); e.rel = f.rel; e.edited = true; }
          else S.recs.push({ id: 'r' + uid(), from: S.me, to: id, cat: f.cat, rel: f.rel, text: f.text.trim(), at: Date.now(), confirmed: false });
        }, '/recommendations', { to: id, cat: f.cat, rel: f.rel, text: f.text.trim() },
          e ? 'Рекомендация обновлена' : `Готово. ${U(id).name.split(' ')[0]} получит уведомление в Telegram`);
      },
    });
  }

  // Поделиться человеком
  function sheetShare(id) {
    const f = { to: [], note: '' };
    openSheet({
      F: f,
      valid: () => f.to.length > 0,
      render: () => `${sheetHead(id, 'Поделиться контактом', esc(U(id).name) + ' · ' + esc(who(id)))}
        <div class="field"><span>Кому</span>${myContacts().filter((c) => c !== id).map((c) => `<button class="pick ${f.to.includes(c) ? 'on' : ''}" data-act="toggle" data-k="to" data-v="${c}">${av(c, 's')}<span class="grow"><span class="h3 ellip" style="display:block">${esc(U(c).name)}</span><span class="small muted">${esc(who(c))}</span></span><span class="radio"></span></button>`).join('')}</div>
        <label class="field"><span>Пара слов, необязательно</span><input class="input" data-bind="note" maxlength="160" placeholder="Например: скажи, что от меня" value="${esc(f.note)}"></label>
        <div class="note">Получатель увидит, что контакт прислали вы, и цепочку до этого человека.</div>
        <div class="s-foot"><div class="btn-row"><button class="btn ghost" data-act="tgShare" data-id="${id}">${ic('send')}В Telegram</button><button class="btn primary" data-act="submitShare" data-submit>Отправить</button></div></div>`,
      submit: () => {
        const to = [...f.to];
        closeSheet();
        mutate(() => to.forEach((x) => S.shares.push({ id: 's' + uid(), from: S.me, to: x, person: id, note: f.note.trim(), at: Date.now() })),
          '/shares', { person: id, to, note: f.note.trim() },
          to.length === 1 ? `Отправлено: ${U(to[0]).name}` : `Отправлено ${pl(to.length, 'человеку', 'людям', 'людям')}`);
      },
    });
  }

  // Попросить знакомство через общего знакомого
  function sheetIntro(id, catId, viaForced) {
    const t = G.trust(id, catId);
    const chain = viaForced ? [S.me, viaForced, id] : t.chain;
    const via = chain[1];
    const f = { text: '' };
    openSheet({
      F: f,
      valid: () => f.text.trim().length >= 10,
      render: () => `${sheetHead(null, 'Попросить знакомство', 'Через: ' + esc(U(via).name))}
        <div class="card" style="box-shadow:none;background:var(--card-2);margin-top:12px">${chainBig(chain, viaForced || t.via, catId)}</div>
        <label class="field"><span>Коротко о задаче</span><textarea class="textarea" data-bind="text" maxlength="400" placeholder="Например: нужен логотип и вывеска для кофейни, бюджет обсуждаем">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="10"></p></label>
        <div class="note"><b>${esc(U(via).name)}</b> увидит вашу просьбу и решит, знакомить ли. ${esc(U(id).name)} получит ваш профиль только после этого — так никто не получает холодных сообщений.</div>
        <div class="s-foot"><button class="btn primary block" data-act="submitIntro" data-submit>${ic('hand')}Отправить просьбу</button></div>`,
      submit: () => {
        const text = f.text.trim();
        closeSheet();
        mutate(() => {
          const x = { id: 'i' + uid(), from: S.me, via, to: id, cat: catId, text, status: 'wait', at: Date.now() };
          S.intros.push(x);
          setTimeout(() => { x.status = 'ok'; commit(); toast('Знакомство одобрено — можно написать: ' + U(id).name.split(' ')[0]); }, 5000);
        }, '/intros', { to: id, via, cat: catId || null, text }, 'Просьба отправлена: ' + U(via).name);
      },
    });
  }

  // Посоветовать человека в ответ на запрос
  function sheetAnswer(qid) {
    const q = S.requests.find((x) => x.id === qid);
    const cands = myContacts().filter((c) => c !== q.from)
      .map((c) => ({ id: c, fit: G.catsOf(c).includes(q.cat), mine: G.recsFrom(S.me).some((r) => r.to === c && r.cat === q.cat) }))
      .sort((a, b) => (b.mine - a.mine) || (b.fit - a.fit) || U(a.id).name.localeCompare(U(b.id).name));
    const f = { person: '', text: '', asRec: true };
    openSheet({
      F: f,
      valid: () => f.person && f.text.trim().length >= 20,
      render: () => {
        const c = cands.find((x) => x.id === f.person);
        const canRec = c && !c.mine;
        return `${sheetHead(q.from, 'Посоветовать', esc(U(q.from).name) + ' ищет: ' + esc(cat(q.cat).who.toLowerCase()))}
          <div class="note" style="font-size:14px;color:var(--ink)">«${esc(q.text)}»</div>
          <div class="field"><span>Кого советуете</span>${cands.map((x) => `<button class="pick ${f.person === x.id ? 'on' : ''}" data-act="set" data-k="person" data-v="${x.id}">${av(x.id, 's')}<span class="grow"><span class="h3 ellip" style="display:block">${esc(U(x.id).name)}</span><span class="small muted">${x.mine ? 'Вы уже рекомендуете' : esc(who(x.id))}</span></span>${x.fit ? `<span class="tag brand">${esc(cat(q.cat).who)}</span>` : ''}<span class="radio"></span></button>`).join('')}</div>
          <label class="field"><span>Почему этот человек</span><textarea class="textarea" data-bind="text" maxlength="400" placeholder="Например: чинил мне часы в прошлом году, взял недорого и сделал за три дня">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="20"></p></label>
          ${canRec ? `<button class="pick ${f.asRec ? 'on' : ''}" data-act="set" data-k="asRec" data-v="${f.asRec ? '' : '1'}"><span class="grow"><span class="h3" style="display:block">Сохранить и как рекомендацию</span><span class="small muted">Появится в профиле ${esc(U(f.person).name.split(' ')[0])} в области «${esc(cat(q.cat).name)}»</span></span><span class="radio"></span></button>` : ''}
          <button class="btn ghost block" style="margin-top:12px" data-act="outsider" data-cat="${q.cat}">Нужного человека нет в Сарафане</button>
          <div class="s-foot"><button class="btn primary block" data-act="submitAnswer" data-submit>${ic('send')}Отправить ответ</button></div>`;
      },
      submit: () => {
        const person = f.person, text = f.text.trim(), asRec = !!f.asRec;
        const c = cands.find((x) => x.id === person);
        closeSheet();
        mutate(() => {
          q.answers.push({ from: S.me, person, text, at: Date.now() });
          if (asRec && c && !c.mine && text.length >= 20)
            S.recs.push({ id: 'r' + uid(), from: S.me, to: person, cat: q.cat, rel: 'other', text, at: Date.now(), confirmed: false });
        }, '/answers', { request: q.id, person, text, as_rec: asRec }, 'Ответ отправлен: ' + U(q.from).name);
      },
    });
  }

  // Рекомендовать человека, которого ещё нет в сети
  function sheetOutsider(catId) {
    const f = { name: '', cat: catId || '', rel: '', text: '', allCats: true, done: null };
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2 && f.cat && f.rel && f.text.trim().length >= MIN_TEXT,
      render: () => {
        if (f.done) {
          const link = `t.me/${S.bot || 'sarafanibot'}?start=${f.done.code}`;
          return `${sheetHead(null, 'Осталось отправить ссылку', esc(f.done.name) + ' · ' + esc(cat(f.done.cat).who))}
            <div class="invite-card" style="margin-top:12px"><div class="small" style="opacity:.8">По этой ссылке ${esc(f.done.name)} войдёт в Сарафан и сразу увидит вашу рекомендацию.</div><div class="link-box">${ic('link').replace('<svg', '<svg style="width:18px;height:18px;flex:none;opacity:.7"')}<span>${link}</span></div>
            <div class="btn-row"><button class="btn sm" data-act="tgSend" data-text="${esc(`${f.done.name}, я рекомендую вас в Сарафане — это сеть, где нужных людей находят через знакомых. Заберите профиль:`)}" data-url="https://${link}">${ic('send')}Отправить</button><button class="btn ghost sm" data-act="copy" data-v="https://${link}">${ic('copy')}Скопировать</button></div></div>
            <div class="note">Когда ${esc(f.done.name)} примет приглашение, вы станете первым контактом, а рекомендация появится в профиле.</div>
            <div class="s-foot"><button class="btn ghost block" data-act="closeSheet">Готово</button></div>`;
        }
        return `${sheetHead(null, 'Рекомендовать того, кого здесь нет', 'Например, человека, который про Сарафан ещё не знает')}
          <label class="field"><span>Имя</span><input class="input" data-bind="name" maxlength="40" placeholder="Например: Рустам" value="${esc(f.name)}"></label>
          ${catChips(f, [])}${relChips(f)}
          <label class="field"><span>Почему рекомендуете</span><textarea class="textarea" data-bind="text" maxlength="600" placeholder="Что человек сделал и почему вы ему доверяете">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="${MIN_TEXT}"></p></label>
          <div class="s-foot"><button class="btn primary block" data-act="submitOutsider" data-submit>Получить ссылку-приглашение</button></div>`;
      },
      submit: async () => {
        const p = { id: 'p' + uid(), name: f.name.trim(), cat: f.cat, rel: f.rel, text: f.text.trim(), code: 'r-' + uid(), at: Date.now() };
        if (LIVE) {
          try {
            const res = await window.API.post('/recommendations/outside', { name: p.name, cat: p.cat, rel: p.rel, text: p.text });
            p.code = res.code;
          } catch (e) { toast(e.message); return; }
        } else {
          S.pendingInvites.push(p); save();
        }
        f.done = p; drawSheet();
      },
      onClose: () => commit(),
    });
  }

  // Быстрая карточка человека с орбиты
  function sheetPeek(id) {
    const cats = G.catsOf(id);
    const c = cats[0];
    const t = G.trust(id, c);
    const rep = c ? G.reputation(id, c) : null;
    const direct = G.connected(S.me, id);
    openSheet({
      F: {},
      render: () => `${sheetHead(null, esc(U(id).name), esc(who(id)) + ' · ' + esc(U(id).city))}
        <div style="margin-top:14px">${chainLine(t.chain || [])}</div>
        ${rep && rep.count ? `<div class="stat-grid" style="margin-top:14px"><div class="stat"><b>${rep.count}</b><span>${plural(rep.count, 'рекомендация', 'рекомендации', 'рекомендаций')}</span></div><div class="stat"><b>${rep.independent}</b><span>${plural(rep.independent, 'независимый источник', 'независимых источника', 'независимых источников')}</span></div><div class="stat"><b>${(G.adj[id] || new Set()).size}</b><span>${plural((G.adj[id] || new Set()).size, 'связь', 'связи', 'связей')}</span></div></div>` : '<div class="note">Рекомендаций пока нет — этот человек просто в вашей сети.</div>'}
        ${rep && rep.recs.length ? `<div class="note" style="color:var(--ink)">«${esc(rep.recs[0].text)}»<div class="tiny muted" style="margin-top:6px">${esc(full(rep.recs[0].from))} · ${esc(cat(rep.recs[0].cat).name)}</div></div>` : ''}
        <div class="s-foot"><div class="btn-row">
          <button class="btn ghost" data-act="closeSheet" data-go="#/p/${id}">Профиль</button>
          ${direct ? `<button class="btn primary" data-act="recommend" data-id="${id}" data-cat="${c || ''}">${ic('seal')}Рекомендовать</button>`
            : t.chain && t.chain.length > 2 ? `<button class="btn primary" data-act="intro" data-id="${id}" data-cat="${c || ''}">${ic('hand')}Знакомство</button>`
              : `<button class="btn primary" data-act="share" data-id="${id}">${ic('share')}Поделиться</button>`}
        </div></div>`,
    });
  }

  // Изменить свой профиль
  function sheetEditMe() {
    const me = U(S.me);
    const f = { name: me.name, about: me.about, cats: [...me.cats], role: me.role || 'both' };
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2,
      render: () => `${sheetHead(null, 'Профиль')}
        <label class="field"><span>Имя</span><input class="input" data-bind="name" maxlength="40" value="${esc(f.name)}"></label>
        <div class="field"><span>Здесь я</span><div class="chips">${[['client', 'Ищу людей'], ['pro', 'Помогаю сам'], ['both', 'И то и другое']].map(([k, l]) => `<button class="chip ${f.role === k ? 'on' : ''}" data-act="set" data-k="role" data-v="${k}">${l}</button>`).join('')}</div></div>
        ${f.role === 'client' ? '' : `<div class="field"><span>Чем занимаетесь</span><div class="chips">${S.cats.map((c) => `<button class="chip ${f.cats.includes(c.id) ? 'on' : ''}" data-act="toggle" data-k="cats" data-v="${c.id}">${esc(c.who)}</button>`).join('')}</div></div>`}
        <label class="field"><span>О себе</span><textarea class="textarea" data-bind="about" maxlength="300">${esc(f.about)}</textarea></label>
        <div class="s-foot"><button class="btn primary block" data-act="submitEdit" data-submit>Сохранить</button></div>`,
      submit: () => {
        const body = { name: f.name.trim(), about: f.about.trim(), role: f.role, cats: f.role === 'client' ? [] : f.cats };
        closeSheet();
        mutate(() => Object.assign(me, { name: body.name, about: body.about, cats: body.cats, role: body.role }),
          '/profile', body, 'Сохранено');
      },
    });
  }

  // ——— Всплывашка ———
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2800);
  }
  const tgShareLink = (url, text) => {
    const u = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg) tg.openTelegramLink(u); else toast('В Telegram откроется выбор чата, куда отправить ссылку');
  };

  // ——— Действия ———
  const ACT = {
    goto: (d) => go(d.h),
    back: () => (history.length > 1 ? history.back() : go('#/')),
    closeSheet: (d) => { const s = SH; closeSheet(); if (s && s.onClose) s.onClose(); if (d && d.go) go(d.go); },
    peek: (d) => sheetPeek(d.id),
    set: (d) => {
      const v = d.v === '1' ? true : d.v === '' ? false : d.v;
      SH.F[d.k] = v; if (SH.onSet) SH.onSet(d.k); drawSheet();
    },
    toggle: (d) => { const a = SH.F[d.k]; const i = a.indexOf(d.v); i < 0 ? a.push(d.v) : a.splice(i, 1); drawSheet(); },
    // Поиск
    filter: (d) => { F.f = d.v; $('#results').innerHTML = searchResults(); },
    clearCat: () => { F.c = ''; history.replaceState(null, '', '#/search'); lastHash = location.hash; render(); },
    clearSearch: () => { F.q = ''; F.c = ''; F.f = 'all'; history.replaceState(null, '', '#/search'); lastHash = location.hash; render(); $('[data-bind=q]').focus(); },
    // Профиль
    rc: (d) => { F.rc = d.v; F.more = false; render(); },
    more: () => { F.more = true; render(); },
    recommend: (d) => sheetRecommend(d.id, d.cat),
    submitRec: () => SH.submit(),
    share: (d) => sheetShare(d.id),
    submitShare: () => SH.submit(),
    tgShare: (d) => tgShareLink(`https://t.me/${S.bot || 'sarafanibot'}/app?startapp=p_${d.id}_from_${S.me}`, `${U(d.id).name} — ${who(d.id)}. Рекомендую, посмотри в Сарафане:`),
    tgSend: (d) => tgShareLink(d.url, d.text),
    intro: (d) => sheetIntro(d.id, d.cat, d.via),
    submitIntro: () => SH.submit(),
    write: (d) => toast(tg ? 'Откроем чат в Telegram' : `В рабочей версии откроется чат с ${U(d.id).name.split(' ')[0]} в Telegram`),
    addConn: (d) => mutate(() => {
      S.conns.push({ a: S.me, b: d.id, status: 'pending', at: Date.now() });
      setTimeout(() => { const c = S.conns.find((x) => x.a === S.me && x.b === d.id); if (c) { c.status = 'ok'; commit(); toast(U(d.id).name + ' теперь в вашей сети'); } }, 4000);
    }, '/connections/ask', { user: d.id }, 'Заявка отправлена'),
    introYes: (d) => mutate(() => { const i = S.intros.find((x) => x.id === d.id); if (i) i.status = 'ok'; },
      '/intros/decide', { id: d.id, ok: true }, 'Знакомство состоялось — оба получат уведомление'),
    introNo: (d) => mutate(() => { const i = S.intros.find((x) => x.id === d.id); if (i) i.status = 'no'; },
      '/intros/decide', { id: d.id, ok: false }, 'Отказали. Человек об этом не узнает'),
    acceptConn: (d) => mutate(() => { const c = S.conns.find((x) => x.a === d.id && x.b === S.me); c.status = 'ok'; c.at = Date.now(); },
      '/connections/accept', { user: d.id }, U(d.id).name + ' теперь в вашей сети'),
    declineConn: (d) => mutate(() => { S.conns = S.conns.filter((x) => !(x.a === d.id && x.b === S.me && x.status === 'pending')); },
      '/connections/decline', { user: d.id }, 'Заявка отклонена. Человек об этом не узнает'),
    // Запросы
    askCat: (d) => { F.cat = d.v; F.catTouched = true; F.allCats = false; $('#askcats').innerHTML = askCats(); syncForm(); },
    askAllCats: () => { F.allCats = true; $('#askcats').innerHTML = askCats(); },
    postAsk: async () => {
      const text = F.t.trim(), cat = F.cat;
      if (LIVE) {
        try {
          const res = await window.API.post('/requests', { text, cat });
          await refresh();
          go('#/q/' + res.id);
          toast('Запрос отправлен ' + pl(myContacts().length, 'человеку', 'людям', 'людям'));
        } catch (e) { toast(e.message); }
        return;
      }
      const q = { id: 'q' + uid(), from: S.me, cat: F.cat, text: F.t.trim(), at: Date.now(), answers: [] };
      S.requests.push(q); commit(); go('#/q/' + q.id);
      toast('Запрос отправлен ' + pl(myContacts().length, 'человеку', 'людям', 'людям'));
      // В демо кто-нибудь из знакомых отвечает через несколько секунд
      const helper = myContacts().map((c) => ({ c, p: [...(G.adj[c] || [])].find((x) => x !== S.me && G.catsOf(x).includes(q.cat)) })).find((x) => x.p);
      if (helper) setTimeout(() => {
        q.answers.push({ from: helper.c, person: helper.p, text: 'Знаю хорошего человека, обращался сам. Скажите, что от меня.', at: Date.now() });
        commit(); toast('Новый ответ на ваш запрос: ' + U(helper.c).name);
      }, 6000);
    },
    answer: (d) => sheetAnswer(d.id),
    submitAnswer: () => SH.submit(),
    skipReq: (d) => mutate(() => { const q = S.requests.find((x) => x.id === d.id); (q.skip = q.skip || []).push(S.me); },
      '/requests/skip', { request: d.id }, 'Скрыли. Спасибо, что честно'),
    thank: (d) => mutate(() => { const q = S.requests.find((x) => x.id === d.q); q.answers[+d.i].thanked = true; },
      '/answers/thank', { request: d.q, index: +d.i }, 'Спасибо отправлено — это укрепит репутацию советчика'),
    closeReq: (d) => mutate(() => { S.requests.find((x) => x.id === d.id).closed = true; },
      '/requests/close', { request: d.id }, 'Запрос закрыт'),
    // Сеть
    tab: (d) => { F.tab = d.v; render(); },
    sendInvite: () => tgShareLink(`https://t.me/${S.bot || 'sarafanibot'}?start=${S.invite.code}`, 'Зову тебя в Сарафан — здесь находят нужных людей через знакомых.'),
    copy: (d) => { try { navigator.clipboard.writeText(d.v).then(() => toast('Ссылка скопирована'), () => toast(d.v)); } catch (e) { toast(d.v); } },
    outsider: (d) => sheetOutsider(d.cat),
    submitOutsider: () => SH.submit(),
    editMe: () => sheetEditMe(),
    submitEdit: () => SH.submit(),
    resetDemo: () => {
      if (LIVE) { refresh(); toast('Обновлено'); return; }
      try { localStorage.removeItem(KEY); } catch (e) { /* */ }
      S = window.buildSeed(); G = window.Graph(S); location.hash = '#/'; render(); toast('Демо начато заново');
    },
    // Первый вход
    toggleCat: (d) => { const i = F.cats.indexOf(d.v); i < 0 ? F.cats.push(d.v) : F.cats.splice(i, 1); render(); },
    finishOnb: () => {
      const me = U(S.me);
      const body = { name: F.name.trim(), about: me.about || '', role: F.cats.length ? 'both' : 'client', cats: F.cats };
      const hello = me.invitedBy ? U(me.invitedBy).name + ' — ваш первый контакт' : 'Добро пожаловать';
      mutate(() => { me.name = body.name; me.cats = F.cats; S.onboarded = true; }, '/profile', body, hello)
        .then(() => go('#/'));
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SH) ACT.closeSheet();
    if (e.key === 'Enter' && e.target.matches('[role=link]')) e.target.click();
  });
  document.addEventListener('input', (e) => {
    const k = e.target.dataset.bind;
    if (!k) return;
    const inSheet = !!e.target.closest('#sheet');
    (inSheet ? SH.F : F)[k] = e.target.value;
    if (!inSheet && k === 'q') {
      history.replaceState(null, '', '#/search' + (F.q ? '?q=' + encodeURIComponent(F.q) : '') + (F.c ? (F.q ? '&' : '?') + 'c=' + F.c : ''));
      lastHash = location.hash; F.f = 'all';
      $('#results').innerHTML = searchResults();
    }
    if (!inSheet && k === 't') $('#askcats').innerHTML = askCats();
    syncForm();
  });
  window.addEventListener('hashchange', () => { if (SH) closeSheet(); render(); });

  if (LIVE) {
    $('#app').innerHTML = '<div class="empty" style="padding-top:38vh"><p class="muted">Открываем вашу сеть…</p></div>';
    refresh().catch((e) => {
      if (!e.status) {  // сервера нет рядом — показываем демо, чтобы ссылка не была мёртвой
        S = load(); G = window.Graph(S); S.onboarded = true; render();
        toast('Сервер недоступен — показываю демо на выдуманных людях');
        return;
      }
      $('#app').innerHTML = `<div class="empty" style="padding-top:26vh"><h2 class="h2">${e.status === 403 ? 'Сюда только по приглашению' : 'Не получилось открыть сеть'}</h2>`
        + `<p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Попробовать снова</button></div>`;
    });
  } else {
    render();
  }
})();
