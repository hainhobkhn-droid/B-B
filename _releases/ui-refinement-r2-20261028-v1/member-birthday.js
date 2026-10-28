/* MEMBER Birthday P3. Backend supplies day/month only; no DOB/age calculation. */
'use strict';
(function (global) {
  const fields = ['player_id','full_name','birthday_day','birthday_month','is_birthday_today','days_until_birthday'];
  function validate(data, offset = 0) {
    if (!data || Object.keys(data).sort().join() !== ['birthdays','has_more','limit','offset','window_days'].sort().join() ||
        !Array.isArray(data.birthdays) || data.birthdays.length > 20 || data.limit !== 20 || data.offset !== offset ||
        data.window_days !== 7 || typeof data.has_more !== 'boolean') throw Error('BIRTHDAY_UNAVAILABLE');
    const ids = new Set(); let previous = -1;
    for (const row of data.birthdays) {
      if (!row || Object.keys(row).sort().join() !== fields.slice().sort().join() ||
          typeof row.player_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.player_id) ||
          typeof row.full_name !== 'string' || !row.full_name.trim() ||
          !Number.isInteger(row.birthday_month) || row.birthday_month < 1 || row.birthday_month > 12 ||
          !Number.isInteger(row.birthday_day) || row.birthday_day < 1 || row.birthday_day > [31,29,31,30,31,30,31,31,30,31,30,31][row.birthday_month-1] ||
          !Number.isInteger(row.days_until_birthday) || row.days_until_birthday < 0 || row.days_until_birthday < previous || row.days_until_birthday > 7 ||
          row.is_birthday_today !== (row.days_until_birthday === 0) || ids.has(row.player_id)) throw Error('BIRTHDAY_UNAVAILABLE');
      previous = row.days_until_birthday; ids.add(row.player_id);
    }
    return data;
  }
  async function read(client, offset = 0) {
    // Supabase builders are thenable; .catch() is not part of this contract.
    const { data, error } = await client.rpc('get_member_birthdays', { p_window_days: 7, p_limit: 20, p_offset: offset });
    if (error) throw Error('BIRTHDAY_UNAVAILABLE');
    return validate(data, offset);
  }
  const label = row => `${row.is_birthday_today ? 'Sinh nhật hôm nay' : 'Sinh nhật sắp tới'} · ${String(row.birthday_day).padStart(2,'0')}/${String(row.birthday_month).padStart(2,'0')}`;
  function badge(el, data, id) {
    const row = data?.birthdays?.find(item => item.player_id === String(id));
    return row ? el('span', label(row), 'badge birthday-badge') : null;
  }
  function mount({ root, client, el, button, panel, initial, isCurrent, onRead = () => {} }) {
    const section = panel('Sinh nhật CLB · hôm nay & 7 ngày tới', root);
    section.classList.add('member-birthdays');
    let stopped = false, request = 0, offset = 0, busy = false;
    const alive = () => !stopped && isCurrent();
    const body = el('div', null, 'birthday-body'); section.append(body);
    function show(data) {
      body.replaceChildren();
      if (!data.birthdays.length) body.append(el('p','Chưa có sinh nhật trong 7 ngày tới.','muted'));
      for (const row of data.birthdays) {
        const item = el('div', null, 'birthday-row');
        const identity = el('div', null, 'birthday-identity');
        identity.append(el('strong', row.full_name), el('span',label(row),'muted'));
        item.append(identity,el('span',row.is_birthday_today ? 'Hôm nay' : `Còn ${row.days_until_birthday} ngày`,'badge'));
        body.append(item);
      }
      if (offset || data.has_more) {
        const controls = el('div', null, 'pagination');
        const prev = button('Trang trước', () => load(Math.max(0,offset-20)), 'btn secondary');
        const next = button('Trang sau', () => load(offset+20), 'btn secondary');
        prev.disabled = offset === 0; next.disabled = !data.has_more;
        controls.append(prev,el('span',`Trang ${offset/20+1}`,'muted'),next); body.append(controls);
      }
    }
    async function load(nextOffset) {
      if (!alive() || busy) return;
      busy = true; const ticket = ++request;
      body.replaceChildren(el('p','Đang tải sinh nhật…','muted')); section.setAttribute('aria-busy','true');
      try {
        const data = await read(client,nextOffset);
        if (!alive() || ticket !== request) return;
        offset = nextOffset; onRead(data); show(data);
      } catch (_) {
        if (!alive() || ticket !== request) return;
        body.replaceChildren(el('p','Chưa tải được sinh nhật.','notice error'),button('Thử lại', () => load(nextOffset),'btn secondary'));
      } finally { busy = false; if (alive()) section.setAttribute('aria-busy','false'); }
    }
    if (initial && initial !== 'error') { offset = initial.offset; show(validate(initial,offset)); }
    else if (initial === 'error') body.append(el('p','Chưa tải được sinh nhật.','notice error'),button('Thử lại',() => load(0),'btn secondary'));
    else void load(0);
    return () => { stopped = true; request++; };
  }
  global.PickMemberBirthday = Object.freeze({ validate, read, badge, mount });
})(typeof window === 'undefined' ? globalThis : window);
