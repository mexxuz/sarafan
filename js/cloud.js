// Облако сети: живой граф, который дышит.
//
// Узлы — вы, знакомые, их знакомые, места и фирмы. Линии — то, что их держит:
// серая значит «знакомы», синяя — «рекомендует». Всё считается на лету, поэтому
// сеть выглядит живой, а не нарисованной: узлы отталкиваются, связи притягивают.
window.Cloud = function (canvas, opts) {
  const ctx = canvas.getContext('2d');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  let nodes = [], edges = [], byId = {};
  let raf = null, held = null, hover = null, moved = 0;
  let pointer = { x: 0, y: 0, down: false, id: null };
  // Полотно бесконечное: у графа нет стен, зато есть камера — её можно двигать и приближать
  const cam = { x: 0, y: 0, scale: 1, vx: 0, vy: 0 };
  const touches = new Map();
  let pinch = 0;
  const imgs = {};

  const rnd = (n) => (Math.random() - 0.5) * n;

  function size() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (canvas.width === w && canvas.height === h) return false;
    W = box.width; H = box.height;
    canvas.width = w;
    canvas.height = h;
    return true;
  }

  // Полотно должно знать свою настоящую ширину. Если её изменили — появилась полоса
  // прокрутки, повернули телефон, раздвинули окно, — картинку растягивает, и граф
  // выглядит сплющенным. Поэтому следим за размером и пересчитываем сразу.
  let watcher = null;
  if (window.ResizeObserver) {
    watcher = new ResizeObserver(() => { if (size() && calm) draw(); });
    watcher.observe(canvas);
  }
  window.addEventListener('resize', () => { if (size() && calm) draw(); });

  // ——— данные ———
  function setData(data) {
    const keep = {};
    nodes.forEach((n) => { keep[n.id] = n; });
    nodes = data.nodes.map((n, i) => {
      const was = keep[n.id];
      const a = Math.random() * Math.PI * 2;
      // стартовый радиус считаем так же, как рабочий, — облако сразу похоже на себя
      const cy0 = H * (opts.centerY || 0.5);
      const k0 = Math.max(0.62, Math.min(2.2, (Math.min(cy0, H - cy0) - 26) / 186));
      const wide0 = Math.max(0.8, Math.min(1.7, W / H));
      const r = n.self ? 0 : (70 + n.ring * 58) * k0 + rnd(16);
      return Object.assign({
        vx: 0, vy: 0,
        // появление: узел всплывает, ближние раньше дальних
        born: was ? 1 : 0, delay: was ? 0 : (n.self ? 0 : n.star ? 8 + Math.random() * 70 : 6 + Math.min(i, 60) * 1.6),
        glow: 0,
        // своя фаза качания: узлы дышат вразнобой, а не строем
        ph: was ? was.ph : Math.random() * Math.PI * 2,
        sp: was ? was.sp : 0.6 + Math.random() * 0.8,
        x: was ? was.x : W / 2 + Math.cos(a) * r * wide0,
        y: was ? was.y : cy0 + Math.sin(a) * r,
      }, n);
    });
    byId = {};
    nodes.forEach((n) => { byId[n.id] = n; });
    edges = data.edges.filter((e) => byId[e.a] && byId[e.b])
      .map((e) => Object.assign({ seed: Math.random() * 1.6 }, e));   // огоньки бегут вразнобой
    nodes.forEach((n) => { if (n.photo && !imgs[n.photo]) load(n.photo); });
    nodes.forEach((n) => { if (n.video && !(n.video in imgs)) loadVideo(n.video); });
  }

  // Живая аватарка: ролик без звука крутится прямо в кружке, облако и так перерисовывается каждый кадр
  function loadVideo(src) {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.oncanplay = () => { imgs[src] = v; v.play().catch(() => {}); };
    v.onerror = () => { imgs[src] = null; };
    imgs[src] = undefined;
    v.src = src;
  }

  function load(src) {
    const im = new Image();
    im.onload = () => { imgs[src] = im; };
    im.onerror = () => { imgs[src] = null; };
    imgs[src] = undefined;
    im.src = src;
  }

  // ——— физика ———
  let now = 0;                                   // время жизни облака, миллисекунды

  function step(heat) {
    const cx = W / 2, cy = H * (opts.centerY || 0.5);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.self) { a.x += (cx - a.x) * 0.2; a.y += (cy - a.y) * 0.2; a.vx = a.vy = 0; continue; }
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = rnd(1); dy = rnd(1); d2 = 1; }
        const min = (a.r + b.r + (a.star && b.star ? 9 : a.star || b.star ? 16 : 26)) ** 2;
        if (d2 > 56000) continue;                       // далёкие друг друга не трогают
        const f = (min / d2) * 1.35;
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        // звезда и портрет: расступается звезда — ваше созвездие стоит на месте
        if (!b.self && !(a.star && !b.star)) { b.vx += ux * f; b.vy += uy * f; }
        if (!a.self && !(b.star && !a.star)) { a.vx -= ux * f; a.vy -= uy * f; }
      }
    }
    edges.forEach((e) => {
      const a = byId[e.a], b = byId[e.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const want = e.len || 92;
      // тонкая нить пересечения почти не тянет: раскладку держат основные
      const f = (d - want) * 0.008 * (e.faint ? 0.3 : e.kind === 'vouch' ? 1.25 : 1) * (e.strong || 1);   // strong — нить, которая держит своё расстояние твёрдо
      const ux = dx / d, uy = dy / d;
      // нить со звездой тянет только звезду: ваше созвездие звёзды не растаскивают
      if (!a.self && !(e.faint && !a.star)) { a.vx += ux * f; a.vy += uy * f; }
      if (!b.self && !(e.faint && !b.star)) { b.vx -= ux * f; b.vy -= uy * f; }
    });
    nodes.forEach((n) => {
      if (n.self || n === held) return;
      // своё кольцо: ближний круг держится ближе к центру, дальний — дальше
      const dx = n.x - cx, dy = n.y - cy;
      // по высоте места меньше, поэтому масштаб берём от неё, а вширь растягиваем
      const wide = Math.max(0.8, Math.min(1.7, W / H));
      const room = Math.min(cy, H - cy) - 26;
      const k = Math.max(0.62, Math.min(2.2, room / 186));
      const d = Math.max(1, Math.hypot(dx / wide, dy));
      if (n.star) {
        n.vx += (cx - n.x) * 0.0012;
        n.vy += (cy - n.y) * 0.0012;
      } else {
        // на звёздном небе ваши знакомые держатся плотной группой вокруг вас — ваше созвездие в центре
        const orb = n.orbit ?? n.ring;   // orbit — своё расстояние от центра, если кольцо должно стоять дальше обычного
        const want = big() ? (58 + orb * 42) * k : (70 + orb * 58) * k;
        const pull = (want - d) * (big() ? 0.01 : 0.006);
        n.vx += (dx / d) * pull / wide;
        n.vy += (dy / d) * pull;
      }
      if (heat) { n.vx += rnd(heat); n.vy += rnd(heat); }
      // медленное плавание: каждый узел ходит по своей маленькой петле. В большой сети — нет:
      // сотни плавающих точек толкают друг друга без конца, и облако не успокаивается
      if (!calm && !big()) {
        const t = animT * 0.0004 * n.sp + n.ph;
        n.vx += Math.cos(t) * 0.035;
        n.vy += Math.sin(t * 1.17) * 0.035;
      }
      const damp = big() ? 0.8 : 0.86;
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx; n.y += n.vy;
      // Под шапкой с логотипом и портретом узел не достать — мягко выталкиваем оттуда
      const screenY = n.y * cam.scale + cam.y;
      const safeTop = (opts.safeTop || 0);
      if (safeTop && screenY < safeTop) {
        n.vy += (safeTop - screenY) * 0.012 / Math.max(0.5, cam.scale);
      }

      // Стен нет. Если узел ушёл совсем далеко, его мягко тянет обратно —
      // пространство бесконечное, но граф не разлетается в пустоту.
      const far = Math.hypot(n.x - cx, n.y - cy);
      const edge = Math.max(W, H) * 0.9;
      if (far > edge) {
        const back = (far - edge) * 0.004;
        n.vx -= ((n.x - cx) / far) * back;
        n.vy -= ((n.y - cy) / far) * back;
      }
    });
  }

  // ——— рисование ———
  //
  // Иерархия читается без подписей:
  //   круг      — человек, и чем он ближе, тем ярче кольцо и крупнее сам узел
  //   квадрат   — место (точка внутри, как метка на карте)
  //   ромб      — фирма
  //   зелёная искра у кольца — человека рекомендуют трое и больше
  const COLOR = {
    know: 'rgba(126,146,178,.16)',
    vouch: 'rgba(47,123,255,.24)',
    knowHot: 'rgba(96,116,150,.5)',
    vouchHot: 'rgba(47,123,255,.8)',
    both: 'rgba(47,123,255,.46)',
    work: 'rgba(120,96,255,.5)',
    wait: 'rgba(122,138,163,.35)',                // ждёт в круге: ещё не пришёл в Сарафан
    waitHot: 'rgba(122,138,163,.7)',                  // человек — его фирма: фиолетовый пунктир
    workHot: 'rgba(120,96,255,.9)',                // взаимно: двое рекомендуют друг друга
    me: '#2f7bff',
    ring1: 'rgba(47,123,255,.95)',
    ring2: 'rgba(47,123,255,.42)',
    far: 'rgba(122,138,163,.4)',
    place: { fill: '#e2efff', line: 'rgba(47,123,255,.75)', dot: 'rgba(47,123,255,.8)' },
    company: { fill: '#e9e6ff', line: 'rgba(120,96,255,.75)', dot: 'rgba(120,96,255,.85)' },
  };

  const ringColor = (n) => (n.self ? COLOR.me : n.ring === 1 ? COLOR.ring1 : n.ring === 2 ? COLOR.ring2 : COLOR.far);

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, dpr * cam.x, dpr * cam.y);

    // Круги никуда не делись — они просто перестали быть расстановкой.
    // Две еле видные окружности напоминают: ближе центра свои, дальше — через них.
    const cx = W / 2, cy = H * (opts.centerY || 0.5);
    ctx.strokeStyle = 'rgba(47,123,255,.045)';
    ctx.lineWidth = 1;
    if (!big()) [72 + 62, 72 + 124].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Чем дальше человек, тем он бледнее: свои в полную силу, знакомые знакомых
    // вполсилы, дальние — едва намечены.
    const depth = (n) => (n.self || n.fc || n.ring <= 1 ? 1 : n.ring === 2 ? 0.6 : 0.36);   // создатель — всегда в полную силу

    const lit = hover || held;
    const near = new Set();
    if (lit) { near.add(lit.id); edges.forEach((e) => { if (e.a === lit.id) near.add(e.b); if (e.b === lit.id) near.add(e.a); }); }

    ctx.lineCap = 'round';
    edges.forEach((e) => {
      const a = byId[e.a], b = byId[e.b];
      const grow = Math.min(a.born, b.born);
      if (grow <= 0.02) return;
      const hot = lit && (e.a === lit.id || e.b === lit.id);
      ctx.strokeStyle = hot ? COLOR[e.kind + 'Hot'] : (e.both ? COLOR.both
        : big() && !e.faint && e.kind === 'know' ? 'rgba(70,110,190,.42)' : COLOR[e.kind]);   // линии вашего созвездия видны отчётливо
      ctx.lineWidth = hot ? 1.4 : e.faint ? 0.5 : big() ? (e.kind === 'vouch' ? 1.6 : 1.3) : (e.both ? 1.7 : e.kind === 'vouch' ? 1.1 : 0.9);
      ctx.globalAlpha = (lit && !hot ? 0.12 : e.faint && !hot ? 0.3 : 1) * grow * Math.min(depth(a), depth(b));
      // Маленькое облако — лёгкие дуги: пучок линий перестаёт выглядеть спицами колеса.
      // Звёздное небо — прямые, как в рисунках созвездий, и чуть не доходят до звезды
      const sky = big();
      let ax = a.x, ay = a.y, bx = b.x, by = b.y;
      if (sky) {
        const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
        const ga = Math.min(L * 0.3, a.r * (a.star ? 1.6 : 1) + 3), gb = Math.min(L * 0.3, b.r * (b.star ? 1.6 : 1) + 3);
        ax += ux * ga; ay += uy * ga; bx -= ux * gb; by -= uy * gb;
      }
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay;
      const bend = sky ? 0 : 0.08;
      const kx = mx - dy * bend, ky = my + dx * bend;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(kx, ky, bx, by);
      ctx.setLineDash(e.kind === 'work' ? [3, 3] : e.kind === 'wait' ? [2, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (e.kind === 'work' || e.kind === 'wait' || (e.faint && !hot)) return;   // по нити работы огоньки не бегут — это не рекомендация

      // По нити плывёт мягкий проблеск — участок линии подсвечивается градиентом
      // и гаснет к краям. Движение заметно боковым зрением, но не отвлекает.
      if (calm || grow < 0.99) return;
      const speed = e.kind === 'vouch' ? 0.000075 : 0.00005;
      const cycle = ((animT * speed + (e.seed || 0)) % 2.4);   // долгая пауза между проблесками
      if (cycle > 1) return;
      const bez = (t) => {
        const u = 1 - t, q = u * u, w = 2 * u * t, z = t * t;
        return [q * ax + w * kx + z * bx, q * ay + w * ky + z * by];
      };
      const half = 0.16;
      const tone = e.kind === 'vouch' ? '47,123,255' : '126,146,178';
      const power = (lit && !hot ? 0.12 : e.both ? 0.5 : 0.42) * Math.sin(cycle * Math.PI);
      // на взаимной нити проблеск идёт сразу в обе стороны — согласие видно без слов
      const runs = e.both ? [cycle, 1 - cycle] : [cycle];
      ctx.globalAlpha = grow * Math.min(depth(a), depth(b));
      ctx.lineWidth = (e.both ? 2 : e.kind === 'vouch' ? 1.8 : 1.4);
      runs.forEach((c) => {
        const t0 = Math.max(0, c - half), t1 = Math.min(1, c + half);
        if (t1 - t0 < 0.02) return;
        const [x0, y0] = bez(t0), [x1, y1] = bez(t1);
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(${tone},0)`);
        g.addColorStop(0.5, `rgba(${tone},${power.toFixed(3)})`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) {
          const [px, py] = bez(t0 + (t1 - t0) * (k / 8));
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;

    nodes.forEach((n) => {
      if (n.born <= 0.02) return;
      const dim = lit && !near.has(n.id);
      const ease = n.born * n.born * (3 - 2 * n.born);      // мягкий вход
      const R = n.r * (0.7 + 0.3 * ease) * (1 + n.glow * 0.12);
      ctx.globalAlpha = (dim ? 0.24 : 1) * ease * (lit && near.has(n.id) ? 1 : depth(n));

      // ореол: свои светятся чуть заметнее — иерархия без лишних обводок
      // создатель за вашими кругами — без ореола: маячок, а не главный герой (правка 25.09)
      if (!dim && (n.self || (n.founder && n.ring <= 1) || n.ring <= 1 || n.glow > 0.02)) {
        const halo = ctx.createRadialGradient(n.x, n.y, R * 0.6, n.x, n.y, R * (2.4 + n.glow));
        const power = (n.self ? 0.2 : n.ring === 1 ? 0.12 : 0.06) + n.glow * 0.18;
        const tone = n.founder ? '232,165,40' : '47,123,255';   // основатель светится тёплым золотом
        halo.addColorStop(0, `rgba(${tone},${n.founder ? power + 0.08 : power})`);
        halo.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(n.x, n.y, R * (2.4 + n.glow), 0, Math.PI * 2);
        ctx.fill();
      }

      const saved = n.r;
      n.r = R;
      if (n.founder && !n.self && n.ring > 1) drawFounder(n);   // маячок — для тех, кто с создателем не знаком
      else if (n.star) drawStar(n, dim);
      else if (n.kind === 'node') drawPlace(n);
      else drawPerson(n);
      n.r = saved;

      const showLabel = n.label && (n.self || n.ring <= 1 || n.fc || n.founder || n === lit || near.has(n.id));
      if (showLabel) {
        ctx.globalAlpha = (dim ? 0.25 : n.ring <= 1 ? 0.85 : 0.55) * ease * (lit && near.has(n.id) ? 1 : depth(n));
        ctx.fillStyle = '#6b7488';
        ctx.font = `${n.self || n.ring <= 1 ? 600 : 500} 9.5px Manrope, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + R + 12);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawPerson(n) {
    const im = (n.video && imgs[n.video]) || (n.photo ? imgs[n.photo] : null);
    if (n.ghost) ctx.globalAlpha *= 0.5;   // ждёт в круге — бледнее своих
    const far = !n.self && n.ring >= 3;

    // у незнакомых кольцо пунктирное: видно, что их пока никто не рекомендует
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    if (im) {
      ctx.clip();
      const s = n.r * 2;
      ctx.drawImage(im, n.x - n.r, n.y - n.r, s, s);
      ctx.restore();
      if (far) { ctx.globalAlpha *= 0.75; }
    } else {
      ctx.fillStyle = n.self ? COLOR.me : n.ring === 1 ? '#dbe8ff' : n.ring === 2 ? '#edf3fb' : '#f1f3f7';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = n.self ? '#fff' : far ? '#8d97a8' : '#59637a';
      ctx.font = `700 ${Math.round(n.r * 0.8)}px Manrope, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.initials || '', n.x, n.y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }

    // кольцо тонкое: иерархию держат размер и свечение, а не толщина линий
    if (!far || n === hover) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor(n);
      ctx.lineWidth = n.self ? 2.4 : n.ring === 1 ? 1.8 : 1.1;
      ctx.stroke();
    }

    // создатель сети — «нулевой пациент»: второе, золотое кольцо
    if (n.founder) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 3.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232,165,40,.95)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // трое независимых — крошечная зелёная искра, заметная только вблизи
    if (n.trusted && n.r > 9) {
      ctx.beginPath();
      ctx.arc(n.x + n.r * 0.74, n.y - n.r * 0.74, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#16a06a';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  // Создатель для незнакомых — золотая звезда-маячок (знакомые видят его обычным портретом). Навели или зажали — звезда поворачивается,
  // растворяется и раскрывается в портрет; отпустили — сворачивается обратно
  function drawFounder(n) {
    const m = calm ? ((hover === n || held === n) ? 1 : 0) : Math.min(1, Math.max(0, n.glow));
    const a = ctx.globalAlpha;
    if (m > 0.02) {
      const r0 = n.r;
      n.r = r0 * (0.55 + 0.45 * m);
      ctx.globalAlpha = a * m;
      drawPerson(n);
      n.r = r0;
    }
    if (m < 0.98) {
      const R = n.r * (0.78 + 0.3 * m), r = R * 0.46, rot = -Math.PI / 2 + m * 1.2;   // звёздочка — скромная
      ctx.globalAlpha = a * (1 - m) * 0.8;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? r : R, ang = rot + (i * Math.PI) / 5;
        if (i) ctx.lineTo(n.x + rad * Math.cos(ang), n.y + rad * Math.sin(ang));
        else ctx.moveTo(n.x + rad * Math.cos(ang), n.y + rad * Math.sin(ang));
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(n.x, n.y - R, n.x, n.y + R);
      g.addColorStop(0, '#ffd66b');
      g.addColorStop(1, '#e39a1c');
      ctx.fillStyle = g;
      ctx.lineJoin = 'round';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.globalAlpha = a;
  }

  // Звезда: ядро и мягкое свечение, мерцает в своём ритме. Голубые — люди (кого рекомендуют — ярче),
  // фиолетовые — фирмы, синие — места
  function drawStar(n, dim) {
    const tw = calm ? 1 : 0.62 + 0.38 * Math.sin(animT * 0.0018 * n.sp + n.ph);
    const tone = n.kind === 'node' ? (n.company ? '120,96,255' : '47,123,255') : n.bright ? '47,123,255' : '120,140,178';
    const glowR = n.r * (3.2 + n.glow * 2);
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
    g.addColorStop(0, `rgba(${tone},${(dim ? 0.08 : 0.28) * tw + n.glow * 0.3})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r * (0.55 + 0.15 * tw), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tone},${0.55 + 0.45 * tw})`;
    ctx.fill();
  }

  // Места и фирмы узнаются по значку внутри кружка, а не по форме маркера:
  // капля — место, дом — фирма. Так же, как в карточках по всему приложению.
  const ICON = {
    place: new Path2D('M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z'),
    placeDot: new Path2D('M12 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z'),
    company: new Path2D('M6 21V4h8.5v17M14.5 21V9.5H19V21M9 7.5h2.5M9 11h2.5M9 14.5h2.5'),
  };

  function drawPlace(n) {
    const c = n.company ? COLOR.company : COLOR.place;
    const r = n.r * 1.18;

    const logoFirst = n.photo && imgs[n.photo];
    if (!logoFirst) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // есть логотип — он в скруглённом квадрате, как значок приложения: люди — кружки, места и фирмы — квадраты,
    // рамка цвета места или фирмы (правка 25.09: «с логотипом фирма не отличается от контактов»)
    const logo = n.photo ? imgs[n.photo] : null;
    if (logo) {
      const h = r * 1.2, rr = h * 0.3;
      const box = () => { ctx.beginPath(); ctx.roundRect(n.x - h, n.y - h, h * 2, h * 2, rr); };
      ctx.save();
      box(); ctx.fillStyle = '#fff'; ctx.fill();
      box(); ctx.clip();
      ctx.drawImage(logo, n.x - h, n.y - h, h * 2, h * 2);
      ctx.restore();
      box();
      ctx.strokeStyle = c.dot;
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    // значок рисуем в своей системе координат: 24×24 масштабируем под узел
    const k = (r * 1.32) / 24;
    ctx.save();
    ctx.translate(n.x - 12 * k, n.y - 12 * k);
    ctx.scale(k, k);
    ctx.lineWidth = 2 / k * 0.9;
    ctx.strokeStyle = c.dot;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (n.company) {
      ctx.stroke(ICON.company);
    } else {
      ctx.stroke(ICON.place);
      ctx.fillStyle = c.dot;
      ctx.fill(ICON.placeDot);
    }
    ctx.restore();
  }

  // ——— жизнь ———
  let frames = 0;
  // Большая сеть раскладывается, а потом плывёт: каждая точка тихо покачивается вокруг своего места —
  // без толкотни, поэтому хаоса нет. Навели на точку или коснулись — всё замирает, и движение, и мерцание
  const big = () => !!opts.sky || nodes.length > 60;
  let settleUntil = 260;
  let animT = 0, lastNow = 0, wasPhysics = true;
  function tick() {
    frames++;
    now = performance.now();
    if (frames % 30 === 0) size();          // страховка: размер мог поменяться незаметно
    // симуляция остывает, как в настоящих графах: сначала расходятся, потом замирают
    // и лишь едва дрейфуют — движение есть, ряби нет
    const dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;
    const paused = !!(hover || held);
    if (!paused) animT += dt;
    const heat = calm ? 0 : big() ? 0.3 * Math.pow(0.975, frames) : Math.max(0.012, 0.3 * Math.pow(0.975, frames));
    const physics = !big() || frames < settleUntil || !!held;
    if (physics && !wasPhysics) nodes.forEach((n) => { n.ax = undefined; });   // снова тянут — плавание с места
    wasPhysics = physics;
    if (physics && !(hover && !held)) step(heat);
    else if (!physics && !calm) {
      nodes.forEach((n) => {
        if (n.self) return;
        const k = 0.00045 * n.sp, amp = n.star ? 7 : 3;
        if (n.ax === undefined) { n.ax = n.x; n.ay = n.y; n.t0 = animT; }
        n.x = n.ax + amp * (Math.cos(animT * k + n.ph) - Math.cos(n.t0 * k + n.ph));
        n.y = n.ay + amp * (Math.sin(animT * k * 1.17 + n.ph) - Math.sin(n.t0 * k * 1.17 + n.ph));
      });
    }

    nodes.forEach((n, i) => {
      if (n.delay > 0) { n.delay -= 1; return; }
      if (n.born < 1) n.born = Math.min(1, n.born + 0.055);
      const want = (hover === n || held === n) ? 1 : 0;
      n.glow += (want - n.glow) * 0.18;            // подсветка приходит плавно
    });

    // полотно по инерции доезжает после того, как его отпустили
    if (!pointer.down) {
      cam.x += cam.vx; cam.y += cam.vy;
      cam.vx *= 0.92; cam.vy *= 0.92;
      if (Math.abs(cam.vx) < 0.02) cam.vx = 0;
      if (Math.abs(cam.vy) < 0.02) cam.vy = 0;
    }
    // уехать можно далеко, но не насовсем: граф мягко возвращается в поле зрения
    const limX = W * 0.65, limY = H * 0.65;
    if (cam.x > limX) { cam.x += (limX - cam.x) * 0.12; cam.vx = 0; }
    if (cam.x < -limX) { cam.x += (-limX - cam.x) * 0.12; cam.vx = 0; }
    if (cam.y > limY) { cam.y += (limY - cam.y) * 0.12; cam.vy = 0; }
    if (cam.y < -limY) { cam.y += (-limY - cam.y) * 0.12; cam.vy = 0; }

    draw();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    frames = 0;
    settleUntil = 260;
    if (calm) { nodes.forEach((n) => { n.born = 1; n.delay = 0; }); for (let i = 0; i < 240; i++) step(0); draw(); return; }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (watcher) { watcher.disconnect(); watcher = null; }
  }

  // ——— касания ———
  const at = (e) => {
    const b = canvas.getBoundingClientRect();
    const sx = e.clientX - b.left, sy = e.clientY - b.top;
    return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale, sx, sy };
  };
  const find = (p) => {
    let best = null, bd = Infinity;
    nodes.forEach((n) => {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d <= Math.max(n.r, 6) + 8 / cam.scale && d < bd) { best = n; bd = d; }
    });
    return best;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const p = at(e);
    touches.set(e.pointerId, { sx: p.sx, sy: p.sy });
    if (touches.size === 2) {                        // два пальца — приближение
      const [a, b] = [...touches.values()];
      pinch = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      held = null;
      return;
    }
    held = find(p);
    moved = 0;
    cam.vx = cam.vy = 0;
    pointer = { x: p.x, y: p.y, sx: p.sx, sy: p.sy, down: true, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* и без захвата работает */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = at(e);
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { sx: p.sx, sy: p.sy });

    if (touches.size === 2 && pinch) {               // приближение двумя пальцами
      const [a, b] = [...touches.values()];
      const now = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
      zoomAt(mid, now / pinch);
      pinch = now;
      if (calm) draw();
      return;
    }

    if (pointer.down && held) {                      // тянем узел
      moved += Math.hypot(p.x - pointer.x, p.y - pointer.y);
      held.x = p.x; held.y = p.y; held.vx = held.vy = 0;
      pointer.x = p.x; pointer.y = p.y;
      if (calm) draw();
      return;
    }
    if (pointer.down) {                              // тянем всё полотно
      const dx = p.sx - pointer.sx, dy = p.sy - pointer.sy;
      moved += Math.hypot(dx, dy);
      cam.x += dx; cam.y += dy;
      cam.vx = dx; cam.vy = dy;
      pointer.sx = p.sx; pointer.sy = p.sy;
      canvas.style.cursor = 'grabbing';
      if (calm) draw();
      return;
    }
    const was = hover;
    hover = find(p);
    canvas.style.cursor = hover ? 'pointer' : 'grab';
    if (calm && was !== hover) draw();
  });
  const release = (e) => {
    if (e && e.pointerId != null) touches.delete(e.pointerId);
    if (touches.size < 2) pinch = 0;
    if (held && moved < 6 && opts.onPick) opts.onPick(held);
    if (held) settleUntil = frames + 90;   // отпустили точку — соседи ещё немного укладываются и снова замирают
    held = null; pointer.down = false;
    canvas.style.cursor = 'grab';
    if (e && canvas.hasPointerCapture && e.pointerId != null) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* уже отпущено */ }
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { hover = null; });

  function zoomAt(point, factor) {
    const next = Math.min(2.4, Math.max(0.45, cam.scale * factor));
    const k = next / cam.scale;
    cam.x = point.x - (point.x - cam.x) * k;
    cam.y = point.y - (point.y - cam.y) * k;
    cam.scale = next;
  }

  canvas.addEventListener('wheel', (e) => {
    // На главной облако — часть страницы: колёсико листает страницу, приближают с Ctrl или щипком.
    // На своём экране облако во весь экран — там колёсико приближает сразу.
    if (!opts.wheelZoom && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const b = canvas.getBoundingClientRect();
    zoomAt({ x: e.clientX - b.left, y: e.clientY - b.top }, e.deltaY < 0 ? 1.08 : 0.93);
    if (calm) draw();
  }, { passive: false });

  canvas.addEventListener('dblclick', () => {
    cam.x = 0; cam.y = 0; cam.scale = 1; cam.vx = cam.vy = 0;
    if (calm) draw();
  });

  canvas.style.cursor = 'grab';
  size();
  return {
    home: () => { cam.x = 0; cam.y = 0; cam.scale = 1; cam.vx = cam.vy = 0; },
    setData: (d) => { setData(d); },
    start,
    stop,
    resize: () => { size(); },
  };
};
