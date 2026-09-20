// Связь приложения с сервером. Кто вы — подтверждает Telegram, паролей нет.
window.API = (function () {
  const qs = new URLSearchParams(location.search);
  const tg = window.Telegram && window.Telegram.WebApp;

  // Если приложение отдаёт сам сервер (свой компьютер) — работаем с ним напрямую.
  // Если открыто с постоянного адреса — берём адрес сервера из настройки.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = (local ? location.origin : (window.SARAFAN_SERVER || location.origin)).replace(/\/$/, '');

  // в Telegram — подпись от Telegram; при проверке на компьютере — режим разработки
  const who = () => {
    if (tg && tg.initData) return tg.initData;
    const dev = qs.get('dev');
    return dev ? encodeURI('dev:' + dev) : '';
  };

  const call = async (path, body) => {
    const r = await fetch(base + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Init-Data': who() },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch (e) { /* пустой ответ */ }
    if (!r.ok) {
      const err = new Error((data && (data.detail || data.message)) || 'Не получилось, попробуйте ещё раз');
      err.status = r.status;
      throw err;
    }
    return data;
  };

  return {
    live: !!(tg && tg.initData) || qs.has('dev'),
    bootstrap: () => call('/bootstrap'),
    post: (path, body) => call(path, body || {}),
  };
})();
