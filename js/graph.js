// Граф доверия: круги, цепочки, репутация, поиск.
// Знакомство (связь) и рекомендация хранятся отдельно — это главный принцип сети.
window.Graph = function (S) {
  const adj = {};
  const edge = (a, b) => { (adj[a] = adj[a] || new Set()).add(b); (adj[b] = adj[b] || new Set()).add(a); };
  S.conns.filter((c) => c.status === 'ok').forEach((c) => edge(c.a, c.b));

  // Кратчайшие пути от «меня» по подтверждённым связям
  const dist = { [S.me]: 0 }, prev = {};
  const queue = [S.me];
  while (queue.length) {
    const v = queue.shift();
    (adj[v] || []).forEach((w) => {
      if (dist[w] === undefined) { dist[w] = dist[v] + 1; prev[w] = v; queue.push(w); }
    });
  }
  const pathTo = (id) => { const p = []; let v = id; while (v !== undefined) { p.unshift(v); v = prev[v]; } return p[0] === S.me ? p : null; };
  const connected = (a, b) => !!(adj[a] && adj[a].has(b));

  const catById = Object.fromEntries(S.cats.map((c) => [c.id, c]));
  // Записи «только для себя» в общий счёт не идут: их видит лишь автор
  const recsTo = (id, cat) => S.recs.filter((r) => r.to === id && !r.private && (!cat || r.cat === cat));
  const recsFrom = (id) => S.recs.filter((r) => r.from === id && !r.private);
  const myPrivate = () => S.recs.filter((r) => r.private && r.from === S.me);

  // Сферы человека: заявленные + те, в которых его рекомендуют (по убыванию числа рекомендаций)
  const catsOf = (id) => {
    const count = {};
    (S.users[id].cats || []).forEach((c) => { count[c] = count[c] || 0; });
    recsTo(id).forEach((r) => { if (r.cat) count[r.cat] = (count[r.cat] || 0) + 1; });   // «не моя сфера» — без сферы
    (S.users[id].anonRecs || []).forEach((r) => { if (r.cat) count[r.cat] = (count[r.cat] || 0) + 1; });   // советы без имени тоже говорят, кто он
    return Object.keys(count).sort((a, b) => count[b] - count[a]);
  };

  // Независимые источники: рекомендатели, связанные между собой, считаются одной группой
  const groupsOf = (ids) => {
    const set = new Set(ids), seen = new Set(), groups = [];
    ids.forEach((s) => {
      if (seen.has(s)) return;
      const g = [], st = [s]; seen.add(s);
      while (st.length) {
        const v = st.pop(); g.push(v);
        (adj[v] || []).forEach((w) => { if (set.has(w) && !seen.has(w)) { seen.add(w); st.push(w); } });
      }
      groups.push(g);
    });
    return groups.sort((a, b) => b.length - a.length);
  };

  const DAY = 864e5;
  const reputation = (id, cat) => {
    const rs = recsTo(id, cat);
    const authors = [...new Set(rs.map((r) => r.from))];
    const groups = groupsOf(authors);
    // Подозрение: большая доля рекомендаций от одной тесной группы, которая появилась недавно
    const big = groups[0] || [];
    const fresh = big.filter((a) => Date.now() - S.users[a].joined < 45 * DAY).length;
    const suspicious = authors.length >= 6 && big.length / authors.length >= 0.6 && fresh / big.length >= 0.6;
    const near = authors.filter((a) => a === S.me || (dist[a] !== undefined && dist[a] <= 1))
      .sort((a, b) => (dist[a] ?? 9) - (dist[b] ?? 9));
    const recent = rs.filter((r) => Date.now() - r.at < 30 * DAY).length;
    return { count: rs.length, unique: authors.length, independent: groups.length, suspicious, bigGroup: big.length, near, recent, recs: rs };
  };

  // Как «я» выхожу на человека в данной сфере: через ближайшего рекомендателя или через прямую связь
  const trust = (id, cat) => {
    if (id === S.me) return { circle: 0, chain: [S.me], via: null };
    let best = null;
    recsTo(id, cat).forEach((r) => {
      const d = dist[r.from];
      if (d === undefined) return;
      const circle = d + 1;
      if (!best || circle < best.circle) best = { circle, chain: [...pathTo(r.from), id], via: r.from, rec: r };
    });
    const d = dist[id];
    if (d !== undefined && (!best || d < best.circle)) best = { circle: d, chain: pathTo(id), via: null };
    return best || { circle: Infinity, chain: null, via: null };
  };

  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ');
  const matchCats = (q) => {
    const words = norm(q).split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return [];
    return S.cats.filter((c) => {
      // пустое слово (сфера с запятой в конце: «…, художник,») подходило к любому запросу — отбрасываем (правка 26.09)
      const keys = [...c.words, c.name.toLowerCase(), c.who.toLowerCase()].map(norm).map((k) => k.trim()).filter((k) => k.length >= 2);
      return words.some((w) => keys.some((k) => {
        if (k.includes(' ')) return k.includes(w) && w.length >= 4;
        return w.length >= 3 ? (w.startsWith(k) || k.startsWith(w)) : w === k;
      }));
    }).map((c) => c.id);
  };

  // Поиск: сначала 1-й круг, потом 2-й, 3-й, затем остальные. Внутри круга — по независимым источникам.
  // Что о человеке сказано в сфере: узкая специальность, метки и слова рекомендаций (и тех, что без имени)
  const hayOf = (u, cat) => norm([((u.focus || {})[cat] || ''),
    ...recsTo(u.id, cat).flatMap((r) => [...(r.tags || []), r.text]),
    ...(u.anonRecs || []).filter((r) => !cat || r.cat === cat).flatMap((r) => [...(r.tags || []), r.text])].join(' '));
  const stem = (w) => (w.length > 5 ? w.slice(0, w.length - 2) : w);

  // Поиск: сначала 1-й круг, потом 2-й, 3-й, затем остальные. Внутри круга — по независимым источникам.
  // Слова сверх сферы («ортодонт», «не назначает лишнего») поднимают тех, у кого они есть
  const search = (q, catFilter) => {
    const cats = catFilter ? [catFilter] : matchCats(q);
    const nq = norm(q).trim();
    const words = nq.split(/\s+/).filter((w) => w.length >= 4);
    const out = [];
    Object.values(S.users).forEach((u) => {
      if (u.id === S.me) return;
      const mine = catsOf(u.id);
      let hit = cats.filter((c) => mine.includes(c));
      if (!hit.length && nq.length >= 3 && !catFilter && norm(u.name).includes(nq)) hit = [mine[0] || null];
      // узкую специальность и метки ищем, даже если сфера не угадалась: «ортодонт», «гинеколог»
      if (!hit.length && words.length && !catFilter) hit = mine.filter((c) => words.some((w) => hayOf(u, c).includes(stem(w)))).slice(0, 1);
      hit.forEach((cat) => {
        const rep = cat ? reputation(u.id, cat) : { count: 0, unique: 0, independent: 0, near: [] };
        const anon = (u.anonRecs || []).filter((r) => r.cat === cat);
        if (!rep.count && !anon.length && !(u.cats || []).includes(cat)) return;
        const t = trust(u.id, cat);
        const hay = cat ? hayOf(u, cat) : '';
        const fit = words.filter((w) => hay.includes(stem(w))).length;
        const anonCircle = anon.length ? Math.min(...anon.map((r) => r.circle || 4)) + 1 : Infinity;
        out.push({ user: u, cat, rep, ...t, fit, anon: anon.length, sortCircle: Math.min(t.circle, anonCircle) });
      });
    });
    const seen = new Set();
    return out
      .sort((a, b) => b.fit - a.fit || a.sortCircle - b.sortCircle || b.rep.independent - a.rep.independent || b.rep.count - a.rep.count)
      .filter((r) => (seen.has(r.user.id) ? false : seen.add(r.user.id)));
  };

  // Репутация рекомендателя: скольких людей советует, в скольких сферах, и как часто его советы подхватывают
  const recommenderStats = (id) => {
    const given = recsFrom(id);
    const cats = new Set(given.map((r) => r.cat).filter(Boolean));
    const answers = S.requests.flatMap((q) => q.answers).filter((a) => a.from === id).length;
    const shared = S.shares.filter((s) => s.from === id).length;
    return { given: given.length, people: new Set(given.map((r) => r.to)).size, cats: cats.size, answers, shared };
  };

  return { adj, dist, myPrivate, pathTo, connected, catById, catsOf, recsTo, recsFrom, reputation, trust, matchCats, search, recommenderStats, groupsOf };
};
