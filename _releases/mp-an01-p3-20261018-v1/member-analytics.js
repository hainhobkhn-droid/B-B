/* MP-AN01-P2: personal read-only analytics. No identity parameter or write path. */
'use strict';
(function (global) {
  const ranges = ['30d', '90d', 'all'];
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const rating = x => finite(x) ? x.toFixed(3) : '—';
  const change = x => !finite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(3)}`;
  const day = x => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short' }).format(new Date(x));
  const bangkokDay = x => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(x));
  const validTime = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
  function consistent(s, h) {
    return s?.projection_revision === h?.projection_revision && s?.algorithm_version === h?.algorithm_version &&
      validTime(s?.as_of) && validTime(h?.as_of) && bangkokDay(s.as_of) === bangkokDay(h.as_of) &&
      JSON.stringify(s?.summary) === JSON.stringify(h?.summary);
  }
  function series(s, h, range) {
    if (!consistent(s, h) || !ranges.includes(range) || h.range !== range ||
        s.contract_version !== 1 || h.contract_version !== 1 ||
        s.timezone !== 'Asia/Bangkok' || h.timezone !== 'Asia/Bangkok') throw new Error('UNAVAILABLE');
    if (s.availability === 'NO_LINKED_PLAYER' && h.availability === 'NO_LINKED_PLAYER') return null;
    if (s.integrity !== 'PASS' || h.integrity !== 'PASS' || s.availability !== 'AVAILABLE' || h.availability !== 'AVAILABLE' || !s.summary || !Array.isArray(h.points)) throw new Error('UNAVAILABLE');
    const a = s.summary;
    if (!['current_rating', 'initial_rating', 'peak_rating', 'rating_change_30d', 'rating_change_90d'].every(k => finite(a[k])) ||
        !['rated_matches', 'wins', 'losses', 'draws'].every(k => Number.isInteger(a[k]) && a[k] >= 0) ||
        !(a.win_rate === null || finite(a.win_rate) && a.win_rate >= 0 && a.win_rate <= 1) ||
        !Array.isArray(a.recent_form) || a.recent_form.length > 5 || a.recent_form.some(x => !['W', 'L', 'D'].includes(x)) ||
        a.recent_form_order !== 'oldest_to_newest' || h.points.length > 399 || !['event', 'bucket_close'].includes(h.aggregation)) throw new Error('UNAVAILABLE');
    const keys = new Set(), matches = new Set();
    let previous = h.baseline?.rating;
    let time = -Infinity;
    for (const [index, p] of h.points.entries()) {
      const key = p.kind === 'BUCKET_CLOSE' ? `bucket:${index}` : p.key;
      if (!key || keys.has(key) || !validTime(p.event_at) || Date.parse(p.event_at) < time ||
          !['MATCH', 'ADJUSTMENT', 'ADJUSTMENT_REVERSAL', 'BUCKET_CLOSE'].includes(p.kind) ||
          ![p.rating_before, p.rating_after, p.rating_delta].every(finite) ||
          finite(previous) && Math.abs(previous - p.rating_before) > 0.00051) throw new Error('UNAVAILABLE');
      if (p.kind === 'MATCH' && (!p.match_id || matches.has(p.match_id))) throw new Error('UNAVAILABLE');
      if (p.kind === 'MATCH') matches.add(p.match_id);
      if (p.kind === 'BUCKET_CLOSE' && (!Number.isInteger(p.event_count) || p.event_count < 1 || h.aggregation !== 'bucket_close')) throw new Error('UNAVAILABLE');
      keys.add(key); previous = p.rating_after; time = Date.parse(p.event_at);
    }
    if (h.points.length && Math.abs(previous - a.current_rating) > 0.00051) throw new Error('UNAVAILABLE');
    // Empty windows remain empty even if the server carries closing baseline metadata.
    if (!h.points.length) return [];
    const out = [];
    if (h.baseline) {
      if (!finite(h.baseline.rating) || !validTime(h.baseline.event_at)) throw new Error('UNAVAILABLE');
      out.push({ kind: h.baseline.kind, rating_after: h.baseline.rating, event_at: h.baseline.event_at, baseline: true });
    }
    return out.concat(h.points); // Never sort, dedupe silently, interpolate or derive a club-wide series.
  }

  function mount({ root, client, el, button, panel, grid, isCurrent }) {
    let disposed = false, generation = 0, selectedRange = '30d', chartCleanup = () => {};
    const section = panel('Rating của tôi', root);
    section.classList.add('member-analytics');
    const content = el('div'); section.append(content);
    const alive = n => !disposed && n === generation && isCurrent() && section.isConnected;
    const status = text => {
      chartCleanup(); chartCleanup = () => {};
      content.replaceChildren();
      const msg = el('p', text, 'muted analytics-status');
      msg.setAttribute('role', 'status'); content.append(msg);
    };
    function render(s, h, points, focusRange) {
      content.replaceChildren();
      if (points === null) { status('Tài khoản chưa liên kết với hồ sơ VĐV. Vui lòng liên hệ ADMIN.'); return; }
      const a = s.summary;
      grid(content, [
        ['Rating hiện tại', rating(a.current_rating), `Ban đầu ${rating(a.initial_rating)}`],
        ['Trận Rated', String(a.rated_matches), `Thắng ${a.wins} · Thua ${a.losses} · Hòa ${a.draws}`],
        ['Tỷ lệ thắng', a.win_rate === null ? '—' : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(a.win_rate * 100)}%`, 'Trên các trận Rated đã duyệt']
      ], 'overview-kpi-grid analytics-kpis');
      const movements = el('div', null, 'analytics-changes');
      for (const [label, value] of [['30 ngày', a.rating_change_30d], ['90 ngày', a.rating_change_90d]]) {
        const n = el('p', null, 'analytics-change');
        n.append(el('span', `Thay đổi ${label}`), el('strong', change(value), value > 0 ? 'analytics-positive' : value < 0 ? 'analytics-negative' : 'muted'));
        movements.append(n);
      }
      content.children[0].children[0].append(movements);
      const form = el('div', null, 'analytics-form');
      form.append(el('span', '5 trận gần nhất', 'muted'));
      const meanings = { W: 'Thắng', L: 'Thua', D: 'Hòa' };
      if (!a.recent_form.length) form.append(el('span', 'Chưa có trận Rated', 'muted'));
      a.recent_form.forEach(x => {
        const chip = el('span', x, `status analytics-form-${x}`); chip.setAttribute('aria-label', meanings[x]); chip.title = meanings[x]; form.append(chip);
      });
      form.append(el('small', 'Cũ → mới · W: Thắng · L: Thua · D: Hòa', 'muted')); content.append(form);
      const trend = el('section', null, 'analytics-trend');
      trend.append(el('h3', 'Diễn biến Rating'));
      const controls = el('div', null, 'analytics-ranges'); controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Khoảng thời gian Rating');
      ranges.forEach((r, i) => {
        const b = button(['30 ngày', '90 ngày', 'Tất cả'][i], () => { selectedRange = r; void load(true); }, 'btn');
        b.type = 'button'; b.setAttribute('aria-pressed', String(r === selectedRange)); b.dataset.range = r; controls.append(b);
      });
      trend.append(controls); content.append(trend);
      const note = el('p', '', 'muted analytics-caption'); trend.append(note);
      if (!points.length) {
        note.textContent = a.rated_matches === 0 ? 'Biểu đồ sẽ xuất hiện sau khi có trận Rated được duyệt. Rating hiện tại và ban đầu được giữ nguyên.' : 'Không có thay đổi Rating trong khoảng thời gian này.';
      } else {
        note.textContent = h.aggregation === 'bucket_close'
          ? 'Dữ liệu được gom nhóm theo thứ tự sự kiện. Mỗi điểm là Rating cuối nhóm; không thể hiện mọi biến động hay đỉnh trung gian.'
          : 'Theo thứ tự sự kiện; khoảng cách ngang không biểu thị thời gian. Điểm tròn: trận đấu · điểm vuông: điều chỉnh.';
        chartCleanup = drawChart(trend, points, el, button);
      }
      content.append(el('p', `Rating cao nhất: ${rating(a.peak_rating)} · Bao gồm Rating ban đầu và điều chỉnh, trên toàn bộ lịch sử.`, 'muted analytics-peak'));
      if (focusRange) controls.children[ranges.indexOf(selectedRange)].focus({ preventScroll: true });
    }
    async function load(focusRange = false) {
      const n = ++generation;
      section.setAttribute('aria-busy', 'true'); status('Đang tải Rating của bạn…');
      try {
        let s, h;
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await Promise.all([
            client.rpc('get_my_member_dashboard_summary'),
            client.rpc('get_my_rating_history', { p_range: selectedRange })
          ]);
          if (!alive(n)) return;
          if (result.some(x => x.error)) throw new Error('UNAVAILABLE');
          [s, h] = result.map(x => x.data);
          if (consistent(s, h)) break;
        }
        if (alive(n)) render(s, h, series(s, h, selectedRange), focusRange);
      } catch (_) {
        if (!alive(n)) return;
        content.replaceChildren();
        const message = el('p', 'Chưa tải được thống kê Rating. Vui lòng thử lại hoặc đăng nhập lại.', 'notice error');
        message.setAttribute('role', 'alert'); content.append(message);
        const retry = button('Thử lại', () => { void load(true); }, 'btn'); retry.type = 'button'; content.append(retry);
      } finally { if (alive(n)) section.setAttribute('aria-busy', 'false'); }
    }
    void load();
    return () => { disposed = true; generation++; chartCleanup(); section.replaceChildren(); };
  }

  function drawChart(parent, points, el, button) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Biểu đồ Rating. Chọn điểm bằng thanh trượt bên dưới để xem chi tiết.');
    svg.classList.add('analytics-chart');
    const ns = (tag, attrs, text) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v))); if (text) n.textContent = text; svg.append(n); return n;
    };
    const values = points.map(p => p.rating_after);
    const lo = Math.min(...values), hi = Math.max(...values), pad = Math.max((hi - lo) * 0.15, 0.025);
    let width = 640, marker;
    const x = i => points.length === 1 ? (width + 45) / 2 : 50 + i * (width - 65) / (points.length - 1);
    const y = v => 185 - (v - lo + pad) / (hi - lo + 2 * pad) * 155;
    function geometry() {
      width = Math.max(240, Math.min(900, parent.clientWidth || 640));
      svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${width} 230`);
      [lo, (lo + hi) / 2, hi].filter((v, i, all) => all.indexOf(v) === i).forEach(v => {
      ns('line', { x1: 50, x2: width - 15, y1: y(v), y2: y(v), class: 'analytics-gridline' });
      ns('text', { x: 5, y: y(v) + 4, class: 'analytics-axis' }, rating(v));
    });
    ns('polyline', { points: points.map((p, i) => `${x(i)},${y(p.rating_after)}`).join(' '), class: 'analytics-line' });
    points.forEach((p, i) => {
      const attrs = { class: i === points.length - 1 ? 'analytics-dot analytics-latest' : 'analytics-dot' };
      if (p.kind === 'ADJUSTMENT' || p.kind === 'ADJUSTMENT_REVERSAL') ns('rect', { ...attrs, x: x(i) - 3, y: y(p.rating_after) - 3, width: 6, height: 6 });
      else ns('circle', { ...attrs, cx: x(i), cy: y(p.rating_after), r: i === points.length - 1 ? 5 : 3 });
    });
      ns('text', { x: 50, y: 218, class: 'analytics-axis' }, day(points[0].event_at));
      ns('text', { x: width - 15, y: 218, 'text-anchor': 'end', class: 'analytics-axis' }, day(points.at(-1).event_at));
      marker = ns('circle', { cx: x(points.length - 1), cy: y(points.at(-1).rating_after), r: 6, class: 'analytics-selected' });
    }
    geometry();
    parent.append(el('p', `Điểm cuối: ${rating(points.at(-1).rating_after)} · ${day(points.at(-1).event_at)}`, 'analytics-chart-summary'), svg);
    const navigator = el('div', null, 'analytics-point-nav');
    const label = el('label', 'Điểm trên biểu đồ', 'analytics-point-label');
    const slider = el('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(points.length - 1); slider.step = '1'; slider.value = slider.max;
    label.append(slider);
    const detail = el('div', null, 'analytics-detail'); detail.setAttribute('role', 'status'); detail.setAttribute('aria-live', 'polite');
    const move = delta => { slider.value = String(Math.max(0, Math.min(points.length - 1, Number(slider.value) + delta))); select(); };
    const prev = button('← Trước', () => move(-1), 'btn'); const next = button('Sau →', () => move(1), 'btn');
    prev.type = next.type = 'button'; navigator.append(prev, label, next); parent.append(navigator, detail);
    function select() {
      const i = Number(slider.value), p = points[i];
      const kind = p.baseline ? (p.kind === 'INITIAL' ? 'Rating ban đầu' : 'Rating đầu kỳ') :
        p.kind === 'BUCKET_CLOSE' ? `Cuối nhóm · ${p.event_count} sự kiện` :
        p.kind === 'ADJUSTMENT' ? 'Điều chỉnh Rating' : p.kind === 'ADJUSTMENT_REVERSAL' ? 'Hoàn tác điều chỉnh' : 'Trận Rated';
      const timestamp = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date(p.event_at));
      detail.replaceChildren(el('strong', `${timestamp} · ${kind}`));
      if (p.baseline) detail.append(el('p', `Rating ${rating(p.rating_after)}`));
      else {
        detail.append(el('p', `${rating(p.rating_before)} → ${rating(p.rating_after)} · ${change(p.rating_delta)}${p.result ? ' · ' + ({ W: 'Thắng', L: 'Thua', D: 'Hòa' }[p.result] || '') : ''}`));
        if (p.kind === 'MATCH') {
          const code = typeof p.match_code === 'string' && /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])\d{2}-\d{4,10}$/.test(p.match_code) ? p.match_code : null;
          if (code) {
            const reference = el('details', '', 'analytics-match-reference');
            reference.append(el('summary', 'Xem mã trận'), el('small', `Mã trận: ${code}`, 'muted'));
            detail.append(reference);
          } else detail.append(el('small', 'Không có mã trận', 'muted'));
        }
      }
      slider.setAttribute('aria-valuetext', `${i + 1} / ${points.length}, ${timestamp}, Rating ${rating(p.rating_after)}`);
      marker.setAttribute('cx', x(i)); marker.setAttribute('cy', y(p.rating_after));
      prev.disabled = i === 0; next.disabled = i === points.length - 1;
    }
    slider.addEventListener('input', select); select();
    let frame = null;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      const nextWidth = Math.max(240, Math.min(900, parent.clientWidth || 640));
      if (nextWidth === width) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = null; geometry(); select(); });
    }) : null;
    observer?.observe(parent);
    return () => { observer?.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }
  global.PickMemberAnalytics = Object.freeze({ mount, series, consistent, rating, change });
})(window);
