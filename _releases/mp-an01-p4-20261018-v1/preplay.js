'use strict';

// B3C local integration. Preparation is disabled until an authenticated gateway is configured.
// Preparation only. Host must explicitly configure an authenticated gateway.
(() => {
  function create(ctx) {
    const { state, client, rows, el, button, actionAccordion, notice, isAdmin, load, render } = ctx;
    const ownerId = state.profile?.id || '';
    const config = window.PICK_PREPLAY;
    const enabled = () => config?.enabled === true && typeof config.prepareUrl === 'string';
    const key = () => `pick-preplay-v1:${ownerId}`;
    let sequence = 0;
    const read = () => {
      try {
        const value = JSON.parse(localStorage.getItem(key()) || '[]');
        return Array.isArray(value) ? value : [];
      } catch (_) { return []; }
    };
    const save = items => {
      // Persist BEFORE issuing RPCs. Storage failure must not create an unknown identity.
      localStorage.setItem(key(), JSON.stringify(items));
    };
    const rpc = async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw error;
      if (!data) throw Error('EMPTY_RESPONSE');
      return data;
    };
    const field = (grid, label, type, value = '') => {
      const group = el('div', null, 'form-group');
      const input = el(type === 'select' ? 'select' : 'input', null, 'field');
      if (type !== 'select') input.type = type;
      input.id = `preplay-field-${++sequence}`;
      input.required = true;
      input.value = value;
      const text = el('label', label); text.htmlFor = input.id;
      group.append(text, input); grid.append(group);
      return input;
    };
    const busy = async (container, message, operation) => {
      if (state.writeBusy) return;
      state.writeBusy = true;
      const focused = document.activeElement;
      const controls = [...container.querySelectorAll('button,input,select')];
      const before = controls.map(c => c.disabled);
      controls.forEach(c => { c.disabled = true; });
      container.setAttribute('aria-busy', 'true');
      try { await operation(); }
      catch (_) {
        notice(message, 'Không thể hoàn tất lúc này. Vui lòng thử lại; thông tin trận đã được giữ.', { tone: 'error' });
      } finally {
        state.writeBusy = false;
        container.removeAttribute('aria-busy');
        controls.forEach((c, i) => { c.disabled = before[i] || c.dataset.locked === 'true'; });
        if (focused?.isConnected && !focused.disabled &&
            (document.activeElement === document.body || document.activeElement === focused)) focused.focus();
      }
    };
    const prepare = async item => {
      const status = await rpc('get_my_rating_validation_intent', { p_intent_id: item.intent });
      if (status.missed_or_void) throw Error('INTENT_CLOSED');
      if (status.started) return;
      if (!status.sealed && !status.started) {
        const url = new URL(config.prepareUrl, location.href);
        if (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) &&
            ['localhost', '127.0.0.1'].includes(location.hostname))) throw Error('HTTPS_REQUIRED');
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session?.access_token) throw Error('SESSION_REQUIRED');
        const response = await fetch(url, { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ intent_id: item.intent }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw Error('PREPARATION_UNAVAILABLE');
        // Read authorized status again; do not trust gateway/frontend readiness alone.
        const ready = await rpc('get_my_rating_validation_intent', { p_intent_id: item.intent });
        if (ready.missed_or_void) throw Error('INTENT_CLOSED');
        if (!ready.sealed) throw Error('NOT_READY');
      }
      if (status.missed_or_void && !status.started) throw Error('INTENT_CLOSED');
      await rpc('start_rating_validation_intent', { p_intent_id: item.intent });
    };

    function mount(root) {
      mountRecovery(root);
      if (!state.profile?.id || (!enabled() && !read().some(i => i.intent))) return;
      if (!isAdmin() && (state.profile.role !== 'MEMBER' || !state.profile.player_id)) return;
      const active = rows('players').filter(p => p.status === 'ACTIVE');
      const section = actionAccordion({ root, title: enabled() ? 'Bắt đầu trận của tôi' : 'Trận đã chuẩn bị trên thiết bị này', semantic: enabled() ? 'create' : 'info',
        className: 'match-action-card match-action-create preplay-section' }).body;
      if (enabled()) {
      section.append(el('p', 'Chọn người chơi trước khi thi đấu. Sau trận, nhập kết quả để đối thủ xác nhận.', 'muted'));
      const message = el('div'); message.hidden = true;
      const form = el('form'), grid = el('div', null, 'form-grid match-form-grid');
      const picks = ['Đội A · Người chơi 1', 'Đội A · Người chơi 2', 'Đội B · Người chơi 1', 'Đội B · Người chơi 2']
        .map(label => {
          const input = field(grid, label, 'select');
          input.append(new Option('Chọn VĐV', ''));
          active.forEach(p => input.append(new Option(p.full_name, p.id)));
          return input;
        });
      picks[0].value = state.profile.player_id || '';
      let draft = read().find(i => !i.intent);
      const replacement = read().find(i => i.replacementPending);
      if (draft) { [...draft.body.p_team_a, ...draft.body.p_team_b].forEach((id, i) => { picks[i].value = id; }); }
      const start = el('button', draft ? 'Thử lại' : 'Bắt đầu trận', 'btn primary'); start.type = 'submit';
      const actions = el('div', null, 'form-actions'); actions.append(start);
      form.append(grid, actions); section.append(form, message);
      if (draft) picks.forEach(p => { p.disabled = true; p.dataset.locked = 'true'; });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (state.writeBusy) return;
        const roster = picks.map(p => p.value);
        if (!draft && (roster.some(x => !x) || new Set(roster).size !== 4 ||
            (!isAdmin() && !roster.includes(state.profile.player_id)))) {
          notice(message, 'Chọn 4 VĐV khác nhau và có VĐV của bạn trong trận.', { tone: 'error' }); return;
        }
        void busy(section, message, async () => {
          if (!draft) {
            draft = { body: { p_request_id: crypto.randomUUID(), p_team_a: roster.slice(0, 2),
              p_team_b: roster.slice(2), p_match_type: 'CLUB_RATED', p_score_mode: 'POINTS', p_replaces_intent_id: replacement?.intent || null } };
            save([...read(), draft]);
            picks.forEach(p => { p.disabled = true; p.dataset.locked = 'true'; });
          }
          notice(message, 'Đang chuẩn bị trận...');
          const created = draft.intent ? {intent_id: draft.intent} : await rpc('create_rating_validation_intent', draft.body);
          const items = read(); const stored = items.find(i => i.body.p_request_id === draft.body.p_request_id);
          if (replacement) items.find(i => i.intent === replacement.intent).replacementPending = false;
          stored.intent = created.intent_id; save(items);
          draft.intent = created.intent_id;
          await prepare(draft);
          notice(message, 'Trận đã sẵn sàng.', { tone: 'success' });
          draft = null; render();
        });
      });
      }
      // Local IDs are a recovery index, never an authority or a cross-device read model.
      const list = el('div', null, 'match-confirm-list'); section.append(list);
      const items = read().filter(i => i.intent).slice().reverse();
      const page = el('div', null, 'form-actions');
      let offset = 0;
      const previous = button('Trang trước', () => { offset = Math.max(0, offset - 10); draw(); }, 'btn');
      const next = button('Trang sau', () => { offset += 10; draw(); }, 'btn');
      const count = el('span', '', 'muted'); page.append(previous, count, next); section.append(page);
      const draw = () => {
        list.replaceChildren();
        items.slice(offset, offset + 10).forEach(item => intentCard(list, item));
        previous.disabled = offset === 0; next.disabled = offset + 10 >= items.length;
        count.textContent = `${items.length ? offset + 1 : 0}–${Math.min(offset + 10, items.length)} / ${items.length} trận trên thiết bị này`;
      };
      draw();
    }

    function intentCard(list, item) {
      const card = el('article', null, 'match-confirm-card');
      const body = item.body;
      const name = id => rows('players').find(p => p.id === id)?.full_name || 'VĐV';
      card.append(el('strong', `Đội A: ${body.p_team_a.map(name).join(' + ')}`),
        el('p', `Đội B: ${body.p_team_b.map(name).join(' + ')}`, 'muted'));
      const message = el('div'); card.append(message);
      const actions = el('div', null, 'form-actions'); card.append(actions); list.append(card);
      const retry = button('Chuẩn bị / kiểm tra lại', () => void busy(card, message, async () => {
        notice(message, 'Đang chuẩn bị trận...'); await prepare(item);
        notice(message, 'Trận đã sẵn sàng.', { tone: 'success' }); refresh();
      }), 'btn');
      const proceed = button('Tiếp tục khi chưa chuẩn bị được', () => void busy(card, message, async () => {
        if (!confirm('Bắt đầu trận dù chưa chuẩn bị hoàn tất? Không thể chuẩn bị lại sau khi bắt đầu.')) return;
        await rpc('start_rating_validation_intent', { p_intent_id: item.intent }); refresh();
      }), 'btn');
      const voidAction = button('Hủy / đổi người chơi', () => void busy(card, message, async () => {
        if (!authoritative || authoritative.missed_or_void || item.matchId) return;
        const reason = prompt('Lý do hủy trận để chọn lại người chơi:'); if (!reason?.trim()) return;
        await rpc('void_rating_validation_intent', { p_intent_id: item.intent, p_reason: reason.trim() });
        // New form remains an explicit action; replacement is persisted before RPC.
        const entries = read();
        entries.find(i => i.intent === item.intent).replacementPending = true;
        save(entries); render();
      }), 'btn match-reject-button');
      [retry, proceed, voidAction].forEach(c => { c.disabled = true; c.dataset.locked = 'true'; });
      actions.append(retry, proceed, voidAction);
      let authoritative = null;
      const statusText = el('p', 'Đang tải trạng thái trận...', 'muted'); card.append(statusText);
      const resultAccordion = actionAccordion({ root: card, title: 'Nhập kết quả', semantic: 'info' });
      const result = resultAccordion.body;
      const form = el('form'), grid = el('div', null, 'form-grid match-form-grid');
      const played = field(grid, 'Thời gian thi đấu', 'datetime-local'); played.step = '1';
      const scoreA = field(grid, 'Tỷ số đội A', 'number'), scoreB = field(grid, 'Tỷ số đội B', 'number');
      scoreA.min = scoreB.min = '0'; scoreA.step = scoreB.step = '1';
      if (item.pendingResult) {
        const date = new Date(item.pendingResult.p_played_at);
        played.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        scoreA.value = item.pendingResult.p_team_a_score; scoreB.value = item.pendingResult.p_team_b_score;
        [played, scoreA, scoreB].forEach(c => { c.disabled = true; });
      }
      const send = el('button', 'Gửi kết quả', 'btn primary'); send.type = 'submit';
      const buttons = el('div', null, 'form-actions'); buttons.append(send); form.append(grid, buttons); result.append(form);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (state.writeBusy) return;
        void busy(card, message, async () => {
          const entries = read(), current = entries.find(i => i.intent === item.intent);
          if (!authoritative?.started || current.matchId) throw Error('RESULT_UNAVAILABLE');
          if (!current.pendingResult) {
            const at = new Date(played.value), a = Number(scoreA.value), b = Number(scoreB.value);
            if (!played.value || !Number.isFinite(at.getTime()) || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) throw Error('RESULT_INVALID');
            current.pendingResult = { p_intent_id: item.intent, p_request_id: crypto.randomUUID(),
              p_played_at: at.toISOString(), p_team_a_score: a, p_team_b_score: b };
            save(entries);
          }
          const output = await rpc('bind_rating_validation_result', current.pendingResult);
          if (!output.match_id) throw Error('RESULT_NOT_BOUND');
          current.matchId = output.match_id; save(entries);
          notice(message, 'Đã gửi kết quả để đối thủ xác nhận.', { tone: 'success' });
          await load(); render();
        });
      });
      const refresh = async () => {
        try {
          const status = await rpc('get_my_rating_validation_intent', { p_intent_id: item.intent });
          if (!card.isConnected) return;
          authoritative = status;
          statusText.textContent = item.matchId ? 'Đã gửi kết quả' : status.started ? 'Chờ nhập kết quả' : status.missed_or_void ? 'Đã hủy / không thể chuẩn bị lại' : status.sealed ? 'Sẵn sàng' : 'Chưa bắt đầu';
          retry.dataset.locked = String(!enabled() || status.started || status.missed_or_void);
          proceed.dataset.locked = String(!enabled() || status.started || status.missed_or_void);
          retry.disabled = !enabled() || status.started || status.missed_or_void;
          proceed.disabled = !enabled() || status.started || status.missed_or_void;
          resultAccordion.wrapper.hidden = !status.started || !!item.matchId;
          if (resultAccordion.wrapper.hidden) resultAccordion.setExpanded(false);
          voidAction.dataset.locked = String(!enabled() || !!item.matchId || status.missed_or_void);
          voidAction.disabled = !enabled() || !!item.matchId || status.missed_or_void;

        } catch (_) { notice(message, 'Chưa tải được trạng thái trận. Vui lòng kiểm tra lại.', { tone: 'error', announce: false }); resultAccordion.wrapper.hidden = true; resultAccordion.setExpanded(false); }
      };
      resultAccordion.wrapper.hidden = true; resultAccordion.setExpanded(false); void refresh();
    }
    function mountRecovery(root) {
      if (!state.profile?.id) return;
      const prefix = `pick-match-edit-v1:${state.profile.id}:`;
      const pending = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      if (!pending.length) return;
      const section = actionAccordion({root, title: 'Kiểm tra thao tác chưa hoàn tất', semantic: 'warning'}).body;
      section.append(el('p', 'Nếu kết nối bị gián đoạn, kiểm tra lại thao tác đã gửi trước khi sửa tiếp.', 'muted'));
      const message = el('div'); section.append(message);
      pending.slice(0, 10).forEach(storageKey => {
        const matchId = storageKey.slice(prefix.length);
        section.append(button('Kiểm tra / gửi lại thao tác', () => void busy(section, message, async () => {
          await retryEdit(matchId);
          notice(message, 'Đã xác nhận thao tác. Đang tải lại dữ liệu...', {tone: 'success'});
          await load(); render();
        }), 'btn'));
      });
    }
    async function retryEdit(matchId) {
      const storageKey = `pick-match-edit-v1:${ownerId}:${matchId}`;
      const request = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!request || request.p_match_id !== matchId) throw Error('EDIT_REQUEST_REQUIRED');
      const output = await rpc('edit_resubmit_rating_validation_match', request);
      if (output.match_id !== matchId) throw Error('EDIT_RESPONSE_INVALID');
      localStorage.removeItem(storageKey);
      return output;
    }
    async function edit(matchId, patch) {
      const storageKey = `pick-match-edit-v1:${ownerId}:${matchId}`;
      const pending = JSON.parse(localStorage.getItem(storageKey) || 'null');
      // Unknown outcome retries retain the exact body and UUID. Never route from local storage.
      if (pending && JSON.stringify(pending.p_patch) !== JSON.stringify(patch)) throw Error('RETRY_ORIGINAL_EDIT_REQUIRED');
      const request = pending || {p_match_id: matchId, p_request_id: crypto.randomUUID(), p_patch: patch};
      localStorage.setItem(storageKey, JSON.stringify(request));
      const output = await rpc('edit_resubmit_rating_validation_match', request);
      if (output.match_id !== matchId) throw Error('EDIT_RESPONSE_INVALID');
      localStorage.removeItem(storageKey);
      return output;
    }
    return Object.freeze({ mount, mountRecovery, edit, retryEdit });
  }
  window.PickPreplay = Object.freeze({ create });
})();
