// Облако сети: живой граф, который дышит.
//
// Узлы — вы, знакомые, их знакомые, места и фирмы. Линии — то, что их держит:
// серая значит «знакомы», синяя — «ручается». Всё считается на лету, поэтому
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
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width; H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  // ——— данные ———
  function setData(data) {
    const keep = {};
    nodes.forEach((n) => { keep[n.id] = n; });
    nodes = data.nodes.map((n, i) => {
      const was = keep[n.id];
      const a = Math.random() * Math.PI * 2;
      const r = n.self ? 0 : 60 + n.ring * 40 + rnd(30);
      return Object.assign({
        vx: 0, vy: 0,
        // появление: узел всплывает, ближние раньше дальних
        born: was ? 1 : 0, delay: was ? 0 : (n.self ? 0 : 6 + i * 1.6),
        glow: 0,
        x: was ? was.x : W / 2 + Math.cos(a) * r,
        y: was ? was.y : H / 2 + Math.sin(a) * r,
      }, n);
    });
    byId = {};
    nodes.forEach((n) => { byId[n.id] = n; });
    edges = data.edges.filter((e) => byId[e.a] && byId[e.b]);
    nodes.forEach((n) => { if (n.photo && !imgs[n.photo]) load(n.photo); });
  }

  function load(src) {
    const im = new Image();
    im.onload = () => { imgs[src] = im; };
    im.onerror = () => { imgs[src] = null; };
    imgs[src] = undefined;
    im.src = src;
  }

  // ——— физика ———
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
        const min = (a.r + b.r + 26) ** 2;
        if (d2 > 56000) continue;                       // далёкие друг друга не трогают
        const f = (min / d2) * 1.35;
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        if (!b.self) { b.vx += ux * f; b.vy += uy * f; }
        if (!a.self) { a.vx -= ux * f; a.vy -= uy * f; }
      }
    }
    edges.forEach((e) => {
      const a = byId[e.a], b = byId[e.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const want = e.len || 92;
      const f = (d - want) * 0.008 * (e.kind === 'vouch' ? 1.25 : 1);
      const ux = dx / d, uy = dy / d;
      if (!a.self) { a.vx += ux * f; a.vy += uy * f; }
      if (!b.self) { b.vx -= ux * f; b.vy -= uy * f; }
    });
    nodes.forEach((n) => {
      if (n.self || n === held) return;
      // своё кольцо: ближний круг держится ближе к центру, дальний — дальше
      const dx = n.x - cx, dy = n.y - cy;
      const d = Math.max(1, Math.hypot(dx, dy));
      const k = Math.min(1.25, Math.max(0.78, Math.min(W, H) / 330));
      const want = (70 + n.ring * 58) * k;
      const pull = (want - d) * 0.006;
      n.vx += (dx / d) * pull;
      n.vy += (dy / d) * pull;
      if (heat) { n.vx += rnd(heat); n.vy += rnd(heat); }
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx; n.y += n.vy;
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
  //   зелёная искра у кольца — за человека ручаются трое и больше
  const COLOR = {
    know: 'rgba(126,146,178,.16)',
    vouch: 'rgba(47,123,255,.24)',
    knowHot: 'rgba(96,116,150,.5)',
    vouchHot: 'rgba(47,123,255,.8)',
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
    [72 + 62, 72 + 124].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    const lit = hover || held;
    const near = new Set();
    if (lit) { near.add(lit.id); edges.forEach((e) => { if (e.a === lit.id) near.add(e.b); if (e.b === lit.id) near.add(e.a); }); }

    ctx.lineCap = 'round';
    edges.forEach((e) => {
      const a = byId[e.a], b = byId[e.b];
      const grow = Math.min(a.born, b.born);
      if (grow <= 0.02) return;
      const hot = lit && (e.a === lit.id || e.b === lit.id);
      ctx.strokeStyle = hot ? COLOR[e.kind + 'Hot'] : COLOR[e.kind];
      ctx.lineWidth = hot ? 1.6 : (e.kind === 'vouch' ? 1.1 : 0.9);
      ctx.globalAlpha = (lit && !hot ? 0.28 : 1) * grow;
      // лёгкая дуга: пучок линий перестаёт выглядеть спицами колеса
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const bend = 0.08;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, b.x, b.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    nodes.forEach((n) => {
      if (n.born <= 0.02) return;
      const dim = lit && !near.has(n.id);
      const ease = n.born * n.born * (3 - 2 * n.born);      // мягкий вход
      const R = n.r * (0.7 + 0.3 * ease) * (1 + n.glow * 0.12);
      ctx.globalAlpha = (dim ? 0.24 : 1) * ease;

      // ореол: свои светятся чуть заметнее — иерархия без лишних обводок
      if (!dim && (n.self || n.ring <= 1 || n.glow > 0.02)) {
        const halo = ctx.createRadialGradient(n.x, n.y, R * 0.6, n.x, n.y, R * (2.4 + n.glow));
        const power = (n.self ? 0.2 : n.ring === 1 ? 0.12 : 0.06) + n.glow * 0.18;
        halo.addColorStop(0, `rgba(47,123,255,${power})`);
        halo.addColorStop(1, 'rgba(47,123,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(n.x, n.y, R * (2.4 + n.glow), 0, Math.PI * 2);
        ctx.fill();
      }

      const saved = n.r;
      n.r = R;
      if (n.kind === 'node') drawPlace(n);
      else drawPerson(n);
      n.r = saved;

      const showLabel = n.label && (n.self || n.ring <= 1 || n === lit || near.has(n.id));
      if (showLabel) {
        ctx.globalAlpha = (dim ? 0.25 : n.ring <= 1 ? 0.82 : 0.6) * ease;
        ctx.fillStyle = '#6b7488';
        ctx.font = `${n.self || n.ring <= 1 ? 600 : 500} 9.5px Manrope, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + R + 12);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawPerson(n) {
    const im = n.photo ? imgs[n.photo] : null;
    const far = !n.self && n.ring >= 3;

    // у незнакомых кольцо пунктирное: видно, что до них никто пока не ручается
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

  function drawPlace(n) {
    const c = n.company ? COLOR.company : COLOR.place;
    const r = n.r;
    ctx.beginPath();
    if (n.company) {
      // фирма — ромб: издалека не спутать с местом
      ctx.moveTo(n.x, n.y - r * 1.15);
      ctx.lineTo(n.x + r * 1.15, n.y);
      ctx.lineTo(n.x, n.y + r * 1.15);
      ctx.lineTo(n.x - r * 1.15, n.y);
      ctx.closePath();
    } else {
      // место — квадрат с меткой внутри
      const x = n.x - r, y = n.y - r, s = r * 2, rad = 3;
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + s, y, x + s, y + s, rad);
      ctx.arcTo(x + s, y + s, x, y + s, rad);
      ctx.arcTo(x, y + s, x, y, rad);
      ctx.arcTo(x, y, x + s, y, rad);
      ctx.closePath();
    }
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(n.x, n.y, Math.max(1.4, r * 0.26), 0, Math.PI * 2);
    ctx.fillStyle = c.dot;
    ctx.fill();
  }

  // ——— жизнь ———
  let frames = 0;
  function tick() {
    frames++;
    // симуляция остывает, как в настоящих графах: сначала расходятся, потом замирают
    // и лишь едва дрейфуют — движение есть, ряби нет
    const heat = calm ? 0 : Math.max(0.012, 0.3 * Math.pow(0.975, frames));
    step(heat);

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

    draw();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    frames = 0;
    if (calm) { nodes.forEach((n) => { n.born = 1; n.delay = 0; }); for (let i = 0; i < 240; i++) step(0); draw(); return; }
    raf = requestAnimationFrame(tick);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  // ——— касания ———
  const at = (e) => {
    const b = canvas.getBoundingClientRect();
    const sx = e.clientX - b.left, sy = e.clientY - b.top;
    return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale, sx, sy };
  };
  const find = (p) => nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= n.r + 8 / cam.scale);

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
