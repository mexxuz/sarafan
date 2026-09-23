(function () {
  'use strict';
  const KEY = 'sarafan-demo-v1';
  const qs = new URLSearchParams(location.search);
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  if (tg) {
    tg.ready(); tg.expand();
    // во весь экран: Telegram рисует свои кнопки поверх — отступаем от них и перерисовываем значок
    try {
      tg.onEvent('fullscreenChanged', () => { document.documentElement.classList.toggle('tg-full', !!tg.isFullscreen); if (typeof render === 'function') render(); });
      tg.onEvent('fullscreenFailed', () => { if (typeof toast === 'function') toast('Telegram не дал развернуть окно'); });
      if (tg.isFullscreen) document.documentElement.classList.add('tg-full');
    } catch (e) { /* старый Telegram */ }
    // потянули вниз у верхнего края — Telegram не должен сворачивать приложение: это читалось как «отскок»
    try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) { /* старый Telegram */ }
  }

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
  let lastPulse = '', pulseTimer = null, missedWhileBusy = false;

  const refresh = async () => {
    S = await window.API.bootstrap();
    S.pendingInvites = S.pendingInvites || [];
    G = window.Graph(S);
    render();
    lastPulse = '';   // только что всё перечитали — отпечаток запомним заново
  };

  // ——— Само обновляется ———
  // Раз в несколько секунд спрашиваем у сервера короткий отпечаток состояния сети.
  // Изменился — перечитываем всё. Человеку не нужно дёргать страницу руками.
  const busyNow = () => {
    if (document.hidden) return true;
    if (SH) return true;                                   // открыта шторка — человек пишет
    const el = document.activeElement;
    return !!(el && el.matches && el.matches('input, textarea'));
  };

  const checkPulse = async () => {
    if (!LIVE) return;
    if (busyNow()) { missedWhileBusy = true; return; }
    try {
      const r = await window.API.pulse();
      if (!lastPulse) { lastPulse = r.v; return; }
      if (r.v !== lastPulse) { lastPulse = r.v; await refresh(); }
    } catch (e) { /* сервер недоступен — попробуем в следующий раз */ }
  };

  const watchLive = () => {
    if (!LIVE) return;
    clearInterval(pulseTimer);
    pulseTimer = setInterval(checkPulse, 7000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPulse(); });
    window.addEventListener('focus', checkPulse);
    checkPulse();
  };
  // Действие: в демо меняем данные на месте, вживую — просим сервер и перечитываем
  const mutate = async (demoFn, path, body, okMsg) => {
    if (!LIVE) { demoFn && demoFn(); commit(); if (okMsg) toast(okMsg); return; }
    try {
      await window.API.post(path, body);
      await refresh();
      if (SH && SH._stale) { SH._stale = false; drawSheet(); }
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
  // Создатель сети: в профиле — золотая рамка со звёздочкой, как в облаке, и строка под именем
  const isFounder = (id) => (S.founders || []).includes(id);
  const founderAv = (id, size, ring = '') => (isFounder(id)
    ? `<span class="founder-av">${av(id, size, 'founder')}<svg class="founder-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg></span>`
    : av(id, size, ring));
  const founderTag = (id) => (isFounder(id) ? '<div class="founder-tag">Основатель, разработчик и просто хороший человек</div>' : '');
  // живая аватарка — только в крупных портретах: в списках десятки роликов разом тяжелы для телефона
  const video = (id) => (U(id) && U(id).video ? srvUrl(U(id).video) : '');
  const av = (id, size = '', ring = '') => `<span class="av ${size} ${ring} ${id === S.me ? 'mine' : ''}" style="--h:${hue(id)}" aria-hidden="true">${esc(initials(id))}${photo(id) ? `<img src="${photo(id)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${video(id) && (size === 'xl' || size === 'l') ? `<video src="${esc(video(id))}" autoplay muted loop playsinline preload="auto"></video>` : ''}</span>`;
  const ringOf = (id) => { const d = G.dist[id]; return d === 1 ? 'r1' : d === 2 ? 'r2' : d === undefined ? '' : 'r3'; };

  // Примеры занятий на свободных местах орбиты — показывают, кого тут находят
  const GHOST_IN = ['Юрист', 'Педиатр', 'Бухгалтер', 'Репетитор', 'Психолог', 'Программист'];
  const GHOST_OUT = ['Стоматолог', 'Фотограф', 'Риелтор', 'Автомеханик', 'Дизайнер', 'Кардиолог',
                     'Маркетолог', 'Электрик', 'Кондитер'];

  // ——— Орбита: вы в центре, ваши контакты рядом, их знакомые дальше ———
  // Живые люди и свободные места стоят на одном круге, поделённом поровну,
  // и плывут вместе: ближний круг в одну сторону, дальний — в другую.
  const orbit = (o) => {
    const box = Math.min(o.size || 320, window.innerWidth - (o.big ? 76 : 44), 400);
    const inner = o.inner || [], outer = o.outer || [];
    let k = 0;

    const ring = (ids, ghostCount, rPct, size, cls, withLabel) => {
      const slots = Math.max(ids.length, ghostCount || 0);
      if (!slots) return '';
      const roles = cls === 'in' ? GHOST_IN : GHOST_OUT;
      const step = 360 / slots;
      const r = Math.round(box * rPct);
      let out = '';
      for (let i = 0; i < slots; i++) {
        const a = -90 + step * i + (cls === 'out' ? step / 2 : 0);
        const pos = `--a:${a}deg;--r:${r}px`;
        if (i < ids.length) {
          const id = ids[i];
          out += `<button class="orb ${cls} ${o.dim && o.dim !== cls ? 'dim' : ''}" style="${pos};--i:${k++}"
            data-act="peek" data-id="${id}" aria-label="${esc(U(id).name)}"><span class="orb-in">
            ${av(id, size, cls === 'in' ? 'r1' : 'r2')}${withLabel ? `<i>${esc(first(id))}</i>` : ''}</span></button>`;
        } else {
          const role = roles[(i - ids.length) % roles.length];
          out += `<span class="orb ghost ${cls}" style="${pos}"><span class="orb-in">
            <span class="ghost-av ${size}">${ic('user')}</span><i class="ghost-tip">${esc(role)}</i></span></span>`;
        }
      }
      return out;
    };

    const g = o.ghost || {};
    return `<div class="orbit" style="width:${box}px;height:${box}px">
      <div class="ring r-in"></div><div class="ring r-out"></div>
      <div class="spin slow">${ring(inner, g.inner, 0.295, o.big ? 's' : 'xs', 'in', o.labels !== false)}</div>
      <div class="spin rev">${ring(outer, g.outer, 0.47, 'xs', 'out', !!o.big)}</div>
      <div class="core">${av(S.me, 'l', 'r1')}${o.cap ? `<span class="cap">${esc(o.cap)}</span>` : ''}</div></div>`;
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

  const REL = { client: 'Опыт клиента', together: 'Работали вместе', team: 'Через сотрудника', colleague: 'Коллеги по цеху', friend: 'Знаю лично', other: 'Другое' };
  const circleName = (c) => (c === 0 ? 'Это вы' : c === 1 ? 'Ваш контакт'
    : c === 2 ? 'Через вашего знакомого' : c === 3 ? 'В двух шагах от вас' : 'Вне вашей сети');
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
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    tag: '<path d="M3.5 12.2 11.8 4h7.7v7.7l-8.3 8.3a1.5 1.5 0 0 1-2.1 0l-5.6-5.7a1.5 1.5 0 0 1 0-2.1z"/><circle cx="15.5" cy="8" r="1.4"/>',
    shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    send: '<path d="M4 11.5 20 4l-7.5 16-2.3-6.2z"/><path d="m10.2 13.8 4.3-4.3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3A2 2 0 0 1 18 19.5 15.5 15.5 0 0 1 4.5 6 2 2 0 0 1 6.5 4z"/>',
    chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    seal: '<path d="M12 3.2 19 6v5.5c0 4.2-2.8 7.6-7 9.3-4.2-1.7-7-5.1-7-9.3V6z"/><path d="m8.8 12.1 2.3 2.3 4.1-4.4"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    pin: '<path d="M12 22c0 0 8-7.2 8-12.4A8 8 0 1 0 4 9.6C4 14.8 12 22 12 22z"/><circle cx="12" cy="9.6" r="3"/>',
    bell: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-1.6 2.2c-.3.4 0 .9.5.9h14.2c.5 0 .8-.5.5-.9z"/><path d="M10 21h4"/>',
    spark: '<path d="M12 3v4M12 17v4M4.9 7.5l2.8 2.8M16.3 13.7l2.8 2.8M3 12h4M17 12h4M4.9 16.5l2.8-2.8M16.3 10.3l2.8-2.8"/>',
    house: '<path d="M3 21h18"/><path d="M6 21V4.5a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1V21"/><path d="M14.5 21V9.5H18a1 1 0 0 1 1 1V21"/><path d="M9 7.5h2.5M9 11h2.5M9 14.5h2.5"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    cam: '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.8l1.3-2h6.8l1.3 2h2.8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>',
    dots3: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.1L4 15.5a1.5 1.5 0 0 1 2.2-2L7 14.3"/>',
  };
  const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  // Тот же знак, что на значке приложения и на аватарке бота: вы в центре, трое вокруг
  const logoMark = `<svg class="logo-mark" viewBox="0 -8 120 120" aria-hidden="true" fill="none">
    <g stroke="var(--blue)" stroke-opacity=".38" stroke-width="7" stroke-linecap="round">
      <path d="M60 45V31"/><path d="M47.6 68.5 35.4 76.9"/><path d="M72.4 68.5 84.6 76.9"/></g>
    <circle cx="60" cy="60" r="16" fill="var(--blue)"/>
    <g stroke="var(--blue)" stroke-width="7" fill="none">
      <circle cx="60" cy="22" r="9"/><circle cx="28" cy="82" r="9"/><circle cx="92" cy="82" r="9"/></g></svg>`;

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
        : isRec ? (prevId === S.me ? 'вы его рекомендуете' : `${esc(first(prevId))} рекомендует${catId ? ' · ' + esc(cat(catId).who.toLowerCase()) : ''}`)
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

  // Ссылка из чата: «код-приглашения_p12». До черты — вход в сеть, после — чья карточка.
  // Человек пришёл не «в приложение», а к конкретному человеку — туда и ведём.
  const startParam = () => String((tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param)
    || qs.get('startapp') || qs.get('tgWebAppStartParam') || qs.get('code') || '');
  let pendingLanding = startParam();
  // по ссылке мастера человек пришёл написать одну фразу — демо ему сейчас ни к чему
  if (pendingLanding.startsWith('a-')) { try { localStorage.setItem('sarafan.tour', '1'); } catch (e) { /* приватный режим */ } }
  function applyLanding() {
    const raw = pendingLanding;
    if (!raw || !S || !S.onboarded) return false;
    pendingLanding = '';
    if (raw.startsWith('a-')) { go('#/rec/' + raw.split('_')[0]); return true; }
    const legacy = raw.match(/^([poq])_(\d+)/);
    const tail = legacy ? legacy[1] + legacy[2] : (raw.split('_')[1] || '');
    const m = tail.match(/^([poq])(\d+)$/);
    if (!m) return false;
    go(`#/${m[1]}/${m[2]}`);
    return true;
  }
  let F = {}; // состояние форм на странице
  let lastHash = null;

  let navBack = false;   // человек нажал «Назад» — экран должен уехать в другую сторону
  function render() {
    const { path, params } = route();
    const hashChanged = location.hash !== lastHash;
    if (hashChanged) { F = {}; lastHash = location.hash; }
    let html, nav = true, active = '';
    const [name, id] = path;
    let seenTour = true;
    try { seenTour = !!localStorage.getItem('sarafan.tour'); } catch (e) { /* приватный режим */ }
    if (!S.onboarded && name !== 'start' && (name === 'tour' || !seenTour)) { html = Tour(); nav = false; }
    else if (!S.onboarded) { html = Onboarding(); nav = false; }
    else if (name === 'search') { html = Search(params); active = 'search'; }
    else if (name === 'p' && id && U(id)) {
      if (id === S.me) { go('#/me'); return; }
      html = Profile(id, params); nav = false;
    }
    else if (name === 'ask') { html = Ask(); active = 'ask'; }
    else if (name === 'q' && id) {
      html = Request(id); nav = false;
      // «Знаю кого» из сообщения бота: сразу открываем ответ, без лишних нажатий
      const rq = S.requests.find((x) => x.id === id);
      if (hashChanged && params.get('answer') && rq && rq.from !== S.me && !rq.answers.some((a) => a.from === S.me)) {
        setTimeout(() => sheetAnswer(id), 300);
      }
    }
    else if (name === 'draft' && id) {
      html = Home(); active = 'home';
      if (hashChanged) setTimeout(() => { history.replaceState(null, '', '#/'); lastHash = location.hash; sheetOutsider('', id); }, 300);
    }
    else if (name === 'rec' && id) {
      html = Home(); active = 'home';
      if (hashChanged) setTimeout(() => { history.replaceState(null, '', '#/'); lastHash = location.hash; sheetAskRec(id); }, 300);
    }
    else if (name === 'net') { html = Network(params); active = 'net'; }
    else if (name === 'new') { html = News(); active = 'new'; }
    else if (name === 'o' && id) { html = Node(id); nav = false; }
    else if (name === 'map') { html = CloudScreen(); active = 'net'; }
    else if (name === 'tour') { html = Tour(); nav = false; }
    else if (name === 'start') { html = Onboarding(); nav = false; }
    else if (name === 'me') { html = Me(params); active = 'me'; }
    else { html = Home(); active = 'home'; }
    const app = $('#app');
    // Вперёд экран приходит снизу, назад — уходит вправо: видно, куда двигаешься
    const enter = hashChanged ? (navBack ? 'fade-back' : 'fade-in') : '';
    navBack = false;
    app.innerHTML = `<div class="${enter}">${html}</div>`;
    app.classList.toggle('no-nav', !nav);
    // Нижняя полоса живёт в каркасе, а не внутри экрана: внутри она цеплялась
    // за анимацию появления и уезжала вместе с ней
    const bar = $('#actions');
    const inside = $('.actions', app);
    if (inside) {
      bar.innerHTML = inside.innerHTML;
      bar.hidden = false;
      inside.remove();
    } else {
      bar.hidden = true;
      bar.innerHTML = '';
    }
    drawNav(nav, active);
    drawFixBtn();
    if (hashChanged) window.scrollTo(0, 0);
    const af = $('[autofocus]', app); if (af && hashChanged) { af.focus(); const v = af.value; af.value = ''; af.value = v; }
    if (hashChanged) countUp(app);
    const np = $('#nodephoto', app);
    if (np) np.onchange = () => uploadPlacePhoto(np.files && np.files[0], np.dataset.node);
    wireRails(app);
    syncBackButton(active, nav);
    if (cloud) { cloud.stop(); cloud = null; }
    if (active === 'home' && S.onboarded) mountCloud('homecloud', 2, true, 12);
    if (name === 'map') mountCloud('bigcloud', 2, F.show !== 'people', 0, F.show === 'places');
    if ($('.tour', app)) mountTour(0); else clearTimeout(tourT);
  }

  // Жест «назад» на телефоне. Пока Telegram не видит своей кнопки возврата,
  // он считает, что возвращаться некуда, и просто сворачивает приложение.
  // Поэтому на каждом экране, кроме главной, кнопку показываем — тогда и жест,
  // и системная кнопка Android ведут на предыдущий экран.
  const goBack = () => {
    if (SH) { closeSheet(); return; }          // открыта шторка — «назад» закрывает её
    navBack = true;
    if (history.length > 1) history.back(); else go('#/');
  };
  function syncBackButton(active, nav) {
    if (!tg || !tg.BackButton) return;
    const home = !location.hash || location.hash === '#/' || (nav && active === 'home');
    try { home ? tg.BackButton.hide() : tg.BackButton.show(); } catch (e) { /* старое приложение Telegram */ }
  }
  if (tg && tg.onEvent) { try { tg.onEvent('backButtonClicked', goBack); } catch (e) { /* старое приложение */ } }

  // Ленты вбок: пальцем они листались всегда, а мышью — нет.
  // Колесо крутит ленту, пока она не упёрлась в край, и её же можно тянуть мышью.
  function wireRails(root) {
    root.querySelectorAll('.rail-x, .chips.scroll').forEach((el) => {
      if (el.dataset.rail) return;
      el.dataset.rail = '1';

      // Колёсико листает страницу, а не ленту: иначе, стоило курсору оказаться над лентой,
      // страница вставала. Вбок — перетаскиванием, тачпадом или Shift + колёсико.
      el.addEventListener('wheel', (e) => {
        if (!e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        const max = el.scrollWidth - el.clientWidth;
        if (max < 4) return;
        e.preventDefault();
        el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      }, { passive: false });

      let sx = 0, sl = 0, moved = 0, drag = false;
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag = true; moved = 0; sx = e.clientX; sl = el.scrollLeft;
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - sx;
        if (Math.abs(dx) > 3) {
          moved = Math.abs(dx);
          el.classList.add('dragging');
          el.scrollLeft = sl - dx;
        }
      });
      const drop = () => {
        drag = false;
        el.classList.remove('dragging');
        setTimeout(() => { moved = 0; }, 0);   // клик после протяжки не должен открывать карточку
      };
      el.addEventListener('pointerup', drop);
      el.addEventListener('pointerleave', drop);
      el.addEventListener('click', (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
  }

  // Числа в профиле набегают от нуля — видно, что за ними живые люди
  const calmMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(root) {
    if (calmMotion()) return;
    root.querySelectorAll('.stat b').forEach((el) => {
      const end = parseInt(el.textContent, 10);
      if (!Number.isFinite(end) || end < 2 || end > 999) return;
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 560);
        el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  let navHideT;
  function drawNav(show, active) {
    const n = $('#nav');
    clearTimeout(navHideT);
    if (!show) {
      n.classList.add('hide');
      navHideT = setTimeout(() => { if (n.classList.contains('hide')) n.hidden = true; }, 320);
      return;
    }
    n.hidden = false;
    requestAnimationFrame(() => n.classList.remove('hide'));
    const incoming = S.requests.filter((q) => q.from !== S.me && G.connected(q.from, S.me) && !q.answers.some((a) => a.from === S.me) && !(q.skip || []).includes(S.me)).length;
    const pendingIn = S.conns.filter(askedMe).length;
    const badges = { home: 0, search: 0, ask: incoming, net: pendingIn, new: todo() };
    // Меню собираем один раз, дальше только переключаем выбранный раздел и числа.
    // Раньше оно пересобиралось при каждом обновлении — подложка рождалась у левого края
    // и тянулась к кнопке: это и была «анимация растяжения».
    if (!n.querySelector('a[data-key]')) {
      const item = (key, href, icon, label) => `<a href="${href}" data-key="${key}" ${key === 'ask' ? 'class="ask" aria-label="Спросить свою сеть"' : ''}>${ic(icon)}<span>${label}</span><i class="badge" hidden></i></a>`;
      n.innerHTML = '<i class="pill" aria-hidden="true"></i>' +
        item('home', '#/', 'home', 'Главная') + item('search', '#/search', 'search', 'Поиск') + item('ask', '#/ask', 'ask', 'Спросить') +
        item('net', '#/net', 'net', 'Сеть') + item('new', '#/new', 'bell', 'Новое');
      n.querySelector('.pill').classList.add('still');   // первый раз встаёт на место без езды
    }
    n.querySelectorAll('a[data-key]').forEach((a) => {
      const k = a.dataset.key, on = k === active;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      const b = a.querySelector('.badge');
      b.hidden = !badges[k];
      if (badges[k] && b.textContent !== String(badges[k])) b.textContent = badges[k];
    });
    movePill(n);
    // меряем ещё раз, когда шрифт и подписи уже на месте — иначе подложка съезжает
    requestAnimationFrame(() => { movePill(n); requestAnimationFrame(() => { const pl = n.querySelector('.pill'); if (pl) pl.classList.remove('still'); }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(n));
  }

  // Подложка переезжает к выбранному разделу. Под круглой кнопкой «Спросить» её прячем
  function movePill(n) {
    const on = n.querySelector('a.on');
    const pill = n.querySelector('.pill');
    if (!pill) return;
    if (!on || on.classList.contains('ask')) { pill.style.setProperty('--pill', '0'); return; }
    pill.style.setProperty('--pill', '1');
    pill.style.setProperty('--w', on.offsetWidth - 8 + 'px');
    pill.style.setProperty('--x', on.offsetLeft + 4 + 'px');
  }
  window.addEventListener('resize', () => { const n = $('#nav'); if (n && !n.hidden) movePill(n); });

  // ——— Общие куски ———
  // Шапка экрана: всегда одной высоты, заголовок одной строкой, подпись под ним,
  // справа — круглые кнопки экрана и последним портрет.
  // Во весь экран — только в Telegram на компьютере: там мини-приложение открывается небольшим окном
  const canFull = () => !!(tg && typeof tg.requestFullscreen === 'function' && /tdesktop|macos|web|unigram/i.test(tg.platform || ''));
  const fullBtn = () => (canFull()
    ? `<button class="icon-btn full-btn" data-act="toggleFull" aria-label="${tg.isFullscreen ? 'Свернуть в окно' : 'Во весь экран'}" title="${tg.isFullscreen ? 'Свернуть в окно' : 'Во весь экран'}">${ic(tg.isFullscreen ? 'shrink' : 'expand')}</button>`
    : '');
  const screenHead = (title, sub, tools) => `<div class="top screen">
      <div class="grow"><h1 class="h1 one">${title}</h1>${sub ? `<div class="sub ellip">${sub}</div>` : ''}</div>
      ${tools || ''}${fullBtn()}<a class="me-dot" href="#/me" aria-label="Профиль">${av(S.me, 'xs')}</a></div>`;
  const personMini = (id, sub, tag = 'a') => `<${tag} class="person" ${tag === 'a' ? `href="#/p/${id}"` : ''}>${av(id, 's')}<div class="grow"><div class="name ellip">${esc(full(id))}</div><div class="sub ellip">${esc(sub ?? who(id))}</div></div>${tag === 'a' ? ic('chev', 'chev') : ''}</${tag}>`;

  // Витрина: то, что человек рассказывает о себе сам. Рекомендации — то, что о нём
  // говорят другие. Первое не заменяет второе и стоит ниже по весу.
  const srvUrl = (u) => (u.startsWith('http') ? u : (window.SARAFAN_SERVER || '').replace(/\/$/, '') + u);
  const lines = (t) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);

  // Пустая галерея: показываем рамки-примеры, чтобы человек увидел, что получится
  const GHOST_WORKS = [
    ['Что было до', 'снимок «до»'],
    ['Что получилось', 'снимок «после»'],
    ['Как шла работа', 'процесс, детали'],
    ['Где это стоит', 'готовое на месте'],
  ];
  const worksGhost = (dirId) => `<div class="works ghost">
    ${GHOST_WORKS.map(([t, hint]) => `<label class="work-ghost">${ic('cam')}<b>${t}</b><span>${hint}</span>
      <input type="file" accept="image/*" class="workfile" data-dir="${dirId || ''}" hidden></label>`).join('')}
  </div>
  <p class="hint" style="text-align:center">Так галерея выглядит заполненной. Нажмите на любую рамку — и вместо неё встанет ваш снимок.</p>`;

  // Картинки работ одного направления
  const workStrip = (list) => (list.length
    ? `<div class="works">${list.map((w) => `<figure class="work"><img src="${esc(srvUrl(w.url))}" alt="${esc(w.title)}" loading="lazy">
        ${w.title || w.note ? `<figcaption>${w.title ? `<b>${esc(w.title)}</b>` : ''}${w.note ? `<span>${esc(w.note)}</span>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>`
    : '');

  function showcaseView(id) {
    const sc = (S.showcases || {})[id];
    if (!sc) return '';
    const works = sc.works || [];
    const dirs = sc.dirs || [];
    const has = sc.story || sc.services || sc.prices || lines(sc.links).length || works.length || dirs.length;
    if (!has) return '';
    const loose = works.filter((w) => !w.dir || !dirs.some((d) => d.id === w.dir));
    return `<div class="sec-title"><h2 class="h2">О работе</h2>${id === S.me ? '<button class="btn sm" data-act="editShowcase">Изменить</button>' : ''}</div>
      ${dirs.map((d) => {
      const mine = works.filter((w) => w.dir === d.id);
      return `<div class="dir">
        <div class="dir-head"><h3 class="h3">${esc(d.title)}</h3>${mine.length ? `<span class="tag">${pl(mine.length, 'работа', 'работы', 'работ')}</span>` : ''}</div>
        ${d.story ? `<p class="small" style="margin:6px 0 0;color:var(--ink-2);line-height:1.55">${esc(d.story).split('\n').join('<br>')}</p>` : ''}
        ${d.prices ? `<p class="dir-price">${esc(d.prices)}</p>` : ''}
        ${mine.length ? workStrip(mine) : (id === S.me ? worksGhost(d.id) : '')}</div>`;
    }).join('')}
      ${workStrip(loose)}
      <div class="card">
        ${sc.headline ? `<div class="h3" style="margin-bottom:8px">${esc(sc.headline)}</div>` : ''}
        ${sc.story ? `<p class="small" style="margin:0 0 12px;color:var(--ink-2);line-height:1.55">${esc(sc.story).replace(/\n/g, '<br>')}</p>` : ''}
        ${lines(sc.services).length ? `<div class="field" style="margin-top:0"><span>Что делает</span><div class="chips">${lines(sc.services).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></div>` : ''}
        ${sc.prices ? `<div class="field"><span>Про деньги</span><p class="small" style="margin:0;color:var(--ink-2)">${esc(sc.prices)}</p></div>` : ''}
        ${lines(sc.links).length ? `<div class="field"><span>Где посмотреть ещё</span><div class="stack">${lines(sc.links).map((x) => `<a class="link-row" href="${esc(x.startsWith('http') ? x : 'https://' + x)}" target="_blank" rel="noopener">${ic('link')}<span class="grow ellip">${esc(x.replace(/^https?:\/\//, ''))}</span>${ic('arrow')}</a>`).join('')}</div></div>` : ''}
      </div>`;
  }

  // Как с человеком иметь дело — короткой таблицей, только заполненное
  function howView(id) {
    const h = U(id).how || {};
    const rows = [
      h.area && ['area', esc(h.area)],
      h.visit && ['visit', HOW.visit[h.visit] || esc(h.visit)],
      h.hours && ['hours', esc(h.hours)],
      h.langs && ['langs', howList(h.langs).map((x) => HOW.langs[x] || esc(x)).join(' · ')],
      h.pay && ['pay', howList(h.pay).map((x) => HOW.pay[x] || esc(x)).join(' · ')],
      h.reply && ['reply', HOW.reply[h.reply] || esc(h.reply)],
    ].filter(Boolean);
    if (!rows.length) return '';
    return `<div class="sec-title"><h2 class="h2">${id === S.me ? 'Как с вами работать' : 'Как с ним работать'}</h2>${id === S.me ? '<button class="btn sm" data-act="editMe">Изменить</button>' : ''}</div>
      <div class="card how">${rows.map(([k, v]) => `<div class="how-row"><span>${HOW_LABEL[k]}</span><b>${v}</b></div>`).join('')}</div>`;
  }

  // Уточнения о человеке: их дописывают знакомые
  const factsAbout = (id) => (S.userFacts || []).filter((f) => f.to === id && (f.status === 'ok' || f.from === S.me || id === S.me));

  function factsView(id) {
    const list = factsAbout(id);
    const mineToCheck = id === S.me ? list.filter((f) => f.status === 'new') : [];
    const shown = list.filter((f) => f.status === 'ok' || (id === S.me && f.status === 'new') || f.from === S.me);
    const canAdd = id !== S.me && G.connected(S.me, id);
    if (!shown.length && !canAdd) return '';
    return `<div class="sec-title"><h2 class="h2">${id === S.me ? 'Что о вас знают' : 'Что о нём знают'}</h2>${canAdd ? `<button class="btn sm" data-act="addUserFact" data-id="${id}">Добавить</button>` : ''}</div>
      ${shown.length ? `<div class="card">${shown.map((f) => `<div class="fact">
        <p>${esc(f.text)}</p>
        <div class="row"><span class="tiny muted grow">${esc(full(f.from))}${f.status === 'new' && id !== S.me ? ' · ждёт подтверждения' : ''} · ${when(f.at)}</span>
          ${id === S.me && f.status === 'new' ? `<button class="btn primary xs" data-act="factYes" data-id="${f.id}">Верно</button><button class="btn ghost xs" data-act="factNo" data-id="${f.id}">Убрать</button>`
      : f.from === S.me ? `<button class="btn ghost xs" data-act="factNo" data-id="${f.id}">Убрать</button>` : ''}</div></div>`).join('')}</div>`
      : `<div class="card"><p class="small muted" style="margin:0">Знаете, как с ним удобнее иметь дело — часы, район, оплату? Допишите: это увидят ваши знакомые.</p></div>`}
      ${mineToCheck.length ? '' : ''}`;
  }

  const repRows = (id, onlyCat) => {
    const cats = G.catsOf(id).filter((c) => !onlyCat || c === onlyCat);
    if (!cats.length) return '<p class="muted small" style="margin:0">Пока нет рекомендаций. Здесь репутация появляется только тогда, когда человека рекомендуют другие.</p>';
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

  // Свой интерес говорят вслух — тогда он не ломает доверие
  const INTEREST = { family: 'родственник', staff: 'работает у него', money: 'зарабатывает на этом' };
  // Что написано на кнопке рекомендации: зависит от того, есть ли уже записи
  const recLabel = (id, catId) => {
    const mine = G.recsFrom(S.me).filter((r) => r.to === id);
    if (catId ? mine.some((r) => r.cat === catId) : mine.length) return 'Изменить запись';
    return G.recsTo(id).length ? 'Тоже рекомендую' : 'Рекомендовать';
  };

  // Двое рекомендуют друг друга — это сильнее, чем две отдельные рекомендации
  const mutualRec = (a, b) => S.recs.some((x) => !x.private && x.from === a && x.to === b)
    && S.recs.some((x) => !x.private && x.from === b && x.to === a);

  const recItem = (r, showTarget) => {
    const author = r.from;
    const d = G.dist[author];
    const tag = author === S.me ? '<span class="tag brand">Вы</span>' : d === 1 ? circleTag(1) : d === 2 ? circleTag(2) : '';
    const target = showTarget ? `<div class="small muted" style="margin-top:8px">→ <a href="#/p/${r.to}"><b style="color:var(--ink)">${esc(full(r.to))}</b></a></div>` : '';
    return `<div class="rec"><div class="row"><a href="#/p/${author}">${av(author, 's')}</a><div class="grow"><div class="row" style="gap:8px"><a href="#/p/${author}" class="h3 ellip" style="text-decoration:none">${esc(full(author))}</a>${tag}</div><div class="tiny muted">${when(r.at)}${r.edited ? ' · изменена' : ''}</div></div></div>
      <div class="chips" style="gap:6px;margin-top:10px"><span class="tag brand">${esc(cat(r.cat).name)}</span><span class="tag">${esc(REL[r.rel] || REL.other)}</span>${r.interest ? `<span class="tag warm">${esc(INTEREST[r.interest])}</span>` : ''}${mutualRec(r.from, r.to) ? `<span class="tag mutual">${ic('swap')}взаимно</span>` : ''}</div>
      <p class="txt">${esc(r.text)}</p>${target}</div>`;
  };

  // Карточка человека в ленте: имя, сфера, живая цитата из рекомендации и кто рекомендует.
  // Главное — не числа, а чужие слова: ради них сюда и приходят.
  const resultCard = (r, accent) => {
    const u = r.user;
    const iRec = r.rep.near.includes(S.me);
    const others = r.rep.near.filter((a) => a !== S.me);
    const authors = [...new Set(r.rep.recs ? r.rep.recs.map((x) => x.from) : [])]
      .sort((a, b) => (G.dist[a] ?? 9) - (G.dist[b] ?? 9));
    // цитата — от самого близкого человека, его же имя под ней
    const best = (r.rep.recs || []).slice().sort((a, b) => (G.dist[a.from] ?? 9) - (G.dist[b.from] ?? 9))[0];
    let who1;
    if (iRec) who1 = others.length ? `Вы и ещё ${others.length}` : 'Вы рекомендуете';
    else if (others.length) who1 = esc(first(others[0])) + (others.length > 1 ? ` и ещё ${others.length - 1}` : ' рекомендует');
    else if (r.via) who1 = esc(first(r.via)) + ' рекомендует';
    else if (r.circle === 1) who1 = 'Ваш контакт';
    else who1 = 'Общих знакомых нет';
    const otherCats = G.catsOf(u.id).filter((c) => c !== r.cat).length;
    const numbers = r.rep.count
      ? `${r.rep.count} ${pl(r.rep.count, 'рекомендация', 'рекомендации', 'рекомендаций').split(' ').pop()} · ${pl(r.rep.independent, 'источник', 'источника', 'источников')}`
      : 'рекомендаций пока нет';
    // Номер круга — наш внутренний жаргон. Человеку нужно знать, как он до этого
    // человека дойдёт: сам напишет, попросит знакомого или пойдёт в два шага.
    const via = r.chain && r.chain.length > 1 ? r.chain[1] : null;
    const path = r.circle === 1 ? 'Ваш контакт'
      : r.circle === 2 && via ? `через ${esc(first(via))}`
        : r.circle === 2 ? 'через знакомого'
          : r.circle === 3 ? 'в два шага' : '';
    return `<a class="card tap pcard ${accent ? 'accent' : ''}" href="#/p/${u.id}?cat=${r.cat}">
      <div class="head">${av(u.id, '', r.circle === 1 ? 'r1' : r.circle === 2 ? 'r2' : '')}
        <div class="grow"><div class="name ellip">${esc(u.name)} ${trustMark(r.rep)}</div>
          <div class="job ellip">${esc(cat(r.cat).name)}${otherCats ? ` <span class="more">+${otherCats}</span>` : ''}</div></div>
        ${path ? `<span class="tag circle-${r.circle}">${path}</span>` : ''}</div>
      <div class="nums">${numbers}${u.busy ? ' · сейчас не берёт' : ''}${r.rep.suspicious ? ' · одна тесная группа' : ''}</div>
      ${best ? `<p class="quote">«${esc(best.text)}»</p>
        <div class="by ellip">${esc(full(best.from))}${best.interest ? ' · ' + esc(INTEREST[best.interest]) : ''}</div>`
    : `<p class="quote empty">${r.circle === 1 ? 'Вы знакомы, но его пока никто не рекомендовал.' : 'Этого человека пока никто не рекомендовал.'}</p>`}
      <div class="foot">${authors.length ? stack(authors) : ''}
        <span class="who-line grow ellip">${who1}</span>${ic('arrow', 'arr')}</div></a>`;
  };

  const incomingRequests = () => S.requests.filter((q) => q.from !== S.me && G.connected(q.from, S.me) && !(q.skip || []).includes(S.me))
    .sort((a, b) => b.at - a.at);

  const requestCard = (q, compact, accent) => {
    const mine = q.from === S.me;
    const answered = q.answers.some((a) => a.from === S.me);
    const head = mine
      ? `<div class="row"><span class="tag brand">Ваш запрос</span><span class="grow"></span><span class="tiny muted">${when(q.at)}</span></div>`
      : q.from
        ? `<div class="row">${av(q.from, 's')}<div class="grow"><div class="h3 ellip">${esc(U(q.from).name)}</div><div class="tiny muted">спрашивает · ${when(q.at)}</div></div></div>`
        : `<div class="row"><span class="av s ghost-av">${ic('user')}</span><div class="grow"><div class="h3 ellip">Кто-то из ваших знакомых</div><div class="tiny muted">спрашивает тихо · ${when(q.at)}</div></div></div>`;
    const foot = mine
      ? `<div class="row"><span class="small">${q.answers.length ? `<b>${pl(q.answers.length, 'ответ', 'ответа', 'ответов')}</b>` : '<span class="muted">Ответов пока нет</span>'}</span><span class="grow"></span>${q.closed ? '<span class="tag">Закрыт</span>' : ''}${ic('chev', 'chev').replace('class="chev"', 'class="chev" style="width:18px;height:18px;color:var(--muted)"')}</div>`
      : answered
        ? `<div class="row"><span class="tag brand">${ic('check').replace('<svg', '<svg style="width:13px;height:13px"')} Вы ответили</span><span class="grow"></span><span class="tiny muted">${pl(q.answers.length, 'ответ', 'ответа', 'ответов')}</span></div>`
        : `<div class="btn-row"><button class="btn primary sm" data-act="answer" data-id="${q.id}">Посоветовать</button><button class="btn ghost sm" data-act="skipReq" data-id="${q.id}">Не знаю</button></div>`;
    return `<div class="card ask-card ${accent ? 'accent' : ''} ${mine ? 'tap' : ''}" ${mine ? `data-act="goto" data-h="#/q/${q.id}" role="link" tabindex="0"` : ''}>${head}
      <p class="q">${esc(q.text)}</p>${compact || !q.cat ? '' : `<div class="chips" style="margin-bottom:12px"><span class="tag brand">${esc(cat(q.cat).name)}</span></div>`}${foot}</div>`;
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
    nodesAll().forEach((n) => {
      (n.recs || []).filter((r) => !r.private).forEach((r) => {
        if (r.from === S.me || !c1.has(r.from)) return;
        ev.push({ at: r.at, who: r.from, link: '#/o/' + n.id,
          html: `<div class="txt"><b>${esc(U(r.from).name)}</b> рекомендует ${n.kind === 'company' ? 'фирму' : 'место'} · <b>${esc(n.name)}</b></div><div class="quote sm">${esc(r.text)}</div>` });
      });
      (n.facts || []).forEach((f) => {
        if (f.from === S.me || !c1.has(f.from) || Date.now() - f.at > 21 * 864e5) return;
        ev.push({ at: f.at, who: f.from, link: '#/o/' + n.id,
          html: `<div class="txt"><b>${esc(U(f.from).name)}</b> уточняет про <b>${esc(n.name)}</b></div><div class="quote sm">${esc(f.text)}</div>` });
      });
    });
    return ev.sort((a, b) => b.at - a.at).slice(0, 14);
  };

  // Пока сеть маленькая — главный экран объясняет, что делать, а не показывает пустоту
  const STARTER_KEY = 'sarafan.starterOff';
  const starterOff = () => { try { return localStorage.getItem(STARTER_KEY) === '1'; } catch (e) { return false; } };
  const starter = () => {
    const c1 = myContacts();
    const myRecs = G.recsFrom(S.me).length;
    const asked = S.requests.filter((q) => q.from === S.me).length;
    const steps = [
      {
        done: c1.length > 0, num: 1,
        title: 'Позовите тех, кому доверяете',
        text: c1.length ? `В вашей сети ${pl(c1.length, 'человек', 'человека', 'человек')}. Чем больше знакомых, тем чаще сеть выручает.`
          : 'Книжка открывается только через знакомых. Начните с трёх-пяти человек: коллеги, друзья, родственники.',
        btn: c1.length ? 'Позвать ещё' : 'Позвать знакомых', act: 'goto', href: '#/net',
      },
      {
        done: myRecs > 0, num: 2,
        title: 'Запишите своих проверенных',
        text: c1.length
          ? (myRecs ? `Вы рекомендуете ${pl(myRecs, 'человека', 'человек', 'человек')}. Так вас находят через ваших знакомых.`
            : 'Напишите, за что вы их советуете: «делал мне сайт», «лечил зуб». Так ваш круг становится полезным знакомым.')
          : 'Станет доступно, когда в сети появится хотя бы один знакомый.',
        btn: c1.length ? 'Кого рекомендовать' : '', act: 'goto', href: '#/net',
      },
      {
        done: asked > 0, num: 3,
        title: 'Спросите, если в кругах никого нет',
        text: c1.length
          ? 'Юрист, врач, бухгалтер, автосервис, репетитор — опишите задачу, и знакомые посмотрят у себя.'
          : 'Запрос уходит вашему кругу. Пока круга нет, спрашивать некого.',
        btn: c1.length ? 'Спросить свою сеть' : '', act: 'goto', href: '#/ask',
      },
    ];
    // Все шаги пройдены — подсказка уходит сама. И её можно убрать раньше
    const left = steps.filter((st) => !st.done).length;
    if (!left || starterOff()) return '';
    return `<div class="card starter">
      <div class="row"><div class="eyebrow grow">с чего начать · осталось ${left} из 3</div>
        <button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2)" data-act="hideStarter" aria-label="Скрыть подсказку">${ic('x')}</button></div>
      <h2 class="h2" style="margin:6px 0 4px">Книжка наполняется людьми</h2>
      <p class="small muted" style="margin:0 0 4px">Чем больше знакомых рядом, тем больше проверенных людей вам открыто. Видно, кто человека рекомендует и через кого вы на него вышли.</p>
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
    const near2 = Object.keys(G.dist).filter((id) => id !== S.me && G.dist[id] >= 1 && G.dist[id] <= 2)
      .map((id) => { const c = G.catsOf(id)[0]; if (!c) return null; const rep = G.reputation(id, c); return rep.count ? { user: U(id), cat: c, rep, ...G.trust(id, c) } : null; })
      .filter(Boolean)
      .sort((a, b) => a.circle - b.circle || b.rep.independent - a.rep.independent)
      .slice(0, 6);
    const mine = S.requests.filter((q) => q.from === S.me && !q.closed).sort((a, b) => b.at - a.at).slice(0, 2);
    const op = orbitPeople(6, 8);
    const small = op.total1 < 3;
    return `
      <div class="head-bar over">
        <div class="logo grow">${logoMark}сарафан</div>
        ${fullBtn()}<a class="me-dot" href="#/me" aria-label="Профиль">${av(S.me, 'xs')}</a></div>
      ${starter()}
      ${draftsCard()}
      <div class="cloud-box"><canvas id="homecloud" aria-label="Облако вашей сети"></canvas>
        <button class="cloud-home" data-act="cloudHome" aria-label="Вернуть в центр">${ic('pin')}</button>
        <a class="cloud-full" href="#/map" aria-label="Развернуть">${ic('net')}</a></div>
      <p class="cloud-gain">${op.total1
    ? `Через ${pl(op.total1, 'знакомого', 'знакомых', 'знакомых')} вам открыто <b>${pl(op.total2, 'человек', 'человека', 'человек')}</b>, которых вы не знаете лично${nodesAll().length ? ` и <b>${pl(nodesAll().length, 'проверенное место', 'проверенных места', 'проверенных мест')}</b>` : ''}`
    : 'Позовите первого знакомого — и его круг откроется вам целиком'}</p>
      ${small ? '<p class="small muted" style="text-align:center;margin:10px auto 0;max-width:290px">Серые места ждут ваших знакомых: ближний круг — те, кого позвали вы, дальний — их знакомые</p>' : ''}
      ${myList()}
      <a class="search" href="#/search" style="margin-top:18px;text-decoration:none">${ic('search')}<span class="muted ellip" style="font-size:16px">Юрист, врач, репетитор, дизайнер…</span></a>
      <div class="chips scroll" style="margin-top:12px">${topCats.map((c) => `<a class="chip" href="#/search?c=${c}">${esc(cat(c).who)}<span class="n">${catCount[c]}</span></a>`).join('')}</div>
      ${near2.length ? `<div class="sec-title"><h2 class="h2">Кого советуют ваши</h2><a class="link" href="#/search">Все</a></div>
      <p class="sec-note">Их рекомендуют знакомые и знакомые знакомых</p>
      <div class="rail-x">${near2.map((r, i) => resultCard(r, i === 0)).join('')}</div>` : ''}
      ${nodesNear().length ? `<div class="sec-title"><h2 class="h2">Куда ходят ваши</h2><a class="link" href="#/search">Все</a></div>
      <p class="sec-note">Места и фирмы, проверенные знакомыми</p>
      <div class="rail-x">${nodesNear().slice(0, 6).map((n, i) => nodeCard(n, i === 0)).join('')}</div>` : ''}
      ${savedList()}
      ${op.total1 ? `<div style="margin-top:16px"><a class="ask-hero" href="#/ask" style="text-decoration:none"><span class="ic">${ic('ask')}</span><span class="grow"><div class="t1">Спросить свою сеть</div><div class="t2">Увидят ${pl(c1.length, 'знакомый', 'знакомых', 'знакомых')} и их знакомые — без спама в общем чате</div></span>${ic('chev').replace('<svg', '<svg style="width:20px;height:20px;opacity:.7"')}</a></div>` : ''}
      <div class="chat-tip"><span class="ic">${ic('chat')}</span><div class="grow"><b>Советуйте прямо в чате</b>
        <p>Спросили в переписке — наберите <code>@${esc(S.bot || 'sarafanibot')} педиатр</code> и отправьте карточку: видно, кто рекомендует. Под карточкой есть «Сохранить себе» — любой в чате сохранит человека одним нажатием.</p>
        <p>Добавьте бота в домовой или родительский чат: под ответом с телефоном он поставит ту же кнопку, а через сутки уберёт.</p>
        <p>Контакт прислали в личке — перешлите боту, можно сразу несколько. Или скопируйте и вставьте в «Записать человека».</p></div></div>
      ${todo() ? `<div class="sec-title"><h2 class="h2">Просит вашего ответа</h2><span class="badge">${todo()}</span></div>
        <a class="ask-hero" href="#/new" style="text-decoration:none"><span class="ic">${ic('bell')}</span><span class="grow"><div class="t1">Загляните в «Новое»</div><div class="t2">${todoText()}</div></span>${ic('chev').replace('<svg', '<svg style="width:20px;height:20px;opacity:.7"')}</a>` : ''}
      ${mine.length ? `<div class="sec-title"><h2 class="h2">Ваши запросы</h2></div><div class="stack">${mine.map((q) => requestCard(q, true)).join('')}</div>` : ''}`;
  }

  // ——— Черновики из переписки ———
  // Каждый видно сразу: открыть и дописать — или убрать крестиком, если нажали по ошибке
  function draftsCard() {
    const list = S.drafts || [];
    if (!list.length) return '';
    const line = (d) => [d.name || 'имя не указано', d.cat ? cat(d.cat).who : ''].filter(Boolean).join(' · ');
    const sub = (d) => [d.phone || (d.username ? '@' + d.username : ''), circleShort(d.text)].filter(Boolean).join(' · ') || 'Совет из чата';
    return `<div class="card over-cloud" style="margin-top:12px">
      <div class="eyebrow">из переписки · ${pl(list.length, 'запись ждёт', 'записи ждут', 'записей ждут')}</div>
      <div style="margin-top:6px">${list.slice(0, 6).map((d) => `<div class="person"><button class="grow row" data-act="openDraft" data-id="${d.id}" style="min-width:0;text-align:left"><span class="av s" style="background:var(--mist-2)">${d.photo ? `<img src="${esc(srvUrl(d.photo))}" alt="" loading="lazy" onerror="this.remove()">` : ic('send')}</span>
        <div class="grow"><div class="name ellip">${esc(line(d))}</div><div class="sub ellip">${esc(sub(d))}</div></div></button>
        <button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2)" data-act="dropDraft" data-id="${d.id}" aria-label="Не сохранять">${ic('x')}</button></div>`).join('')}</div>
      <p class="tiny muted" style="margin:8px 0 0">Нажмите, чтобы дописать, или крестик — если сохранили по ошибке</p></div>`;
  }
  const circleShort = (t) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 70 ? x.slice(0, 69) + '…' : x; };

  // ——— Сохранено из чатов ———
  // Нажали «Сохранить себе» под карточкой в переписке — человек или место здесь,
  // даже если он не из ваших кругов. Видно, кто советовал.
  function savedList() {
    const items = (S.saved || []).filter((x) => (x.kind === 'person' ? U(x.id) : nodeById(x.id))).slice(0, 8);
    if (!items.length) return '';
    const by = (x) => { const f = x.from && U(x.from); return f ? (x.from === S.me ? 'ваша рекомендация' : 'советует ' + full(x.from)) : 'из переписки'; };
    return `<div class="sec-title"><h2 class="h2">Сохранено из чатов</h2></div>
      <p class="sec-note">Вы нажали «Сохранить себе» под советом в переписке</p>
      <div class="card">${items.map((x) => {
    const n = x.kind === 'place' ? nodeById(x.id) : null;
    const pic = n ? `<span class="node-ic ${n.kind}" style="width:34px;height:34px">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>` : av(x.id, 's');
    const title = n ? n.name : full(x.id);
    const sub = (n ? cat(n.cat).who : who(x.id)) + ' · ' + by(x);
    return `<div class="person"><a class="grow row" href="#/${n ? 'o' : 'p'}/${x.id}" style="min-width:0">${pic}<div class="grow"><div class="name ellip">${esc(title)}</div><div class="sub ellip">${esc(sub)}</div></div></a>
      <button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2)" data-act="dropSaved" data-kind="${x.kind}" data-id="${x.id}" aria-label="Убрать из сохранённого">${ic('x')}</button></div>`;
  }).join('')}</div>`;
  }

  // ——— Свой список проверенных ———
  // Пока сеть мала, искать в ней некого. Но у каждого уже есть люди, которых он советует
  // знакомым: часовщик, педиатр, электрик. Записать их — польза с первой минуты,
  // а сеть вырастает сама: запись станет первой рекомендацией, когда человек войдёт.
  function myList() {
    const waiting = S.pendingInvites || [];
    const mineRecs = G.recsFrom(S.me);
    if (mineRecs.length >= 5 && waiting.length === 0) return '';   // сеть уже живая
    return `<div class="card" style="margin-top:18px">
      <div class="eyebrow">ваш круг</div>
      <h2 class="h2" style="margin:6px 0 6px">Запишите своих проверенных</h2>
      <p class="small muted" style="margin:0 0 12px">Часовщик, педиатр, электрик — те, кого вы советуете в чатах по памяти. Запишите один раз: знакомые найдут их сами, а вам не придётся отвечать на один и тот же вопрос снова.</p>
      ${waiting.length ? `<div class="stack" style="margin-bottom:12px">${waiting.map((p) => `<div class="person"><span class="av s" style="background:var(--mist-2)">${esc(p.name.slice(0, 1).toUpperCase())}</span>
        <div class="grow"><div class="name ellip">${esc(p.name)}</div><div class="sub ellip">${esc(cat(p.cat).who)}${p.private ? ' · для себя' : ''} · ${p.phone ? esc(p.phone) : 'записан ' + when(p.at)}</div></div>
        ${p.private ? '' : `<button class="btn xs" data-act="callPending" data-code="${p.code}" data-name="${esc(p.name)}">Позвать</button>`}
        <button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2);margin-left:6px" data-act="dropPending" data-code="${p.code}" data-name="${esc(p.name)}" aria-label="Убрать запись">${ic('x')}</button></div>`).join('')}</div>` : ''}
      <button class="btn primary block" data-act="outsider">${ic('user')}Записать человека</button>
      <button class="btn block" style="margin-top:8px" data-act="pickContacts">${ic('send')}Из контактов Telegram</button>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn" data-act="newNode" data-v="place">${ic('pin')}Место</button>
        <button class="btn" data-act="newNode" data-v="company">${ic('house')}Фирму</button></div>
      ${waiting.length ? '' : '<p class="tiny muted" style="text-align:center;margin:10px 0 0">Достаточно имени и одной фразы — как в чате</p>'}</div>`;
  }

  // ——— Облако сети ———
  // Кого показываем: вы, ваши контакты, их знакомые, места и фирмы вокруг них.
  function cloudData(limitRing, withPlaces, maxFar, onlyPlaces) {
    const ring = (id) => (id === S.me ? 0 : Math.min(G.dist[id] ?? 9, 9));
    let people = Object.keys(S.users).filter((id) => ring(id) <= (limitRing || 2));
    if (maxFar) {
      // на маленьком полотне показываем не всех: сначала тех, кого рекомендуют
      const far = people.filter((id) => ring(id) === 2)
        .sort((a, b) => G.recsTo(b).length - G.recsTo(a).length).slice(0, maxFar);
      const keep = new Set([...people.filter((id) => ring(id) <= 1), ...far]);
      people = people.filter((id) => keep.has(id));
    }
    const nodes = people.map((id) => {
      const cats = G.catsOf(id);
      const rep0 = cats.length ? G.reputation(id, cats[0]) : null;
      return {
        id, ring: ring(id), self: id === S.me, kind: 'person',
        r: id === S.me ? 21 : ring(id) === 1 ? 15 : ring(id) === 2 ? 10 : 7.5,
        photo: U(id).photo || null,
        video: U(id).video && (id === S.me || ring(id) <= 1) ? srvUrl(U(id).video) : null,   // дальних — фото, телефон не тянет десятки роликов
        trusted: !!(rep0 && rep0.independent >= 3),
        founder: (S.founders || []).includes(id),
        initials: (U(id).name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase(),
        label: id === S.me ? 'вы' : first(id),
        go: id === S.me ? '#/me' : '#/p/' + id,
      };
    });
    // кто ждёт в круге — бледный кружок на пунктире: место уже есть, человек ещё не пришёл
    if (!onlyPlaces) (S.waiting || []).slice(0, 12).forEach((w) => nodes.push({
      id: 'w' + w.id, ring: 1, self: false, kind: 'person', ghost: true, r: 11,
      photo: w.photo ? srvUrl(w.photo) : null,
      initials: (w.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase(),
      label: (w.name || '').split(' ')[0], go: '#/net' }));
    const edges = [];
    (S.waiting || []).slice(0, 12).forEach((w) => { if (!onlyPlaces) edges.push({ a: S.me, b: 'w' + w.id, kind: 'wait', len: 70 }); });
    const known = new Set(people);
    S.conns.filter((c) => c.status === 'ok' && known.has(c.a) && known.has(c.b))
      .forEach((c) => edges.push({ a: c.a, b: c.b, kind: 'know' }));
    const vouched = new Set();
    S.recs.filter((r) => !r.private).forEach((r) => vouched.add(r.from + '>' + r.to));
    const pairSeen = new Set();
    S.recs.filter((r) => !r.private && known.has(r.from) && known.has(r.to))
      .forEach((r) => {
        // взаимность: оба рекомендуют друг друга — такую нить рисуем одну и особо
        const both = vouched.has(r.to + '>' + r.from);
        const key = both ? [r.from, r.to].sort().join('~') : null;
        if (both) { if (pairSeen.has(key)) return; pairSeen.add(key); }
        edges.push({ a: r.from, b: r.to, kind: 'vouch', both, len: both ? 58 : 64 });
      });

    if (withPlaces) {
      nodesAll().forEach((n) => {
        const voices = [...new Set([...nodeRecs(n).map((r) => r.from), n.by])].filter((id) => known.has(id));
        // кто из видимых людей здесь работает — к ним фиолетовая пунктирная нить
        const staff = nodePeople(n.id).filter((x) => !x.past && !x.waiting && known.has(x.user)).map((x) => x.user);
        // ждущие в круге, отмеченные здесь сотрудниками, — тоже держат фирму в облаке
        const waitStaff = onlyPlaces ? [] : (S.waiting || []).slice(0, 12).filter((w) => w.node === n.id).map((w) => 'w' + w.id);
        if (!voices.length && !staff.length && !waitStaff.length) return;
        const id = 'o' + n.id;
        nodes.push({ id, ring: 2, kind: 'node', company: n.kind === 'company',
          r: n.kind === 'company' ? 8 : 8.5,
          label: n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name,
          go: '#/o/' + n.id });
        voices.filter((v) => !staff.includes(v)).forEach((v) => edges.push({ a: v, b: id, kind: 'vouch', len: 44 }));
        staff.forEach((v) => edges.push({ a: v, b: id, kind: 'work', len: 40 }));
        waitStaff.forEach((v) => edges.push({ a: v, b: id, kind: 'work', len: 40 }));
        // Подрядчики фирмы — бледные кружки-разделы с числом: полсотни точек облако бы утопили
        if (!onlyPlaces) {
          const secs = new Map();
          partnersOf(n.id).forEach((x) => { const k = (x.section || '').split(' › ')[0]; secs.set(k, (secs.get(k) || 0) + 1); });
          [...secs].slice(0, 6).forEach(([k, c]) => {
            const sid = 'ps' + n.id + ':' + k;
            nodes.push({ id: sid, ring: 3, ghost: true, r: 5.5, initials: String(c), label: (k || 'Подрядчики') + ' · ' + c, sec: { firm: n.id, key: k } });
            edges.push({ a: id, b: sid, kind: 'wait', len: 30 });
          });
        }
      });
    }
    if (onlyPlaces) {
      // срез «только места»: сами места и те, кто их советует, — остальные люди уходят
      const keep = new Set([S.me]);
      edges.forEach((e) => { if (String(e.b).startsWith('o')) { keep.add(e.a); keep.add(e.b); } });
      const kept = nodes.filter((n) => keep.has(n.id));
      const ids = new Set(kept.map((n) => n.id));
      return { nodes: kept, edges: edges.filter((e) => ids.has(e.a) && ids.has(e.b)) };
    }
    return { nodes, edges };
  }

  // Нажатие в облаке: своя карточка — на экран профиля, чужая — быстрым окном,
  // чтобы человек не терял из виду всю сеть
  function pickInCloud(n) {
    if (n.self) { go('#/me'); return; }
    if (n.sec) { openSecs.add(n.sec.firm + ':' + n.sec.key); go('#/o/' + n.sec.firm); return; }
    if (n.ghost) { go('#/net'); toast(`${n.label || 'Он'} ещё не в Сарафане — придёт, и вы станете знакомыми`); return; }
    if (n.kind === 'node') { sheetNodePeek(n.id.slice(1)); return; }
    sheetPeek(n.id);
  }

  // Посоветовать подрядчика своей фирмы: спросивший увидит его телефон — вы им делитесь
  function sheetAnswerPartner(qid, pid) {
    const q = S.requests.find((x) => x.id === qid);
    if (!q) return;
    const mine = myFirmPartners();
    const f = { partner: pid || '', text: '', q: '' };
    const listHtml = () => mine.filter((x) => !f.q.trim() || partnerFits(x, f.q, ''))
      .sort((a, b) => partnerScore(b, q) - partnerScore(a, q)).slice(0, 30)
      .map((x) => `<button class="pick" data-act="pickWho" data-k="partner" data-v="${x.id}">${partnerAv(x)}<span class="grow"><span class="h3 ellip" style="display:block">${esc(x.name)}</span><span class="small muted ellip" style="display:block">${esc(x.section || (x.cat ? cat(x.cat).who : ''))}</span></span><span class="radio"></span></button>`).join('')
      || '<p class="small muted">Никого не нашли — попробуйте другое слово</p>';
    openSheet({
      F: f,
      valid: () => !!f.partner && f.text.trim().length >= 8,
      render: () => {
        const x = mine.find((y) => y.id === f.partner);
        return `${sheetHead(q.from, 'Подрядчик вашей фирмы', q.from ? esc(U(q.from).name) + ' спрашивает' : 'Знакомый спрашивает')}
        <div class="note" style="font-size:14px;color:var(--ink)">«${esc(q.text)}»</div>
        ${x ? `<div class="field"><span>Кого советуете</span><div class="pick on">${partnerAv(x)}<span class="grow"><span class="h3 ellip" style="display:block">${esc(x.name)}</span><span class="small muted ellip" style="display:block">${esc([x.section, nodeById(x.firm) ? nodeById(x.firm).name : ''].filter(Boolean).join(' · '))}</span></span><button class="btn ghost xs" data-act="set" data-k="partner" data-v="">Другой</button></div></div>`
    : `<label class="field"><span>Кого советуете</span><input class="input" data-live="1" placeholder="Имя, раздел или что делает" autocomplete="off" value="${esc(f.q)}"></label><div class="stack partner-pick">${listHtml()}</div>`}
        <label class="field"><span>Почему он</span><textarea class="textarea" data-bind="text" maxlength="400" placeholder="Например: печатаем у него баннеры третий год, всегда в срок">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="8"></p></label>
        <p class="why">${ic('spark')}Спросивший увидит телефон и ник подрядчика — вы им делитесь. Остальным он по-прежнему не виден</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitAnswerPartner" data-submit>${ic('send')}Отправить ответ</button></div>`;
      },
      onLive: (v) => { f.q = v; const b = $('#sheet .partner-pick'); if (b) b.innerHTML = listHtml(); },
      submit: () => {
        const body = { request: qid, partner: f.partner, text: f.text.trim() };
        closeAllSheets();
        mutate(null, '/answers/partner', body, 'Ответ отправлен');
      },
    });
  }

  // Посоветовать в ответ не человека, а место или фирму
  function sheetAnswerPlace(qid, catId) {
    const q = S.requests.find((x) => x.id === qid);
    const list = nodesAll().filter((n) => !catId || n.cat === catId || !n.cat)
      .sort((a, b) => nodeRecs(b).length - nodeRecs(a).length);
    const f = { node: '', text: '' };
    openSheet({
      F: f,
      valid: () => f.node && f.text.trim().length >= 20,
      render: () => `${sheetHead(q.from, 'Посоветовать место', esc(U(q.from).name) + ' спрашивает')}
        <div class="note" style="font-size:14px;color:var(--ink)">«${esc(q.text)}»</div>
        <div class="field"><span>Что советуете</span>
          ${list.length ? list.map((n) => `<button class="pick ${f.node === n.id ? 'on' : ''}" data-act="pickWho" data-k="node" data-v="${n.id}">
            <span class="node-ic ${n.kind}" style="width:34px;height:34px">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>
            <span class="grow"><span class="h3 ellip" style="display:block">${esc(n.name)}</span>
            <span class="small muted">${esc(n.cat ? cat(n.cat).name : NODE_KIND[n.kind])}${n.address ? ' · ' + esc(n.address) : ''}</span></span>
            <span class="radio"></span></button>`).join('')
    : '<p class="small muted" style="margin:0">Вы пока не записали ни одного места. Запишите — и сможете советовать его знакомым.</p>'}
          <button class="btn ghost sm block" style="margin-top:10px" data-act="newNode" data-v="place">${ic('plus')}Записать новое</button></div>
        <label class="field"><span>Почему именно это место</span>
          <textarea class="textarea" data-bind="text" maxlength="400" placeholder="Например: чинили там машину дважды, делают в срок и не навязывают лишнего">${esc(f.text)}</textarea>
          <p class="hint" data-count="text" data-min="8"></p></label>
          ${quickChips()}
        <div class="s-foot"><button class="btn primary block" data-act="submitAnswerPlace" data-id="${qid}" data-submit>${ic('send')}Отправить ответ</button></div>`,
      submit: () => {
        const n = nodeById(f.node);
        const text = f.text.trim();
        closeAllSheets();
        mutate(() => { q.answers.push({ from: S.me, person: S.me, text: `${n.name} — ${text}`, at: Date.now() }); },
          '/answers/place', { request: qid, node: f.node, text }, 'Ответ отправлен');
      },
    });
  }

  // Быстрая карточка места или фирмы
  // Карточка места или фирмы из облака: всё главное с одного взгляда —
  // чем занимаются, где и когда, кто там ваш, что говорят знакомые
  function sheetNodePeek(id) {
    const n = nodeById(id);
    if (!n) return;
    const recs = nodeRecs(n).slice().sort((a, b) => (G.dist[a.from] ?? 9) - (G.dist[b.from] ?? 9));
    const best = recs[0];
    const mineRec = recs.find((r) => r.from === S.me);
    const fact = (k) => (n.facts || []).slice().sort(officialFirst).find((f) => f.kind === k);
    const people = nodePeople(n.id).filter((x) => !x.past && (x.accepted !== false) && (!x.waiting || x.user === S.me));
    const waitHere = (S.waiting || []).filter((w) => w.node === n.id);
    const me = people.find((x) => x.user === S.me);
    const friends = people.filter((x) => x.user !== S.me && G.dist[x.user] === 1);
    const others = (S.nodeOthers || {})[n.id] || 0;
    const total = people.length + waitHere.length + others;
    const relation = me ? (me.role === 'owner' ? 'Вы владелец' : `Вы здесь работаете${me.title ? ' · ' + esc(me.title) : ''}`)
      : friends.length ? `Здесь работает ваш знакомый — ${esc(first(friends[0].user))}${friends[0].title ? ', ' + esc(friends[0].title) : ''}`
        : '';
    const info = [
      fact('service') && [ic('spark'), 'Что делают', fact('service').text],
      (n.address || mapLink(n)) && [ic('pin'), 'Где', n.address || 'На карте', mapLink(n)],
      fact('hours') && [ic('clock'), 'Когда работают', fact('hours').text],
      fact('price') && [ic('tag'), 'Сколько стоит', fact('price').text],
      n.link && [ic('link'), 'Сайт', n.link.replace(/^https?:\/\//, ''), n.link.startsWith('http') ? n.link : 'https://' + n.link],
      fact('who') && [ic('user'), 'К кому подходить', fact('who').text],
    ].filter(Boolean);
    const face = (uid) => `<span class="stack-face">${av(uid, 'xs')}</span>`;
    openSheet({
      F: {},
      render: () => `${n.photo ? `<div class="peek-cover"><img src="${esc(srvUrl(n.photo))}" alt=""></div>` : ''}
        <div class="s-head"><span class="node-ic ${n.kind}" style="width:44px;height:44px">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>
          <div class="grow"><h2 class="h2">${esc(n.name)}</h2><div class="small muted" style="margin-top:4px">${NODE_KIND[n.kind]}${n.cat ? ' · ' + esc(cat(n.cat).name) : ''}</div></div>
          <button class="icon-btn" data-act="closeSheet" aria-label="Закрыть" style="box-shadow:none;background:var(--card-2)">${ic('x')}</button></div>
        ${relation ? `<div class="peek-rel">${ic('seal')}${relation}</div>` : ''}
        ${info.length ? `<div class="peek-info">${info.map(([i, label, text, href]) => `${href ? `<a href="${esc(href)}" target="_blank" rel="noopener"` : '<div'} class="peek-row">${i}<span class="grow"><i>${label}</i>${esc(text)}</span>${href ? `${ic('arrow')}</a>` : '</div>'}`).join('')}</div>`
    : `<p class="small muted" style="margin:12px 0 0">О ${n.kind === 'company' ? 'фирме' : 'месте'} пока ничего не дописали: что делают, часы, цены. Знаете — добавьте, это увидят ваши знакомые</p>`}
        ${total ? `<div class="peek-people"><span class="faces">${people.slice(0, 4).map((x) => face(x.user)).join('')}${waitHere.slice(0, Math.max(0, 4 - people.length)).map((w) => `<span class="stack-face">${waitAv(w, 'xs')}</span>`).join('')}</span>
          <span class="grow small">${pl(total, 'человек', 'человека', 'человек')} ${n.kind === 'company' ? 'в фирме' : 'здесь работают'}${friends.length ? ` · ${pl(friends.length, 'ваш знакомый', 'ваших знакомых', 'ваших знакомых')}` : ''}</span></div>` : ''}
        ${best ? `<div class="note" style="color:var(--ink);margin-top:12px">«${esc(best.text)}»<div class="tiny muted" style="margin-top:6px">${esc(full(best.from))}${G.dist[best.from] === 1 ? ' · ваш знакомый' : ''}${recs.length > 1 ? ` · и ещё ${pl(recs.length - 1, 'рекомендация', 'рекомендации', 'рекомендаций')}` : ''}</div></div>`
    : `<p class="small muted" style="margin:12px 0 0">Пока никто не рекомендовал. ${me ? 'Попросите довольных клиентов — одной ссылкой' : 'Были здесь — будьте первым'}</p>`}
        <div class="s-foot"><div class="btn-row">
          <button class="btn ghost" data-act="closeSheet" data-go="#/o/${n.id}">Открыть</button>
          ${canCard(n) ? `<button class="btn primary" data-act="nodeCard" data-id="${n.id}">${ic('edit')}Карточка ${n.kind === 'company' ? 'фирмы' : 'места'}</button>`
    : me ? `<button class="btn primary" data-act="addFact" data-id="${n.id}">${ic('plus')}Дописать сведения</button>`
    : `<button class="btn primary" data-act="recNode" data-id="${n.id}">${ic('seal')}${mineRec ? 'Изменить запись' : 'Рекомендовать'}</button>`}
        </div></div>`,
    });
  }

  // Облако живёт, пока экран открыт: при уходе с экрана его останавливаем
  let cloud = null;
  function mountCloud(id, limitRing, withPlaces, maxFar, onlyPlaces) {
    setTimeout(() => {
      const el = $('#' + id);
      if (!el) return;
      if (cloud) cloud.stop();
      cloud = window.Cloud(el, { onPick: pickInCloud, centerY: id === 'homecloud' ? 0.56 : 0.5, wheelZoom: id !== 'homecloud',
        safeTop: id === 'homecloud' ? 92 : 0 });
      cloud.setData(cloudData(limitRing, withPlaces, maxFar, onlyPlaces));
      cloud.start();
    }, 30);
  }

  // ——— Карта сети ———
  // Вы в центре, вокруг кольцами — знакомые и знакомые знакомых, дальше места и фирмы.
  // Линии показывают, что кого держит: серая — знакомство, синяя — рекомендация.
  function CloudScreen() {
    if (F.show === undefined) F.show = 'all';
    const ring1 = myContacts();
    const ring2 = Object.keys(G.dist).filter((k) => G.dist[k] === 2);
    return `<div class="top"><button class="back" data-act="back" aria-label="Назад">${ic('back')}</button><button class="back" data-act="goHome" aria-label="На главную">${ic('home')}</button>
        <h1 class="h2 grow">Облако сети</h1>
        ${fullBtn()}<a class="me-dot" href="#/me" aria-label="Профиль">${av(S.me, 'xs')}</a></div>
      <div class="chips" style="margin-bottom:10px">
        ${[['all', 'Всё'], ['people', 'Только люди'], ['places', 'Только места']].map(([k, l]) => `<button class="chip ${F.show === k ? 'on' : ''}" data-act="mapShow" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="cloud-box big"><canvas id="bigcloud" aria-label="Облако вашей сети"></canvas></div>
      <div class="cloud-legend" style="margin-top:10px">
        <span><i class="lg-me"></i>вы</span>
        ${F.show === 'places' ? `<span><i class="lg-1"></i>кто советует</span>` : `<span><i class="lg-1"></i>${pl(ring1.length, 'контакт', 'контакта', 'контактов')}</span>
        <span><i class="lg-2"></i>${pl(ring2.length, 'человек', 'человека', 'человек')} через них</span>
        <span><i class="lg-far"></i>дальше</span>`}
        ${F.show === 'people' ? '' : `<span><i class="lg-place"></i>${pl(nodesAll().filter((n) => n.kind !== 'company').length, 'место', 'места', 'мест')}</span>
        <span><i class="lg-co"></i>${pl(nodesAll().filter((n) => n.kind === 'company').length, 'фирма', 'фирмы', 'фирм')}</span>`}
        <span><i class="lg-trust"></i>надёжно</span></div>
      <p class="tiny muted" style="text-align:center;margin-top:10px">Серая нить — знакомы, синяя — рекомендует. Точку можно тянуть, нажатие открывает карточку.</p>`;
  }

  // ——— Места и фирмы ———
  // Такой же узел сети, как человек, только приглашать никого не нужно.
  // Как с человеком иметь дело: короткие варианты, одинаковые у всех
  const HOW = {
    visit: { out: 'Выезжаю', home: 'Принимаю у себя', both: 'И выезжаю, и принимаю', far: 'Работаю удалённо' },
    reply: { fast: 'Отвечаю за час-другой', day: 'Отвечаю в тот же день', slow: 'Отвечаю не сразу' },
    pay: { cash: 'Наличными', card: 'Картой', transfer: 'Переводом', bill: 'По счёту, с договором' },
    langs: { ru: 'Русский', uz: 'Oʻzbekcha', en: 'English' },
  };
  const HOW_LABEL = { area: 'Район', visit: 'Как работаю', hours: 'Когда писать', langs: 'Языки', pay: 'Деньги', reply: 'Ответ' };
  const howList = (v) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);

  const NODE_KIND = { place: 'Место', company: 'Фирма' };
  // Карта — Яндекс: по Узбекистану он знает адреса и дворы лучше остальных.
  // По координатам ставим метку, по адресу — ищем текстом.
  const mapLink = (n) => (n.lat && n.lng
    ? `https://yandex.uz/maps/?ll=${n.lng},${n.lat}&z=17&pt=${n.lng},${n.lat},pm2rdm`
    : n.address ? `https://yandex.uz/maps/?text=${encodeURIComponent(n.address + ', ' + (n.city || 'Ташкент'))}` : '');
  const askWhere = (onOk) => {
    if (!navigator.geolocation) { toast('Телефон не даёт определить место'); return; }
    toast('Определяем, где вы…');
    navigator.geolocation.getCurrentPosition(
      (pos) => onOk(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6)),
      () => toast('Не получилось: разрешите доступ к местоположению'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };
  const FACT_KIND = { service: 'Что делают', hours: 'Когда работают', price: 'Сколько стоит',
    contact: 'Как связаться', who: 'К кому подходить', note: 'Просто знание' };
  const nodesAll = () => Object.values(S.nodes || {});
  // мои записи и те, что пришли от знакомых
  const myNodes = () => nodesAll().filter((n) => n.by === S.me || (n.recs || []).some((r) => r.from === S.me));
  const nodesOf = (id) => nodesAll().filter((n) => (n.recs || []).some((r) => r.from === id && !r.private));
  const nodesNear = () => nodesAll()
    .filter((n) => (n.recs || []).some((r) => !r.private && G.dist[r.from] !== undefined && G.dist[r.from] <= 2))
    .sort((a, b) => nodeNear(b).length - nodeNear(a).length || (b.facts || []).length - (a.facts || []).length);
  const nodeById = (id) => (S.nodes || {})[id];
  const nodeRecs = (n) => (n.recs || []).filter((r) => !r.private || r.from === S.me);
  const nodeNear = (n) => nodeRecs(n).filter((r) => G.dist[r.from] !== undefined && G.dist[r.from] <= 2);

  const nodeCard = (n, accent) => {
    const recs = nodeRecs(n);
    const best = recs.slice().sort((a, b) => (G.dist[a.from] ?? 9) - (G.dist[b.from] ?? 9))[0];
    const who1 = recs.some((r) => r.from === S.me) ? 'Вы рекомендуете'
      : best ? esc(first(best.from)) + (recs.length > 1 ? ` и ещё ${recs.length - 1}` : ' рекомендует')
        : esc(first(n.by)) + ' записал';
    return `<a class="card tap pcard ${accent ? 'accent' : ''} ${n.closed ? 'closed' : ''}" href="#/o/${n.id}">
      ${n.photo ? `<div class="node-cover"><img src="${esc(srvUrl(n.photo))}" alt="" loading="lazy"></div>` : ''}
      <div class="head">${n.photo ? '' : `<span class="node-ic ${n.kind} ${n.closed ? 'off' : ''}">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>`}
        <div class="grow"><div class="name two">${esc(n.name)}</div>
          <div class="job ellip">${esc(n.cat ? cat(n.cat).name : NODE_KIND[n.kind])}</div></div>
        ${n.closed ? '<span class="tag warm">закрылось</span>'
      : `<span class="tag sign ${n.kind} ${n.photo ? 'on-cover' : ''}" title="${NODE_KIND[n.kind]}" aria-label="${NODE_KIND[n.kind]}">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>`}</div>
      <div class="nums">${recs.length ? `${pl(recs.length, 'рекомендация', 'рекомендации', 'рекомендаций')} · ${pl((n.facts || []).length, 'уточнение', 'уточнения', 'уточнений')}` : 'пока только запись'}</div>
      ${best ? `<p class="quote">«${esc(best.text)}»</p><div class="by ellip">${esc(full(best.from))}</div>`
    : `<p class="quote empty">${n.address ? esc(n.address) : 'Никто пока не рассказал об этом месте'}</p>`}
      <div class="foot">${recs.length ? stack(recs.map((r) => r.from)) : ''}
        <span class="who-line grow ellip">${who1}</span>${ic('arrow', 'arr')}</div></a>`;
  };

  // Снимок места — первое, что смотрят. Поэтому и кнопка живёт здесь же, а не в подвале.
  function photoBlock(n, can) {
    const input = `<input type="file" accept="image/*" id="nodephoto" data-node="${n.id}" hidden>`;
    if (n.photo) {
      return `<div class="node-photo full"><img src="${esc(srvUrl(n.photo))}" alt="${esc(n.name)}">
        ${can ? `<label class="shoot">${ic('cam')}Заменить${input}</label>` : ''}</div>`;
    }
    if (!can) return '';
    return `<label class="node-photo blank">${ic('cam')}
      <b>Добавить снимок</b>
      <span>Знакомые узнают место с первого взгляда — вывеску, вход, зал</span>${input}</label>`;
  }

  // ——— Ждут в круге: добавлены из контактов Telegram, но ещё не в Сарафане ———
  // Придут по любой ссылке — Сарафан узнает их и пришлёт заявку от вас.
  function waitingList() {
    const list = S.waiting || [];
    if (!list.length) return '';
    return `<div class="sec-title"><h2 class="h2">Ждут в вашем круге</h2><span class="tag">${list.length}</span></div>
      <p class="sec-note">Ещё не в Сарафане. Придут по любой ссылке — сразу получат вашу заявку</p>
      <div class="card">${list.map((w) => `<button class="person" data-act="openWaiting" data-id="${w.id}" style="width:100%;text-align:left">${waitAv(w, 's')}
        <div class="grow" style="min-width:0"><div class="name ellip">${esc(w.name || 'Без имени')}</div>
        <div class="sub ellip">${esc([w.node && nodeById(w.node) ? (cap1(w.job) || 'Работает') + ' в ' + nodeById(w.node).name : '', w.cat ? cat(w.cat).who : '', w.note, w.username ? '@' + w.username : '', 'ждёт с ' + when(w.at)].filter(Boolean).join(' · '))}</div></div>${ic('chev', 'chev')}</button>`).join('')}</div>`;
  }
  const waitAv = (w, size) => `<span class="av ${size} wait">${w.photo ? `<img src="${esc(srvUrl(w.photo))}" alt="" loading="lazy" onerror="this.remove()">` : esc((w.name || '?').slice(0, 1).toUpperCase())}</span>`;

  // Карточка того, кто ждёт в круге: подписать, как вы его знаете, рекомендовать, поторопить
  function sheetWaiting(id) {
    const w = (S.waiting || []).find((x) => x.id === id);
    if (!w) return;
    const f = { name: w.name || '', note: w.note || '', cat: w.cat || '' };
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 1,
      render: () => `<div class="s-head">${waitAv(w, 'l')}<div class="grow"><h2 class="h2">${esc(f.name || 'Без имени')}</h2>
          <div class="small muted" style="margin-top:4px">${w.username ? '@' + esc(w.username) + ' · ' : ''}ещё не в Сарафане</div></div>
          <button class="icon-btn" data-act="closeSheet" aria-label="Закрыть" style="box-shadow:none;background:var(--card-2)">${ic('x')}</button></div>
        <label class="field"><span>Как вы его знаете</span><input class="input" data-bind="name" maxlength="60" placeholder="Шахина, менеджер PS" value="${esc(f.name)}"></label>
        <label class="field"><span>Заметка — видите только вы</span><textarea class="textarea" data-bind="note" maxlength="300" rows="2" placeholder="Коллега по PS, отвечает за закупки">${esc(f.note)}</textarea></label>
        ${catPick(f, 'cat', 'who', 'Чем занимается')}
        <p class="why">${ic('spark')}Придёт в Сарафан по любой ссылке — сразу получит вашу заявку, и вы станете знакомыми</p>
        <div class="s-foot"><button class="btn primary block" data-act="saveWaiting" data-id="${w.id}" data-submit>Сохранить</button>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn sm" data-act="recWaiting" data-id="${w.id}">${ic('seal')}Рекомендовать</button>
            <button class="btn sm ghost" data-act="sendInvite">${ic('send')}Поторопить</button></div>
          <button class="btn ghost block" style="margin-top:4px" data-act="dropWaiting" data-id="${w.id}" data-name="${esc(w.name)}">Убрать из круга</button></div>`,
    });
  }

  // ——— Люди фирмы: кто владелец, кто работает, кто работал раньше ———
  // Через фирму выходят на своего человека, через человека — на фирму.
  const nodePeople = (nid) => (S.nodePeople || []).filter((x) => x.node === nid);
  const jobsOf = (uid) => (S.nodePeople || []).filter((x) => x.user === uid && nodeById(x.node));
  const cap1 = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
  const jobRole = (x) => (x.role === 'owner' ? cap1(x.title) || 'Владелец' : cap1(x.title) || 'Работает');
  // Неподтверждённая отметка: человек написал о себе сам, никто пока не подтвердил
  const jobState = (x) => (x.accepted === false ? (x.user === S.me ? 'отметил ' + (x.by && U(x.by) ? first(x.by) : 'знакомый') : 'ждёт его согласия')
    : x.waiting ? 'ждёт владельца' : x.confirmed ? '' : x.role === 'owner' ? 'ждёт подтверждения' : 'не подтверждено');
  const recommended = (uid) => (S.recs || []).some((r) => r.to === uid && !r.private);

  // Строка под именем: «Директор · Premium Selection» — до двух текущих мест
  function jobLine(uid) {
    const cur = jobsOf(uid).filter((x) => !x.past && (!x.waiting || uid === S.me));
    if (!cur.length) return '';
    return `<div class="job-line">${cur.slice(0, 2).map((x) => { const n = nodeById(x.node);
      return `<a href="#/o/${n.id}"><span class="node-ic ${n.kind} mini">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>${esc(jobRole(x))} · <b>${esc(n.name)}</b>${jobState(x) ? `<i>${jobState(x)}</i>` : ''}</a>`; }).join('')}
      ${cur.length > 2 ? `<span class="tiny muted">и ещё ${cur.length - 2}</span>` : ''}</div>`;
  }

  // Блок «Где работает» в профиле: текущие места, ниже — «Раньше»
  function partnerOfView(kind, id) {
    const list = partnerFirms(kind, id);
    if (!list.length) return '';
    return `<p class="small" style="margin:${kind === 'user' ? '10px 0 0' : '0'}">${ic('seal')} С ${kind === 'user' ? 'ним' : 'ними'} работают: ${list.slice(0, 4).map((x) => `<a class="link" href="#/o/${x.firm}">${esc(nodeById(x.firm).name)}</a>`).join(', ')}</p>`;
  }

  function workView(uid) {
    const all = jobsOf(uid);
    const mine = uid === S.me;
    const cur = all.filter((x) => !x.past && (!x.waiting || mine));
    const past = all.filter((x) => x.past && (!x.hidden || mine));
    const addBtn = `<button class="btn sm ghost" style="margin-top:10px" data-act="pickNode" data-id="${uid}">${ic('house')}${mine ? 'Отметиться в фирме' : 'Указать, где работает'}</button>`;
    if (!cur.length && !past.length) {
      return mine ? `<div class="sec-title"><h2 class="h2">Где вы работаете</h2></div><div class="card"><p class="small muted" style="margin:0">Найдите свою фирму по названию — знакомые выйдут через вас на неё и наоборот</p>${addBtn}</div>`
        : `<div style="margin-top:12px">${addBtn}</div>`;
    }
    const row = (x) => { const n = nodeById(x.node);
      return `<div class="person"><a class="grow row" href="#/o/${n.id}" style="min-width:0"><span class="node-ic ${n.kind}" style="width:34px;height:34px">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>
        <div class="grow"><div class="name ellip">${esc(n.name)}</div><div class="sub ellip">${esc(jobRole(x))}${jobState(x) && !x.past ? ' · ' + jobState(x) : ''}${x.hidden ? ' · скрыто от других' : ''}</div></div></a>
        ${x.canAccept ? `<button class="btn xs" data-act="acceptWork" data-id="${x.id}">Да</button><button class="btn ghost xs" data-act="workLeave" data-id="${x.id}" data-name="${esc(n.name)}">Нет</button>`
    : mine && !x.past ? `<button class="btn ghost xs" data-act="workLeave" data-id="${x.id}" data-name="${esc(n.name)}">${x.confirmed ? 'Ушёл' : 'Отозвать'}</button>` : ''}
        ${mine && x.past ? `<button class="btn ghost xs" data-act="workHide" data-id="${x.id}" data-v="${x.hidden ? '' : '1'}">${x.hidden ? 'Показывать' : 'Скрыть'}</button><button class="btn ghost xs" data-act="workErase" data-id="${x.id}" data-name="${esc(n.name)}">Удалить</button>` : ''}</div>`; };
    return `<div class="sec-title"><h2 class="h2">${mine ? 'Где вы работаете' : 'Где работает'}</h2></div>
      <div class="card">${cur.map(row).join('') || '<p class="small muted" style="margin:0">Сейчас нигде не отмечен</p>'}
      ${past.length ? `<div class="eyebrow" style="margin-top:12px">раньше</div>${past.map(row).join('')}` : ''}${addBtn}</div>`;
  }

  // Блок «Люди» на странице фирмы или места
  function peopleBlock(n) {
    const all = nodePeople(n.id);
    const cur = all.filter((x) => !x.past)
      .sort((a, b) => (b.role === 'owner') - (a.role === 'owner') || b.confirmed - a.confirmed || (G.dist[a.user] ?? 9) - (G.dist[b.user] ?? 9));
    const past = all.filter((x) => x.past && !x.hidden);
    const others = (S.nodeOthers || {})[n.id] || 0;
    const waitHere = (S.waiting || []).filter((w) => w.node === n.id);
    const mine = cur.find((x) => x.user === S.me);
    const hasOwner = cur.some((x) => x.role === 'owner' && x.confirmed);
    const iOwn = cur.some((x) => x.user === S.me && x.role === 'owner' && x.confirmed);
    const row = (x) => `<div class="person"><a class="grow row" href="#/p/${x.user}" style="min-width:0">${av(x.user, 's')}
        <div class="grow"><div class="name ellip">${esc(full(x.user))}</div>
        <div class="sub ellip">${x.role === 'owner' ? 'Владелец' + (x.title ? ' · ' + esc(x.title) : '') : esc(jobRole(x))}${jobState(x) ? ' · ' + jobState(x) : ''}${recommended(x.user) && x.user !== S.me ? ' · его рекомендуют' : ''}</div></div></a>
        ${x.canConfirm ? `<button class="btn xs" data-act="workConfirm" data-id="${x.id}">Подтвердить</button>` : ''}
        ${iOwn && x.user !== S.me ? `<button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2);margin-left:6px" data-act="workLeave" data-id="${x.id}" data-name="${esc(full(x.user))}" aria-label="Убрать из фирмы">${ic('x')}</button>` : ''}</div>`;
    return `<div class="sec-title"><h2 class="h2">Люди</h2>${cur.length + waitHere.length ? `<span class="tag">${cur.length + others + waitHere.length}</span>` : ''}</div>
      <p class="sec-note">${n.kind === 'company' ? 'Кто здесь работает — можно выйти на своего человека, а не звонить наугад' : 'Кто здесь работает — владелец, мастера, администраторы'}</p>
      <div class="card">${cur.map(row).join('')}${waitHere.map((w) => `<div class="person"><button class="grow row" data-act="openWaiting" data-id="${w.id}" style="min-width:0;text-align:left">${waitAv(w, 's')}
          <div class="grow"><div class="name ellip">${esc(w.name || 'Без имени')}</div><div class="sub ellip">${esc(cap1(w.job) || 'Работает')} · ещё не в Сарафане · видите только вы</div></div></button>
          <button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2);margin-left:6px" data-act="dropWaitJob" data-id="${w.id}" aria-label="Убрать из фирмы">${ic('x')}</button></div>`).join('')}
        ${cur.length || waitHere.length ? '' : '<p class="small muted" style="margin:0 0 4px">Пока никто не отметился</p>'}
        ${others ? `<p class="tiny muted" style="margin:8px 0 0">И ещё ${pl(others, 'человек', 'человека', 'человек')} — не из ваших кругов</p>` : ''}
        ${past.length ? `<div class="eyebrow" style="margin-top:12px">раньше работали</div><div class="chips" style="margin-top:6px">${past.map((x) => `<span class="chip"><a href="#/p/${x.user}" style="text-decoration:none">${esc(full(x.user))}</a>${iOwn || x.user === S.me ? `<button class="chip-x" data-act="workErase" data-id="${x.id}" data-name="${esc(full(x.user))}" aria-label="Удалить запись">${ic('x')}</button>` : ''}</span>`).join('')}</div>` : ''}
        <div class="btn-row" style="margin-top:12px">${mine ? '' : `<button class="btn sm" data-act="workJoin" data-id="${n.id}" data-v="staff">${ic('user')}Я здесь работаю</button>`}
          <button class="btn sm ghost" data-act="proposePerson" data-id="${n.id}">${ic('plus')}Добавить человека</button></div>
        ${mine || hasOwner ? '' : `<button class="btn ghost xs" style="margin-top:6px" data-act="workJoin" data-id="${n.id}" data-v="owner">${ic('house')}Это моя ${n.kind === 'company' ? 'фирма' : 'точка'}</button>`}</div>`;
  }

  // Отметить другого человека в фирме: выбираем из знакомых по имени
  function sheetProposePerson(nid) {
    const n = nodeById(nid);
    if (!n) return;
    const taken = new Set(nodePeople(nid).filter((x) => !x.past).map((x) => x.user));
    const f = { q: '', user: '', wait: '', title: '' };
    // кто ещё не в Сарафане, но ждёт в вашем круге: отметка дождётся, пока он придёт
    const waiters = () => (S.waiting || []).filter((w) => w.node !== nid)
      .filter((w) => !f.q.trim() || normCat(w.name + ' ' + (w.username || '')).includes(normCat(f.q))).slice(0, 8);
    const people = () => Object.keys(S.users).filter((id) => id !== S.me && !taken.has(id))
      .filter((id) => !f.q.trim() || normCat(U(id).name).includes(normCat(f.q)))
      .sort((a, b) => (G.dist[a] ?? 9) - (G.dist[b] ?? 9)).slice(0, 8);
    const peopleHtml = () => {
      const a = people().map((id) => `<button class="person" data-act="pickWho" data-k="user" data-v="${id}" style="width:100%;text-align:left">${av(id, 's')}
          <div class="grow"><div class="name ellip">${esc(full(id))}</div><div class="sub ellip">${esc(who(id))}</div></div></button>`).join('');
      const w = waiters().map((x) => `<button class="person" data-act="pickWho" data-k="wait" data-v="${x.id}" style="width:100%;text-align:left">${waitAv(x, 's')}
          <div class="grow"><div class="name ellip">${esc(x.name || 'Без имени')}</div><div class="sub ellip">${x.username ? '@' + esc(x.username) + ' · ' : ''}ещё не в Сарафане</div></div></button>`).join('');
      return (a || '') + (w ? `<div class="eyebrow" style="margin:12px 2px 4px">ещё не в Сарафане — ждут в вашем круге</div>${w}` : '')
        || '<p class="small muted">Никого не нашли. Кого нет в Сарафане — сначала добавьте в круг: «Моя сеть» → «Добавить знакомых из Telegram»</p>';
    };
    openSheet({
      F: f,
      valid: () => !!(f.user || f.wait),
      render: () => { const w = f.wait && (S.waiting || []).find((x) => x.id === f.wait);
        return `${sheetHead(null, 'Кто работает в «' + esc(n.name) + '»', 'Отметите — ему придёт вопрос «это так?»')}
        ${w ? `<div class="person" style="margin-bottom:8px">${waitAv(w, 's')}<div class="grow"><div class="name">${esc(w.name || 'Без имени')}</div><div class="sub">Ещё не в Сарафане — спросим, когда придёт</div></div>
          <button class="btn ghost xs" data-act="set" data-k="wait" data-v="">Другой</button></div>`
    : f.user ? `<div class="person" style="margin-bottom:8px">${av(f.user, 's')}<div class="grow"><div class="name">${esc(full(f.user))}</div><div class="sub">${esc(who(f.user))}</div></div>
          <button class="btn ghost xs" data-act="set" data-k="user" data-v="">Другой</button></div>`
    : `<label class="field"><span>Кого</span><input class="input" data-live="1" placeholder="Начните печатать имя" value="${esc(f.q)}" autocomplete="off"></label>
        <div class="stack person-find" style="margin-top:6px">${peopleHtml()}</div>`}
        <label class="field"><span>Кем работает</span><input class="input" data-bind="title" maxlength="60" placeholder="мастер, менеджер, врач" value="${esc(f.title)}"></label>
        <p class="why">${ic('spark')}${w ? 'Пока его нет в Сарафане, отметку видите только вы. Придёт — сразу получит вопрос «это так?»'
      : 'Пока он не согласится, отметку видите только вы, он и владелец фирмы'}</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitPropose" data-submit>Отметить</button></div>`; },
      submit: () => {
        closeSheet();
        if (f.wait) mutate(null, '/circle/waiting/job', { id: f.wait, node: nid, title: f.title.trim() }, 'Отметили — спросим, когда придёт в Сарафан');
        else mutate(null, '/nodes/people/propose', { node: nid, user: f.user, title: f.title.trim() }, 'Отметили — ждём его согласия');
      },
      onLive: (v) => { f.q = v; const box = $('#sheet .person-find'); if (box) box.innerHTML = peopleHtml(); },
      // выбрали участника — сбрасываем ожидающего, и наоборот
      onSet: (k) => { if (k === 'user' && f.user) f.wait = ''; if (k === 'wait' && f.wait) f.user = ''; },
    });
  }

  // Найти фирму по названию — среди всех в Сарафане. Себя — сразу отметить, другого — предложить
  function sheetPickNode(uid) {
    const mine = uid === S.me;
    const f = { q: '', node: '', name: '', title: '', items: [] };
    let t = null;
    const search = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (f.q.trim().length < 2) { f.items = []; drawList(); return; }
        try { f.items = LIVE ? (await window.API.get('/nodes/find?q=' + encodeURIComponent(f.q.trim()))).items
          : nodesAll().filter((n) => normCat(n.name).includes(normCat(f.q))).map((n) => ({ id: n.id, name: n.name, kind: n.kind, address: n.address }));
        } catch (e) { f.items = []; }
        drawList();
      }, 250);
    };
    const listHtml = () => (f.q.trim().length < 2 ? '<p class="tiny muted" style="margin:6px 2px">Название, хотя бы две буквы</p>'
      : f.items.map((n) => `<button class="person" data-act="pickNodeFor" data-id="${n.id}" data-name="${esc(n.name)}" style="width:100%;text-align:left">
          <span class="node-ic ${n.kind}" style="width:34px;height:34px">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>
          <div class="grow"><div class="name ellip">${esc(n.name)}</div><div class="sub ellip">${esc([n.address, n.people ? pl(n.people, 'человек', 'человека', 'человек') + ' отмечены' : ''].filter(Boolean).join(' · ') || NODE_KIND[n.kind])}</div></div></button>`).join('')
        + `<button class="link-row wide" data-act="newNode" data-v="company" style="margin-top:6px">${ic('plus')}<span class="grow"><b>Нет в списке — записать фирму</b><i>${f.items.length ? 'Если нужной среди найденных нет' : 'Такой фирмы в Сарафане ещё нет'}</i></span>${ic('arrow')}</button>`);
    const drawList = () => { const box = $('#sheet .node-find'); if (box) box.innerHTML = listHtml(); };
    openSheet({
      F: f,
      valid: () => !!f.node,
      render: () => `${sheetHead(null, mine ? 'Где вы работаете' : 'Где работает ' + esc(first(uid)), mine ? 'Найдите фирму по названию' : 'Отметите — ему придёт вопрос «это так?»')}
        ${f.node ? `<div class="person" style="margin-bottom:8px"><span class="node-ic company" style="width:34px;height:34px">${ic('house')}</span><div class="grow"><div class="name">${esc(f.name)}</div></div>
          <button class="btn ghost xs" data-act="set" data-k="node" data-v="">Другая</button></div>`
    : `<label class="field"><span>Фирма</span><input class="input" data-live="1" placeholder="Premium Selection, Ремстрой…" value="${esc(f.q)}" autocomplete="off"></label>
        <div class="node-find">${listHtml()}</div>`}
        <label class="field"><span>${mine ? 'Кем вы там' : 'Кем работает'}</span><input class="input" data-bind="title" maxlength="60" placeholder="${mine ? 'директор, мастер, менеджер' : 'мастер, менеджер, врач'}" value="${esc(f.title)}"></label>
        <div class="s-foot"><button class="btn primary block" data-act="submitPickNode" data-submit>${mine ? 'Отметиться' : 'Отметить'}</button></div>`,
      submit: () => {
        closeSheet();
        if (mine) mutate(null, '/nodes/people/join', { node: f.node, role: 'staff', title: f.title.trim() }, 'Отмечено');
        else mutate(null, '/nodes/people/propose', { node: f.node, user: uid, title: f.title.trim() }, 'Отметили — ждём его согласия');
      },
      onLive: (v) => { f.q = v; search(); },
    });
  }

  // ——— Правка прямо из приложения — только для основателя ———
  // Кнопка в углу: написал, приложил скриншот — правка уходит в разработку, ответ придёт в бота.
  // Полоса сверху, пока смотрите чужими глазами: кем смотрите и как выйти
  function drawViewAsBar() {
    const va = window.API && window.API.viewAs && window.API.viewAs();
    let bar = $('#viewas');
    if (!va) {
      if (bar) bar.remove();
      document.body.classList.remove('viewing-as');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'viewas'; bar.className = 'viewas-bar';
      document.body.appendChild(bar);
    }
    document.body.classList.add('viewing-as');
    bar.innerHTML = `${ic('eye')}<span class="grow ellip"><b>${esc(va.label)}</b>${va.name && !va.name.startsWith('Гость') ? ' · ' + esc(va.name) : ''}</span>
      <button data-act="viewAsPick">Другой</button><button data-act="viewAsExit">Выйти</button>`;
  }

  function sheetViewAs() {
    const f = { data: null, err: '' };
    window.API.viewRoles().then((r) => { f.data = r; if (SH && SH.F === f) drawSheet(); })
      .catch((e) => { f.err = e.message; if (SH && SH.F === f) drawSheet(); });
    const distWord = (p) => (p.staff ? 'сотрудник вашей фирмы' : p.dist === 1 ? 'ваш знакомый' : p.dist === 2 ? 'знакомый знакомого' : 'не знаком с вами');
    openSheet({
      F: f,
      render: () => `${sheetHead(null, 'Посмотреть глазами других', 'Приложение покажет ровно то, что видит этот человек. Менять ничего нельзя')}
        ${f.err ? `<p class="small muted">${esc(f.err)}</p>` : !f.data ? '<p class="small muted">Собираю, кто кем вам приходится…</p>' : `
        <div class="stack" style="gap:8px">${f.data.roles.map((r) => `<button class="link-row wide" data-act="viewAsGo" data-id="${r.user}" data-label="${esc(r.label)}" data-name="${esc(r.name)}">${ic('eye')}
          <span class="grow"><b>${esc(r.label)}</b><i>${esc(r.hint)}</i></span>${ic('arrow')}</button>`).join('')}</div>
        ${f.data.people.length ? `<div class="sec-title"><h2 class="h2">Или конкретный человек</h2></div>
        <div class="card">${f.data.people.map((p) => `<button class="person" style="width:100%;text-align:left" data-act="viewAsGo" data-id="${p.id}" data-label="${esc(distWord(p)[0].toUpperCase() + distWord(p).slice(1))}" data-name="${esc(p.name)}">
          ${U(p.id) ? av(p.id, 's') : `<span class="av s" style="--h:${hue(p.id)}">${esc(p.name[0] || '?')}</span>`}<div class="grow" style="min-width:0"><div class="name ellip">${esc(p.name)}</div><div class="sub">${distWord(p)}</div></div></button>`).join('')}</div>` : ''}`}`,
    });
  }

  // Инструменты основателя в углу: «глазами других» и «Правка». Остальным не видны
  function drawFixBtn() {
    drawViewAsBar();
    let b = $('#fixbtn');
    const show = LIVE && isFounder(S.me);
    if (!show) { if (b) b.hidden = true; return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'fixbtn'; b.className = 'dev-tools';
      b.innerHTML = `<button class="fix-btn round" aria-label="Посмотреть глазами других" title="Посмотреть глазами других">${ic('eye')}</button>`
        + `<button class="fix-btn" aria-label="Отправить правку">${ic('edit')}<span>Правка</span></button>`;
      b.children[0].addEventListener('click', () => sheetViewAs());
      b.children[1].addEventListener('click', () => sheetFix());
      document.body.appendChild(b);
    }
    b.hidden = !!SH;
  }

  function sheetFix() {
    const f = { text: '', file: null, screen: location.hash || '#/' };
    openSheet({
      F: f,
      valid: () => f.text.trim().length >= 3 || !!f.file,
      render: () => `${sheetHead(null, 'Правка', 'Уйдёт в разработку, ответ придёт в бота')}
        <label class="field"><span>Что поправить</span><textarea class="textarea" data-bind="text" rows="4" maxlength="2000" placeholder="Кнопка кривая, текст непонятный, хочу чтобы…">${esc(f.text)}</textarea></label>
        <label class="link-row wide" style="cursor:pointer;margin-top:8px">${ic('cam')}<span class="grow"><b>${f.file ? 'Скриншот приложен' : 'Приложить скриншот'}</b><i>${f.file ? esc(f.file.name) : 'Необязательно, но так понятнее'}</i></span>
          <input type="file" accept="image/*" id="fixfile" hidden></label>
        <p class="tiny muted" style="margin:8px 2px 0">Экран, на котором вы были, приложу сам: ${esc(f.screen)}</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitFix" data-submit>${ic('send')}Отправить правку</button></div>`,
      submit: async () => {
        try {
          await window.API.upload('/feedback', f.file, { text: f.text.trim(), screen: f.screen, size: innerWidth + '×' + innerHeight });
          closeSheet(); toast('Правка ушла в разработку');
        } catch (e) { toast(e.message); }
      },
    });
    setTimeout(() => { const inp = $('#fixfile'); if (inp) inp.onchange = () => { f.file = inp.files && inp.files[0]; drawSheet(); setTimeout(() => { const i2 = $('#fixfile'); if (i2) i2.onchange = inp.onchange; }, 30); }; }, 60);
  }

  function sheetWorkJoin(nid, role) {
    const n = nodeById(nid);
    if (!n) return;
    const hasOwner = nodePeople(nid).some((x) => !x.past && x.role === 'owner' && x.confirmed);
    const f = { role: role === 'owner' && !hasOwner ? 'owner' : 'staff', title: '' };
    openSheet({
      F: f,
      valid: () => true,
      render: () => `${sheetHead(null, esc(n.name), f.role === 'owner' ? 'Это ваша фирма' : 'Вы здесь работаете')}
        <div class="field" style="margin-top:0"><span>Кто вы здесь</span><div class="chips">
          <button class="chip ${f.role === 'staff' ? 'on' : ''}" data-act="set" data-k="role" data-v="staff">Работаю здесь</button>
          ${hasOwner ? '' : `<button class="chip ${f.role === 'owner' ? 'on' : ''}" data-act="set" data-k="role" data-v="owner">Владелец</button>`}</div></div>
        <label class="field"><span>${f.role === 'owner' ? 'Должность, если хотите' : 'Кем'}</span><input class="input" data-bind="title" maxlength="60"
          placeholder="${f.role === 'owner' ? 'директор, основатель' : 'мастер, врач, администратор'}" value="${esc(f.title)}"></label>
        <p class="why">${ic('spark')}${f.role === 'owner'
    ? 'Подтвердит ваш знакомый или тот, кто записал фирму. После этого вы сможете подтверждать сотрудников и править карточку'
    : hasOwner ? 'Подтвердит владелец. До этого отметку видите только вы и он'
      : 'Видно сразу, с пометкой «не подтверждено», — пока не подтвердит коллега или владелец'}</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitWork" data-submit>Отметиться</button></div>`,
      submit: () => {
        closeSheet();
        mutate(() => { (S.nodePeople = S.nodePeople || []).push({ id: 'w' + uid(), node: nid, user: S.me, role: f.role, title: f.title.trim(),
          confirmed: false, past: false, hidden: false, waiting: hasOwner, at: Date.now() }); },
        '/nodes/people/join', { node: nid, role: f.role, title: f.title.trim() }, 'Отмечено');
      },
    });
  }

  // Карточку фирмы заполняет владелец, а пока его нет — тот, кто её записал
  const canCard = (n) => {
    const owners = nodePeople(n.id).filter((x) => !x.past && x.role === 'owner' && x.confirmed).map((x) => x.user);
    return owners.includes(S.me) || (!owners.length && (n.by === S.me || n.claimed === S.me));
  };
  const officialFirst = (a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0);

  // Одной формой: всё главное о фирме — что делают, где, когда, сколько, к кому подходить
  function sheetNodeCard(id) {
    const n = nodeById(id);
    if (!n) return;
    const own = (k) => ((n.facts || []).find((f) => f.kind === k && f.official && f.from === S.me) || {}).text || '';
    const f = { name: n.name, cat: n.cat || '', address: n.address || '', link: n.link || '',
      service: own('service'), hours: own('hours'), price: own('price'), who: own('who'), contact: own('contact') };
    const field = (k, label, ph, area) => `<label class="field"><span>${label}</span>${area
      ? `<textarea class="textarea" data-bind="${k}" rows="2" maxlength="300" placeholder="${ph}">${esc(f[k])}</textarea>`
      : `<input class="input" data-bind="${k}" maxlength="200" placeholder="${ph}" value="${esc(f[k])}">`}</label>`;
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2,
      render: () => `${sheetHead(null, n.kind === 'company' ? 'Карточка фирмы' : 'Карточка места', 'Всё, что знакомым полезно знать заранее')}
        ${field('name', 'Название', 'Premium Selection')}
        ${catPick(f, 'cat', 'name', 'Сфера')}
        ${field('service', 'Что делаете', 'Широкоформатная печать, вывески, POS-материалы', true)}
        ${field('address', 'Адрес', 'Бешагач, 71')}
        ${field('hours', 'Когда работаете', 'Пн–Сб, 9:00–19:00')}
        ${field('price', 'Сколько стоит', 'Баннер 3×6 м — от 450 000 сум', true)}
        ${field('link', 'Сайт или канал', 'ps.com.uz')}
        ${field('who', 'К кому подходить', 'Раксана — менеджер, отвечает за заказы')}
        ${field('contact', 'Как связаться', '+998 71 … или @premium_selection')}
        <p class="why">${ic('spark')}Это будет стоять первым, с пометкой «от владельца». Уточнения знакомых останутся ниже</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitCard" data-submit>Сохранить карточку</button></div>`,
      submit: () => {
        closeSheet();
        mutate(null, '/nodes/card', { id: n.id, name: f.name.trim(), cat: f.cat || '', address: f.address.trim(), link: f.link.trim(),
          service: f.service.trim(), hours: f.hours.trim(), price: f.price.trim(), who: f.who.trim(), contact: f.contact.trim() }, 'Карточка сохранена');
      },
    });
  }

  // С кем работает фирма: подрядчики и поставщики — от имени фирмы, видно, кто вёл дело
  const partnersOf = (fid) => (S.partners || []).filter((x) => x.firm === fid);
  const partnerFirms = (kind, id) => (S.partners || []).filter((x) => (kind === 'user' ? x.user === id : x.node === id) && nodeById(x.firm));
  // Один и тот же подрядчик у разных фирм — одна карточка: сервер сводит их по телефону или нику
  const partnerGroups = (list) => {
    const m = new Map();
    list.forEach((x) => { const k = x.key || x.id; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return [...m.values()];
  };
  const stem = (w) => (w.length > 5 ? w.slice(0, w.length - 3) : w);
  const partnerHay = (x) => normCat([x.name, x.section, x.text, x.cat ? cat(x.cat).name + ' ' + cat(x.cat).who : ''].join(' '));
  // Подходит ли подрядчик под запрос: все слова (по корню) есть в имени, разделе, сфере или заметках
  const partnerFits = (x, q, catId) => {
    const hay = partnerHay(x);
    if (catId && (x.cat === catId || catWords(cat(catId)).some((w) => w.length >= 4 && hay.includes(stem(w))))) return true;
    const words = normCat(q).split(/[\s,.]+/).filter((w) => w.length >= 3);
    return !!words.length && words.every((w) => hay.includes(stem(w)));
  };
  // Насколько подрядчик подходит к запросу знакомого: сфера и совпавшие слова
  const partnerScore = (x, q) => {
    const hay = partnerHay(x);
    const words = normCat(q.text || '').split(/[\s,.!?]+/).filter((w) => w.length >= 4);
    return (q.cat && x.cat === q.cat ? 3 : 0) + words.filter((w) => hay.includes(stem(w))).length;
  };
  const myFirmPartners = () => (S.partners || []).filter((x) => x.inside);
  const partnersForRequest = (q) => myFirmPartners().map((x) => ({ x, s: partnerScore(x, q) }))
    .filter((y) => y.s > 0).sort((a, b) => b.s - a.s).map((y) => y.x);
  const partnerAv = (x) => (x.user && U(x.user) ? av(x.user, 's')
    : `<span class="av s" style="--h:${hue(x.key || x.id)}" aria-hidden="true">${esc(((x.name || '?').match(/[A-Za-zА-Яа-яЁё0-9]/) || ['?'])[0].toUpperCase())}</span>`);
  const firmsLine = (g) => [...new Set(g.map((x) => x.firm))].filter((f) => nodeById(f)).map((f) => nodeById(f).name);
  function partnerCard(g) {
    const x = g[0];
    const where = (x.section || '').split(' › ').slice(-1)[0] || (x.cat ? cat(x.cat).who : '');
    const firms = firmsLine(g);
    const inner = `${partnerAv(x)}<div class="grow" style="min-width:0"><div class="name ellip">${esc(x.user && U(x.user) ? full(x.user) : x.name)}</div>
      <div class="sub ellip">${esc([where, 'работает с ' + firms.join(', ')].filter(Boolean).join(' · '))}</div></div>`;
    return x.user && U(x.user) ? `<a class="person" href="#/p/${x.user}">${inner}</a>`
      : `<button class="person" style="width:100%;text-align:left" data-act="partnerView" data-id="${x.id}">${inner}</button>`;
  }
  const findPartners = (q, catId) => partnerGroups((S.partners || []).filter((x) => nodeById(x.firm) && partnerFits(x, q, catId)));

  // Разделы открываются по нажатию: у фирмы бывает полсотни подрядчиков
  const openSecs = new Set();
  function partnersBlock(n) {
    const list = partnersOf(n.id);
    const member = nodePeople(n.id).some((x) => x.user === S.me && !x.past && x.confirmed);
    const iOwn = nodePeople(n.id).some((x) => x.user === S.me && !x.past && x.confirmed && x.role === 'owner');
    if (!list.length && !member) return '';
    const who = (x) => (x.user ? full(x.user) : x.node && nodeById(x.node) ? nodeById(x.node).name : x.name || 'Без имени');
    const pic = (x) => (x.user ? av(x.user, 's') : x.node ? `<span class="node-ic ${nodeById(x.node) ? nodeById(x.node).kind : 'company'}" style="width:34px;height:34px">${ic('house')}</span>`
      : `<span class="av s" style="--h:${hue(x.id)}" aria-hidden="true">${esc(((x.name || '?').match(/[A-Za-zА-Яа-яЁё0-9]/) || ['?'])[0].toUpperCase())}</span>`);
    const via = (x) => (x.source === 'import' ? '' : x.via === S.me ? 'через вас' : x.via ? 'вёл(а) ' + first(x.via) : x.viaName ? 'вёл(а) ' + x.viaName : '');
    const top = (x) => (x.section || '').split(' › ')[0];
    const rest = (x) => (x.section || '').split(' › ').slice(1).join(' › ');
    const reach = (x) => (x.inside ? [x.phone, x.username ? '@' + x.username : ''].filter(Boolean).join(' · ') : '');
    const row = (x) => {
      const link = x.user ? `href="#/p/${x.user}"` : x.node ? `href="#/o/${x.node}"` : `href="#" data-act="partnerView" data-id="${x.id}"`;
      const sub = [rest(x) || (x.cat ? cat(x.cat).who : ''), via(x), reach(x), x.text].filter(Boolean).join(' · ');
      return `<div class="person">${link ? `<a class="grow row" ${link} style="min-width:0">` : '<div class="grow row" style="min-width:0">'}${pic(x)}
          <div class="grow" style="min-width:0"><div class="name ellip">${esc(who(x))}</div>
          ${sub ? `<div class="sub ellip">${esc(sub)}</div>` : ''}</div>${link ? '</a>' : '</div>'}
          ${x.by === S.me || iOwn ? `<button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2);margin-left:6px" data-act="dropPartner" data-id="${x.id}" aria-label="Убрать">${ic('x')}</button>` : ''}</div>`;
    };
    const groups = [];
    list.slice().sort((a, b) => (top(a) ? 1 : 0) - (top(b) ? 1 : 0) || (top(a) ? a.id - b.id : 0)).forEach((x) => {
      const k = top(x);
      let g = groups.find((y) => y.k === k);
      if (!g) groups.push(g = { k, items: [] });
      g.items.push(x);
    });
    const body = groups.length > 1 || (groups[0] && groups[0].k)
      ? groups.map((g) => {
        const key = n.id + ':' + g.k, open = openSecs.has(key) || g.items.length <= 3;
        return `<div class="partner-sec"><button class="partner-sec-head" data-act="toggleSec" data-k="${esc(key)}">
            <b>${esc(g.k || 'Отмечены вручную')}</b><span class="tag">${g.items.length}</span><span class="grow"></span>${g.items.length > 3 ? `<span class="tiny muted">${open ? 'Свернуть' : 'Показать'}</span>` : ''}</button>
          ${open ? g.items.map(row).join('') : `<p class="tiny muted" style="margin:0 0 6px">${esc(g.items.slice(0, 4).map((x) => who(x).split(' ')[0]).join(', '))}${g.items.length > 4 ? ' и ещё ' + (g.items.length - 4) : ''}</p>`}</div>`;
      }).join('')
      : list.map(row).join('');
    return `<div class="sec-title"><h2 class="h2">С кем работает</h2>${list.length ? `<span class="tag">${list.length}</span>` : ''}</div>
      <p class="sec-note">Подрядчики и поставщики ${n.kind === 'company' ? 'фирмы' : 'места'} — рекомендация от ${esc(n.name)}, а не личная${member && list.some((x) => x.source === 'import') ? '. Телефоны и заметки видят только сотрудники' : ''}</p>
      <div class="card">${body || '<p class="small muted" style="margin:0 0 4px">Пока пусто. Добавьте подрядчиков и поставщиков, с которыми работает фирма — знакомые смогут на них выйти</p>'}
        ${member ? `<div class="btn-row" style="margin-top:12px"><button class="btn sm ghost" data-act="addPartner" data-id="${n.id}">${ic('plus')}Добавить подрядчика</button></div>
        <p class="tiny muted" style="margin:6px 2px 0">Много контактов сразу — пришлите боту файл: контакты из телефона (.vcf), таблицу (.csv) или карту XMind</p>` : ''}</div>`;
  }

  // Контакт фирмы целиком: раздел, заметки и цены, как связаться
  function sheetPartnerView(pid) {
    const x0 = (S.partners || []).find((y) => y.id === pid);
    if (!x0) return;
    const group = (S.partners || []).filter((y) => (y.key || y.id) === (x0.key || x0.id));
    const x = group.find((y) => y.inside) || x0;          // есть своя фирма среди них — берём её запись: там телефон
    const firm = nodeById(x.firm);
    const firms = [...new Set(group.map((y) => y.firm))].map(nodeById).filter(Boolean);
    const tel = (x.phone || '').match(/\+?[\d\s\-()]{7,}/);
    const notes = [...new Set(group.flatMap((y) => (y.text || '').split(/;\s*/)).filter(Boolean))];
    // Телефона не видно — выходим через сотрудника фирмы, который вас знает
    const staff = firms.flatMap((n) => nodePeople(n.id).filter((y) => !y.past && y.confirmed && U(y.user) && y.user !== S.me)
      .map((y) => ({ user: y.user, firm: n.name })))
      .sort((a, b) => (G.dist[a.user] ?? 9) - (G.dist[b.user] ?? 9)).slice(0, 4);
    openSheet({
      F: {},
      render: () => `${sheetHead(null, esc(x.name || 'Без имени'), esc([x.section, x.cat ? cat(x.cat).who : ''].filter(Boolean).join(' · ') || 'Контакт фирмы'))}
        <p class="small muted" style="margin:0 0 12px">${ic('seal')} С ним работа${firms.length > 1 ? 'ют' : 'ет'} ${firms.map((n) => `<a class="link" href="#/o/${n.id}">${esc(n.name)}</a>`).join(', ') || 'фирма'}${x.viaName ? ' · вёл(а) ' + esc(x.viaName) : x.via && x.source !== 'import' ? ' · вёл(а) ' + esc(first(x.via)) : ''}</p>
        ${notes.length ? `<div class="card" style="margin-bottom:12px">${notes.map((t) => `<p class="small" style="margin:4px 0">${esc(t)}</p>`).join('')}</div>` : ''}
        ${x.inside ? `<div class="stack" style="gap:8px">
          ${x.username ? `<button class="btn primary block" data-act="openTg" data-u="${esc(x.username)}">${ic('send')}Написать в Telegram · @${esc(x.username)}</button>` : ''}
          ${tel ? `<a class="btn ${x.username ? 'ghost' : 'primary'} block" href="tel:${esc(tel[0].replace(/[^\d+]/g, ''))}">${ic('phone')}Позвонить · ${esc(tel[0].trim())}</a>` : ''}</div>`
    : `<p class="small muted" style="margin:0 0 10px">Телефон знают сотрудники фирмы — спросите того, кто ближе к вам</p>
          ${staff.length ? `<div class="card">${staff.map((y) => `<a class="person" href="#/p/${y.user}">${av(y.user, 's')}<div class="grow" style="min-width:0"><div class="name ellip">${esc(full(y.user))}</div>
            <div class="sub ellip">${esc(y.firm)}${G.dist[y.user] === 1 ? ' · ваш знакомый' : G.dist[y.user] === 2 ? ' · через ваших знакомых' : ''}</div></div></a>`).join('')}</div>` : ''}`}`,
    });
  }

  function sheetPartner(fid) {
    const firm = nodeById(fid);
    if (!firm) return;
    const staff = nodePeople(fid).filter((x) => !x.past && x.confirmed && x.accepted !== false).map((x) => x.user);
    const f = { mode: 'contact', user: '', node: '', nodeName: '', name: '', phone: '', cat: '', text: '', via: S.me, viaName: '', q: '', items: [] };
    let t = null;
    const people = () => Object.keys(S.users).filter((id) => id !== S.me && (!f.q.trim() || normCat(U(id).name).includes(normCat(f.q)))).slice(0, 8);
    const listHtml = () => (f.mode === 'user'
      ? people().map((id) => `<button class="person" data-act="pickWho" data-k="user" data-v="${id}" style="width:100%;text-align:left">${av(id, 's')}<div class="grow"><div class="name ellip">${esc(full(id))}</div><div class="sub ellip">${esc(who(id))}</div></div></button>`).join('') || '<p class="small muted">Никого не нашли</p>'
      : f.q.trim().length < 2 ? '<p class="tiny muted" style="margin:6px 2px">Название, хотя бы две буквы</p>'
        : f.items.filter((x) => x.id !== fid).map((x) => `<button class="person" data-act="pickPartnerNode" data-id="${x.id}" data-name="${esc(x.name)}" style="width:100%;text-align:left"><span class="node-ic ${x.kind}" style="width:34px;height:34px">${ic(x.kind === 'company' ? 'house' : 'pin')}</span><div class="grow"><div class="name ellip">${esc(x.name)}</div><div class="sub ellip">${esc(x.address || NODE_KIND[x.kind])}</div></div></button>`).join('') || '<p class="small muted">Не нашли — добавьте как «Просто контакт»</p>');
    openSheet({
      F: f,
      valid: () => (f.mode === 'user' ? !!f.user : f.mode === 'node' ? !!f.node : f.name.trim().length >= 2),
      render: () => `${sheetHead(null, 'Подрядчик «' + esc(firm.name) + '»', 'С кем работает фирма — видно, кто вёл дело')}
        <div class="chips" style="margin-bottom:10px">${[['contact', 'Просто контакт'], ['user', 'Человек в Сарафане'], ['node', 'Фирма в Сарафане']].map(([k, l]) => `<button class="chip ${f.mode === k ? 'on' : ''}" data-act="set" data-k="mode" data-v="${k}">${l}</button>`).join('')}</div>
        ${f.mode === 'contact' ? `<label class="field" style="margin-top:0"><span>Имя или название</span><input class="input" data-bind="name" maxlength="80" placeholder="Бумага-Опт, Азамат" value="${esc(f.name)}"></label>
          <label class="field"><span>Телефон — видят только сотрудники фирмы</span><input class="input" data-bind="phone" inputmode="tel" maxlength="40" placeholder="+998 90 …" value="${esc(f.phone)}"></label>`
    : f.mode === 'user' ? (f.user ? `<div class="person">${av(f.user, 's')}<div class="grow"><div class="name">${esc(full(f.user))}</div></div><button class="btn ghost xs" data-act="set" data-k="user" data-v="">Другой</button></div>`
      : `<label class="field" style="margin-top:0"><span>Кого</span><input class="input" data-live="1" placeholder="Начните печатать имя" autocomplete="off"></label><div class="stack partner-find">${listHtml()}</div>`)
      : (f.node ? `<div class="person"><span class="node-ic company" style="width:34px;height:34px">${ic('house')}</span><div class="grow"><div class="name">${esc(f.nodeName)}</div></div><button class="btn ghost xs" data-act="set" data-k="node" data-v="">Другая</button></div>`
        : `<label class="field" style="margin-top:0"><span>Фирма</span><input class="input" data-live="1" placeholder="Название фирмы" autocomplete="off"></label><div class="stack partner-find">${listHtml()}</div>`)}
        ${catPick(f, 'cat', 'name', 'Сфера')}
        <label class="field"><span>За что ценим — одной фразой</span><input class="input" data-bind="text" maxlength="200" placeholder="Бумага всегда в наличии, привозят за день" value="${esc(f.text)}"></label>
        <div class="field"><span>Кто вёл дело</span><div class="chips">${[S.me, ...staff.filter((u) => u !== S.me)].slice(0, 8).map((u) => `<button class="chip ${f.via === u && !f.viaName ? 'on' : ''}" data-act="pickVia" data-v="${u}">${u === S.me ? 'Я' : esc(first(u))}</button>`).join('')}${(S.waiting || []).filter((w) => w.node === fid).slice(0, 8).map((w) => `<button class="chip ${f.viaName === w.name ? 'on' : ''}" data-act="pickVia" data-name="${esc(w.name)}">${esc(w.name.split(' ')[0])}</button>`).join('')}</div>
          <input class="input" style="margin-top:8px" data-bind="viaName" maxlength="60" placeholder="Или имя: менеджер Раксана" value="${esc(f.viaName)}"></div>
        <div class="s-foot"><button class="btn primary block" data-act="submitPartner" data-submit>Добавить</button></div>`,
      onLive: (v) => {
        f.q = v;
        const box = $('#sheet .partner-find');
        if (f.mode === 'user') { if (box) box.innerHTML = listHtml(); return; }
        clearTimeout(t);
        t = setTimeout(async () => { try { f.items = (await window.API.get('/nodes/find?q=' + encodeURIComponent(v.trim()))).items; } catch (e) { f.items = []; } const b2 = $('#sheet .partner-find'); if (b2) b2.innerHTML = listHtml(); }, 250);
      },
      submit: () => {
        closeSheet();
        mutate(null, '/firms/partner', { firm: fid, user: f.mode === 'user' ? f.user : '', node: f.mode === 'node' ? f.node : '',
          name: f.mode === 'contact' ? f.name.trim() : '', phone: f.mode === 'contact' ? f.phone.trim() : '', cat: f.cat || '',
          text: f.text.trim(), via: f.viaName.trim() ? '' : f.via, via_name: f.viaName.trim() }, 'Добавлено в «С кем работает»');
      },
    });
  }

  function Node(id) {
    const n = nodeById(id);
    if (!n) return '<div class="empty"><h2 class="h2">Место не найдено</h2><a class="btn" href="#/">На главную</a></div>';
    const recs = nodeRecs(n).sort((a, b) => (G.dist[a.from] ?? 9) - (G.dist[b.from] ?? 9));
    const mine = recs.find((r) => r.from === S.me);
    const facts = (n.facts || []).slice().sort((a, b) => officialFirst(a, b) || (G.dist[a.from] ?? 9) - (G.dist[b.from] ?? 9));
    const byKind = {};
    facts.forEach((f) => { (byKind[f.kind] = byKind[f.kind] || []).push(f); });
    const can = n.by === S.me || !!mine || canCard(n);
    return `<div class="top ${n.photo ? 'on-photo' : ''}"><button class="back" data-act="back" aria-label="Назад">${ic('back')}</button><button class="back" data-act="goHome" aria-label="На главную">${ic('home')}</button>
        <div class="grow"></div>
        ${can ? `<button class="icon-btn" data-act="nodeTools" data-id="${n.id}" aria-label="Что можно поправить">${ic('dots3')}</button>` : ''}
        <button class="icon-btn" data-act="shareNode" data-id="${n.id}" aria-label="Поделиться">${ic('share')}</button></div>
      ${photoBlock(n, can)}
      <div class="p-head">
        <div class="node-line ${n.photo ? 'on-photo' : ''}"><span class="node-ic big ${n.kind} ${n.closed ? 'off' : ''} ${n.photo ? 'lift' : ''}">${ic(n.kind === 'company' ? 'house' : 'pin')}</span>
          <span class="who">${NODE_KIND[n.kind]}${n.cat ? ' · ' + esc(cat(n.cat).name) : ''}</span></div>
        <h1 class="h1" style="margin-top:-6px">${esc(n.name)}</h1>
        ${n.closed ? `<div class="warn">${ic('alert')}<div>Закрылось или переехало${n.closedBy ? ' — отметил ' + esc(full(n.closedBy)) : ''}. Рекомендации оставили: они часть истории.</div></div>` : ''}
        ${mapLink(n)
      ? `<a class="link-row" href="${esc(mapLink(n))}" target="_blank" rel="noopener">${ic('pin')}
          <span class="grow">${n.address ? esc(n.address) : 'Посмотреть на карте'}<i>${n.lat ? 'Открыть в Яндекс Картах — точка уже стоит' : 'Найти в Яндекс Картах'}</i></span>${ic('arrow')}</a>`
      : n.address ? `<p class="about">${ic('pin')} ${esc(n.address)}</p>` : ''}
        ${n.link ? `<a class="link-row" href="${esc(n.link.startsWith('http') ? n.link : 'https://' + n.link)}" target="_blank" rel="noopener">${ic('link')}<span class="grow ellip">${esc(n.link.replace(/^https?:\/\//, ''))}</span>${ic('arrow')}</a>` : ''}</div>

      <div class="stat-grid" style="margin-top:18px">
        <div class="stat"><b>${recs.length}</b><span>${plural(recs.length, 'рекомендация', 'рекомендации', 'рекомендаций')}</span></div>
        <div class="stat"><b>${new Set(recs.map((r) => r.from)).size}</b><span>${plural(new Set(recs.map((r) => r.from)).size, 'человек рекомендует', 'человека рекомендуют', 'человек рекомендуют')}</span></div>
        <div class="stat"><b>${facts.length}</b><span>${plural(facts.length, 'уточнение', 'уточнения', 'уточнений')}</span></div></div>

      ${canCard(n) && !(n.facts || []).some((x) => x.official) ? `<button class="link-row wide" data-act="nodeCard" data-id="${n.id}" style="margin-top:16px">${ic('edit')}<span class="grow"><b>Заполните карточку ${n.kind === 'company' ? 'фирмы' : 'места'}</b><i>Что делаете, часы, цены, к кому подходить — одним экраном</i></span>${ic('arrow')}</button>` : ''}

      ${partnerOfView('node', n.id) ? `<div class="card" style="margin-top:16px">${partnerOfView('node', n.id)}</div>` : ''}

      ${peopleBlock(n)}

      ${partnersBlock(n)}

      <div class="sec-title"><h2 class="h2">Что об этом знают</h2><button class="btn sm" data-act="${canCard(n) ? 'nodeCard' : 'addFact'}" data-id="${n.id}">${canCard(n) ? 'Карточка' : 'Добавить'}</button></div>
      ${facts.length ? `<div class="card">${Object.keys(byKind).map((k) => `<div class="fact-group">
        <div class="eyebrow">${esc(FACT_KIND[k] || FACT_KIND.note)}</div>
        ${byKind[k].map((f) => `<div class="fact"><p>${esc(f.text)}</p>
          <div class="row"><span class="tiny muted grow">${f.official ? '<b style="color:#6b4fd0">от владельца</b> · ' : ''}${esc(full(f.from))}${G.dist[f.from] === 1 ? ' · ваш контакт' : ''} · ${when(f.at)}</span>
          ${f.from === S.me ? `<button class="btn ghost xs" data-act="delFact" data-id="${f.id}">Убрать</button>` : ''}</div></div>`).join('')}
      </div>`).join('')}</div>`
    : `<div class="card"><p class="small muted" style="margin:0">Пока никто ничего не уточнил. Знаете часы работы, цены или к кому подходить — расскажите, это увидят ваши знакомые.</p></div>`}

      ${recs.length ? `<div class="sec-title"><h2 class="h2">Кто рекомендует</h2></div>
      <div class="card">${recs.map((r) => `<div class="rec"><div class="row"><a href="#/p/${r.from}">${av(r.from, 's')}</a>
        <div class="grow"><div class="row" style="gap:8px"><a href="#/p/${r.from}" class="h3 ellip" style="text-decoration:none">${esc(full(r.from))}</a>${G.dist[r.from] === 1 ? circleTag(1) : G.dist[r.from] === 2 ? circleTag(2) : ''}${r.private ? '<span class="tag">только для вас</span>' : ''}</div>
        <div class="tiny muted">${when(r.at)}</div></div></div>
        <p class="txt">${esc(r.text)}</p></div>`).join('')}</div>` : ''}

      <div style="height:96px"></div>
      <div class="actions"><div class="inner">
        <button class="btn primary" data-act="recNode" data-id="${n.id}">${ic('seal')}${mine ? 'Изменить запись' : 'Рекомендовать'}</button>
        </div></div>`;
  }

  // Что можно поправить в карточке места — под кнопкой в шапке, а не в подвале экрана
  function sheetNodeTools(id) {
    const n = nodeById(id);
    if (!n) return;
    openSheet({
      F: {},
      render: () => `${sheetHead(null, esc(n.name), 'Что можно поправить')}
        ${canCard(n) ? `<button class="link-row wide" data-act="nodeCard" data-id="${n.id}">${ic('edit')}
          <span class="grow"><b>Карточка ${n.kind === 'company' ? 'фирмы' : 'места'}</b><i>Название, сфера, что делаете, адрес, часы, цены, сайт</i></span>${ic('arrow')}</button>`
    : n.by === S.me ? `<button class="link-row wide" data-act="editNode" data-id="${n.id}">${ic('edit')}
          <span class="grow"><b>Поправить карточку</b><i>Название, сфера, адрес, ссылка</i></span>${ic('arrow')}</button>` : ''}
        <label class="link-row wide" style="cursor:pointer">${ic('cam')}
          <span class="grow"><b>${n.photo ? 'Заменить снимок' : 'Добавить снимок'}</b><i>Знакомые узнают место с первого взгляда</i></span>
          <input type="file" accept="image/*" id="nodephoto2" data-node="${n.id}" hidden></label>
        <button class="link-row wide" data-act="closeNode" data-id="${n.id}" data-v="${n.closed ? '' : '1'}">${ic('alert')}
          <span class="grow"><b>${n.closed ? 'Снова работает' : 'Закрылось или переехало'}</b><i>${n.closed ? 'Уберём отметку, карточка снова обычная' : 'Знакомые не поедут зря. Рекомендации останутся'}</i></span></button>`,
    });
  }

  // Записать место или фирму
  function sheetNewNode(kind) {
    const f = { kind: kind || 'place', name: '', cat: '', address: '', link: '', lat: null, lng: null, text: '' };
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2,
      render: () => `${sheetHead(null, 'Записать место или фирму')}
        <div class="field" style="margin-top:0"><span>Что это</span><div class="chips">
          ${Object.entries(NODE_KIND).map(([k, l]) => `<button class="chip ${f.kind === k ? 'on' : ''}" data-act="set" data-k="kind" data-v="${k}">${l}</button>`).join('')}</div></div>
        <label class="field"><span>Название</span><input class="input" data-bind="name" maxlength="90" placeholder="${f.kind === 'company' ? 'Например: Ремстрой' : 'Например: Чайхана на Мирабаде'}" value="${esc(f.name)}"></label>
        ${catChips(f, S.cats.slice(0, 10).map((c) => c.id))}
        <label class="field"><span>Адрес — если это место</span><input class="input" data-bind="address" maxlength="160" placeholder="Мирабад, 12" value="${esc(f.address)}"></label>
        <label class="field"><span>Ссылка — сайт, канал, карта</span><input class="input" data-bind="link" maxlength="200" placeholder="remstroy.uz" value="${esc(f.link)}"></label>
        <div class="field"><span>Точка на карте</span>
          ${f.lat ? `<div class="note" style="margin-top:0">${ic('pin')} Точка сохранена · ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}
            <button class="btn ghost xs" style="margin-top:8px" data-act="dropWhere">Убрать</button></div>`
    : `<button class="btn block" data-act="takeWhere">${ic('pin')}Взять моё местоположение</button>
             <p class="hint">Если вы сейчас в этом месте — координаты сохранятся, и знакомые смогут построить маршрут</p>`}</div>
        <label class="field"><span>За что советуете — по желанию</span><textarea class="textarea" data-bind="text" maxlength="600" placeholder="Например: плов только до обеда, зато настоящий — ходим семьёй третий год">${esc(f.text)}</textarea></label>
        <div class="note">Приглашать никого не нужно: карточка появится сразу, и её увидят ваши знакомые.</div>
        <p class="why">${ic('spark')}Через полгода вы не вспомните название — а здесь оно останется, и знакомые найдут его по сфере</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitNode" data-submit>${ic('plus')}Записать</button></div>`,
      submit: async () => {
        const body = { kind: f.kind, name: f.name.trim(), cat: f.cat, address: f.address.trim(),
          link: f.link.trim(), lat: f.lat || null, lng: f.lng || null, text: f.text.trim() };
        closeSheet();
        if (!LIVE) { toast('В демо места не записываются'); return; }
        try {
          const res = await window.API.post('/nodes', body);
          await refresh();
          go('#/o/' + res.id);
          toast(res.existed ? 'Это место уже записано — открыли его' : 'Записали');
        } catch (e) { toast(e.message); }
      },
    });
  }

  // Поправить карточку места: адрес меняется, ссылка тоже
  function sheetEditNode(id) {
    const n = nodeById(id);
    const f = { name: n.name, cat: n.cat || '', address: n.address || '', link: n.link || '',
      lat: n.lat || null, lng: n.lng || null, allCats: false };
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2,
      render: () => `${sheetHead(null, 'Поправить карточку', esc(NODE_KIND[n.kind]))}
        <label class="field" style="margin-top:0"><span>Название</span><input class="input" data-bind="name" maxlength="90" value="${esc(f.name)}"></label>
        ${catChips(f, S.cats.slice(0, 10).map((c) => c.id))}
        <label class="field"><span>Адрес</span><input class="input" data-bind="address" maxlength="160" value="${esc(f.address)}"></label>
        <label class="field"><span>Ссылка</span><input class="input" data-bind="link" maxlength="200" value="${esc(f.link)}"></label>
        <div class="field"><span>Точка на карте</span>
          ${f.lat ? `<div class="note" style="margin-top:0">${ic('pin')} ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}
            <button class="btn ghost xs" style="margin-top:8px" data-act="dropWhere">Убрать</button></div>`
    : `<button class="btn block" data-act="takeWhere">${ic('pin')}Взять моё местоположение</button>`}</div>
        <div class="s-foot"><button class="btn primary block" data-act="submitEditNode" data-id="${id}" data-submit>Сохранить</button></div>`,
      submit: () => {
        const body = { id, name: f.name.trim(), cat: f.cat, address: f.address.trim(), link: f.link.trim(),
          lat: f.lat || null, lng: f.lng || null };
        closeSheet();
        mutate(() => Object.assign(nodeById(id), { name: body.name, cat: body.cat, address: body.address, link: body.link }),
          '/nodes/edit', body, 'Поправили');
      },
    });
  }

  // Рекомендовать место
  function sheetNodeRec(id) {
    const n = nodeById(id);
    const was = nodeRecs(n).find((r) => r.from === S.me);
    const f = { text: was ? was.text : '', priv: was ? !!was.private : false };
    openSheet({
      F: f,
      valid: () => f.text.trim().length >= 20,
      render: () => `${sheetHead(null, was ? 'Изменить запись' : 'Рекомендовать', esc(n.name))}
        <label class="field" style="margin-top:0"><span>За что рекомендуете</span>
          <textarea class="textarea" data-bind="text" maxlength="600" placeholder="Что здесь было хорошо: что делали, сколько ждали, чем кончилось">${esc(f.text)}</textarea>
          <p class="hint" data-count="text" data-min="20"></p></label>
        <button class="pick ${f.priv ? 'on' : ''}" data-act="set" data-k="priv" data-v="${f.priv ? '' : '1'}">
          <span class="grow"><span class="h3" style="display:block">Только для себя</span>
          <span class="small muted">Останется в вашем кругу, знакомым видно не будет</span></span><span class="radio"></span></button>
        <div class="s-foot"><button class="btn primary block" data-act="submitNodeRec" data-id="${id}" data-submit>${ic('seal')}${was ? 'Сохранить' : 'Рекомендовать'}</button></div>`,
      submit: () => {
        const body = { node: id, text: f.text.trim(), private: f.priv };
        closeSheet();
        mutate(null, '/nodes/recommend', body, f.priv ? 'Записали только для вас' : 'Готово');
      },
    });
  }

  // Добавить своё знание о месте
  function sheetFact(id) {
    const n = nodeById(id);
    const f = { kind: 'hours', text: '' };
    openSheet({
      F: f,
      valid: () => f.text.trim().length >= 2,
      render: () => `${sheetHead(null, 'Что вы об этом знаете', esc(n.name))}
        <div class="field" style="margin-top:0"><span>О чём расскажете</span><div class="chips">
          ${Object.entries(FACT_KIND).map(([k, l]) => `<button class="chip ${f.kind === k ? 'on' : ''}" data-act="set" data-k="kind" data-v="${k}">${l}</button>`).join('')}</div></div>
        <label class="field"><span>Своими словами</span>
          <textarea class="textarea" data-bind="text" maxlength="300" placeholder="Например: по понедельникам закрыто, а после семи лучше звонить заранее">${esc(f.text)}</textarea></label>
        <div class="note">Рядом будет ваше имя: знакомые увидят, чьё это знание.</div>
        <p class="why">${ic('spark')}Одно уточнение экономит знакомому поездку впустую — часы работы и цены устаревают быстрее всего</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitFact" data-id="${id}" data-submit>Добавить</button></div>`,
      submit: () => {
        const body = { node: id, kind: f.kind, text: f.text.trim() };
        closeSheet();
        mutate(null, '/nodes/fact', body, 'Спасибо, это увидят ваши знакомые');
      },
    });
  }

  // ——— Новое: всё, что произошло и что просит ответа ———
  const todoCounts = () => {
    const asks = S.intros.filter((i) => i.via === S.me && i.status === 'wait').length;
    const pend = S.conns.filter(askedMe).length;
    const inc = incomingRequests().filter((q) => !q.answers.some((a) => a.from === S.me)).length;
    const res = S.intros.filter((i) => i.from === S.me && i.status === 'ok' && !i.result
      && Date.now() - i.at > 3 * 864e5).length;
    // кто отметился в вашей фирме или просит подтвердить, что он владелец
    const work = (S.nodePeople || []).filter((x) => x.canConfirm || x.canAccept).length;
    return { asks, pend, inc, res, work };
  };
  const todo = () => { const t = todoCounts(); return t.asks + t.pend + t.inc + t.res + t.work; };
  const todoText = () => {
    const t = todoCounts();
    const parts = [];
    if (t.inc) parts.push(pl(t.inc, 'запрос от знакомых', 'запроса от знакомых', 'запросов от знакомых'));
    if (t.asks) parts.push(pl(t.asks, 'просьба познакомить', 'просьбы познакомить', 'просьб познакомить'));
    if (t.pend) parts.push(pl(t.pend, 'заявка в вашу сеть', 'заявки в вашу сеть', 'заявок в вашу сеть'));
    if (t.res) parts.push('вопрос о знакомстве');
    if (t.work) parts.push(pl(t.work, 'отметка в фирме', 'отметки в фирме', 'отметок в фирме'));
    return parts.join(' · ');
  };

  function News() {
    const asks = S.intros.filter((i) => i.via === S.me && i.status === 'wait');
    const pend = S.conns.filter(askedMe);
    const inc = incomingRequests();
    const howItWent = S.intros.filter((i) => i.from === S.me && i.status === 'ok' && !i.result
      && Date.now() - i.at > 3 * 864e5).slice(0, 1);
    const ev = feed();
    const work = (S.nodePeople || []).filter((x) => (x.canConfirm || x.canAccept) && nodeById(x.node));
    const nothing = !asks.length && !pend.length && !inc.length && !howItWent.length && !ev.length && !work.length;
    return screenHead('Новое', todo() ? 'Ждут вашего ответа' : 'Движение доверия вокруг вас') + `
      ${nothing ? `<div class="empty" style="padding-top:18vh"><h2 class="h2">Пока тихо</h2>
        <p>Здесь появится движение доверия: кто кого рекомендует, кто вошёл в сеть, кого просят познакомить.</p>
        <a class="btn primary" href="#/net">${ic('plus')}Позвать знакомых</a></div>` : ''}
      ${howItWent.map(resultAskCard).join('')}
      ${asks.length ? `<div class="sec-title"><h2 class="h2">Просят познакомить</h2><span class="badge">${asks.length}</span></div>${asks.map(introAskCard).join('')}` : ''}
      ${work.length ? `<div class="sec-title"><h2 class="h2">Отметились в фирме</h2><span class="badge">${work.length}</span></div>
      <div class="card">${work.map((x) => { const n = nodeById(x.node);
    return `<div class="person"><a class="grow row" href="#/o/${n.id}" style="min-width:0">${av(x.user, 's')}<div class="grow"><div class="name ellip">${esc(full(x.user))}</div>
      <div class="sub ellip">${x.canAccept ? `${x.by && U(x.by) ? esc(first(x.by)) : 'Знакомый'} отметил вас · ` : ''}${x.role === 'owner' ? 'Владелец' : esc(jobRole(x))} · ${esc(n.name)}</div></div></a>
      <button class="btn xs" data-act="${x.canAccept ? 'acceptWork' : 'workConfirm'}" data-id="${x.id}">${x.canAccept ? 'Да, работаю' : 'Подтвердить'}</button>
      <button class="icon-btn" style="width:30px;height:30px;box-shadow:none;background:var(--card-2);margin-left:6px" data-act="workLeave" data-id="${x.id}" data-name="${esc(full(x.user))}" aria-label="Не подтверждать">${ic('x')}</button></div>`; }).join('')}
      <p class="tiny muted" style="margin:8px 0 0">Подтвердите, если это правда: так знакомые выходят на своего человека в фирме</p></div>` : ''}
      ${pend.length ? `<div class="sec-title"><h2 class="h2">Хотят в вашу сеть</h2></div>${pend.map(connRequestCard).join('')}` : ''}
      ${inc.length ? `<div class="sec-title"><h2 class="h2">Вас спрашивают</h2></div><div class="stack">${inc.map((q, i) => requestCard(q, false, i === 0)).join('')}</div>` : ''}
      ${ev.length ? `<div class="sec-title"><h2 class="h2">В вашей сети</h2></div>
      <div class="card">${ev.map((e) => `<div class="feed-item" data-act="goto" data-h="${e.link}" role="link" tabindex="0">${av(e.who, 's')}<div class="grow" style="min-width:0">${e.html}<div class="when">${when(e.at)}</div></div></div>`).join('')}</div>` : ''}`;
  }

  // Просьба познакомить: решает посредник, и только он
  const introAskCard = (i) => `<div class="card accent">
    <div class="row">${av(i.from, 's')}<div class="grow"><div class="h3">${esc(full(i.from))}</div>
      <div class="tiny" style="opacity:.85">просит познакомить · ${when(i.at)}</div></div></div>
    <div style="margin:12px 0"><div class="stitch"><b>${esc(first(i.from))}</b><span class="thr"></span><span class="you">Вы</span><span class="thr"></span><b>${esc(first(i.to))}</b></div></div>
    <p class="q" style="margin:0 0 12px">«${esc(i.text)}»</p>
    <div class="small" style="opacity:.85;margin-bottom:12px">Согласитесь — ${esc(first(i.to))} увидит просьбу и сможет ответить, а вы останетесь в цепочке. Откажете — ${esc(first(i.from))} узнает только «не сейчас», без объяснений.</div>
    <div class="btn-row"><button class="btn primary sm" data-act="introYes" data-id="${i.id}">Познакомить</button><button class="btn sm" data-act="introNo" data-id="${i.id}">Не сейчас</button></div></div>`;

  // «Сложилось?» — спокойный вопрос без оценок и звёзд
  const resultAskCard = (i) => `<div class="card" style="margin-top:16px">
    <div class="row">${av(i.to, 's')}<div class="grow"><div class="h3">${esc(full(i.to))}</div>
      <div class="tiny muted">знакомство через ${esc(first(i.via))} · ${when(i.at)}</div></div></div>
    <p class="small" style="margin:12px 0">Сложилось? Ответ видите только вы — он помогает сети показывать тех, кто правда помогает.</p>
    <div class="btn-row"><button class="btn primary sm" data-act="introWorked" data-id="${i.id}">Да, помогли</button><button class="btn ghost sm" data-act="introFailed" data-id="${i.id}">Не сложилось</button></div></div>`;

  const connRequestCard = (c) => {
    const from = whoAsked(c);
    const common = [...(G.adj[from] || [])].filter((x) => G.connected(x, S.me));
    return `<div class="card"><div class="row">${av(from)}<div class="grow"><a href="#/p/${from}" class="h3" style="text-decoration:none">${esc(U(from).name)}</a><div class="small muted">${common.length ? 'Общие знакомые: ' + esc(names(common)) : 'Общих знакомых нет'}</div></div></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-act="acceptConn" data-id="${from}">Это мой знакомый</button><button class="btn ghost sm" data-act="declineConn" data-id="${from}">Не знаю</button></div></div>`;
  };

  // ——— Поиск ———
  const FILTERS = [['all', 'Все'], ['1', 'Ваши контакты'], ['2', 'Через знакомых'], ['far', 'Дальше']];
  function Search(params) {
    if (F.q === undefined) { F.q = params.get('q') || ''; F.c = params.get('c') || ''; F.f = params.get('f') || 'all'; }
    return `<div class="top">
        <label class="search grow">${ic('search')}<input data-bind="q" value="${esc(F.q)}" placeholder="${F.c ? esc(cat(F.c).name) : 'Юрист, врач, репетитор, дизайнер…'}" autocomplete="off" enterkeyhint="search" ${F.c ? '' : 'autofocus'} aria-label="Кого ищете">${F.q || F.c ? `<button class="clear" data-act="clearSearch" aria-label="Очистить">${ic('x')}</button>` : ''}</label>
        ${fullBtn()}<a class="me-dot" href="#/me" aria-label="Профиль">${av(S.me, 'xs')}</a></div>
      <div id="results">${searchResults()}</div>`;
  }
  // Места и фирмы, подходящие под запрос: по названию и по сфере
  const findNodes = (q, catId) => {
    const words = (q || '').toLowerCase().trim();
    return nodesAll().filter((n) => {
      if (catId && n.cat !== catId) return false;
      if (!words) return !!catId;
      if (n.name.toLowerCase().includes(words)) return true;
      if (n.cat && (cat(n.cat).name.toLowerCase().includes(words) || cat(n.cat).who.toLowerCase().includes(words))) return true;
      // то, что люди рассказали о месте, тоже стоит искать
      return (n.recs || []).some((r) => !r.private && r.text.toLowerCase().includes(words))
        || (n.facts || []).some((f) => f.text.toLowerCase().includes(words))
        || (n.address || '').toLowerCase().includes(words);
    }).sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0)
      || nodeNear(b).length - nodeNear(a).length || nodeRecs(b).length - nodeRecs(a).length);
  };

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
      const placeBy = {};
      nodesAll().forEach((n) => { if (n.cat) (placeBy[n.cat] = placeBy[n.cat] || []).push(n); });
      return `${nodesNear().length ? `<div class="sec-title"><h2 class="h2">Места и фирмы</h2><span class="small muted">${nodesNear().length}</span></div>
        <div class="rail-x">${nodesNear().slice(0, 6).map((n, i) => nodeCard(n, i === 0)).join('')}</div>` : ''}
      <div class="sec-title"><h2 class="h2">Сферы</h2><span class="small muted">${pl(near.length, 'человек', 'человека', 'человек')} в вашей сети</span></div>
        <div class="cat-grid">${tiles.map((x) => { const ps = (placeBy[x.c.id] || []).length; return `<a class="cat-tile" href="#/search?c=${x.c.id}" style="text-decoration:none"><b>${esc(x.c.name)}</b>${x.close.length ? `<div class="av-stack">${x.close.slice(0, 3).map((id) => av(id, 'xs')).join('')}</div><span>${pl(x.close.length, 'человек', 'человека', 'человек')} через ваших знакомых${ps ? ` · ${pl(ps, 'место', 'места', 'мест')}` : ''}</span>` : `<span>${pl(x.all.length, 'человек', 'человека', 'человек')}${ps ? ` · ${pl(ps, 'место', 'места', 'мест')}` : ''}, но не через вашу сеть</span>`}</a>`; }).join('')}</div>`;
    }
    const all = G.search(q, F.c);
    const bucket = (r) => (r.circle <= 1 ? '1' : r.circle === 2 ? '2' : 'far');
    const counts = { all: all.length, 1: 0, 2: 0, far: 0 };
    all.forEach((r) => counts[bucket(r)]++);
    const list = F.f === 'all' ? all : all.filter((r) => bucket(r) === F.f);
    const catsFound = F.c ? [F.c] : G.matchCats(q);
    const filt = `<div class="chips scroll" style="margin-top:12px">${F.c ? `<button class="chip on" data-act="clearCat">${esc(cat(F.c).name)} ${ic('x').replace('<svg', '<svg style="width:14px;height:14px"')}</button>` : ''}${FILTERS.map(([k, l]) => `<button class="chip ${F.f === k ? 'on' : ''}" data-act="filter" data-v="${k}" ${counts[k] ? '' : 'disabled style="opacity:.45"'}>${l}<span class="n">${counts[k]}</span></button>`).join('')}</div>`;
    const askPrefill = encodeURIComponent(q || (F.c ? cat(F.c).who : ''));
    const askCard = `<div class="card" style="margin-top:16px;text-align:center"><div class="h3">${list.length ? 'Спросить знакомых?' : 'В кругах знакомых никого'}</div><p class="small muted" style="margin:6px 0 14px">Запрос получат ${pl(myContacts().length, 'человек', 'человека', 'человек')} из вашего круга — они посмотрят у себя и посоветуют.</p><a class="btn primary" href="#/ask?t=${askPrefill}&c=${catsFound[0] || ''}">${ic('ask')}Спросить свою сеть</a></div>`;
    const places = findNodes(q, F.c);
    const placeBlock = places.length ? `<div class="sec-title"><h2 class="h2">Места и фирмы</h2><span class="small muted">${places.length}</span></div>
      <div class="stack">${places.slice(0, 6).map((n, i) => nodeCard(n, i === 0 && !all.length)).join('')}</div>` : '';
    const addPlace = `<p style="text-align:center;margin-top:16px"><button class="btn ghost sm" data-act="newNode" data-v="place">${ic('plus')}Записать место или фирму</button></p>`;
    const partnersFound = findPartners(q, F.c);
    const partnerBlock = partnersFound.length ? `<div class="sec-title"><h2 class="h2">Подрядчики фирм</h2><span class="small muted">${partnersFound.length}</span></div>
      <p class="sec-note">С ними работают фирмы из Сарафана — выйти можно через сотрудника</p>
      <div class="card">${partnersFound.slice(0, 8).map(partnerCard).join('')}${partnersFound.length > 8 ? `<p class="tiny muted" style="margin:8px 0 0">и ещё ${partnersFound.length - 8} — уточните запрос</p>` : ''}</div>` : '';
    if (!all.length) {
      if (places.length || partnersFound.length) return filt + placeBlock + partnerBlock + addPlace + askCard;
      return filt + `<div class="empty"><h2 class="h2">${catsFound.length ? 'Никого не нашли' : 'Не понимаем запрос'}</h2><p>${catsFound.length ? 'В кругах ваших знакомых в этой сфере пока никого.' : 'Попробуйте иначе: «юрист», «стоматолог», «бухгалтер», «репетитор».'}</p></div>` + addPlace + askCard;
    }
    const groups = [['1', 'Ваши контакты'], ['2', 'Через ваших знакомых'], ['far', 'Дальше от вас']];
    let html = filt + `<div class="count-line"><b>${pl(list.length, 'человек найден', 'человека найдено', 'человек найдено')}</b>${F.f !== 'all' ? '<button class="link" data-act="filter" data-v="all">Показать всех</button>' : ''}</div>`;
    groups.forEach(([k, label]) => {
      const g = list.filter((r) => bucket(r) === k);
      if (!g.length) return;
      html += `<div class="group-label">${label}</div><div class="stack">${g.map(resultCard).join('')}</div>`;
    });
    return html + placeBlock + partnerBlock + addPlace + askCard;
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
    // К дальнему человеку идём шагами, поэтому ждём ответа не про него, а про ближайшее звено
    const stepGoal = t.chain && t.chain.length > 3 ? t.chain[2] : id;
    const intro = S.intros.find((x) => x.to === stepGoal && x.from === S.me && x.status !== 'no');
    const pendingOut = S.conns.find((c) => c.status === 'pending' && pairWith(c, id) && c.by === S.me);
    const pendingIn = S.conns.find((c) => c.status === 'pending' && pairWith(c, id) && c.by === id);

    let actions;
    if (pendingIn) actions = `<button class="btn primary" data-act="acceptConn" data-id="${id}">${ic('check')}Это мой знакомый</button><button class="btn ghost" data-act="declineConn" data-id="${id}">Не знаю</button>`;
    else if (direct) actions = `<button class="btn soft" data-act="write" data-id="${id}">${ic('chat')}Написать</button><button class="btn primary" data-act="recommend" data-id="${id}" data-cat="${focus || ''}">${ic('seal')}${recLabel(id, focus)}</button>`;
    else if (intro && intro.status === 'ok') actions = `<button class="btn soft" data-act="write" data-id="${id}">${ic('chat')}Написать</button>${pendingOut ? '<button class="btn ghost" disabled>Заявка отправлена</button>' : `<button class="btn primary" data-act="addConn" data-id="${id}">${ic('plus')}В мою сеть</button>`}`;
    else if (intro && intro.status === 'gone') actions = `<button class="btn primary" data-act="intro" data-id="${id}" data-cat="${focus || ''}">${ic('hand')}Попросить ещё раз</button><span class="tag" style="align-self:center">Не сложилось</span>`;
    else if (intro) actions = `<button class="btn ghost" disabled>Ждём ответа: ${esc(first(intro.via))}</button>`;
    else if (t.chain && t.chain.length > 2) actions = `<button class="btn primary" data-act="intro" data-id="${id}" data-cat="${focus || ''}">${ic('hand')}${t.chain.length > 3 ? 'Шаг к знакомству' : 'Попросить знакомство'}</button>`;
    else actions = `<button class="btn primary" data-act="share" data-id="${id}">${ic('share')}Поделиться контактом</button>`;

    return `<div class="top"><button class="back" data-act="back" aria-label="Назад">${ic('back')}</button><button class="back" data-act="goHome" aria-label="На главную">${ic('home')}</button><div class="grow"></div><button class="icon-btn" data-act="share" data-id="${id}" aria-label="Поделиться">${ic('share')}</button></div>
      ${share ? `<div class="shared-banner">${av(share.from, 's')}<div><div>Контакт прислали вам: <b>${esc(U(share.from).name)}</b></div>${share.note ? `<div style="margin-top:4px;color:var(--ink-2)">«${esc(share.note)}»</div>` : ''}</div></div>` : ''}
      <div class="p-head">${founderAv(id, 'xl', ringOf(id))}<div><div class="who">${esc(who(id))} · ${esc(u.city)}</div><h1 class="h1" style="margin-top:4px">${esc(u.name)}</h1>${founderTag(id)}${jobLine(id)}</div>${u.busy ? '<div class="chips" style="margin-top:8px"><span class="tag warm">Сейчас не берёт работу</span></div>' : ''}${u.about ? `<p class="about">${esc(u.about)}</p>` : ''}</div>
      <div class="stat-grid" style="margin-top:18px"><div class="stat"><b>${allRecs.length}</b><span>${plural(allRecs.length, 'рекомендация', 'рекомендации', 'рекомендаций')}</span></div><div class="stat"><b>${indep}</b><span>${plural(indep, 'независимый источник', 'независимых источника', 'независимых источников')}</span></div><div class="stat"><b>${(G.adj[id] || new Set()).size}</b><span>${plural((G.adj[id] || new Set()).size, 'связь', 'связи', 'связей')} в сети</span></div></div>
      <div class="sec-title"><h2 class="h2">Как вы связаны</h2>${t.circle && t.circle < Infinity ? circleTag(t.circle) : ''}</div>
      <div class="card">${how}</div>
      ${direct ? '' : `<div style="text-align:center;margin-top:10px"><button class="btn ghost xs" data-act="hideFrom" data-id="${id}">Не показывать меня этому человеку</button></div>`}
      ${partnerOfView('user', id)}
      ${workView(id)}
      ${howView(id)}
      ${factsView(id)}
      ${showcaseView(id)}
      <div class="sec-title"><h2 class="h2">За что рекомендуют</h2></div>
      <div class="card">${repRows(id)}</div>
      ${allRecs.length ? `<div class="sec-title"><h2 class="h2">Рекомендации</h2></div>
      ${cats.length > 1 ? `<div class="chips scroll" style="margin-bottom:10px"><button class="chip ${F.rc === 'all' ? 'on' : ''}" data-act="rc" data-v="all">Все<span class="n">${allRecs.length}</span></button>${cats.filter((c) => G.recsTo(id, c).length).map((c) => `<button class="chip ${F.rc === c ? 'on' : ''}" data-act="rc" data-v="${c}">${esc(cat(c).name)}<span class="n">${G.recsTo(id, c).length}</span></button>`).join('')}</div>` : ''}
      <div class="card">${shown.map((r) => recItem(r)).join('')}${recs.length > shown.length ? `<button class="btn ghost block" style="margin-top:12px" data-act="more">Показать все ${recs.length}</button>` : ''}</div>` : ''}
      ${nodesOf(id).length ? `<div class="sec-title"><h2 class="h2">Какие места советует</h2><span class="small muted">${nodesOf(id).length}</span></div>
      <div class="stack">${nodesOf(id).slice(0, 4).map((n) => nodeCard(n)).join('')}</div>` : ''}
      ${given.length ? `<div class="sec-title"><h2 class="h2">Кого рекомендует</h2><span class="small muted">${pl(rs.people, 'человек', 'человека', 'человек')} · ${pl(rs.cats, 'сфера', 'сферы', 'сфер')}</span></div>
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
    return screenHead('Спросить', `Запрос уйдёт ${pl(myContacts().length, 'знакомому', 'знакомым', 'знакомым')}`) + `
      <div class="card">
        <label class="field" style="margin-top:0"><span>Кого ищете</span><textarea class="textarea" data-bind="t" placeholder="Например: нужен юрист по трудовому спору — уволили, хочу разобраться" maxlength="300">${esc(F.t)}</textarea></label>
        <div id="askcats">${askCats()}</div>
        ${askTo(c1)}
        <button class="btn primary block" style="margin-top:14px" data-act="postAsk" data-submit ${askValid() ? '' : 'disabled'}>${ic('send')}Отправить запрос</button>
      </div>
      ${inc.length ? `<div class="sec-title"><h2 class="h2">Вас спрашивают</h2><span class="small muted">${pl(inc.length, 'запрос', 'запроса', 'запросов')}</span></div><div class="stack">${inc.map((q) => requestCard(q)).join('')}</div>` : ''}
      ${mine.length ? `<div class="sec-title"><h2 class="h2">Ваши запросы</h2></div><div class="stack">${mine.map((q) => requestCard(q, true)).join('')}</div>` : ''}`;
  }
  const askValid = () => (F.t || '').trim().length >= 10 && !!F.cat && (!F.quiet || (F.to || []).length > 0);
  // Кому уйдёт запрос: всем знакомым или только выбранным. Деликатное спрашивают тихо
  function askTo(c1) {
    const picked = F.to || [];
    const quiet = F.quiet;
    const rows = quiet
      ? `<div class="chips" style="margin-top:8px">${c1.map((id) => `<button class="chip ${picked.includes(id) ? 'on' : ''}" data-act="askTo" data-v="${id}">${esc(first(id))}</button>`).join('')}</div>
         <button class="pick ${F.anon ? 'on' : ''}" style="margin-top:10px" data-act="askAnon"><span class="grow"><span class="h3" style="display:block">Не показывать моё имя</span><span class="small muted">Имя увидит только тот, кто ответит</span></span>
           <span class="radio"></span></button>`
      : `<div class="row" style="margin-top:10px"><div class="av-stack">${c1.slice(0, 5).map((id) => av(id, 'xs')).join('')}</div><div class="grow small muted">Получат ${pl(c1.length, 'человек', 'человека', 'человек')} из 1-го круга. Они посоветуют своих — с цепочкой, через кого.</div></div>`;
    return `<div class="field" id="askto"><span>Кому уйдёт</span>
      <div class="chips"><button class="chip ${quiet ? '' : 'on'}" data-act="askQuiet" data-v="">Всем знакомым</button><button class="chip ${quiet ? 'on' : ''}" data-act="askQuiet" data-v="1">Выбрать, кому</button></div>
      ${rows}
      ${quiet && !picked.length ? '<p class="hint">Отметьте хотя бы одного человека</p>' : ''}</div>`;
  }

  function askCats() {
    const auto = G.matchCats(F.t || '');
    if (!F.catTouched) F.cat = auto[0] || '';
    const list = F.allCats ? S.cats.map((c) => c.id) : [...new Set([...(F.cat ? [F.cat] : []), ...auto])].slice(0, 5);
    const chips = list.map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" data-act="askCat" data-v="${c}">${esc(cat(c).name)}</button>`).join('');
    const more = F.allCats ? '' : `<button class="chip" data-act="askAllCats">${list.length ? 'Другая…' : 'Выбрать сферу'}</button>`;
    const own = F.own
      ? `<div class="row" style="margin-top:8px"><input class="input" data-bind="ownName" placeholder="Например: таможенный брокер" maxlength="40" value="${esc(F.ownName || '')}">
         <button class="btn sm" data-act="askOwnCat">Добавить</button></div>`
      : `<button class="chip" data-act="askOwn">Своей сферы нет</button>`;
    return `<div class="field"><span>В какой сфере ищете человека</span>
      <div class="chips">${chips}${more}${F.own ? '' : own}</div>${F.own ? own : ''}
      <p class="hint">${F.cat
        ? 'Ответ знакомого сразу станет рекомендацией в этой сфере'
        : 'Не нашли подходящую — заведите свою, она появится у всех'}</p></div>`;
  }

  // ——— Запрос: ответы ———
  function Request(id) {
    const q = S.requests.find((x) => x.id === id);
    if (!q) return '<div class="empty"><h2 class="h2">Запрос не найден</h2><a class="btn" href="#/">На главную</a></div>';
    const mine = q.from === S.me;
    const answered = q.answers.some((a) => a.from === S.me);
    const answers = q.answers.map((a, i) => {
      if (a.partner) {
        const x = a.partner, tel = (x.phone || '').match(/\+?[\d\s\-()]{7,}/);
        const thanksP = mine ? (a.thanked ? `<span class="tag brand">${ic('check').replace('<svg', '<svg style="width:13px;height:13px"')} Спасибо</span>` : `<button class="btn ghost xs" data-act="thank" data-q="${q.id}" data-i="${i}">Сказать спасибо</button>`) : '';
        return `<div class="answer"><div class="row">${av(a.from, 'xs')}<div class="grow small"><b>${esc(full(a.from))}</b> <span class="muted">советует подрядчика фирмы · ${when(a.at)}</span></div>${thanksP}</div>
          <div class="row" style="margin-top:10px"><span class="av" style="--h:${hue(x.id)}">${esc((x.name || '?')[0].toUpperCase())}</span><div class="grow"><div class="h3">${esc(x.name)}</div>
          <div class="small muted">${esc([x.section, 'работает с ' + x.firmName].filter(Boolean).join(' · '))}</div></div></div>
          <p class="txt">«${esc(a.text)}»</p>
          ${x.username || tel ? `<div class="btn-row">${x.username ? `<button class="btn soft sm" data-act="openTg" data-u="${esc(x.username)}">${ic('send')}Написать</button>` : ''}${tel ? `<a class="btn ${x.username ? 'ghost' : 'soft'} sm" href="tel:${esc(tel[0].replace(/[^\d+]/g, ''))}">${ic('phone')}${esc(tel[0].trim())}</a>` : ''}</div>` : ''}</div>`;
      }
      const t = G.trust(a.person, q.cat);
      const direct = G.connected(S.me, a.person);
      const intro = S.intros.find((x) => x.to === a.person && x.from === S.me);
      // Внизу карточки — одно действие: попросить знакомство.
      // Благодарность относится к тому, кто посоветовал, поэтому живёт наверху, рядом с его именем.
      const act = a.person === S.me ? '' : direct ? `<a class="btn soft sm block" href="#/p/${a.person}?cat=${q.cat}">Открыть профиль</a>`
        : intro ? `<a class="btn ghost sm block" href="#/p/${a.person}?cat=${q.cat}">${intro.status === 'ok' ? 'Знакомство состоялось' : 'Ждём ответа'}</a>`
          : `<button class="btn primary sm block" data-act="intro" data-id="${a.person}" data-via="${a.from}" data-cat="${q.cat}" data-q="${mine ? q.id : ''}">${ic('hand')}Попросить знакомство</button>
             <p class="tiny muted" style="margin:7px 0 0;text-align:center">${esc(first(a.from))} передаст вашу просьбу</p>`;
      const thanks = mine ? (a.thanked ? `<span class="tag brand">${ic('check').replace('<svg', '<svg style="width:13px;height:13px"')} Спасибо</span>` : `<button class="btn ghost xs" data-act="thank" data-q="${q.id}" data-i="${i}">Сказать спасибо</button>`) : '';
      return `<div class="answer"><div class="row">${av(a.from, 'xs')}<div class="grow small"><b>${esc(full(a.from))}</b> <span class="muted">советует · ${when(a.at)}</span></div>${thanks}</div>
        <a href="#/p/${a.person}?cat=${q.cat}" style="text-decoration:none;display:block;margin-top:10px"><div class="row">${av(a.person)}<div class="grow"><div class="h3">${esc(full(a.person))}</div><div class="small muted">${esc(cat(q.cat).who)} · ${pl(G.recsTo(a.person, q.cat).length, 'рекомендация', 'рекомендации', 'рекомендаций')}</div></div></div></a>
        <div style="margin-top:10px">${chainLine(direct ? [S.me, a.person] : [S.me, a.from, a.person].filter((x, k, arr) => arr.indexOf(x) === k))}</div>
        <p class="txt">«${esc(a.text)}»</p>${act}</div>`;
    }).join('');
    return `<div class="top"><button class="back" data-act="back" aria-label="Назад">${ic('back')}</button><button class="back" data-act="goHome" aria-label="На главную">${ic('home')}</button><h1 class="h2 grow">${mine ? 'Ваш запрос' : 'Запрос'}</h1></div>
      <div class="card">${mine ? '' : q.from
        ? `<div class="row">${av(q.from, 's')}<div class="grow"><div class="h3">${esc(U(q.from).name)}</div><div class="tiny muted">${when(q.at)}</div></div></div>`
        : `<div class="row"><span class="av s ghost-av">${ic('user')}</span><div class="grow"><div class="h3">Кто-то из ваших знакомых</div><div class="tiny muted">имя откроется, когда вы ответите · ${when(q.at)}</div></div></div>`}
        <p style="font-size:17px;margin:${mine ? 0 : '12px'} 0 12px">${esc(q.text)}</p>
        <div class="row">${q.cat ? `<span class="tag brand">${esc(cat(q.cat).name)}</span>` : ''}<span class="grow"></span><span class="tiny muted">${mine ? 'отправлен ' + when(q.at) : ''}</span></div></div>
      <div class="sec-title"><h2 class="h2">${q.answers.length ? pl(q.answers.length, 'ответ', 'ответа', 'ответов') : 'Ответов пока нет'}</h2></div>
      ${answers ? `<div class="card" style="padding:6px 10px 10px">${answers}</div>` : `<div class="card"><p class="small muted" style="margin:0">${mine ? 'Мы сообщим в Telegram, как только кто-то посоветует человека.' : 'Будьте первым, кто поможет.'}</p></div>`}
      <div style="margin-top:16px">${mine
        ? (q.closed ? '<p class="small muted" style="text-align:center">Запрос закрыт</p>' : `<button class="btn ghost block" data-act="closeReq" data-id="${q.id}">${ic('check')}Нашёл, закрыть запрос</button>`)
        : answered ? '' : `${partnersForRequest(q).length ? `<div class="note" style="margin-bottom:12px">${ic('seal')} У подрядчиков вашей фирмы есть подходящие: <b>${esc(partnersForRequest(q).slice(0, 3).map((x) => x.name.split(' ')[0]).join(', '))}</b>
          <button class="btn ghost xs" style="margin-top:10px" data-act="answerPartner" data-q="${q.id}" data-id="${partnersForRequest(q)[0].id}">Посоветовать</button></div>` : ''}<button class="btn primary block" data-act="answer" data-id="${q.id}">Посоветовать человека</button>`}</div>`;
  }

  // ——— Моя сеть ———
  function Network(params) {
    if (F.tab === undefined) F.tab = params.get('tab') || 'c1';
    const c1 = myContacts();
    const c2 = Object.keys(G.dist).filter((k) => G.dist[k] === 2).sort((a, b) => U(a).name.localeCompare(U(b).name));
    const pend = S.conns.filter(askedMe);
    const inv = S.invite;
    const bot = S.bot || 'sarafanibot';
    const link = `t.me/${bot}?start=${inv.code}`;
    const left = inv.max - inv.used;
    const empty = c1.length === 0;
    const myRecTo = (id) => G.recsFrom(S.me).filter((r) => r.to === id).map((r) => cat(r.cat).who);
    // места и фирмы, которые есть в вашей сети: сначала ваши, потом от знакомых
    const mineNodes = myNodes();
    const allPlaces = [...mineNodes, ...nodesNear().filter((n) => !mineNodes.includes(n))];
    const dim = F.tab === 'c1' ? 'in' : F.tab === 'c2' ? 'out' : null;

    const invite = `
      <div class="card accent invite-strong">
        <div class="eyebrow">сильное приглашение</div>
        <h2 class="h2" style="margin:6px 0 8px">Позовите и сразу порекомендуйте</h2>
        <p class="small" style="margin:0 0 4px;color:rgba(255,255,255,.88)">Напишите рекомендацию заранее — человек войдёт по вашей ссылке, и она уже будет ждать у него в профиле. Так сеть с первого дня наполняется доверием, а не просто людьми.</p>
        <p class="small" style="margin:8px 0 0;color:rgba(255,255,255,.72)">Каждый приглашённый открывает вам свой список проверенных — и списки его знакомых.</p>
        <button class="btn primary block" style="margin-top:14px" data-act="outsider">${ic('seal')}Написать рекомендацию</button>
      </div>

      <div class="card" style="margin-top:10px">
        <div class="eyebrow">просто позвать</div>
        <div class="row" style="margin-top:8px"><div class="grow"><div class="h3">Ваша личная ссылка</div>
          <div class="small muted" style="margin-top:2px">Осталось мест: ${left} из ${inv.max}</div></div></div>
        <div class="link-box plain">${ic('link').replace('<svg', '<svg style="width:17px;height:17px;flex:none;opacity:.6"')}<span>${link}</span></div>
        <div class="btn-row"><button class="btn sm" data-act="sendInvite">${ic('send')}Отправить</button><button class="btn ghost sm" data-act="copy" data-v="https://${link}">${ic('copy')}Скопировать</button></div>
        <div class="dots plain">${Array.from({ length: inv.max }, (_, i) => `<i class="${i < inv.used ? 'on' : ''}"></i>`).join('')}</div>
        <p class="small muted" style="margin:12px 0 0">Кто войдёт по ссылке — сразу ваш контакт. Но приглашение не значит, что вы человека рекомендуете: это отдельное действие.</p>
      </div>`;

    const howto = `<div class="card" style="margin-top:10px">
      <div class="eyebrow">как это работает</div>
      <div class="rail" style="margin-top:10px">
        ${[['Вы отправляете ссылку', 'в Telegram, любым знакомым'],
           ['Человек открывает её', 'и нажимает «Открыть Сарафан»'],
           ['Он в сети и он ваш контакт', 'дальше вы можете рекомендовать друг друга']]
          .map(([t, d], i, all) => `<div class="step ${i === all.length - 1 ? 'now' : ''}" style="--k:${i}">
            <span class="mark"><span class="dot"></span><span class="line"></span></span>
            <span class="body"><span class="grow"><span class="who">${t}</span><span class="role">${d}</span></span></span></div>`).join('')}
      </div></div>`;

    const people = F.tab === 'c1'
      ? c1.map((id) => { const r = myRecTo(id); return personMini(id, r.length ? 'Вы рекомендуете: ' + r.join(', ') : who(id)); }).join('')
      : c2.map((id) => personMini(id, who(id) + ' · через ' + first(G.pathTo(id)[1]))).join('');

    return screenHead('Моя сеть',
      empty ? 'Пока только вы' : `${pl(c1.length, 'знакомый', 'знакомых', 'знакомых')} · ещё ${c2.length} в их кругах`,
      `<button class="icon-btn" data-act="goto" data-h="#/map" aria-label="Облако сети">${ic('net')}</button>`) + `
      ${pend.length ? `<div class="sec-title" style="margin-top:var(--s-4)"><h2 class="h2">Хотят в вашу сеть</h2><span class="badge">${pend.length}</span></div>${pend.map(connRequestCard).join('')}` : ''}
      <button class="link-row wide" data-act="pickCircle" style="margin:var(--s-3) 0 var(--s-3)">${ic('user')}
        <span class="grow"><b>Добавить знакомых из Telegram</b><i>Отметьте людей в контактах — без рекомендаций</i></span>${ic('arrow')}</button>
      ${waitingList()}
      ${invite}
      ${empty ? howto : ''}
      ${myNodes().length ? `<div class="sec-title"><h2 class="h2">Ваши места и фирмы</h2><span class="small muted">${myNodes().length}</span></div>
      <div class="stack">${myNodes().map((n) => nodeCard(n)).join('')}</div>` : ''}
      <p style="text-align:center;margin-top:14px"><button class="btn ghost sm" data-act="newNode" data-v="place">${ic('plus')}Записать место или фирму</button></p>
      ${S.pendingInvites.length ? `<div class="sec-title"><h2 class="h2">Ждут приглашения</h2></div><div class="card">${S.pendingInvites.map((p) => `<div class="person"><span class="av s" style="background:var(--mist-2)">${esc(p.name.slice(0, 1).toUpperCase())}</span><div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${esc(cat(p.cat).who)} · ссылка отправлена ${when(p.at)}</div></div><span class="tag">ждём</span></div>`).join('')}</div>` : ''}
      ${empty ? '' : `
      <div class="sec-title"><h2 class="h2">Кто рядом с вами</h2></div>
      ${orbit({ inner: c1.slice(0, 8), outer: c2.slice(0, 8), cap: 'вы', size: 360, big: true, dim })}
      <div class="orbit-legend" style="margin-bottom:var(--s-5)"><span><i class="dot-1"></i>ваши контакты</span><span><i class="dot-2"></i>через них</span></div>
      <div class="tabs" role="tablist">
        <button class="${F.tab === 'c1' ? 'on' : ''}" data-act="tab" data-v="c1">Знакомые<i>${c1.length}</i></button>
        <button class="${F.tab === 'c2' ? 'on' : ''}" data-act="tab" data-v="c2">Через них<i>${c2.length}</i></button>
        <button class="${F.tab === 'places' ? 'on' : ''}" data-act="tab" data-v="places">Места<i>${allPlaces.length}</i></button></div>
      ${F.tab === 'places'
    ? (allPlaces.length
      ? `<div class="stack">${allPlaces.map((n) => nodeCard(n)).join('')}</div>`
      : `<div class="card"><p class="muted small" style="margin:0">Ни вы, ни ваши знакомые пока не записали ни одного места. Чайхана, клиника, автосервис, мастерская — всё, куда вы ходите сами.</p>
         <button class="btn primary block" style="margin-top:12px" data-act="newNode" data-v="place">${ic('plus')}Записать первое</button></div>`)
    : `<div class="card">${people || '<p class="muted small" style="margin:0">Здесь пока пусто</p>'}</div>`}`}`;
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
      <div class="p-head">${founderAv(S.me, 'xl')}<div><div class="who">${esc(who(S.me))} · ${esc(me.city)}</div><h1 class="h1" style="margin-top:6px">${esc(me.name)}</h1>${founderTag(S.me)}${jobLine(S.me)}</div>${me.about ? `<p class="about">${esc(me.about)}</p>` : ''}</div>
      <div class="stat-grid" style="margin-top:18px"><div class="stat"><b>${inRecs.length}</b><span>${plural(inRecs.length, 'рекомендация', 'рекомендации', 'рекомендаций')} вам</span></div><div class="stat"><b>${indep}</b><span>${plural(indep, 'независимый источник', 'независимых источника', 'независимых источников')}</span></div><div class="stat"><b>${myContacts().length}</b><span>${plural(myContacts().length, 'контакт', 'контакта', 'контактов')}</span></div></div>
      ${me.role !== 'client' ? `<div class="card" style="margin-top:18px"><div class="eyebrow">рекомендации клиентов</div>
        <h2 class="h2" style="margin:6px 0 6px">Попросите довольных клиентов</h2>
        <p class="small muted" style="margin:0 0 12px">Одна ссылка на всех: клиент пишет одну фразу — и вас находят его знакомые. Про Сарафан ему знать не нужно.</p>
        <button class="btn primary block" data-act="askLink">${ic('send')}Получить ссылку</button></div>` : ''}
      ${workView(S.me)}
      ${howView(S.me)}
      ${factsView(S.me)}
      ${U(S.me).pro ? showcaseView(S.me) || `<div class="card" style="margin-top:18px"><div class="eyebrow">ваша витрина</div>
        <h2 class="h2" style="margin:6px 0 6px">Расскажите о работе</h2>
        <p class="small muted" style="margin:0 0 12px">Что вы делаете, как считаете деньги, где посмотреть работы. Витрину видят все, кто открывает вашу карточку.</p>
        <div class="dir ghost-dir"><div class="dir-head"><h3 class="h3">Свадебная съёмка</h3><span class="tag">пример</span></div>
          <p class="small" style="margin:6px 0 0;color:var(--ink-3)">Снимаю день целиком, отдаю 300 кадров за две недели</p>
          <p class="dir-price">День — от 4 млн, обработка входит</p>
          ${worksGhost('')}</div>
        <button class="btn primary block" style="margin-top:14px" data-act="editShowcase">${ic('seal')}Заполнить витрину</button></div>`
    : `<div class="card" style="margin-top:18px"><div class="eyebrow">витрина</div>
        <h2 class="h2" style="margin:6px 0 6px">Показать свои работы</h2>
        <p class="small muted" style="margin:0 0 12px">Обычная карточка с рекомендациями есть у всех и всегда бесплатна. Витрина — для тех, кому сеть приносит работу: рассказ о себе, услуги, цены, ссылки и до 12 примеров работ.</p>
        <button class="btn block" data-act="openShowcase">Открыть витрину</button></div>`}
      <div class="sec-title"><h2 class="h2">Вас рекомендуют</h2></div>
      <div class="card">${repRows(S.me)}</div>
      <div class="sec-title"><h2 class="h2">Ваши советы помогают</h2></div>
      <div class="card"><div class="stat-grid"><div class="stat"><b>${rs.people}</b><span>${plural(rs.people, 'человек', 'человека', 'человек')} рекомендуете</span></div><div class="stat"><b>${(S.impact || { shares: 0, thanks: 0, worked: 0 }).shares}</b><span>раз карточки ушли в чаты</span></div><div class="stat"><b>${thanks}</b><span>${plural(thanks, 'спасибо', 'спасибо', 'спасибо')} за советы</span></div></div>
        ${(S.impact || { shares: 0, thanks: 0, worked: 0 }).worked ? `<p class="small" style="margin:12px 0 0;color:var(--good);font-weight:600">Через вас сложилось ${pl((S.impact || { shares: 0, thanks: 0, worked: 0 }).worked, 'знакомство', 'знакомства', 'знакомств')}</p>` : ''}
        <p class="small muted" style="margin:12px 0 0">Записали однажды — а советы продолжают работать без вас: их находят в поиске и отправляют в чаты. Раз в неделю бот расскажет, кому они помогли.</p></div>
      ${myNodes().length ? `<div class="sec-title"><h2 class="h2">Ваши места и фирмы</h2><span class="small muted">${myNodes().length}</span></div>
      <div class="stack">${myNodes().slice(0, 4).map((n) => nodeCard(n)).join('')}</div>` : ''}
      <button class="link-row wide" data-act="tourOpen" style="margin-top:20px">${ic('spark')}
        <span class="grow"><b>Как это работает</b><i>Короткое демо: что делать и что это даёт</i></span>${ic('arrow')}</button>
      <div class="sec-title"><h2 class="h2">Рекомендации</h2></div>
      <div class="tabs" role="tablist"><button class="${F.tab === 'in' ? 'on' : ''}" data-act="tab" data-v="in">Вам<i>${inRecs.length}</i></button><button class="${F.tab === 'out' ? 'on' : ''}" data-act="tab" data-v="out">От вас<i>${outRecs.length}</i></button></div>
      <div class="card">${(F.tab === 'in' ? inRecs.map((r) => recItem(r)) : outRecs.map((r) => recItem(r, true))).join('') || '<p class="small muted" style="margin:0">Пока пусто</p>'}</div>
      ${LIVE && !window.API.inTelegram ? '' : `<div class="card" style="margin-top:20px"><div class="h3">Войти в браузере</div>
        <p class="small muted" style="margin:6px 0 12px">Сарафан открывается и на компьютере, без Telegram. Возьмите код и наберите его там — вход сохранится в том браузере.</p>
        <div id="handoff"><button class="btn block" data-act="handoff">Получить код</button></div></div>`}
      ${LIVE ? '' : '<p style="text-align:center;margin-top:20px"><button class="btn ghost sm" data-act="resetDemo">Начать демо заново</button></p>'}`;
  }

  // ——— Вход в браузере ———
  // Сарафан должен работать и без Telegram: не всем удобно в мини-приложении,
  // а где-то Telegram недоступен. Здесь три двери, все ведут в одну и ту же сеть.
  function webEntrance(note) {
    const nav = $('#nav'); if (nav) nav.hidden = true;
    const codeFromLink = qs.get('code') || qs.get('start') || qs.get('startapp') || '';
    const bot = 'sarafanibot';
    const box = (id, title, sub, inner) => `<div class="card" style="margin-top:14px"><div class="h3">${title}</div>
      <p class="small muted" style="margin:6px 0 12px">${sub}</p>${inner}</div>`;

    $('#app').innerHTML = `<div class="onb fade-in" style="padding-bottom:40px">
      <div class="top"><div class="logo grow">${logoMark}сарафан</div></div>
      <div class="reveal" style="text-align:center;margin-top:10px">
        <h1 class="h1" style="--k:0">Спросите своих —</h1>
        <h1 class="h1" style="--k:1">получите имя</h1>
        <p class="small muted" style="--k:2;margin:10px auto 6px;max-width:320px">Нужен часовщик, педиатр, электрик? Вопрос уходит вашим знакомым, они смотрят у себя и советуют того, кого рекомендуют сами. Видно, кто рекомендует и через кого вы на него вышли.</p>
      </div>
      ${note ? `<div class="note" style="margin-top:14px">${esc(note)}</div>` : ''}

      ${box('join', 'У меня есть приглашение', 'Код из ссылки, которую прислал знакомый',
    `<label class="field" style="margin-top:0"><span>Код приглашения</span><input class="input" id="wcode" maxlength="20" value="${esc(codeFromLink)}" placeholder="например, vikram-7Q2"></label>
        <label class="field"><span>Как вас зовут</span><input class="input" id="wname" maxlength="40" placeholder="Имя и фамилия"></label>
        <button class="btn primary block" id="wjoin">Войти в сеть</button>`)}

      ${box('move', 'Я уже в сети', 'Перенесите вход с телефона: в приложении откройте Профиль → «Войти в браузере» и наберите код',
    `<label class="field" style="margin-top:0"><span>Код переноса</span><input class="input" id="wmove" maxlength="8" placeholder="шесть знаков"></label>
        <button class="btn block" id="wclaim">Продолжить</button>`)}

      ${box('tg', 'Открыть в Telegram', 'Если вам удобнее в телефоне',
    `<div id="tglogin"></div><a class="btn ghost block" href="https://t.me/${bot}" target="_blank" rel="noopener">Перейти к боту</a>`)}

      <p style="text-align:center;margin-top:22px"><button class="btn ghost sm" id="wdemo">Посмотреть, как всё устроено</button></p>
    </div>`;

    const val = (id) => ($('#' + id).value || '').trim();
    const wrong = (id) => {
      const el = $('#' + id);
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus();
    };
    const busy = (btn, on) => { btn.disabled = on; btn.textContent = on ? 'Минутку…' : btn.dataset.t; };

    const join = $('#wjoin'); join.dataset.t = join.textContent;
    join.onclick = async () => {
      if (!val('wcode')) { wrong('wcode'); toast('Нужен код приглашения'); return; }
      if (val('wname').length < 2) { wrong('wname'); toast('Напишите, как вас зовут'); return; }
      busy(join, true);
      try { await window.API.joinByInvite(val('wcode'), val('wname')); location.href = location.pathname; }
      catch (e) { busy(join, false); wrong('wcode'); toast(e.message); }
    };

    const claim = $('#wclaim'); claim.dataset.t = claim.textContent;
    claim.onclick = async () => {
      if (val('wmove').length < 4) { wrong('wmove'); toast('Наберите код из приложения'); return; }
      busy(claim, true);
      try { await window.API.claimCode(val('wmove')); location.href = location.pathname; }
      catch (e) { busy(claim, false); wrong('wmove'); toast(e.message); }
    };

    $('#wdemo').onclick = () => { location.href = location.pathname + '?demo=1'; };

    // Кнопка «Войти через Telegram» появляется сама, когда домен сайта привязан к боту
    window.sarafanTgAuth = async (user) => {
      try { await window.API.loginTelegram(user); location.href = location.pathname; }
      catch (e) { toast(e.message); }
    };
    window.API.telegramReady().then((r) => {
      // Кнопка работает только на том адресе, который привязан к боту.
      // На своём компьютере её не показываем — там она выдала бы ошибку
      if (!r.ready || (r.site && r.site !== location.origin)) return;
      const sc = document.createElement('script');
      sc.src = 'https://telegram.org/js/telegram-widget.js?22';
      sc.async = true;
      sc.setAttribute('data-telegram-login', bot);
      sc.setAttribute('data-size', 'large');
      sc.setAttribute('data-radius', '14');
      sc.setAttribute('data-userpic', 'false');
      sc.setAttribute('data-onauth', 'sarafanTgAuth(user)');
      const box = $('#tglogin');
      box.style.cssText = 'display:flex;justify-content:center;margin-bottom:10px';
      box.appendChild(sc);
    }).catch(() => {});
  }


  // ——— Стартовое демо ———
  // Четыре сцены: что делаешь и что с этого получаешь. Каждая сцена сама себя
  // разыгрывает, поэтому объяснять словами почти не приходится.
  const TOUR = [
    {
      key: 'write',
      eyebrow: 'ваш круг',
      title: 'Запишите своих проверенных',
      gain: 'Имена, которые вы советуете в чатах по памяти, больше не теряются — и знакомые находят их сами, без вопроса',
      scene: `<div class="sc sc-write">
        <svg class="web" viewBox="0 0 330 268" preserveAspectRatio="none" aria-hidden="true">
          <path class="w1" d="M131 118Q115 105 95 100"/>
          <path class="w2" d="M200 120Q220 118 236 107"/>
          <path class="w3" d="M134 156Q115 163 101 178"/>
          <path class="w4" d="M198 154Q213 169 233 175"/></svg>
        <span class="me"><b>вы</b></span>
        <i class="dot d1"><em>РТ</em><b>Рустам</b><s>часовщик</s></i>
        <i class="dot d2"><em>НА</em><b>Нигора</b><s>педиатр</s></i>
        <i class="dot d3"><em>УХ</em><b>Улугбек</b><s>электрик</s></i>
        <i class="dot d4"><em>АК</em><b>Азиз</b><s>юрист</s></i>
        <i class="count">4 проверенных</i></div>`,
    },
    {
      key: 'invite',
      eyebrow: 'приглашение',
      title: 'Позовите знакомого',
      gain: 'Его проверенные становятся видны вам — и проверенные его знакомых. Один знакомый открывает целый круг',
      scene: `<div class="sc sc-invite">
        <svg class="web" viewBox="0 0 330 268" preserveAspectRatio="none" aria-hidden="true">
          <path class="join" d="M86 134Q115 141 144 134"/>
          <path class="t1" d="M194 117Q216 108 231 91"/>
          <path class="t2" d="M200 134Q230 141 260 134"/>
          <path class="t3" d="M194 151Q209 170 231 180"/>
          <path class="t4" d="M180 161Q181 181 191 198"/></svg>
        <span class="p a"><b>вы</b></span>
        <span class="p b"><b>АК</b><s>Азиз</s></span>
        <i class="dot n1"><em>МХ</em><s>Мирсобит</s></i>
        <i class="dot n2"><em>КУ</em><s>Камила</s></i>
        <i class="dot n3"><em>РЮ</em><s>Рустам</s></i>
        <i class="dot n4"><em>${ic('pin')}</em><s>Чайхана</s></i>
        <span class="lbl">${ic('check')}круг Азиза открыт вам</span></div>`,
    },
    {
      key: 'ask',
      eyebrow: 'запрос',
      title: 'Спросите свой круг',
      gain: 'Вопрос видят знакомые ваших знакомых — без спама в общем чате. Ответ приходит с именем того, кто рекомендует',
      scene: `<div class="sc sc-ask">
        <span class="bubble">Нужен педиатр${ic('ask')}</span>
        <div class="mates">
          <i class="mate m1"><b>АК</b><s>Азиз</s></i>
          <i class="mate m2"><b>ЭС</b><s>Эстелла</s></i>
          <i class="mate m3"><b>УХ</b><s>Улугбек</s></i>
          <i class="mate more"><b>+3</b><s>ещё</s></i></div>
        <div class="reply">
          <span class="from">АК</span>
          <div class="bubble-in">
            <b>Нигора Ахмедова</b><s>педиатр · Юнусабад</s>
            <em>${ic('seal')}рекомендую, вожу к ней дочку</em></div>
        </div>
        <div class="chain"><i>вы</i>${ic('arrow')}<i>Азиз</i>${ic('arrow')}<i class="last">Нигора</i></div></div>`,
    },
    {
      key: 'places',
      eyebrow: 'места и фирмы',
      title: 'Не только люди',
      gain: 'Куда ходят свои: с часами работы, ценами и именем того, кто это проверил',
      scene: `<div class="sc sc-places">
        <div class="place-card">
          <div class="sc-cover"><i class="shine"></i></div><span class="pin">${ic('pin')}</span>
          <b>Чайхана Центральная</b><s>кухня и торты · Мирабад</s>
          <i class="fact f1"><u>когда</u>Плов до 14:00, потом шашлык</i>
          <i class="fact f2"><u>к кому</u>Спросить Дилю, она держит столы</i>
          <i class="fact f3">${ic('seal')}Эстелла и ещё двое рекомендуют</i></div></div>`,
    },
    {
      key: 'chat',
      eyebrow: 'прямо в чате',
      title: 'Советуйте, не выходя из чата',
      gain: 'Спросили в переписке — наберите @sarafanibot педиатр и отправьте карточку. Видно, кто рекомендует, открывать ничего не нужно',
      scene: `<div class="sc sc-chat">
        <div class="chat-win">
          <div class="msg in"><s>Дилноза</s>Кто знает хорошего педиатра?</div>
          <div class="typing"><span>@sarafanibot педиатр</span><i></i></div>
          <div class="msg out card-msg"><b>Нигора Ахмедова — педиатр</b>
            <em>Рекомендует Азиз: «водит к ней дочку»</em>
            <u>Открыть в Сарафане</u></div>
          <div class="msg in"><s>Дилноза</s>Спасибо, записываюсь!</div>
        </div></div>`,
    },
  ];


  function Tour() {
    return `<div class="tour">
      <div class="tour-top"><div class="logo">${logoMark}сарафан</div></div>
      <div class="bars">${TOUR.map((_, i) => `<i data-bar="${i}"><b></b></i>`).join('')}</div>
      <button class="tour-skip" data-act="tourEnd">Пропустить</button>
      <div class="glow" aria-hidden="true"></div>
      <div class="scenes">${TOUR.map((t, i) => `<section class="scene" data-scene="${i}">
        ${t.scene}
        <div class="say"><span class="eyebrow">${t.eyebrow}</span>
          <h2 class="h1">${t.title}</h2>
          <p class="gain">${t.gain}</p></div></section>`).join('')}</div>
      <div class="tour-foot">
        <button class="btn primary block" data-act="tourNext">Дальше</button>
      </div>
      <button class="tour-tap prev" data-act="tourPrev" aria-label="Назад"></button>
      <button class="tour-tap next" data-act="tourNext" aria-label="Дальше"></button></div>`;
  }

  let tourAt = 0, tourT = null;
  function mountTour(from) {
    tourAt = from || 0;
    showScene();
  }
  function showScene() {
    const root = $('.tour');
    if (!root) return;
    clearTimeout(tourT);
    root.querySelectorAll('.scene').forEach((el, i) => el.classList.toggle('on', i === tourAt));
    root.querySelectorAll('[data-bar]').forEach((el, i) => {
      el.classList.toggle('done', i < tourAt);
      el.classList.toggle('run', i === tourAt);
    });
    const last = tourAt === TOUR.length - 1;
    const btn = root.querySelector('.tour-foot .btn');
    if (btn) btn.textContent = last ? 'Понятно, начнём' : 'Дальше';
    if (!last) tourT = setTimeout(() => { tourAt++; showScene(); }, 6400);
  }
  function tourStep(d) {
    const root = $('.tour');
    if (!root) return;
    if (tourAt + d >= TOUR.length) { endTour(); return; }
    tourAt = Math.max(0, tourAt + d);
    showScene();
  }
  function endTour() {
    clearTimeout(tourT);
    try { localStorage.setItem('sarafan.tour', '1'); } catch (e) { /* приватный режим */ }
    go(S.onboarded ? '#/' : '#/start');
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
      <h1 class="h1" style="text-align:center;font-size:29px;line-height:1.1;margin-top:6px">Спросите своих —<br>получите имя</h1>
      <p class="muted" style="text-align:center;margin:12px auto 20px;max-width:315px">Нужен часовщик, педиатр, юрист? Знакомые посмотрят у себя и посоветуют того, кого рекомендуют сами. Не рейтинг, а живая цепочка: видно, кто человека знает и через кого до него дойти.</p>
      ${inviter ? `<div class="inviter">${av(inviter, '', 'r1')}<div class="grow"><div class="small muted">Вас пригласили</div><div class="h3">${esc(U(inviter).name)}</div></div><span class="tag brand">ваш контакт</span></div>` : '<div class="inviter"><div class="grow"><div class="small muted">Вы первый в сети</div><div class="h3">Пригласите тех, кому доверяете</div></div></div>'}
      <div class="card onb" style="margin-top:10px"><div class="rules">
        ${rule('net', 'Вам уже открыт чужой круг', inviter
      ? `${esc(first(inviter))} пригласил вас — значит, вам видно всех, кого ${esc(first(inviter))} проверил на себе, и тех, кого проверили его знакомые.`
      : 'Каждый знакомый открывает вам свой список проверенных людей и мест — и списки его знакомых.')}
        ${rule('seal', 'Ответили однажды — больше не спрашивают', 'Записали своего педиатра — знакомые найдут его сами, когда понадобится. А через год и вы найдёте его за секунду, а не в переписке.')}
        ${rule('ask', 'Вопрос без спама в общем чате', 'Опишите задачу — её увидят ваши знакомые и их знакомые, а не весь чат. Ответ придёт с именем того, кто рекомендует.')}
        ${rule('chat', 'Работает прямо в чатах', `В любой переписке наберите @${esc(S.bot || 'sarafanibot')} педиатр и отправьте карточку из своего круга. Ничего открывать не нужно.`)}
      </div></div>
      <div class="card" style="margin-top:10px">
        <label class="field" style="margin-top:0"><span>Как вас зовут</span><input class="input" data-bind="name" value="${esc(F.name)}" maxlength="40" autocomplete="given-name"></label>
        ${catPick(F, 'cats', 'who', 'Чем занимаетесь').replace('</div></div>', '</div>')}
          <p class="hint">Можно пропустить: в чём вы сильны, решат рекомендации знакомых</p></div>
        <button class="btn primary block" style="margin-top:18px" data-act="finishOnb" data-submit ${F.name.trim() ? '' : 'disabled'}>Войти в сеть</button>
        <p style="text-align:center;margin-top:12px"><button class="btn ghost sm" data-act="tourOpen">Ещё раз показать, как это работает</button></p>
      </div></div>`;
  }

  // ——— Шторка ———
  let SH = null;
  // Стопка окон: окно, открытое из другого окна, ложится сверху, а «закрыть» возвращает к предыдущему
  const SHSTACK = [];
  function openSheet(obj) {
    const el = $('#sheet');
    const panel = $('#sheet .panel');
    const layered = SH && panel && el.classList.contains('open');
    if (layered) { SH._scroll = panel.scrollTop; SHSTACK.push(SH); }
    SH = obj;
    const fb = $('#fixbtn'); if (fb) fb.hidden = true;
    if (layered) { panel.scrollTop = 0; drawSheet(); return; }
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
    const np2 = $('#nodephoto2', $('#sheet'));
    if (np2) np2.onchange = () => { const file = np2.files && np2.files[0]; const id = np2.dataset.node; closeSheet(); uploadPlacePhoto(file, id); };
  }
  // Пока была открыта шторка, сеть могла измениться — догоняем сразу после закрытия
  const catchUp = () => { if (missedWhileBusy) { missedWhileBusy = false; setTimeout(checkPulse, 400); } };

  function closeSheet() {
    if (SHSTACK.length && $('#sheet .panel')) {
      const prev = SHSTACK.pop();
      SH = prev; SH._stale = true;          // пока были наверху, данные могли поменяться
      drawSheet();
      $('#sheet .panel').scrollTop = prev._scroll || 0;
      return;
    }
    SHSTACK.length = 0;
    const el = $('#sheet'); el.classList.remove('open');
    setTimeout(() => { if (!el.classList.contains('open')) { el.hidden = true; el.innerHTML = ''; } }, 300);
    SH = null;
    catchUp();
    if (typeof drawFixBtn === 'function') drawFixBtn();
  }
  function closeAllSheets() { SHSTACK.length = 0; if (SH) closeSheet(); }
  function syncForm() {
    const scope = SH ? $('#sheet') : $('#app');
    const data = SH ? SH.F : F;
    $$('[data-count]', scope).forEach((el) => {
      const n = (data[el.dataset.count] || '').trim().length, min = +el.dataset.min;
      el.textContent = n < min ? `${min - n} до минимума · конкретика помогает другим` : 'Так понятно, за что вы его рекомендуете';
      el.classList.toggle('ok', n >= min);
    });
    const valid = SH ? (SH.valid ? SH.valid() : true) : route().path[0] === 'ask' ? askValid() : !S.onboarded ? !!(F.name || '').trim() : true;
    $$('[data-submit]', scope).forEach((b) => { b.disabled = !valid; });
  }
  const sheetHead = (id, title, sub) => `<div class="s-head">${id ? founderAv(id, 'l') : ''}<div class="grow"><h2 class="h2">${title}</h2>${sub ? `<div class="small muted" style="margin-top:4px">${sub}</div>` : ''}</div><button class="icon-btn" data-act="closeSheet" aria-label="Закрыть" style="box-shadow:none;background:var(--card-2)">${ic('x')}</button></div>`;
  const relChips = (F, heard) => `<div class="field"><span>Откуда знаете</span><div class="chips">${Object.entries(heard ? { heard: 'Мне посоветовали', ...REL } : REL).map(([k, v]) => `<button class="chip ${F.rel === k ? 'on' : ''}" data-act="set" data-k="rel" data-v="${k}">${v}</button>`).join('')}</div></div>`;
  // ——— Сфера: одно поле с подсказками вместо длинного списка ———
  // Печатаете — под полем подходящие сферы, в том числе похожие по смыслу. Нужной нет —
  // «Добавить» заводит новую для всех. Одна сфера (место, фирма, запись) или несколько (профиль).
  const normCat = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').trim();
  const catWords = (c) => [c.name, c.who, ...(c.words || [])].map(normCat).filter(Boolean);
  const catMatch = (c, q) => {
    let best = 0;
    catWords(c).forEach((h) => {
      const parts = h.split(/[\s,-]+/);
      if (h === q) best = Math.max(best, 100);
      else if (h.startsWith(q)) best = Math.max(best, 80);
      else if (parts.some((w) => w.startsWith(q))) best = Math.max(best, 70);
      else if (h.includes(q)) best = Math.max(best, 50);
      // похожие по корню: «ремонт» найдёт «ремонтник», «стоматолог» — «стоматология»
      else if (q.length >= 4 && parts.some((w) => w.length >= 4 && (w.startsWith(q.slice(0, 4)) || q.startsWith(w.slice(0, 4))))) best = Math.max(best, 30);
    });
    return best;
  };
  const catScore = (c, query) => {
    const q = normCat(query);
    if (!q) return 0;
    const words = q.split(/\s+/).filter((w) => w.length >= 2);
    const whole = catMatch(c, q);
    const each = words.length > 1 ? Math.min(...words.map((w) => catMatch(c, w))) * 0.9 : 0;
    return Math.max(whole, each);
  };
  // чем чаще сфера встречается в сети, тем выше в подсказках
  const catPopularity = () => {
    const n = {};
    Object.keys(S.users || {}).forEach((id) => G.catsOf(id).forEach((c) => { n[c] = (n[c] || 0) + 1; }));
    nodesAll().forEach((x) => { if (x.cat) n[x.cat] = (n[x.cat] || 0) + 1; });
    return n;
  };
  const capFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

  // key: 'cat' — одна сфера, 'cats' — несколько; label: как подписывать — 'name' (сфера) или 'who' (занятие)
  const catPick = (F, key, label = 'name', title = 'В какой сфере') => {
    const chosen = key === 'cats' ? (F.cats || []) : (F.cat ? [F.cat] : []);
    const show = (id) => esc(cat(id)[label] || cat(id).name);
    return `<div class="field catpick"><span>${title}</span>
      ${chosen.length ? `<div class="chips" style="margin-bottom:8px">${chosen.map((id) => `<span class="chip on">${show(id)}
        <button class="chip-x" data-act="${key === 'cats' ? 'toggle' : 'set'}" data-k="${key}" data-v="${key === 'cats' ? id : ''}" aria-label="Убрать">${ic('x')}</button></span>`).join('')}</div>` : ''}
      <input class="input" data-catq="${key}" data-label="${label}" autocomplete="off" maxlength="40"
        placeholder="${chosen.length && key === 'cat' ? 'Поменять: начните печатать' : key === 'cats' ? 'Начните печатать: дизайнер, юрист…' : 'Начните печатать: типография, юрист…'}">
      <div class="cat-sugg"></div></div>`;
  };

  function catSuggest(input) {
    const box = input.parentElement.querySelector('.cat-sugg');
    if (!box) return;
    const key = input.dataset.catq, label = input.dataset.label || 'name';
    const data = input.closest('#sheet') ? (SH && SH.F) : F;
    const chosen = key === 'cats' ? ((data && data.cats) || []) : [];
    const q = input.value.trim();
    const pop = catPopularity();
    let list;
    if (!q) {   // пустое поле — самые частые в вашей сети, чтобы было с чего начать
      list = S.cats.filter((c) => !chosen.includes(c.id)).sort((a, b) => (pop[b.id] || 0) - (pop[a.id] || 0)).slice(0, 6);
    } else {
      list = S.cats.map((c) => ({ c, s: catScore(c, q) })).filter((x) => x.s > 0 && !chosen.includes(x.c.id))
        .sort((a, b) => b.s - a.s || (pop[b.c.id] || 0) - (pop[a.c.id] || 0)).slice(0, 7).map((x) => x.c);
    }
    const exact = q && S.cats.some((c) => normCat(c.name) === normCat(q) || normCat(c.who) === normCat(q));
    box.innerHTML = list.map((c) => `<button class="sugg" data-act="pickCat" data-k="${key}" data-v="${c.id}">
        <b>${esc(c[label] || c.name)}</b>${label === 'who' && c.name !== c.who ? `<i>${esc(c.name)}</i>` : label === 'name' && c.who !== c.name ? `<i>${esc(c.who)}</i>` : ''}</button>`).join('')
      + (q.length >= 3 && !exact ? `<button class="sugg new" data-act="newCat" data-k="${key}" data-name="${esc(capFirst(q))}">${ic('plus')}Добавить «${esc(capFirst(q))}»</button>` : '')
      + (q && !list.length && q.length < 3 ? '<p class="tiny muted" style="margin:6px 2px">Ещё пару букв…</p>' : '');
  }

  const catChips = (F) => catPick(F, 'cat');
  // Своя сфера: заводим на сервере и сразу выбираем
  const addOwnCat = async (name) => {
    const low = name.trim().replace(/\s+/g, ' ').toLowerCase();
    if (low.length < 3) { toast('Напишите хотя бы три буквы'); return null; }
    const clean = low[0].toUpperCase() + low.slice(1);
    const known = S.cats.find((c) => c.name.toLowerCase() === low || c.who.toLowerCase() === low);
    if (known) return known.id;
    if (!LIVE) {
      const id = 'own-' + uid();
      S.cats.push({ id, name: clean, who: clean, words: [low] });
      G = window.Graph(S);
      return id;
    }
    try {
      const res = await window.API.post('/categories', { name: clean });
      await refresh();
      return res.id;
    } catch (e) { toast(e.message); return null; }
  };

  // Заявка в сеть: пара хранится один раз (a < b), кто позвал — в поле by
  const askedMe = (c) => c.status === 'pending' && (c.a === S.me || c.b === S.me) && c.by !== S.me;
  const whoAsked = (c) => (c.a === S.me ? c.b : c.a);
  const pairWith = (c, id) => (c.a === S.me && c.b === id) || (c.b === S.me && c.a === id);

  const recsToday = () => G.recsFrom(S.me).filter((r) => Date.now() - r.at < 864e5).length;
  const REC_LIMIT = 5, MIN_TEXT = 15;
  // Частые фразы одним нажатием: рекомендация не должна быть дороже ответа в чате
  const QUICK = ['Сам пользуюсь', 'Сделал быстро и аккуратно', 'Честные цены', 'Всегда на связи', 'Советую близким'];
  const quickChips = () => `<div class="chips quick">${QUICK.map((q) => `<button class="chip" data-act="addPhrase" data-v="${q}">+ ${q}</button>`).join('')}</div>`;

  // Рекомендовать знакомого
  function sheetRecommend(id, catId) {
    const prefer = G.catsOf(id);
    const f = { cat: catId || prefer[0] || '', rel: '', text: '', interest: '', priv: false, allCats: !prefer.length };
    const existing = () => G.recsFrom(S.me).find((r) => r.to === id && r.cat === f.cat);
    const fillFromExisting = () => { const e = existing(); if (e) { f.text = e.text; f.rel = e.rel; f.interest = e.interest || ''; f.priv = !!e.private; } };
    fillFromExisting();
    openSheet({
      F: f,
      onSet: (k) => { if (k === 'cat') { f.text = ''; f.rel = ''; fillFromExisting(); } },
      valid: () => f.cat && f.rel && f.text.trim().length >= MIN_TEXT && (existing() || recsToday() < REC_LIMIT),
      render: () => {
        const e = existing();
        const limit = !e && recsToday() >= REC_LIMIT;
        return `${sheetHead(id, e ? 'Изменить запись' : 'Рекомендовать', esc(U(id).name))}
          ${catChips(f, prefer)}${relChips(f)}
          <label class="field"><span>Почему рекомендуете</span><textarea class="textarea" data-bind="text" maxlength="600" placeholder="Одной фразой, как сказали бы в чате: «делал нам ремонт, уложился в срок»">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="${MIN_TEXT}"></p></label>
          ${quickChips()}
          <div class="field"><span>Есть ли у вас свой интерес</span><div class="chips">${[
          ['', 'Нет, просто советую'], ['family', 'Это мой родственник'], ['staff', 'Работает у меня'], ['money', 'Я на этом зарабатываю'],
        ].map(([k, l]) => `<button class="chip ${f.interest === k ? 'on' : ''}" data-act="set" data-k="interest" data-v="${k}">${l}</button>`).join('')}</div>
            <p class="hint">Скрытый интерес ломает доверие ко всей сети, названный вслух — нет</p></div>
          ${e ? `<div class="note">Вы уже рекомендовали в этой сфере ${when(e.at)}. Изменения сохранятся с пометкой «изменена» — старую версию мы храним.</div>` : ''}
          ${limit ? `<div class="warn">${ic('alert')}<div>Сегодня вы уже дали ${REC_LIMIT} рекомендаций. Лимит защищает сеть от накруток — продолжить можно завтра.</div></div>` : ''}
          <button class="pick ${f.priv ? 'on' : ''}" data-act="set" data-k="priv" data-v="${f.priv ? '' : '1'}">
            <span class="grow"><span class="h3" style="display:block">Только для себя</span>
            <span class="small muted">Запись останется в вашем кругу: её не увидит ни этот человек, ни знакомые, и в его репутацию она не пойдёт</span></span><span class="radio"></span></button>
          <div class="note">${f.priv
            ? 'Пока запись только ваша. Её можно открыть кругу в любой момент — тогда она станет рекомендацией с вашим именем.'
            : 'Рекомендация подписана вашим именем, и её видят знакомые. Звёзд здесь нет — только ваши слова.'}</div>
          <p class="why">${ic('spark')}${f.priv ? 'Личная запись работает на вас: через год вы вспомните, за что советовали этого человека' : `Такие записи и делают сеть полезной: за ${esc(first(id))} придут к вам, а не будут искать вслепую`}</p>
          <div class="s-foot"><button class="btn primary block" data-act="submitRec" data-id="${id}" data-submit>${ic('seal')}${e ? 'Сохранить изменения' : 'Отправить рекомендацию'}</button></div>`;
      },
      submit: () => {
        const e = existing();
        closeSheet();
        mutate(() => {
          if (e) { (e.history = e.history || []).push({ text: e.text, rel: e.rel, at: e.at }); e.text = f.text.trim(); e.rel = f.rel; e.interest = f.interest; e.private = f.priv; e.edited = true; }
          else S.recs.push({ id: 'r' + uid(), from: S.me, to: id, cat: f.cat, rel: f.rel, text: f.text.trim(), interest: f.interest, private: f.priv, at: Date.now(), confirmed: false });
        }, '/recommendations', { to: id, cat: f.cat, rel: f.rel, text: f.text.trim(), interest: f.interest, private: f.priv },
          e ? 'Запись обновлена' : f.priv ? 'Записали только для вас' : `Готово. ${U(id).name.split(' ')[0]} получит уведомление в Telegram`);
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
  function sheetIntro(id, catId, viaForced, fromReq) {
    const t = G.trust(id, catId);
    const path = viaForced ? [S.me, viaForced, id] : (t.chain || [S.me, id]);
    // Через сеть идут шагами: знакомит только общий знакомый, поэтому если человек
    // дальше второго круга, сначала знакомимся со следующим звеном цепочки.
    const step = path.slice(0, 3);
    const via = step[1];
    const goal = step[2] || id;
    const far = goal !== id;
    // Если знакомство просят из своего запроса — задача уже описана, незачем писать заново
    const req = fromReq ? S.requests.find((x) => x.id === fromReq && x.from === S.me) : null;
    const f = { text: req ? req.text : '' };
    openSheet({
      F: f,
      valid: () => f.text.trim().length >= 10,
      render: () => `${sheetHead(null, far ? 'Шаг к знакомству' : 'Попросить знакомство', 'Через: ' + esc(U(via).name))}
        <div class="card" style="box-shadow:none;background:var(--card-2);margin-top:12px">${chainBig(step, viaForced || t.via, catId)}</div>
        ${far ? `<div class="note" style="margin-top:12px">Сюда два шага: знакомит только общий знакомый. Ближайшее звено — ${esc(full(goal))}; дальше просьба пойдёт через этого человека.</div>` : ''}
        <label class="field"><span>Коротко о задаче</span><textarea class="textarea" data-bind="text" maxlength="400" placeholder="Например: нужен логотип и вывеска для кофейни, бюджет обсуждаем">${esc(f.text)}</textarea>${req ? '<p class="hint">Взяли из вашего запроса — поправьте, если нужно</p>' : '<p class="hint" data-count="text" data-min="10"></p>'}</label>
        <div class="note"><b>${esc(U(via).name)}</b> увидит вашу просьбу и решит, знакомить ли. ${esc(U(goal).name)} получит ваш профиль только после этого — так никто не получает холодных сообщений.</div>
        <div class="s-foot"><button class="btn primary block" data-act="submitIntro" data-submit>${ic('hand')}Отправить просьбу</button></div>`,
      submit: () => {
        const text = f.text.trim();
        closeSheet();
        mutate(() => {
          const x = { id: 'i' + uid(), from: S.me, via, to: goal, cat: catId, text, status: 'wait', at: Date.now() };
          S.intros.push(x);
          setTimeout(() => { x.status = 'ok'; commit(); toast('Знакомство одобрено — можно написать: ' + first(goal)); }, 5000);
        }, '/intros', { to: goal, via, cat: catId || null, text }, 'Просьба отправлена: ' + U(via).name);
      },
    });
  }

  // Посоветовать человека в ответ на запрос
  function sheetAnswer(qid) {
    const q = S.requests.find((x) => x.id === qid);
    const cands = myContacts().filter((c) => c !== q.from)
      .map((c) => ({ id: c, fit: !!q.cat && G.catsOf(c).includes(q.cat), mine: !!q.cat && G.recsFrom(S.me).some((r) => r.to === c && r.cat === q.cat) }))
      .sort((a, b) => (b.mine - a.mine) || (b.fit - a.fit) || U(a.id).name.localeCompare(U(b.id).name));
    const f = { person: '', text: '', asRec: true };
    const fits = partnersForRequest(q);
    openSheet({
      F: f,
      valid: () => f.person && f.text.trim().length >= 8,
      render: () => {
        const c = cands.find((x) => x.id === f.person);
        const canRec = c && !c.mine && !!q.cat;
        return `${sheetHead(q.from, 'Посоветовать', esc(U(q.from).name) + (q.cat ? ' ищет: ' + esc(cat(q.cat).who.toLowerCase()) : ' спрашивает сеть'))}
          <div class="note" style="font-size:14px;color:var(--ink)">«${esc(q.text)}»</div>
          <div class="field"><span>Кого советуете</span>${cands.map((x) => `<button class="pick ${f.person === x.id ? 'on' : ''}" data-act="pickWho" data-k="person" data-v="${x.id}">${av(x.id, 's')}<span class="grow"><span class="h3 ellip" style="display:block">${esc(U(x.id).name)}</span><span class="small muted">${x.mine ? 'Вы уже рекомендуете' : esc(who(x.id))}</span></span>${x.fit ? `<span class="tag brand">${esc(cat(q.cat).who)}</span>` : ''}<span class="radio"></span></button>`).join('')}</div>
          <label class="field"><span>Почему этот человек</span><textarea class="textarea" data-bind="text" maxlength="400" placeholder="Например: чинил мне часы в прошлом году, взял недорого и сделал за три дня">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="20"></p></label>
          ${canRec ? `<div class="note" style="margin-top:12px">Ваш ответ сам ляжет в ваш круг — записью о ${esc(U(f.person).name.split(' ')[0])} в сфере «${esc(cat(q.cat).name)}». Её увидят знакомые, когда будут искать такого же человека.
            <button class="btn ghost xs" style="margin-top:10px" data-act="set" data-k="asRec" data-v="${f.asRec ? '' : '1'}">${f.asRec ? 'Не записывать, просто ответить' : 'Всё-таки записать'}</button></div>` : ''}
          ${fits.length ? `<div class="field"><span>Подрядчики вашей фирмы — подходят</span>${fits.slice(0, 5).map((x) => `<button class="pick" data-act="answerPartner" data-q="${q.id}" data-id="${x.id}">${partnerAv(x)}<span class="grow"><span class="h3 ellip" style="display:block">${esc(x.name)}</span><span class="small muted ellip" style="display:block">${esc(x.section || (x.cat ? cat(x.cat).who : ''))}</span></span>${ic('arrow')}</button>`).join('')}</div>` : ''}
          <div class="btn-row" style="margin-top:12px">
            <button class="btn ghost sm" data-act="outsider" data-cat="${q.cat}">Человека нет в сети</button>
            ${myFirmPartners().length ? `<button class="btn ghost sm" data-act="answerPartner" data-q="${q.id}">Подрядчик фирмы</button>` : ''}
            <button class="btn ghost sm" data-act="answerPlace" data-id="${q.id}" data-cat="${q.cat}">Посоветовать место</button></div>
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


  // Мастер прислал клиенту ссылку «порекомендуйте меня»: одна фраза — и готово
  async function sheetAskRec(code) {
    let info;
    try { info = await window.API.get('/invites/ask/' + encodeURIComponent(code)); } catch (e) { toast(e.message || 'Ссылка устарела'); return; }
    if (info.self) {
      toast('Это ваша ссылка — отправьте её клиентам');
      go('#/me');
      return;
    }
    const prefer = info.cats || [];
    const f = { cat: prefer[0] || '', rel: 'client', text: '', allCats: !prefer.length };
    openSheet({
      F: f,
      valid: () => f.cat && f.text.trim().length >= MIN_TEXT,
      render: () => `${sheetHead(S.users[info.user] ? info.user : null, esc(info.name) + ' просит пару слов', info.already ? 'Вы уже рекомендовали — можно дополнить' : 'Ваши слова увидят знакомые, когда будут искать такого мастера')}
        ${catChips(f, prefer)}${relChips(f)}
        <label class="field"><span>Как всё прошло</span><textarea class="textarea" data-bind="text" maxlength="600" placeholder="Одной фразой: «делал нам ремонт, уложился в срок»">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="${MIN_TEXT}"></p></label>
        ${quickChips()}
        <p class="why">${ic('spark')}Хороших мастеров находят по словам клиентов, а не по рекламе. Ваша фраза — лучшее спасибо</p>
        <div class="s-foot"><button class="btn primary block" data-act="submitAskRec" data-submit>${ic('seal')}Рекомендовать</button></div>`,
      submit: async () => {
        try {
          const res = await window.API.post('/invites/ask/recommend', { code, cat: f.cat, rel: f.rel, text: f.text.trim() });
          closeSheet();
          toast('Спасибо! ' + info.name.split(' ')[0] + ' увидит вашу рекомендацию');
          await refresh();
          go('#/p/' + res.user);
        } catch (e) { toast(e.message); }
      },
    });
  }

  // Мастер просит клиентов: ссылка, по которой клиент пишет о нём одну фразу
  async function sheetAskLink() {
    if (!LIVE) { toast('В демо ссылка не создаётся — в рабочей версии здесь будет ваша личная ссылка'); return; }
    let res;
    try { res = await window.API.post('/invites/ask', {}); } catch (e) { toast(e.message); return; }
    const tgLink = `https://t.me/${S.bot || 'sarafanibot'}?startapp=${res.code}`;
    const webLink = `${location.origin}${location.pathname}?code=${res.code}`;
    const link = window.API.inTelegram ? tgLink : tgLink;
    openSheet({
      F: {},
      render: () => `${sheetHead(null, 'Попросите довольных клиентов', res.got ? `Вас уже рекомендуют ${pl(res.got, 'человек', 'человека', 'человек')}` : 'Первая рекомендация — самая важная')}
        <p class="small" style="color:var(--ink-2);margin:0 0 12px">Отправьте ссылку в чат, где договаривались о работе. Клиент напишет одну фразу — и вас найдут его знакомые. Про Сарафан ему знать не нужно: ссылка сама всё объяснит.</p>
        <div class="invite-card"><div class="link-box">${ic('link').replace('<svg', '<svg style="width:18px;height:18px;flex:none;opacity:.7"')}<span>${esc(link.replace('https://', ''))}</span></div>
          <div class="btn-row"><button class="btn sm" data-act="tgSend" data-text="${esc('Если вам понравилась моя работа — напишите, пожалуйста, пару слов. Это займёт минуту:')}" data-url="${esc(link)}">${ic('send')}Отправить</button>
            <button class="btn ghost sm" data-act="copy" data-v="${esc(link)}">${ic('copy')}Скопировать</button></div></div>
        ${window.API.inTelegram ? '' : `<p class="hint" style="margin-top:10px">Для тех, у кого нет Telegram: <a class="link" href="${esc(webLink)}" target="_blank" rel="noopener">${esc(webLink.replace(/^https?:\/\//, ''))}</a></p>`}
        <p class="why">${ic('spark')}Одна ссылка на всех: её можно отправлять каждому клиенту снова и снова</p>
        <div class="s-foot"><button class="btn ghost block" data-act="closeSheet">Готово</button></div>`,
    });
  }

  // Рекомендовать человека, которого ещё нет в сети
  function sheetOutsider(catId, draftId) {
    const d = (S.drafts || []).find((x) => x.id === draftId);
    const f = { name: d ? d.name : '', cat: (d && d.cat) || catId || '', rel: d && /посоветовал|прислал/.test(d.text || '') ? 'heard' : '', text: d ? d.text : '',
      phone: d ? (d.phone || (d.username ? '@' + d.username : '')) : '', allCats: true, done: null };
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2 && f.cat && f.rel && f.text.trim().length >= MIN_TEXT,
      render: () => {
        if (f.done) {
          const link = `t.me/${S.bot || 'sarafanibot'}?start=${f.done.code}`;
          return `${sheetHead(null, 'Записали. Позвать его?', esc(f.done.name) + ' · ' + esc(cat(f.done.cat).who))}
            <div class="invite-card" style="margin-top:12px"><div class="small" style="opacity:.8">По этой ссылке ${esc(f.done.name)} войдёт в Сарафан и сразу увидит вашу рекомендацию.</div><div class="link-box">${ic('link').replace('<svg', '<svg style="width:18px;height:18px;flex:none;opacity:.7"')}<span>${link}</span></div>
            <div class="btn-row"><button class="btn sm" data-act="tgSend" data-text="${esc(`${f.done.name}, я рекомендую вас в Сарафане — это сеть, где нужных людей находят через знакомых. Заберите профиль:`)}" data-url="https://${link}">${ic('send')}Отправить</button><button class="btn ghost sm" data-act="copy" data-v="https://${link}">${ic('copy')}Скопировать</button></div></div>
            <div class="note">Когда ${esc(f.done.name)} примет приглашение, вы станете первым контактом, а рекомендация появится в профиле.</div>
            <div class="s-foot">${f.next ? `<button class="btn primary block" data-act="openDraft" data-id="${f.next}">Следующий из переписки</button>` : ''}<button class="btn ghost block" data-act="closeSheet">Позову позже</button></div>`;
        }
        const heard = f.rel === 'heard';
        const more = (S.drafts || []).filter((x) => x.id !== draftId).length;
        return `${sheetHead(null, d ? 'Из переписки' : 'Записать человека', d ? (more ? `Проверьте и сохраните — дальше ещё ${more}` : 'Проверьте и сохраните — через год найдёте за секунду') : 'Даже если про Сарафан он ещё не знает')}
          ${d ? '' : `<button class="link-row wide" data-act="pickContacts" style="margin-bottom:12px">${ic('send')}<span class="grow"><b>Выбрать из контактов Telegram</b><i>До 10 человек за раз — бот сохранит их в черновики</i></span>${ic('arrow')}</button>`}
          ${d ? '' : `<label class="field paste"><span>Скопировали совет в переписке? Вставьте — разберём сами</span><textarea class="textarea" rows="2" data-paste data-bind="paste" placeholder="Рустам, электрик, +998 90 123 45 67 — делал у нас проводку">${esc(f.paste || '')}</textarea></label>`}
          ${d && d.photo ? `<div class="row" style="gap:12px;margin-bottom:12px"><span class="av l"><img src="${esc(srvUrl(d.photo))}" alt=""></span>
            <div class="grow small muted">Так он выглядит в Telegram${d.username ? ` · @${esc(d.username)}` : ''}. Имя взято из его профиля — впишите, как знаете его вы</div></div>` : ''}
          <label class="field"><span>Имя</span><input class="input" data-bind="name" maxlength="40" placeholder="Например: Рустам" value="${esc(f.name)}"></label>
          <label class="field"><span>Телефон или ник — видите только вы</span><input class="input" data-bind="phone" maxlength="40" placeholder="+998… или @ник" value="${esc(f.phone)}"></label>
          ${catChips(f, [])}${relChips(f, true)}
          <label class="field"><span>${heard ? 'Что о нём сказали' : 'Почему рекомендуете'}</span><textarea class="textarea" data-bind="text" maxlength="600" placeholder="${heard ? 'Кто советовал и что сказал: «Азиз хвалил, чинил ему кондиционер»' : 'Одной фразой, как сказали бы в чате'}">${esc(f.text)}</textarea><p class="hint" data-count="text" data-min="${MIN_TEXT}"></p></label>
          ${heard ? '' : quickChips()}
          <p class="why">${ic('spark')}${heard ? 'Сами вы с ним не работали — поэтому запись останется только у вас и в чужую репутацию не пойдёт' : 'Знакомые найдут его, когда будут искать такого же — и не придётся отвечать в чате заново'}</p>
          <div class="s-foot"><button class="btn primary block" data-act="submitOutsider" data-submit>${heard ? 'Сохранить для себя' : 'Записать'}</button>
            ${d ? `<button class="btn ghost block" data-act="skipDraft" data-id="${d.id}">Не сохранять${more ? ' — к следующему' : ''}</button>` : ''}</div>`;
      },
      submit: async () => {
        const p = { id: 'p' + uid(), name: f.name.trim(), cat: f.cat, rel: f.rel, text: f.text.trim(), code: 'r-' + uid(), at: Date.now(),
          phone: (f.phone || '').trim(), private: f.rel === 'heard' };
        if (LIVE) {
          try {
            const res = await window.API.post('/recommendations/outside', { name: p.name, cat: p.cat, rel: p.rel, text: p.text,
              phone: p.phone, draft: draftId || '' });
            p.code = res.code;
          } catch (e) { toast(e.message); return; }
        } else {
          S.pendingInvites.push(p); save();
        }
        if (draftId) S.drafts = (S.drafts || []).filter((x) => x.id !== draftId);
        const next = draftId && (S.drafts || [])[0];
        if (p.private) {
          closeSheet(); toast('Сохранили для себя: ' + p.name);
          if (next) setTimeout(() => sheetOutsider(null, next.id), 350);
          if (LIVE) refresh();
          return;
        }
        f.next = next ? next.id : null;
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
      render: () => `${sheetHead(id, esc(U(id).name), esc(who(id)) + ' · ' + esc(U(id).city))}
        <div style="margin-top:14px">${chainLine(t.chain || [])}</div>
        ${rep && rep.count ? `<div class="stat-grid" style="margin-top:14px"><div class="stat"><b>${rep.count}</b><span>${plural(rep.count, 'рекомендация', 'рекомендации', 'рекомендаций')}</span></div><div class="stat"><b>${rep.independent}</b><span>${plural(rep.independent, 'независимый источник', 'независимых источника', 'независимых источников')}</span></div><div class="stat"><b>${(G.adj[id] || new Set()).size}</b><span>${plural((G.adj[id] || new Set()).size, 'связь', 'связи', 'связей')}</span></div></div>` : '<div class="note">Рекомендаций пока нет — этот человек просто в вашей сети.</div>'}
        ${rep && rep.recs.length ? `<div class="note" style="color:var(--ink)">«${esc(rep.recs[0].text)}»<div class="tiny muted" style="margin-top:6px">${esc(full(rep.recs[0].from))} · ${esc(cat(rep.recs[0].cat).name)}</div></div>` : ''}
        <div class="s-foot"><div class="btn-row">
          <button class="btn ghost" data-act="closeSheet" data-go="#/p/${id}">Профиль</button>
          ${direct ? `<button class="btn primary" data-act="recommend" data-id="${id}" data-cat="${c || ''}">${ic('seal')}${recLabel(id, c)}</button>`
            : t.chain && t.chain.length > 2 ? `<button class="btn primary" data-act="intro" data-id="${id}" data-cat="${c || ''}">${ic('hand')}Знакомство</button>`
              : `<button class="btn primary" data-act="share" data-id="${id}">${ic('share')}Поделиться</button>`}
        </div></div>`,
    });
  }

  // Изменить свой профиль
  function sheetEditMe() {
    const me = U(S.me);
    const how = me.how || {};
    const f = { name: me.name, about: me.about, cats: [...me.cats], role: me.role || 'both',
      avail: S.availability || (me.hidden ? 'hidden' : me.busy ? 'busy' : 'open'),
      area: how.area || '', visit: how.visit || '', hours: how.hours || '',
      langs: how.langs || '', pay: how.pay || '', reply: how.reply || '', busyDays: '', cardPhone: S.cardPhone || '' };
    const hidden = S.blocked || [];
    openSheet({
      F: f,
      valid: () => f.name.trim().length >= 2,
      render: () => `${sheetHead(null, 'Профиль')}
        <label class="field"><span>Имя</span><input class="input" data-bind="name" maxlength="40" value="${esc(f.name)}"></label>
        <div class="field"><span>Живая аватарка</span>
          <div class="row" style="gap:12px">${av(S.me, 'l')}<div class="grow">
            <label class="btn sm">${ic('spark')}${U(S.me).video ? 'Заменить ролик' : 'Загрузить ролик'}<input type="file" id="videoav" accept="video/*,image/gif" hidden></label>
            ${U(S.me).video ? '<button class="btn sm ghost" data-act="dropVideo" style="margin-left:6px">Убрать</button>' : ''}</div></div>
          <p class="hint">Несколько секунд видео или GIF — будет крутиться без звука в профиле и в облаке сети</p></div>
        <div class="field"><span>Здесь я</span><div class="chips">${[['client', 'Ищу людей'], ['pro', 'Помогаю сам'], ['both', 'И то и другое']].map(([k, l]) => `<button class="chip ${f.role === k ? 'on' : ''}" data-act="set" data-k="role" data-v="${k}">${l}</button>`).join('')}</div></div>
        ${f.role === 'client' ? '' : catPick(f, 'cats', 'who', 'Чем занимаетесь')}
        <label class="field"><span>О себе</span><textarea class="textarea" data-bind="about" maxlength="300">${esc(f.about)}</textarea></label>
        ${f.role === 'client' ? '' : `<div class="field"><span>Как с вами работать</span>
          <input class="input" data-bind="area" maxlength="80" placeholder="Район: Мирабад, Юнусабад…" value="${esc(f.area || '')}">
          <div class="chips" style="margin-top:8px">${Object.entries(HOW.visit).map(([k, l]) => `<button class="chip ${f.visit === k ? 'on' : ''}" data-act="set" data-k="visit" data-v="${k}">${l}</button>`).join('')}</div>
          <div class="chips" style="margin-top:8px">${Object.entries(HOW.reply).map(([k, l]) => `<button class="chip ${f.reply === k ? 'on' : ''}" data-act="set" data-k="reply" data-v="${k}">${l}</button>`).join('')}</div>
          <div class="chips" style="margin-top:8px">${Object.entries(HOW.pay).map(([k, l]) => `<button class="chip ${howList(f.pay).includes(k) ? 'on' : ''}" data-act="toggleWord" data-k="pay" data-v="${k}">${l}</button>`).join('')}</div>
          <div class="chips" style="margin-top:8px">${Object.entries(HOW.langs).map(([k, l]) => `<button class="chip ${howList(f.langs).includes(k) ? 'on' : ''}" data-act="toggleWord" data-k="langs" data-v="${k}">${l}</button>`).join('')}</div>
          <input class="input" style="margin-top:8px" data-bind="hours" maxlength="80" placeholder="Когда удобно писать: будни до 20:00" value="${esc(f.hours || '')}">
          <p class="hint">Это снимает половину вопросов ещё до первого сообщения</p></div>
        <label class="field"><span>Телефон для карточки в чатах</span><input class="input" data-bind="cardPhone" inputmode="tel" maxlength="30" placeholder="+998 90 123 45 67" value="${esc(f.cardPhone || '')}">
          ${tg && tg.requestContact ? `<button class="btn sm ghost" style="margin-top:8px" data-act="takePhone">${ic('user')}Взять номер из Telegram</button>` : ''}
          <p class="hint">Когда вас советуют в чате, номер будет в карточке — нажмут и позвонят. Не хотите — оставьте пустым</p></label>`}
        <div class="field"><span>Как вы видны сети</span><div class="chips">${[
          ['open', 'Беру работу'], ['busy', 'Сейчас занят'], ['hidden', 'Не показывать меня'],
        ].map(([k, l]) => `<button class="chip ${f.avail === k ? 'on' : ''}" data-act="set" data-k="avail" data-v="${k}">${l}</button>`).join('')}</div>
          ${f.avail === 'busy' ? `<div class="chips" style="margin-top:8px">${[['', 'Без срока'], ['7', 'До конца недели'], ['30', 'На месяц']].map(([k, l]) => `<button class="chip ${String(f.busyDays || '') === k ? 'on' : ''}" data-act="set" data-k="busyDays" data-v="${k}">${l}</button>`).join('')}</div>
          <p class="hint">Со сроком состояние отпускает само — не придётся вспоминать</p>` : ''}
          <p class="hint">${f.avail === 'open' ? 'Вас находят в поиске, к вам приходят запросы'
            : f.avail === 'busy' ? 'Вас по-прежнему видно, но рядом с именем написано, что сейчас вы не берёте'
              : 'Вас не найдут в поиске и не посоветуют. Видят только ваши знакомые'}</p></div>
        ${hidden.length ? `<div class="field"><span>Скрыты от вас</span><div class="chips">${hidden.map((b) => `<button class="chip" data-act="unblock" data-id="${b.id}">${esc(b.name)} ✕</button>`).join('')}</div>
          <p class="hint">Вы друг друга не видите. Нажмите, чтобы вернуть</p></div>` : ''}
        <div class="s-foot"><button class="btn primary block" data-act="submitEdit" data-submit>Сохранить</button></div>`,
      submit: () => {
        const body = { name: f.name.trim(), about: f.about.trim(), role: f.role, availability: f.avail,
          cats: f.role === 'client' ? [] : f.cats,
          area: f.area.trim(), visit: f.visit, hours: f.hours.trim(),
          langs: f.langs, pay: f.pay, reply: f.reply, cardPhone: (f.cardPhone || '').trim(),
          busyUntil: f.avail === 'busy' && f.busyDays ? Date.now() + Number(f.busyDays) * 864e5 : null };
        closeSheet();
        mutate(() => { S.availability = f.avail; S.cardPhone = body.cardPhone; Object.assign(me, { name: body.name, about: body.about, cats: body.cats, role: body.role, busy: f.avail === 'busy', hidden: f.avail === 'hidden',
          how: { area: body.area, visit: body.visit, hours: body.hours, langs: body.langs, pay: body.pay, reply: body.reply } }); },
          '/profile', body, 'Сохранено');
      },
    });
    wireVideoInput();
  }

  // Дописать факт о знакомом: не отзыв, а польза для тех, кто к нему пойдёт
  function sheetUserFact(id) {
    const f = { text: '' };
    openSheet({
      F: f,
      valid: () => f.text.trim().length >= 3,
      render: () => `${sheetHead(id, 'Что вы знаете', esc(U(id).name))}
        <label class="field" style="margin-top:0"><span>Одним предложением</span>
          <textarea class="textarea" data-bind="text" maxlength="160" placeholder="Например: работает по субботам, берёт наличными, лучше писать, чем звонить">${esc(f.text)}</textarea></label>
        <div class="note">${esc(first(id))} увидит уточнение и подтвердит или поправит. Это не отзыв: пишите то, что помогает другим, а не оценку.</div>
        <div class="s-foot"><button class="btn primary block" data-act="submitUserFact" data-id="${id}" data-submit>Добавить</button></div>`,
      submit: () => {
        const body = { user: id, text: f.text.trim() };
        closeSheet();
        mutate(null, '/user/fact', body, 'Добавили — ждём подтверждения');
      },
    });
  }

  // Направление витрины: отдельное занятие со своим рассказом и ценами
  function sheetDir(id) {
    const box = (S.showcases || {})[S.me] || {};
    const was = (box.dirs || []).find((d) => d.id === id);
    const f = { id: id || '', title: was ? was.title : '', story: was ? was.story : '', prices: was ? was.prices : '' };
    openSheet({
      F: f,
      valid: () => f.title.trim().length >= 2,
      render: () => `${sheetHead(null, was ? 'Направление' : 'Новое направление')}
        <label class="field" style="margin-top:0"><span>Как называете это занятие</span>
          <input class="input" data-bind="title" maxlength="80" placeholder="Например: свадебная съёмка" value="${esc(f.title)}"></label>
        <label class="field"><span>Что именно делаете</span>
          <textarea class="textarea" data-bind="story" maxlength="1200" placeholder="Как работаете, сколько это занимает, что получает человек на выходе">${esc(f.story)}</textarea></label>
        <label class="field"><span>Про деньги в этом направлении</span>
          <textarea class="textarea" data-bind="prices" maxlength="400" placeholder="Например: съёмочный день — от 4 млн, обработка входит">${esc(f.prices)}</textarea></label>
        <p class="why">${ic('spark')}Разные занятия не мешают друг другу: за съёмкой придут одни, за ремонтом — другие</p>
        ${was ? `<button class="btn ghost block" style="margin-top:12px" data-act="delDir" data-id="${was.id}">Убрать направление</button>` : ''}
        <div class="s-foot"><button class="btn primary block" data-act="submitDir" data-submit>${was ? 'Сохранить' : 'Завести'}</button></div>`,
      submit: () => {
        const body = { id: f.id, title: f.title.trim(), story: f.story.trim(), prices: f.prices.trim() };
        closeSheet();
        mutate(null, '/showcase/dir', body, was ? 'Сохранили' : 'Направление заведено');
      },
    });
  }

  // Правка витрины: текстом о себе и картинками работ
  function sheetShowcase() {
    const sc = (S.showcases || {})[S.me] || { headline: '', story: '', services: '', prices: '', links: '', works: [] };
    const f = { headline: sc.headline, story: sc.story, services: sc.services, prices: sc.prices, links: sc.links };
    openSheet({
      F: f,
      valid: () => true,
      render: () => {
        const box = (S.showcases || {})[S.me] || {};
        const works = box.works || [];
        const dirs = box.dirs || [];
        const loose = works.filter((w) => !w.dir || !dirs.some((d) => d.id === w.dir));
        return `${sheetHead(null, 'Витрина')}
          <label class="field" style="margin-top:0"><span>Строка под именем</span>
            <input class="input" data-bind="headline" maxlength="120" placeholder="Айдентика и упаковка для локальных брендов" value="${esc(f.headline)}"></label>
          <label class="field"><span>О работе</span>
            <textarea class="textarea" data-bind="story" maxlength="2000" placeholder="Чем занимаетесь, с кем работаете, что для вас важно в работе">${esc(f.story)}</textarea></label>
          <label class="field"><span>Что делаете — по строке на услугу</span>
            <textarea class="textarea" data-bind="services" maxlength="1200" placeholder="Логотип и фирменный стиль&#10;Упаковка&#10;Оформление соцсетей">${esc(f.services)}</textarea></label>
          <label class="field"><span>Про деньги</span>
            <textarea class="textarea" data-bind="prices" maxlength="600" placeholder="Например: логотип от 3 млн, обсуждаем после разговора о задаче">${esc(f.prices)}</textarea></label>
          <label class="field"><span>Ссылки — по одной на строку</span>
            <textarea class="textarea" data-bind="links" maxlength="600" placeholder="behance.net/вы&#10;t.me/ваш_канал">${esc(f.links)}</textarea></label>
          <div class="field"><span>Направления ${dirs.length ? `· ${dirs.length} из 8` : ''}</span>
            <p class="hint" style="margin:0 0 8px">Занимаетесь разным? Заведите направление на каждое: у него свой рассказ, свои цены и свои работы.</p>
            ${dirs.map((d) => {
      const mine = works.filter((w) => w.dir === d.id);
      return `<div class="dir-edit">
              <div class="row"><b class="grow">${esc(d.title)}</b>
                <button class="btn ghost xs" data-act="editDir" data-id="${d.id}">Править</button></div>
              ${mine.length ? `<div class="works small-works">${mine.map((w) => `<figure class="work"><img src="${esc(srvUrl(w.url))}" alt="" loading="lazy">
                <button class="work-x" data-act="delWork" data-id="${w.id}" aria-label="Убрать">${ic('x')}</button></figure>`).join('')}</div>`
        : `<div class="works small-works ghost">${GHOST_WORKS.slice(0, 3).map(([t]) => `<label class="work-ghost sm">${ic('cam')}<span>${t}</span>
                <input type="file" accept="image/*" class="workfile" data-dir="${d.id}" hidden></label>`).join('')}</div>`}
              <label class="btn ghost xs" style="margin-top:8px;cursor:pointer">${ic('plus')}Картинка сюда
                <input type="file" accept="image/*" class="workfile" data-dir="${d.id}" hidden></label></div>`;
    }).join('')}
            <button class="btn block" style="margin-top:10px" data-act="editDir" data-id="">${ic('plus')}Добавить направление</button></div>

          <div class="field"><span>Работы без направления ${loose.length ? `· ${loose.length}` : ''}</span>
            ${loose.length ? `<div class="works small-works">${loose.map((w) => `<figure class="work"><img src="${esc(srvUrl(w.url))}" alt="" loading="lazy">
              <button class="work-x" data-act="delWork" data-id="${w.id}" aria-label="Убрать">${ic('x')}</button></figure>`).join('')}</div>` : ''}
            <label class="btn block" style="margin-top:10px;cursor:pointer">${ic('plus')}Добавить картинку
              <input type="file" accept="image/*" class="workfile" data-dir="" hidden></label>
            <p class="hint">JPG, PNG или WebP до 6 МБ. Всего до 12 работ.</p></div>
          <div class="s-foot"><button class="btn primary block" data-act="submitShowcase" data-submit>Сохранить</button></div>`;
      },
      submit: () => {
        closeSheet();
        mutate(() => {
          S.showcases = S.showcases || {};
          S.showcases[S.me] = Object.assign({ works: [] }, S.showcases[S.me], f);
        }, '/showcase', { ...f }, 'Витрина сохранена');
      },
    });
    // загрузка картинки — сразу после выбора файла, в то направление, где нажали
    wireWorkInputs();
  }

  // Снимок места: показывает, куда человек придёт, лучше любого описания
  async function uploadVideoAvatar(file) {
    if (!file) return;
    if (!LIVE) { toast('В демо ролики не загружаются'); return; }
    toast('Загружаем и сжимаем ролик…');
    try {
      await window.API.upload('/profile/video', file, {});
      await refresh();
      if (SH) { drawSheet(); wireVideoInput(); }
      toast('Живая аватарка готова');
    } catch (e) { toast(e.message); }
  }
  function wireVideoInput() {
    setTimeout(() => { const inp = $('#videoav'); if (inp) inp.onchange = () => uploadVideoAvatar(inp.files && inp.files[0]); }, 60);
  }

  async function uploadPlacePhoto(file, node) {
    if (!file) return;
    if (!LIVE) { toast('В демо снимки не загружаются'); return; }
    toast('Загружаем…');
    try {
      await window.API.upload('/nodes/photo', file, { node });
      await refresh();
      toast('Снимок добавлен');
    } catch (e) { toast(e.message); }
  }

  function wireWorkInputs() {
    setTimeout(() => {
      $('#sheet').querySelectorAll('.workfile').forEach((inp) => {
        inp.onchange = () => uploadWork(inp.files && inp.files[0], inp.dataset.dir || '');
      });
    }, 60);
  }

  async function uploadWork(file, dir) {
    if (!file) return;
    if (!LIVE) { toast('В демо работы не загружаются'); return; }
    toast('Загружаем…');
    try {
      await window.API.upload('/works', file, dir ? { dir } : {});
      await refresh();
      if (SH) { drawSheet(); wireWorkInputs(); }
      toast('Работа добавлена');
    } catch (e) { toast(e.message); }
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

  // «В Telegram»: в выбранный чат уходит та же карточка с кнопками, что и через «@бот …».
  // Где Telegram этого не умеет (старые версии, браузер) — как раньше, ссылкой.
  const shareCard = async (kind, id, fallback) => {
    if (!(LIVE && tg && tg.shareMessage)) { fallback(); return; }
    try {
      const res = await window.API.post('/share/prepare', { kind, id });
      tg.shareMessage(res.id, (sent) => { if (sent) toast('Отправили'); });
    } catch (e) { fallback(); }
  };

  // ——— Действия ———
  const ACT = {
    goto: (d) => go(d.h),
    back: () => goBack(),
    // С глубокого экрана — сразу на главную, не щёлкая «назад» по цепочке
    goHome: () => { closeAllSheets(); navBack = true; go('#/'); },
    closeSheet: (d) => { const s = SH; if (d && d.go) closeAllSheets(); else closeSheet(); if (s && s.onClose) s.onClose(); if (d && d.go) go(d.go); },
    peek: (d) => sheetPeek(d.id),
    set: (d) => {
      const v = d.v === '1' ? true : d.v === '' ? false : d.v;
      SH.F[d.k] = v; if (SH.onSet) SH.onSet(d.k); drawSheet();
    },
    // и в окне, и на странице входа (там сферы выбирают до того, как открылось хоть одно окно)
    toggle: (d) => { const data = SH ? SH.F : F; const a = data[d.k] = data[d.k] || []; const i = a.indexOf(d.v); i < 0 ? a.push(d.v) : a.splice(i, 1); if (SH) drawSheet(); else render(); },
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
    tgShare: (d) => shareCard('person', d.id, () => tgShareLink(`https://t.me/${S.bot || 'sarafanibot'}?startapp=${S.invite ? S.invite.code + '_' : ''}p${d.id}`, `${U(d.id).name} — ${who(d.id)}. Рекомендую, посмотри в Сарафане:`)),
    tgSend: (d) => tgShareLink(d.url, d.text),
    addPhrase: (d) => {
      const t = (SH.F.text || '').trim();
      if (t.includes(d.v)) return;
      SH.F.text = t ? t.replace(/[.!]?$/, '. ') + d.v : d.v;
      drawSheet();
    },
    openDraft: (d) => sheetOutsider('', d.id),
    // Записали человека, а он не нужен — убираем; его ссылка-приглашение перестаёт работать
    dropPending: (d) => mutate(() => { S.pendingInvites = (S.pendingInvites || []).filter((x) => x.code !== d.code); },
      '/recommendations/outside/delete', { code: d.code }, 'Убрали: ' + d.name),
    openWaiting: (d) => sheetWaiting(d.id),
    saveWaiting: (d) => {
      const f = SH.F;
      closeSheet();
      mutate(() => { const w = (S.waiting || []).find((x) => x.id === d.id); if (w) Object.assign(w, { name: f.name.trim(), note: f.note.trim(), cat: f.cat || '' }); },
        '/circle/waiting/update', { id: d.id, name: f.name.trim(), note: f.note.trim(), cat: f.cat || '' }, 'Сохранено');
    },
    // Рекомендовать того, кто ещё не пришёл: обычная запись «человек вне Сарафана», уже с его именем и ником
    recWaiting: (d) => {
      const w = (S.waiting || []).find((x) => x.id === d.id);
      const f = SH ? SH.F : {};
      closeSheet();
      setTimeout(() => {
        sheetOutsider(f.cat || (w && w.cat) || '');
        if (SH && w) { SH.F.name = (f.name || w.name || '').trim(); SH.F.phone = w.username ? '@' + w.username : ''; drawSheet(); }
      }, 320);
    },
    dropWaitJob: (d) => mutate(() => { const w = (S.waiting || []).find((x) => x.id === d.id); if (w) { w.node = null; w.job = ''; } },
      '/circle/waiting/job', { id: d.id, node: '' }, 'Убрали из фирмы'),
    dropWaiting: (d) => mutate(() => { if (SH) closeSheet(); S.waiting = (S.waiting || []).filter((x) => x.id !== d.id); },
      '/circle/waiting/delete', { id: d.id }, 'Убрали из круга: ' + (d.name || '')),
    dropSaved: (d) => mutate(() => { S.saved = (S.saved || []).filter((x) => !(x.kind === d.kind && x.id === d.id)); }, '/saved/delete', { kind: d.kind, id: d.id }, 'Убрали'),
    dropVideo: async () => {
      if (!LIVE) return;
      try { await window.API.post('/profile/video/delete', {}); await refresh(); if (SH) { drawSheet(); wireVideoInput(); } toast('Живая аватарка убрана'); } catch (e) { toast(e.message); }
    },
    // Номер для карточки — из самого Telegram: он спросит разрешения, набирать ничего не нужно
    takePhone: () => {
      tg.requestContact((ok, res) => {
        const raw = ok && res && res.responseUnsafe && res.responseUnsafe.contact && res.responseUnsafe.contact.phone_number;
        if (!raw) { if (ok === false) toast('Номер не взяли — можно вписать руками'); return; }
        if (!SH) return;
        SH.F.cardPhone = (String(raw).startsWith('+') ? '' : '+') + raw;
        drawSheet(); toast('Номер вписан — нажмите «Сохранить»');
      });
    },
    toggleFull: () => { try { if (tg.isFullscreen) tg.exitFullscreen(); else tg.requestFullscreen(); } catch (e) { toast('В этой версии Telegram так нельзя'); } },
    // Позвать знакомых из контактов — просто в круг, без рекомендаций
    pickCircle: () => {
      const link = `https://t.me/${S.bot || 'sarafanibot'}?start=pickc`;
      if (!LIVE) { toast('В рабочей версии откроется бот с кнопкой «Выбрать знакомых»'); return; }
      if (tg && tg.openTelegramLink) tg.openTelegramLink(link); else window.open(link, '_blank');
    },
    // Выбрать людей из контактов: Telegram сам показывает список, бот сохраняет отмеченных в черновики
    pickContacts: () => {
      const link = `https://t.me/${S.bot || 'sarafanibot'}?start=pick`;
      if (!LIVE) { toast('В рабочей версии откроется бот с кнопкой «Выбрать из контактов»'); return; }
      if (tg && tg.openTelegramLink) tg.openTelegramLink(link); else window.open(link, '_blank');
    },
    // Нажали «Сохранить» в чате по ошибке — черновик убираем, открываем следующий, если есть
    skipDraft: async (d) => {
      closeSheet();
      await mutate(() => { S.drafts = (S.drafts || []).filter((x) => x.id !== d.id); }, '/drafts/done', { id: d.id }, 'Не сохранили');
      const next = (S.drafts || []).find((x) => x.id !== d.id);
      if (next) setTimeout(() => sheetOutsider(null, next.id), 350);
    },
    dropDraft: (d) => mutate(() => { S.drafts = (S.drafts || []).filter((x) => x.id !== d.id); }, '/drafts/done', { id: d.id }, 'Не сохранили'),
    submitAskRec: () => SH.submit(),
    askLink: () => sheetAskLink(),
    intro: (d) => sheetIntro(d.id, d.cat, d.via, d.q),
    submitIntro: () => SH.submit(),
    // Открыть переписку с человеком: по нику, а если ника нет — по телефону из его карточки
    write: (d) => {
      const u = U(d.id) || {};
      const link = u.username ? `https://t.me/${u.username}` : u.phone ? `https://t.me/${u.phone.replace(/[^\d+]/g, '')}` : '';
      if (!LIVE) { toast(`В рабочей версии откроется чат с ${(u.name || '').split(' ')[0]} в Telegram`); return; }
      if (!link) { toast('У человека нет ника в Telegram — попросите знакомого вас познакомить'); return; }
      if (tg && tg.openTelegramLink) tg.openTelegramLink(link); else window.open(link, '_blank');
    },
    addConn: (d) => mutate(() => {
      S.conns.push({ a: S.me, b: d.id, by: S.me, status: 'pending', at: Date.now() });
      setTimeout(() => { const c = S.conns.find((x) => pairWith(x, d.id)); if (c) { c.status = 'ok'; commit(); toast(U(d.id).name + ' теперь в вашей сети'); } }, 4000);
    }, '/connections/ask', { user: d.id }, 'Заявка отправлена'),
    introWorked: (d) => mutate(() => { const i = S.intros.find((x) => x.id === d.id); if (i) i.result = 'yes'; },
      '/intros/result', { id: d.id, ok: true }, 'Спасибо. Тому, кто познакомил, отправили добрую весть'),
    introFailed: (d) => mutate(() => { const i = S.intros.find((x) => x.id === d.id); if (i) i.result = 'no'; },
      '/intros/result', { id: d.id, ok: false }, 'Поняли. Это останется между нами'),
    introYes: (d) => mutate(() => { const i = S.intros.find((x) => x.id === d.id); if (i) i.status = 'ok'; },
      '/intros/decide', { id: d.id, ok: true }, 'Знакомство состоялось — оба получат уведомление'),
    introNo: (d) => mutate(() => { const i = S.intros.find((x) => x.id === d.id); if (i) i.status = 'no'; },
      '/intros/decide', { id: d.id, ok: false }, 'Отказали. Человек об этом не узнает'),
    acceptConn: (d) => mutate(() => { const c = S.conns.find((x) => pairWith(x, d.id) && x.status === 'pending'); if (c) { c.status = 'ok'; c.at = Date.now(); } },
      '/connections/accept', { user: d.id }, U(d.id).name + ' теперь в вашей сети'),
    declineConn: (d) => mutate(() => { S.conns = S.conns.filter((x) => !(pairWith(x, d.id) && x.status === 'pending')); },
      '/connections/decline', { user: d.id }, 'Заявка отклонена. Человек об этом не узнает'),
    // Запросы
    askQuiet: (d) => { F.quiet = !!d.v; if (!F.quiet) { F.to = []; F.anon = false; } render(); },
    askTo: (d) => {
      const a = F.to || (F.to = []);
      const i = a.indexOf(d.v); i < 0 ? a.push(d.v) : a.splice(i, 1);
      $('#askto').innerHTML = askTo(myContacts()).replace(/^<div class="field" id="askto">|<\/div>$/g, '');
      render();
    },
    askAnon: () => { F.anon = !F.anon; render(); },
    askCat: (d) => { F.cat = d.v || ''; F.catTouched = true; F.allCats = false; $('#askcats').innerHTML = askCats(); syncForm(); },
    askAllCats: () => { F.allCats = true; $('#askcats').innerHTML = askCats(); },
    postAsk: async () => {
      const text = F.t.trim(), cat = F.cat;
      const to = F.quiet ? (F.to || []) : [];
      const anon = !!(F.quiet && F.anon);
      const sent = to.length ? pl(to.length, 'человеку', 'людям', 'людям') : pl(myContacts().length, 'человеку', 'людям', 'людям');
      if (LIVE) {
        try {
          const res = await window.API.post('/requests', { text, cat, to, anon });
          await refresh();
          go('#/q/' + res.id);
          toast('Запрос отправлен ' + sent);
        } catch (e) { toast(e.message); }
        return;
      }
      const q = { id: 'q' + uid(), from: S.me, cat: F.cat, text: F.t.trim(), at: Date.now(), answers: [], anon, quiet: !!to.length };
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
    pickCat: (d, el) => {
      const inSheet = !!el.closest('#sheet');
      const data = inSheet ? SH.F : F;
      if (d.k === 'cats') { data.cats = data.cats || []; if (!data.cats.includes(d.v)) data.cats.push(d.v); } else data.cat = d.v;
      if (inSheet) drawSheet(); else render();
      setTimeout(() => { const inp = $(`${inSheet ? '#sheet ' : ''}[data-catq="${d.k}"]`); if (inp && d.k === 'cats') inp.focus(); }, 30);
    },
    newCat: async (d, el) => {
      const inSheet = !!el.closest('#sheet');
      const id = await addOwnCat(d.name || '');
      if (!id) return;
      ACT.pickCat({ k: d.k, v: id }, el.isConnected ? el : (inSheet ? $('#sheet') : $('#app')));
      toast('Сфера добавлена — теперь она есть у всех');
    },
    saveOwnJob: async () => {
      const id = await addOwnCat(SH.F.ownName || '');
      if (!id) return;
      if (!SH.F.cats.includes(id)) SH.F.cats.push(id);
      SH.F.own = false; SH.F.ownName = '';
      drawSheet();
      toast('Занятие добавлено');
    },
    saveOwnCat: async () => {
      const id = await addOwnCat(SH.F.ownName || '');
      if (!id) return;
      SH.F.cat = id; SH.F.own = false; SH.F.ownName = ''; SH.F.allCats = false;
      drawSheet();
      toast('Сфера добавлена');
    },
    askOwnCat: async () => {
      const id = await addOwnCat(F.ownName || '');
      if (!id) return;
      F.cat = id; F.own = false; F.ownName = ''; F.catTouched = true;
      render();
      toast('Сфера добавлена');
    },
    askOwn: () => { F.own = true; $('#askcats').innerHTML = askCats(); },
    callPending: (d) => tgShareLink(`https://t.me/${S.bot || 'sarafanibot'}?start=${d.code}`,
      `${d.name}, я записал вас в Сарафан — сети рекомендаций по знакомым. Моя рекомендация уже ждёт в вашем профиле:`),
    outsider: (d) => sheetOutsider(d.cat),
    submitOutsider: () => SH.submit(),
    submitWork: () => SH.submit(),
    submitFix: () => SH.submit(),
    submitPropose: () => SH.submit(),
    submitCard: () => SH.submit(),
    submitPartner: () => SH.submit(),
    nodeCard: (d) => sheetNodeCard(d.id),
    addPartner: (d) => sheetPartner(d.id),
    partnerView: (d) => sheetPartnerView(d.id),
    answerPartner: (d) => sheetAnswerPartner(d.q, d.id),
    submitAnswerPartner: () => SH.submit(),
    viewAsOpen: () => sheetViewAs(),
    // «Другой»: выбор открывается прямо поверх — список ролей сервер собирает вашими глазами
    viewAsPick: () => sheetViewAs(),
    viewAsGo: (d) => { window.API.setViewAs({ id: d.id, label: d.label, name: d.name }); location.hash = '#/'; location.reload(); },
    viewAsExit: () => { window.API.setViewAs(null); location.hash = '#/me'; location.reload(); },
    toggleSec: (d) => { if (openSecs.has(d.k)) openSecs.delete(d.k); else openSecs.add(d.k); render(); },
    openTg: (d) => { const link = 'https://t.me/' + d.u; if (tg && tg.openTelegramLink) tg.openTelegramLink(link); else window.open(link, '_blank'); },
    pickVia: (d) => { if (d.name) { SH.F.viaName = d.name; } else { SH.F.via = d.v; SH.F.viaName = ''; } drawSheet(); },
    pickPartnerNode: (d) => { SH.F.node = d.id; SH.F.nodeName = d.name; drawSheet(); },
    dropPartner: (d) => mutate(() => { S.partners = (S.partners || []).filter((x) => x.id !== d.id); }, '/firms/partner/delete', { id: d.id }, 'Убрали'),
    // выбрать человека в окне: номер кладём как есть — общее «set» превращало «1» в «да»
    pickWho: (d) => { SH.F[d.k] = d.v; if (SH.onSet) SH.onSet(d.k); drawSheet(); },
    submitPickNode: () => SH.submit(),
    proposePerson: (d) => sheetProposePerson(d.id),
    pickNode: (d) => sheetPickNode(d.id),
    pickNodeFor: (d) => { SH.F.node = d.id; SH.F.name = d.name; drawSheet(); },
    acceptWork: (d) => mutate(() => { const x = (S.nodePeople || []).find((y) => y.id === d.id); if (x) { x.accepted = true; x.canAccept = false; } },
      '/nodes/people/accept', { id: d.id }, 'Отмечено: вы там работаете'),
    workJoin: (d) => sheetWorkJoin(d.id, d.v),
    workConfirm: (d) => mutate(() => { const x = (S.nodePeople || []).find((y) => y.id === d.id); if (x) { x.confirmed = true; x.waiting = false; x.canConfirm = false; } },
      '/nodes/people/confirm', { id: d.id }, 'Подтверждено'),
    workLeave: (d) => mutate(() => { const x = (S.nodePeople || []).find((y) => y.id === d.id); if (x) x.past = true; },
      '/nodes/people/leave', { id: d.id }, 'Готово: ' + (d.name || 'убрали')),
    // попало по ошибке — удаляем насовсем, из истории тоже
    workErase: (d) => mutate(() => { S.nodePeople = (S.nodePeople || []).filter((y) => y.id !== d.id); },
      '/nodes/people/erase', { id: d.id }, 'Удалено: ' + (d.name || '')),
    workHide: (d) => mutate(() => { const x = (S.nodePeople || []).find((y) => y.id === d.id); if (x) x.hidden = !!d.v; },
      '/nodes/people/hide', { id: d.id, hidden: !!d.v }, d.v ? 'Скрыто от других' : 'Снова видно'),
    // «Не показывайте меня этому человеку»: перестают видеть друг друга, он не узнаёт
    hideFrom: (d) => {
      const name = U(d.id).name;
      mutate(() => {
        S.blocked = [...(S.blocked || []), { id: d.id, name }];
        S.conns = S.conns.filter((c) => !((c.a === S.me && c.b === d.id) || (c.b === S.me && c.a === d.id)));
        delete S.users[d.id];
        G = window.Graph(S);
      }, '/blocks', { user: d.id, on: true }, name + ' больше вас не видит');
      location.hash = '#/';
    },
    unblock: (d) => {
      mutate(() => { S.blocked = (S.blocked || []).filter((b) => b.id !== d.id); },
        '/blocks', { user: d.id, on: false }, 'Снова видите друг друга');
      if (SH) drawSheet();
    },
    // Код для входа на компьютере: человек набирает его в браузере
    handoff: async () => {
      const box = $('#handoff');
      if (!LIVE) { box.innerHTML = '<div class="note">В демо код не выдаём — он нужен для настоящей сети</div>'; return; }
      box.innerHTML = '<p class="small muted" style="margin:0">Готовим код…</p>';
      try {
        const r = await window.API.handoff();
        const site = location.origin + location.pathname;
        box.innerHTML = `<div class="note" style="text-align:center"><div style="font:800 30px/1.1 var(--t);letter-spacing:.12em">${esc(r.code)}</div>
          <p class="small muted" style="margin:10px 0 0">Откройте на компьютере<br><b>${esc(site.replace(/^https?:\/\//, ''))}</b><br>и наберите этот код. Он живёт ${r.minutes} минут.</p></div>`;
      } catch (e) { box.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
    },
    hideStarter: () => { try { localStorage.setItem(STARTER_KEY, '1'); } catch (e) { /* */ } render(); toast('Убрали. Всё это есть в разделах ниже'); },
    mapShow: (d) => { F.show = d.v; render(); },
    cloudHome: () => { if (cloud) cloud.home(); },
    newNode: (d) => sheetNewNode(d.v),
    submitNode: () => SH.submit(),
    takeWhere: () => askWhere((lat, lng) => { SH.F.lat = lat; SH.F.lng = lng; drawSheet(); toast('Точка сохранена'); }),
    dropWhere: () => { SH.F.lat = null; SH.F.lng = null; drawSheet(); },
    editNode: (d) => sheetEditNode(d.id),
    submitEditNode: () => SH.submit(),
    nodeTools: (d) => sheetNodeTools(d.id),
    tourNext: () => tourStep(1),
    tourPrev: () => tourStep(-1),
    tourEnd: () => endTour(),
    tourOpen: () => go('#/tour'),
    closeNode: (d) => mutate(() => { const n = nodeById(d.id); if (n) { n.closed = !!d.v; n.closedBy = d.v ? S.me : null; } },
      '/nodes/close', { id: d.id, closed: !!d.v }, d.v ? 'Отметили: закрылось' : 'Отметили: снова работает'),
    answerPlace: (d) => sheetAnswerPlace(d.id, d.cat),
    submitAnswerPlace: () => SH.submit(),
    recNode: (d) => sheetNodeRec(d.id),
    submitNodeRec: () => SH.submit(),
    addFact: (d) => sheetFact(d.id),
    submitFact: () => SH.submit(),
    delFact: (d) => mutate(null, '/nodes/fact/delete', { id: d.id }, 'Убрали'),
    shareNode: (d) => { const n = nodeById(d.id); shareCard('place', d.id, () => tgShareLink(`https://t.me/${S.bot || 'sarafanibot'}?startapp=${S.invite ? S.invite.code + '_' : ''}o${d.id}`,
      `${n.name} — советую, посмотри в Сарафане:`)); },
    toggleWord: (d) => {
      const cur = howList(SH.F[d.k]);
      SH.F[d.k] = (cur.includes(d.v) ? cur.filter((x) => x !== d.v) : [...cur, d.v]).join(',');
      drawSheet();
    },
    addUserFact: (d) => sheetUserFact(d.id),
    submitUserFact: () => SH.submit(),
    factYes: (d) => mutate(() => { const f = (S.userFacts || []).find((x) => x.id === d.id); if (f) f.status = 'ok'; },
      '/user/fact/decide', { id: d.id, ok: true }, 'Подтвердили'),
    factNo: (d) => mutate(() => { S.userFacts = (S.userFacts || []).filter((x) => x.id !== d.id); },
      '/user/fact/decide', { id: d.id, ok: false }, 'Убрали'),
    editShowcase: () => sheetShowcase(),
    editDir: (d) => sheetDir(d.id || ''),
    submitDir: () => SH.submit(),
    delDir: (d) => { closeSheet(); mutate(null, '/showcase/dir/delete', { id: d.id }, 'Направление убрано'); },
    submitShowcase: () => SH.submit(),
    delWork: (d) => mutate(() => {
      const box = (S.showcases || {})[S.me];
      if (box) box.works = box.works.filter((w) => w.id !== d.id);
    }, '/works/delete', { id: d.id }, 'Работа убрана'),
    openShowcase: async () => {
      if (!LIVE) { toast('В демо витрина не открывается'); return; }
      try {
        await window.API.post('/showcase/open', {});
        await refresh();
        toast('Витрина открыта');
        sheetShowcase();
      } catch (e) { toast(e.message); }
    },
    editMe: () => sheetEditMe(),
    submitEdit: () => SH.submit(),
    tryDemo: () => { location.href = location.pathname + '?demo=1'; },
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
        .then(() => { if (!applyLanding()) go('#/'); });
    },
  };

  // Действия, после которых человек остаётся на месте: кнопка сама отвечает галочкой,
  // чтобы нажатие не проваливалось в пустоту
  const ANSWERS_BACK = { skipReq: 'Скрыт', thank: 'Спасибо!', introWorked: 'Записали', introFailed: 'Поняли' };

  // Короткая отдача в телефоне: нажатие ощущается, а не только видится
  const buzz = (kind) => {
    try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(kind || 'light'); } catch (e) { /* не везде есть */ }
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('#nav a') || e.target.closest('.chip')) buzz('light');
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    const word = ANSWERS_BACK[el.dataset.act];
    if (word && el.classList.contains('btn') && !calmMotion()) {
      el.classList.add('done');
      el.innerHTML = `${ic('check')}${word}`;
      setTimeout(() => fn(el.dataset, el), 420);
      return;
    }
    fn(el.dataset, el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SH) ACT.closeSheet();
    if (e.key === 'Enter' && e.target.matches('[role=link]')) e.target.click();
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-catq]')) return;
    const t = e.target, v = t.value;
    if (v && v[0] !== v[0].toUpperCase()) { const pos = t.selectionStart; t.value = capFirst(v); t.setSelectionRange(pos, pos); }
    catSuggest(t);
  });
  document.addEventListener('focusin', (e) => { if (e.target.matches('[data-catq]')) catSuggest(e.target); });
  document.addEventListener('input', (e) => { if (e.target.matches('[data-live]') && SH && SH.onLive) SH.onLive(e.target.value); });

  // Вставили совет из переписки — раскладываем по полям: имя, телефон, сфера, текст
  let pasteTimer = null;
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-paste]') || !SH) return;
    const raw = e.target.value.trim();
    clearTimeout(pasteTimer);
    if (raw.length < 6) return;
    pasteTimer = setTimeout(async () => {
      const sheet = SH;
      let r = null;
      try { r = LIVE ? await window.API.post('/parse', { text: raw }) : null; } catch (err) { r = null; }
      if (!r) {   // без сервера — хотя бы телефон и ник
        const ph = raw.match(/\+?\d[\d\s\-()]{7,}\d/); const nk = raw.match(/@([A-Za-z0-9_]{5,32})/);
        r = { name: '', phone: ph ? ph[0] : '', username: nk ? nk[1] : '', cat: '' };
      }
      if (sheet !== SH) return;
      const f = SH.F;
      if (r.name && !f.name) f.name = r.name;
      if (!f.phone) f.phone = r.phone || (r.username ? '@' + r.username : '');
      if (r.cat && (S.cats || []).some((c) => c.id === r.cat)) f.cat = r.cat;
      if (!f.text) f.text = raw;
      if (!f.rel) f.rel = 'heard';
      drawSheet();
      toast(r.name || r.phone ? 'Разобрали — проверьте поля' : 'Имя не нашли — впишите сами');
    }, 500);
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
  window.addEventListener('hashchange', () => { closeAllSheets(); render(); });

  if (LIVE) {
    $('#app').innerHTML = `<div class="fade-in" style="padding:24px 20px">
      <div class="row" style="gap:12px"><div class="skeleton" style="width:44px;height:44px;border-radius:50%"></div>
        <div class="grow"><div class="skeleton" style="height:12px;width:40%"></div>
          <div class="skeleton" style="height:16px;width:66%;margin-top:8px"></div></div></div>
      <div class="skeleton" style="height:300px;border-radius:50%;margin:26px auto 0;width:300px;max-width:82vw"></div>
      <div class="skeleton" style="height:52px;margin-top:26px"></div>
      <div class="skeleton" style="height:150px;margin-top:16px"></div>
      <p class="small muted" style="text-align:center;margin-top:18px">Открываем вашу сеть…</p></div>`;
    refresh().then(() => {
      applyLanding();
      // В Telegram сразу оставляем ключ для браузера: потом можно работать и без Telegram
      if (window.API.inTelegram && !window.API.hasSession()) window.API.keepMeIn().catch(() => {});
      watchLive();
    }).catch((e) => {
      // Демо — только когда сервер правда не ответил. Если споткнулись о сами данные,
      // честно пишем об этом, а не подсовываем выдуманных людей вместо ваших
      const offline = !e.status && /fetch|network|load failed|сервер/i.test(String(e && e.message));
      if (!e.status && !offline) {
        console.error(e);
        $('#app').innerHTML = `<div class="empty" style="padding-top:22vh"><h2 class="h2">Не получилось открыть вашу сеть</h2>
          <p>Что-то пошло не так на нашей стороне. Попробуйте ещё раз через минуту.</p>
          <div class="btn-row" style="max-width:320px;margin:0 auto"><button class="btn primary" onclick="location.reload()">Ещё раз</button></div></div>`;
        return;
      }
      if (!e.status) {  // сервера нет рядом — показываем демо, чтобы ссылка не была мёртвой
        S = load(); G = window.Graph(S); S.onboarded = true; render();
        toast('Сервер недоступен — показываю демо на выдуманных людях');
        return;
      }
      if (e.status === 401 && !window.API.inTelegram) { webEntrance(); return; }
      $('#app').innerHTML = `<div class="empty" style="padding-top:22vh"><h2 class="h2">${e.status === 403 ? 'Сюда только по приглашению' : 'Не получилось открыть сеть'}</h2>`
        + `<p>${e.status === 403
      ? 'Сарафан открывается ссылкой от того, кто уже внутри. Пока её нет — посмотрите на выдуманной сети, как всё устроено.'
      : esc(e.message)}</p>`
        + `<div class="btn-row" style="max-width:320px;margin:0 auto">
             <button class="btn ghost" onclick="location.reload()">Ещё раз</button>
             <button class="btn primary" data-act="tryDemo">${ic('net')}Посмотреть демо</button></div></div>`;
    });
  } else if (!window.API.inTelegram && !qs.has('demo') && !qs.has('dev')) {
    webEntrance();   // открыли в обычном браузере — предлагаем войти
  } else {
    render();
  }
})();
