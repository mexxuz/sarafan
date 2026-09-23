// Связь приложения с сервером.
//
// Войти можно двумя путями: из Telegram (подпись даёт сам Telegram) или в браузере —
// тогда у человека есть ключ входа, который лежит в этом браузере и живёт полгода.
// Второй путь важен: не всем удобно в мини-приложении, а где-то Telegram недоступен.
window.API = (function () {
  const qs = new URLSearchParams(location.search);
  const tg = window.Telegram && window.Telegram.WebApp;
  const KEY = 'sarafan.session';

  // Если приложение отдаёт сам сервер (свой компьютер) — работаем с ним напрямую.
  // Если открыто с постоянного адреса — берём адрес сервера из настройки.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = (local ? location.origin : (window.SARAFAN_SERVER || location.origin)).replace(/\/$/, '');

  let session = '';
  try { session = localStorage.getItem(KEY) || ''; } catch (e) { /* приватный режим */ }

  const saveSession = (t) => {
    session = t || '';
    try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) { /* */ }
  };

  // в Telegram — подпись от Telegram; при проверке на компьютере — режим разработки
  const who = () => {
    if (tg && tg.initData) return tg.initData;
    const dev = qs.get('dev');
    return dev ? encodeURI('dev:' + dev) : '';
  };

  const call = async (path, body) => {
    const r = await fetch(base + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Init-Data': who(),
        'X-Session': session,
        'X-Invite-Code': qs.get('code') || qs.get('tgWebAppStartParam') || '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch (e) { /* пустой ответ */ }
    if (!r.ok) {
      const err = new Error((data && (data.detail || data.message)) || 'Не получилось, попробуйте ещё раз');
      err.status = r.status;
      if (r.status === 401 && session) saveSession('');   // ключ устарел — забываем
      throw err;
    }
    return data;
  };

  return {
    // живая работа: Telegram, ключ браузера или режим проверки
    live: !!(tg && tg.initData) || !!session || qs.has('dev'),
    inTelegram: !!(tg && tg.initData),
    hasSession: () => !!session,
    bootstrap: () => call('/bootstrap'),
    // картинка работы уходит файлом, а не текстом
    upload: async (path, file, fields) => {
      const form = new FormData();
      if (file) form.append('file', file);   // правку можно отправить и без картинки
      Object.entries(fields || {}).forEach(([k, v]) => form.append(k, v));
      const r = await fetch(base + '/api' + path, {
        method: 'POST',
        headers: { 'X-Init-Data': who(), 'X-Session': session },
        body: form,
      });
      let data = null;
      try { data = await r.json(); } catch (e) { /* пусто */ }
      if (!r.ok) throw new Error((data && (data.detail || data.message)) || 'Картинка не загрузилась');
      return data;
    },
    pulse: () => call('/pulse'),
    get: (path) => call(path),
    post: (path, body) => call(path, body || {}),

    // ——— вход в браузере ———
    // войти по приглашению без Telegram
    joinByInvite: async (code, name) => saveSession((await call('/auth/invite', { code, name })).session),
    // перенести вход с телефона: код из приложения
    claimCode: async (code) => saveSession((await call('/auth/claim', { code })).session),
    // кнопка «Войти через Telegram» на сайте
    loginTelegram: async (data) => saveSession((await call('/auth/telegram', { data })).session),
    telegramReady: () => call('/auth/telegram/ready'),
    // получить ключ для этого браузера, когда человек уже внутри Telegram
    keepMeIn: async () => { const r = await call('/auth/session', {}); saveSession(r.session); },
    // код для переноса на компьютер
    handoff: () => call('/auth/handoff', {}),
    logout: async () => { try { await call('/auth/logout', {}); } catch (e) { /* */ } saveSession(''); },
  };
})();
