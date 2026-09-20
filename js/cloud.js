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
  const imgs = {};

  const rnd = (n) => (Math.random() - 0.5) * n;

  function size() {
    const box = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width; H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ——— данные ———
  function setData(data) {
    const keep = {};
    nodes.forEach((n) => { keep[n.id] = n; });
    nodes = data.nodes.map((n) => {
      const was = keep[n.id];
      const a = Math.random() * Math.PI * 2;
      const r = n.self ? 0 : 60 + n.ring * 40 + rnd(30);
      return Object.assign({
        vx: 0, vy: 0,
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
    im.crossOrigin = 'anonymous';
    im.onload = () => { imgs[src] = im; };
    im.onerror = () => { imgs[src] = null; };
    imgs[src] = undefined;
    im.src = src;
  }

  // ——— физика ———
  function step(heat) {
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.self) { a.x += (cx - a.x) * 0.2; a.y += (cy - a.y) * 0.2; a.vx = a.vy = 0; continue; }
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = rnd(1); dy = rnd(1); d2 = 1; }
        const min = (a.r + b.r + 18) ** 2;
        if (d2 > 42000) continue;                       // далёкие друг друга не трогают
        const f = (min / d2) * 0.9;
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
      const want = e.len || 78;
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
      const want = 58 + n.ring * 46;
      const pull = (want - d) * 0.006;
      n.vx += (dx / d) * pull;
      n.vy += (dy / d) * pull;
      if (heat) { n.vx += rnd(heat); n.vy += rnd(heat); }
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx; n.y += n.vy;
      const pad = n.r + 6;
      n.x = Math.max(pad, Math.min(W - pad, n.x));
      n.y = Math.max(pad, Math.min(H - pad, n.y));
    });
  }

  // ——— рисование ———
  const COLOR = {
    know: 'rgba(120,140,170,.28)',
    vouch: 'rgba(47,123,255,.42)',
    knowHot: 'rgba(90,110,150,.55)',
    vouchHot: 'rgba(47,123,255,.85)',
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const lit = hover || held;
    const near = new Set();
    if (lit) { near.add(lit.id); edges.forEach((e) => { if (e.a === lit.id) near.add(e.b); if (e.b === lit.id) near.add(e.a); }); }

    edges.forEach((e) => {
      const a = byId[e.a], b = byId[e.b];
      const hot = lit && (e.a === lit.id || e.b === lit.id);
      ctx.strokeStyle = hot ? COLOR[e.kind + 'Hot'] : COLOR[e.kind];
      ctx.lineWidth = hot ? 1.8 : (e.kind === 'vouch' ? 1.2 : 1);
      ctx.globalAlpha = lit && !hot ? 0.35 : 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    nodes.forEach((n) => {
      const dim = lit && !near.has(n.id);
      ctx.globalAlpha = dim ? 0.32 : 1;
      if (n.kind === 'node') drawPlace(n);
      else drawPerson(n);
      if (n.label && (n.r >= 11 || n === lit)) {
        ctx.globalAlpha = dim ? 0.3 : 0.9;
        ctx.fillStyle = '#5b6474';
        ctx.font = '600 10px Manrope, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + n.r + 12);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawPerson(n) {
    const im = n.photo ? imgs[n.photo] : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    if (im) {
      ctx.clip();
      const s = n.r * 2;
      ctx.drawImage(im, n.x - n.r, n.y - n.r, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = n.self ? '#2f7bff' : n.ring === 1 ? '#dce8ff' : '#eef2f8';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = n.self ? '#fff' : '#5b6474';
      ctx.font = `700 ${Math.round(n.r * 0.82)}px Manrope, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.initials || '', n.x, n.y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.strokeStyle = n.self ? '#2f7bff' : n.ring === 1 ? 'rgba(47,123,255,.9)' : 'rgba(47,123,255,.35)';
    ctx.lineWidth = n.self ? 3 : n.ring === 1 ? 2 : 1.4;
    ctx.stroke();
  }

  function drawPlace(n) {
    const r = n.r, x = n.x - r, y = n.y - r, s = r * 2, rad = 4;
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + s, y, x + s, y + s, rad);
    ctx.arcTo(x + s, y + s, x, y + s, rad);
    ctx.arcTo(x, y + s, x, y, rad);
    ctx.arcTo(x, y, x + s, y, rad);
    ctx.closePath();
    ctx.fillStyle = n.company ? '#e6ecff' : '#e8f1ff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(47,123,255,.6)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // ——— жизнь ———
  let frames = 0;
  function tick() {
    frames++;
    // сначала граф раскладывается, потом еле заметно дышит
    const heat = calm ? 0 : frames < 90 ? 0.25 : 0.035;
    step(heat);
    draw();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    frames = 0;
    if (calm) { for (let i = 0; i < 240; i++) step(0); draw(); return; }
    raf = requestAnimationFrame(tick);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  // ——— касания ———
  const at = (e) => {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const find = (p) => nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= n.r + 6);

  canvas.addEventListener('pointerdown', (e) => {
    const p = at(e);
    held = find(p);
    moved = 0;
    pointer = { x: p.x, y: p.y, down: true, id: e.pointerId };
    if (held) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = at(e);
    if (held && pointer.down) {
      moved += Math.hypot(p.x - pointer.x, p.y - pointer.y);
      held.x = p.x; held.y = p.y; held.vx = held.vy = 0;
      pointer.x = p.x; pointer.y = p.y;
      if (calm) draw();
      return;
    }
    const was = hover;
    hover = find(p);
    canvas.style.cursor = hover ? 'pointer' : 'default';
    if (calm && was !== hover) draw();
  });
  const release = (e) => {
    if (held && moved < 6 && opts.onPick) opts.onPick(held);
    held = null; pointer.down = false;
    if (e && canvas.hasPointerCapture && e.pointerId != null) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* уже отпущено */ }
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { hover = null; });

  size();
  return {
    setData: (d) => { setData(d); },
    start,
    stop,
    resize: () => { size(); },
  };
};
