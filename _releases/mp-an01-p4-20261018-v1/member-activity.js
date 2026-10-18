/* MP-AN01-P3: read-only caller-owned activity; IDs never become display references. */
'use strict';
(function (global) {
  const pageSize = 20;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const time = s => typeof s === 'string' && Number.isFinite(Date.parse(s));
  const statuses = { APPROVED: ['Đã duyệt', 'good'], PENDING: ['Chờ xác nhận', 'pending'],
    REJECTED: ['Bị từ chối', 'bad'], INVALID: ['Không hợp lệ', 'bad'], VOIDED: ['Đã hủy', ''] };
  function code(match) {
    if (!time(match.played_at) || !Number.isSafeInteger(match.match_number) || match.match_number < 1) return 'Không có mã trận';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit', month: '2-digit', year: '2-digit' }).formatToParts(new Date(match.played_at)).map(p => [p.type, p.value]));
    return `${parts.day}${parts.month}${parts.year}-${String(match.match_number).padStart(4, '0')}`;
  }
  function normalize(data, history, weights) {
    if (!data || !Array.isArray(data.matches)) throw new Error('UNAVAILABLE');
    if (data.player_id === null && data.matches.length === 0) return null;
    if (typeof data.player_id !== 'string' || !data.player_id) throw new Error('UNAVAILABLE');
    let deltas = new Map();
    if (history) {
      try {
        global.PickMemberAnalytics.series(history, history, 'all');
        deltas = new Map(history.points.filter(p => p.kind === 'MATCH').map(p => [p.match_id, p]));
      } catch (_) { /* Unavailable/aggregated Rating is never reconstructed from other players. */ }
    }
    const configuration = new Map();
    if (Array.isArray(weights)) for (const w of weights) {
      if (typeof w.match_type !== 'string' || !finite(w.weight) || w.weight < 0 || configuration.has(w.match_type)) throw new Error('UNAVAILABLE');
      configuration.set(w.match_type, w.weight);
    }
    const seen = new Set();
    return data.matches.map(m => {
      if (!m || typeof m.id !== 'string' || seen.has(m.id) || !['A', 'B'].includes(m.my_team) || !Array.isArray(m.players)) throw new Error('UNAVAILABLE');
      seen.add(m.id);
      const own = m.players.filter(p => p.player_id === data.player_id);
      if (own.length !== 1 || own[0].team !== m.my_team || m.players.some(p => !['A', 'B'].includes(p.team)) ||
          new Set(m.players.map(p => p.player_id)).size !== m.players.length) throw new Error('UNAVAILABLE');
      const other = m.my_team === 'A' ? 'B' : 'A';
      const names = team => m.players.filter(p => p.team === team && p.player_id !== data.player_id)
        .map(p => typeof p.full_name === 'string' && p.full_name.trim() ? p.full_name : 'Chưa có tên VĐV').join(' + ') || 'Chưa có thông tin';
      const validScore = [m.team_a_score, m.team_b_score].every(n => Number.isInteger(n) && n >= 0);
      const mine = m.my_team === 'A' ? m.team_a_score : m.team_b_score;
      const theirs = m.my_team === 'A' ? m.team_b_score : m.team_a_score;
      const result = m.status === 'APPROVED' && validScore ? (mine === theirs ? 'D' : mine > theirs ? 'W' : 'L') : null;
      const status = m.status === 'PENDING' && m.opponent_rejected === true ? 'REJECTED' : m.status;
      const rated = configuration.has(m.match_type) ? configuration.get(m.match_type) > 0 : null;
      const reference = code(m), point = deltas.get(m.id);
      const delta = rated === true && result && reference !== 'Không có mã trận' && point?.match_code === reference && point.result === result && finite(point.rating_delta)
        ? point.rating_delta : null;
      return { code: reference, date: time(m.played_at) ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.played_at)) : 'Chưa có thời gian',
        partner: names(m.my_team), opponents: names(other), score: validScore ? `${mine} – ${theirs}` : 'Chưa có tỷ số', result,
        status: statuses[status] || ['Chưa xác định trạng thái', ''], rated, delta };
    });
  }
  function page(rows, filter = '', number = 1) {
    const filtered = rows.filter(r => filter === 'rated' ? r.rated === true : filter === 'unrated' ? r.rated === false : true);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const current = Math.max(1, Math.min(pages, number));
    return { rows: filtered.slice((current - 1) * pageSize, current * pageSize), total: filtered.length, pages, current };
  }
  function mount({ root, client, el, button, panel, isCurrent }) {
    let disposed = false, generation = 0, filter = '', number = 1, records = [], partial = false;
    const section = panel('Hoạt động của tôi', root);
    section.classList.add('member-activity');
    section.tabIndex = -1;
    section.setAttribute('aria-label', 'Hoạt động của tôi');
    section.focus();
    section.append(el('p', 'Các trận bạn đã tham gia · Tỷ số theo đội của bạn', 'muted'));
    const content = el('div'); section.append(content);
    const alive = n => !disposed && n === generation && isCurrent() && section.isConnected;
    function render(focus) {
      content.replaceChildren();
      const toolbar = el('div', null, 'list-toolbar');
      const label = el('label', null, 'list-control');
      label.append(el('span', 'Thể thức', 'list-control-label'));
      const select = el('select', null, 'field'); select.id = 'member-activity-type';
      for (const [value, text] of [['', 'Tất cả'], ['rated', 'Rated'], ['unrated', 'Thường / non-Rated']]) {
        const option = el('option', text); option.value = value; select.append(option);
      }
      select.value = filter; label.append(select); toolbar.append(label);
      const reset = button('Xóa bộ lọc', () => { filter = ''; number = 1; render('filter'); }, 'btn secondary');
      reset.disabled = filter === ''; toolbar.append(reset); content.append(toolbar);
      select.addEventListener('change', () => { filter = select.value; number = 1; render('filter'); });
      const found = page(records, filter, number); number = found.current;
      const count = el('p', found.total ? `${(number - 1) * pageSize + 1}–${Math.min(number * pageSize, found.total)} / ${found.total} trận` : '0 trận', 'muted list-result-count');
      count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); content.append(count);
      const list = el('div', null, 'activity-records');
      for (const row of found.rows) {
        const card = el('article', null, 'activity-record');
        const identity = el('div', null, 'activity-identity'); identity.append(el('h3', row.code), el('p', row.date, 'muted'));
        const outcome = el('div', null, 'activity-outcome');
        outcome.append(el('strong', `${row.result ? ({ W: 'Thắng', L: 'Thua', D: 'Hòa' })[row.result] : 'Chưa có kết quả'} · ${row.score}`,
          row.result === 'W' ? 'analytics-positive' : row.result === 'L' ? 'analytics-negative' : ''));
        outcome.append(el('span', row.status[0], `badge ${row.status[1]}`));
        const roster = el('div', null, 'activity-roster');
        roster.append(el('p', `Đồng đội: ${row.partner}`), el('p', `Đối thủ: ${row.opponents}`));
        const rating = el('div', null, 'activity-rating');
        rating.append(el('span', row.rated === null ? 'Chưa xác định thể thức' : row.rated ? 'Rated' : 'Thường / non-Rated', 'muted'));
        if (row.delta !== null) rating.append(el('strong', `Rating ${global.PickMemberAnalytics.change(row.delta)}`, row.delta > 0 ? 'analytics-positive' : row.delta < 0 ? 'analytics-negative' : ''));
        card.append(identity, outcome, roster, rating); list.append(card);
      }
      if (!found.total) list.append(el('p', records.length ? 'Không có trận trong bộ lọc này.' : 'Bạn chưa có trận đấu nào.', 'notice'));
      content.append(list);
      if (found.pages > 1) {
        const pager = el('nav', null, 'list-pager'); pager.setAttribute('aria-label', 'Phân trang hoạt động');
        const prev = button('Trang trước', () => { number--; render('page'); }, 'btn secondary'); prev.disabled = number === 1;
        const next = button('Trang sau', () => { number++; render('page'); }, 'btn secondary'); next.disabled = number === found.pages;
        const position = el('span', `Trang ${number} / ${found.pages}`, 'muted'); position.tabIndex = -1;
        pager.append(prev, position, next); content.append(pager);
        if (focus === 'page') position.focus();
      }
      if (focus === 'filter') select.focus();
      if (partial) {
        const warning = el('p', 'Một số thông tin Rating hoặc thể thức chưa tải được.', 'notice');
        warning.setAttribute('role', 'status'); warning.append(button('Tải lại thông tin', load, 'btn secondary')); content.append(warning);
      }
    }
    async function load() {
      const n = ++generation;
      content.replaceChildren();
      const loading = el('p', 'Đang tải hoạt động của bạn…', 'notice'); loading.setAttribute('role', 'status'); content.append(loading);
      try {
        const [matches, history, weights] = await Promise.all([
          client.rpc('get_my_matches'),
          optionalRead(() => client.rpc('get_my_rating_history', { p_range: 'all' })),
          optionalRead(() => client.from('rating_match_weights').select('match_type,weight'))
        ]);
        if (!alive(n)) return;
        if (matches.error) throw new Error('UNAVAILABLE');
        records = normalize(matches.data, history.error ? null : history.data, weights.error ? null : weights.data);
        if (records === null) { content.replaceChildren(el('p', 'Tài khoản chưa liên kết với hồ sơ VĐV.', 'notice')); return; }
        partial = !!(history.error || weights.error || history.data?.integrity !== 'PASS');
        if (!partial) {
          try { global.PickMemberAnalytics.series(history.data, history.data, 'all'); }
          catch (_) { partial = true; }
        }
        render();
      } catch (_) {
        if (!alive(n)) return;
        const error = el('p', 'Chưa tải được hoạt động. Vui lòng thử lại.', 'notice error'); error.setAttribute('role', 'alert');
        content.replaceChildren(error, button('Thử lại', load, 'btn secondary'));
      }
    }
    async function optionalRead(read) {
      try {
        // Supabase builders are awaitable but do not promise native .catch()/finally().
        const { data, error } = await read();
        return { data, error };
      } catch (_) { return { data: null, error: true }; }
    }
    load();
    return () => { disposed = true; generation++; };
  }
  global.PickMemberActivity = Object.freeze({ normalize, code, page, mount });
})(window);
