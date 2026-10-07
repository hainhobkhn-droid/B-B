(function () {
  'use strict';

  function create(ctx) {
    if (!ctx || typeof ctx !== 'object') {
      throw new Error('PICK Account: thiếu context.');
    }

      const {
        $,
        state,
        client,
        isAdmin,
        canViewAudit = () => false,
        button,
        actionAccordion,
        panel,
        el,
        rows,
        raw,
        upper,
        number,
        date,
        sources,
        ready,
        notice,
        load,
        render,
        explain,
        badge,
        table,
        settings,
        query,
        activeRatingSettings,
        signupRatingConfig
      } = ctx;

      function adminBirthdayReport(root) {
        if (!ready('players')) {
          return;
        }

        const today =
          new Date();

        const currentYear =
          today.getFullYear();

        const currentMonth =
          today.getMonth();

        const currentQuarter =
          Math.floor(
            currentMonth / 3
          );

        const birthdayData =
          rows('players')
            .filter(
              player =>
                upper(
                  player.status
                ) ===
                  'ACTIVE' &&
                player.date_of_birth
            )
            .map(player => {
              const parts =
                String(
                  player.date_of_birth
                )
                  .slice(
                    0,
                    10
                  )
                  .split('-');

              const birthYear =
                Number(
                  parts[0]
                );

              const month =
                Number(
                  parts[1]
                ) - 1;

              const day =
                Number(
                  parts[2]
                );

              return {
                ...player,
                birthday_month:
                  month,
                birthday_day:
                  day,
                birthday_display:
                  `${String(
                    day
                  ).padStart(
                    2,
                    '0'
                  )}/${String(
                    month + 1
                  ).padStart(
                    2,
                    '0'
                  )}`,
                age_this_year:
                  Number.isInteger(
                    birthYear
                  )
                    ? currentYear -
                      birthYear
                    : null
              };
            })
            .filter(
              player =>
                Number.isInteger(
                  player.birthday_month
                ) &&
                Number.isInteger(
                  player.birthday_day
                )
            )
            .sort(
              (a, b) =>
                a.birthday_month -
                  b.birthday_month ||
                a.birthday_day -
                  b.birthday_day ||
                raw(
                  a.full_name
                ).localeCompare(
                  raw(
                    b.full_name
                  ),
                  'vi'
                )
            );

        const monthRows =
          birthdayData.filter(
            player =>
              player.birthday_month ===
                currentMonth
          );

        const quarterRows =
          birthdayData.filter(
            player =>
              Math.floor(
                player.birthday_month / 3
              ) ===
                currentQuarter
          );

        const birthdayCols = [
          [
            'Vận động viên',
            r =>
              raw(
                r.full_name
              )
          ],
          [
            'Ngày sinh',
            r =>
              r.birthday_display
          ],
          [
            'Tuổi trong năm',
            r =>
              number(
                r.age_this_year
              )
          ]
        ];

        sources(
          root,
          ['players']
        );

        table(
          root,
          '🎂 Sinh nhật tháng này',
          monthRows,
          birthdayCols
        );

        table(
          root,
          '🎉 Sinh nhật quý này',
          quarterRows,
          birthdayCols
        );
      }
      function accountPassword(root) {
        if (!state.session || state.profile?.is_active !== true) return;
        const section = panel('Đổi mật khẩu', root);
        const form = el('form');
        const message = el('div', null, 'notice');
        message.hidden = true;
        message.setAttribute('role', 'status');
        const grid = el('div', null, 'form-grid');
        const field = (id, title, type, autocomplete) => {
          const group = el('div', null, 'form-group');
          const label = el('label', title);
          label.htmlFor = id;
          const input = el('input', null, 'field');
          input.id = id;
          input.name = id;
          input.type = type;
          input.autocomplete = autocomplete;
          group.append(label, input);
          grid.append(group);
          return input;
        };
        const password = field('account-new-password', 'Mật khẩu mới', 'password', 'new-password');
        const confirm = field('account-confirm-password', 'Nhập lại mật khẩu mới', 'password', 'new-password');
        password.required = confirm.required = true;
        password.minLength = confirm.minLength = 8;
        const nonce = field('account-password-nonce', 'Mã xác thực qua email (khi được yêu cầu)', 'text', 'one-time-code');
        const submit = el('button', 'Đổi mật khẩu', 'btn primary');
        submit.type = 'submit';
        const resend = button('Gửi mã xác thực', async () => {
          if (pending || state.writeBusy || !state.session) return;
          lock(true);
          try {
            const { error } = await client.auth.reauthenticate();
            if (error) throw error;
            notice(message, 'Đã gửi mã xác thực. Kiểm tra email rồi nhập mã và thử đổi mật khẩu.', false, true);
          } catch (error) {
            notice(message, authError(error), true);
          } finally { lock(false); }
        }, 'btn secondary');
        resend.hidden = true;
        nonce.parentElement.hidden = true;
        const controls = [password, confirm, nonce, submit, resend];
        let pending = false;
        const lock = value => {
          pending = value;
          state.writeBusy = value;
          controls.forEach(control => { control.disabled = value; });
          submit.textContent = value ? 'Đang xử lý…' : 'Đổi mật khẩu';
        };
        const authError = error => {
          const code = error?.code || '';
          if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid') {
            nonce.parentElement.hidden = false;
            resend.hidden = false;
            return 'Cần xác thực lại. Gửi mã qua email, nhập mã rồi thử lại.';
          }
          if (code === 'weak_password') return 'Mật khẩu chưa đáp ứng yêu cầu bảo mật. Hãy chọn mật khẩu dài và khó đoán hơn.';
          if (code === 'same_password') return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
          if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) {
            return 'Đã vượt giới hạn yêu cầu. Vui lòng chờ rồi thử lại.';
          }
          return 'Không đổi được mật khẩu. Kiểm tra kết nối hoặc đăng nhập lại rồi thử lại.';
        };
        controls.forEach(control => { control.disabled = state.writeBusy; });
        const actions = el('div', null, 'form-actions');
        actions.append(submit, resend);
        form.append(el('p', 'Dùng ít nhất 8 ký tự. Không chia sẻ mật khẩu hoặc mã xác thực.', 'muted'), grid, actions, message);
        section.append(form);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          if (pending || state.writeBusy || state.busy || !state.session) return;
          if (password.value.length < 8) {
            notice(message, 'Mật khẩu mới cần ít nhất 8 ký tự.', true);
            return;
          }
          if (password.value !== confirm.value) {
            notice(message, 'Mật khẩu xác nhận không khớp.', true);
            return;
          }
          if (!form.reportValidity()) return;
          const userId = state.session.user.id;
          lock(true);
          notice(message, '');
          try {
            const attributes = { password: password.value };
            if (nonce.value.trim()) attributes.nonce = nonce.value.trim();
            const { data, error } = await client.auth.updateUser(attributes);
            if (error) throw error;
            if (!data?.user || data.user.id !== userId) throw new Error('USER_CONFIRMATION_MISSING');
            password.value = confirm.value = nonce.value = '';
            if (state.session?.user.id === userId) {
              notice(message.isConnected ? message : $('global-message'),
                'Đã đổi mật khẩu thành công. Hãy dùng mật khẩu mới cho lần đăng nhập tiếp theo.', false, true);
            }
          } catch (error) {
            if (state.session?.user.id === userId) notice(message, authError(error), true);
          } finally {
            lock(false);
          }
        });
      }


      // Account presentation only; existing loaders and action handlers are unchanged.
      function accountAction(root, title, renderBody, variant = 'info') {
        const semantic = variant === 'success' ? 'create' : variant;
        let onOpen;
        return actionAccordion({
          root,
          title,
          semantic,
          render(body, action) { onOpen = renderBody(body, action); },
          onOpen() { if (typeof onOpen === 'function') void onOpen(); }
        }).wrapper;
      }

      function memberPersonalSummary(root, player) {
        const grid = el('div', null, 'form-grid acc06-summary');
        const add = (label, value) => {
          const item = el('div', null, 'form-group');
          item.append(el('span', label, 'muted'), el('strong', value)); grid.append(item);
        };
        add('Trạng thái duyệt', membershipLabel(state.profile));
        add('Nickname đăng nhập', Object.prototype.hasOwnProperty.call(state.profile, 'login_name')
          ? (state.profile.login_name || 'Chưa thiết lập') : 'Chưa tải được');
        add('Điện thoại', player && Object.prototype.hasOwnProperty.call(player,'phone')
          ? (player.phone || 'Chưa cập nhật') : 'Chưa tải được');
        add('Ngày sinh', player && Object.prototype.hasOwnProperty.call(player,'date_of_birth')
          ? (player.date_of_birth || 'Chưa cập nhật') : 'Chưa tải được');
        const permissions = [
          ['can_approve_matches','Duyệt trận'],['can_manage_tournaments','Quản lý giải'],
          ['can_collect_tournament_fee','Thu phí giải'],['can_manage_fund','Quản lý Quỹ'],
          ['can_collect_fund','Thu Quỹ'],['can_manage_members','Quản lý thành viên'],
          ['can_manage_players','Quản lý VĐV'],['can_manage_player_lifecycle','Quản lý vòng đời VĐV'],
          ['can_adjust_rating','Điều chỉnh Rating'],['can_view_audit','Xem lịch sử thao tác']
        ].filter(([key]) => state.profile[key] === true);
        const details = el('details', null, 'acc06-permissions');
        details.append(el('summary', 'Quyền được cấp: ' + permissions.length + ' (chỉ xem)'));
        for (const [,label] of permissions) details.append(el('p',label));
        if (!permissions.length) details.append(el('p','Bạn đang dùng quyền thành viên thông thường.','muted'));
        root.append(grid, details);
        // WP-C9: a stored capability is not an available backend workflow.
        if (state.profile.can_adjust_rating === true) {
          details.append(el('p',
            'Điều chỉnh Rating: mở VĐV → Điều chỉnh Rating. Sửa Rating ban đầu vẫn chỉ dành cho ADMIN.',
            'notice'));
        }
        if (state.profile.can_view_audit === true) {
          details.append(el('p',
            'Xem Audit: mở Lịch sử thao tác để xem metadata nghiệp vụ đã được lọc an toàn.',
            'notice'));
        }
      }

      function memberNickname(root) {
        const actor = state.session?.user?.id;
        const generation = state.generation;
        const current = () => root.isConnected && state.session?.user?.id === actor &&
          state.generation === generation && state.profile?.role === 'MEMBER' &&
          state.profile?.is_active === true && state.profile?.membership_status === 'APPROVED';
        if (!current()) return;
        if (!Object.prototype.hasOwnProperty.call(state.profile,'login_name')) {
          root.append(el('p','Chưa tải được nickname. Vui lòng tải lại tài khoản.','notice')); return;
        }
        if (String(state.profile.login_name || '').trim()) {
          root.append(el('strong',state.profile.login_name,'account-name'),
            el('p','Nickname đăng nhập đã được thiết lập và chỉ xem tại đây.','muted')); return;
        }
        root.append(el('p','Chưa thiết lập. Bạn có thể tạo nickname đăng nhập một lần.','muted'));
        const form=el('form'), input=el('input',null,'field'), label=el('label','Nickname đăng nhập');
        input.id='member-claim-nickname';label.htmlFor=input.id;
        input.required=true;input.minLength=3;input.maxLength=32;input.autocomplete='username';
        input.setAttribute('autocapitalize','none');input.spellcheck=false;
        const message=el('div');message.hidden=true;message.setAttribute('role','status');
        const submit=el('button','Tạo nickname đăng nhập','btn primary');submit.type='submit';
        const actions=el('div',null,'form-actions');actions.append(submit);
        form.append(label,input,el('p','3–32 ký tự: chữ a–z, số, dấu chấm, gạch dưới hoặc gạch ngang. Chữ hoa được chuyển thành chữ thường.','muted'),actions,message);
        root.append(form);
        let saving=false, claimed=false;
        form.addEventListener('submit',async event=>{
          event.preventDefault();
          if (!current() || saving || claimed || state.writeBusy || state.busy || String(state.profile.login_name || '').trim()) return;
          const nickname=input.value.trim().toLowerCase();
          if (!/^[a-z0-9._-]{3,32}$/.test(nickname)) { notice(message,'Nickname cần 3–32 ký tự hợp lệ.',true);return; }
          saving=true;state.writeBusy=true;input.disabled=submit.disabled=true;
          notice(message,'Đang tạo nickname…');
          try {
            const {data,error}=await client.rpc('claim_my_nickname',{p_nickname:nickname});
            if (error) throw error;
            if (data?.success!==true || data.profile_id!==actor || data.login_name!==nickname) throw new Error('CLAIM_UNCONFIRMED');
            if (!current()) return;
            claimed=true;state.profile.login_name=data.login_name;
            root.replaceChildren(el('strong',data.login_name,'account-name'),el('p','Đã tạo nickname đăng nhập. Nickname chỉ được thiết lập một lần.','notice success'));
            await load();
          } catch(error) {
            if (!current()) return;
            const code=String(error?.message || '');
            notice(claimed ? $('global-message') : message, claimed
              ? 'Đã tạo nickname nhưng chưa tải lại được tài khoản. Vui lòng tải lại.'
              : code.includes('LOGIN_NAME_TAKEN') ? 'Nickname đã được sử dụng. Hãy chọn tên khác.'
              : code.includes('LOGIN_NAME_ALREADY_SET') ? 'Tài khoản đã có nickname. Vui lòng tải lại trạng thái.'
              : 'Chưa xác nhận tạo nickname. Vui lòng tải lại trạng thái trước khi thử lại.',true);
          } finally {
            saving=false;
            if (state.session?.user?.id===actor) state.writeBusy=false;
            if (current() && !claimed) input.disabled=submit.disabled=false;
          }
        });
      }

      // WP-C9A: one read-only Audit component for ADMIN/exact delegated capability.
      function auditWorkspace(root) {
        if (!canViewAudit()) return;
        const actor = state.session?.user?.id, generation = state.generation;
        const current = () => root.isConnected && state.session?.user?.id === actor &&
          state.generation === generation && canViewAudit();
        let offset = 0, busy = false, revision = 0, opened = false;
        let readPage = () => {};
        const filters = {}, controls = [];
        actionAccordion({root, title: 'Lịch sử thao tác', semantic: 'info',
          onOpen: () => { if (!opened) { opened = true; readPage(); } },
          render(body) {
            body.append(el('p', 'Xem lịch sử thao tác theo ngày, người thực hiện và nhóm dữ liệu.', 'muted'));
            const form = el('form');
            const grid = el('div', null, 'form-grid');
            const field = (key, label, type, values = null) => {
              const group = el('div', null, 'form-group'), caption = el('label', label);
              const input = el(values ? 'select' : 'input', null, 'field');
              input.id = 'audit-' + key; caption.htmlFor = input.id;
              if (!values) input.type = type;
              else { const all = el('option', 'Tất cả'); all.value = ''; input.append(all);
                values.forEach(value => { const option = el('option', value); option.value = value; input.append(option); }); }
              group.append(caption, input); grid.append(group); filters[key] = input; controls.push(input);
            };
            field('from', 'Từ ngày', 'date'); field('to', 'Đến ngày', 'date');
            field('actor', 'Actor ID (không bắt buộc)', 'text');
            field('action', 'Loại thao tác', null, ['RECORD_RATING_ADJUSTMENT', 'CORRECT_RATING_ADJUSTMENT',
              'REBUILD_RATINGS', 'PLAYER_STATUS_CHANGED', 'PLAYER_HARD_DELETED',
              'RECORD_FUND_PAYMENT', 'REFUND_FUND_PAYMENT', 'RECORD_MEMBER_FUND_PAYMENT', 'OTHER']);
            field('table', 'Nhóm dữ liệu', null, ['players','matches','rating_events','rating_adjustments',
              'fund_payments','fund_transactions','fund_contributions','tournaments',
              'tournament_registrations','tournament_payments','profiles','OTHER']);
            const apply = el('button', 'Lọc lịch sử', 'btn primary'); apply.type = 'submit'; controls.push(apply);
            const clear = button('Xóa bộ lọc', () => { Object.values(filters).forEach(input => { input.value = ''; }); offset = 0; readPage(); });
            const retry = button('Tải lại', () => readPage()); controls.push(clear, retry);
            const actions = el('div', null, 'form-actions'); actions.append(apply, clear, retry);
            form.append(grid, actions); body.append(form);
            const message = el('div'); message.hidden = true; body.append(message);
            const records = el('div', null, 'structured-list audit-records'); body.append(records);
            const pager = el('div', null, 'form-actions');
            const previous = button('← Trước', () => { offset = Math.max(0, offset - 30); readPage(); });
            const next = button('Sau →', () => { offset += 30; readPage(); });
            const page = el('span', 'Chưa tải lịch sử', 'muted'); pager.append(previous, page, next); body.append(pager);
            previous.disabled = next.disabled = true;
            form.addEventListener('submit', event => { event.preventDefault(); offset = 0; readPage(); });
            async function readPageImpl() {
              if (!current() || busy) return;
              const actorFilter = filters.actor.value.trim();
              if (actorFilter && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorFilter)) {
                notice(message, 'Actor ID cần là UUID hợp lệ.', true); return;
              }
              const from = filters.from.value ? new Date(filters.from.value + 'T00:00:00+07:00') : null;
              const to = filters.to.value ? new Date(new Date(filters.to.value + 'T00:00:00+07:00').getTime() + 86400000) : null;
              if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from >= to)) {
                notice(message, 'Khoảng ngày không hợp lệ.', true); return;
              }
              busy = true; const request = ++revision;
              controls.forEach(control => { control.disabled = true; }); previous.disabled = next.disabled = true;
              body.setAttribute('aria-busy', 'true'); notice(message, 'Đang tải lịch sử…');
              try {
                const {data, error} = await client.rpc('get_audit_events', {p_limit: 30, p_offset: offset,
                  p_from: from?.toISOString() || null, p_to: to?.toISOString() || null,
                  p_actor_id: actorFilter || null, p_action: filters.action.value || null,
                  p_table_name: filters.table.value || null});
                if (error) throw error;
                if (!current() || request !== revision) return;
                const fields = ['id','created_at','actor_id','action','entity_type','target_id','summary'];
                if (!data || !Array.isArray(data.events) || data.events.length > 30 || data.page_size !== 30 ||
                    data.offset !== offset || typeof data.has_more !== 'boolean' || data.events.some(item =>
                      !item || typeof item !== 'object' || Object.keys(item).some(key => !fields.includes(key)) ||
                      typeof item.id !== 'string' || typeof item.summary !== 'string'))
                  throw new Error('AUDIT_READ_MODEL_INVALID');
                records.replaceChildren();
                data.events.forEach(item => {
                  const card = el('article', null, 'record-card');
                  card.append(el('strong', item.summary), el('p', date(item.created_at) + ' • ' + item.entity_type, 'muted'));
                  const detail = el('details'), caption = el('summary', 'Metadata'); detail.append(caption);
                  ['id','actor_id','target_id','action'].forEach(key => detail.append(el('p', key + ': ' + (item[key] || '—'), 'muted')));
                  card.append(detail); records.append(card);
                });
                if (!data.events.length) records.append(el('p', 'Không có thao tác trong bộ lọc này.', 'muted'));
                page.textContent = 'Trang ' + (Math.floor(offset / 30) + 1);
                previous.disabled = offset === 0; next.disabled = !data.has_more || offset + 30 > 10000;
                notice(message, 'Đã tải ' + data.events.length + ' thao tác.');
              } catch (error) {
                if (current() && request === revision) notice(message,
                  error?.code === 'PGRST202' ? 'Backend lịch sử thao tác chưa sẵn sàng trên môi trường này. Vui lòng liên hệ ADMIN.' : explain(error), true);
              } finally {
                busy = false;
                if (current()) { controls.forEach(control => { control.disabled = false; }); body.removeAttribute('aria-busy'); }
              }
            }
            readPage = readPageImpl;
          }
        });
      }

      function admin() {
        const root = el('div', null, 'account-ui');
        $('content').append(root);
        root.append(el('p', isAdmin()
          ? 'Thông tin tài khoản và các thao tác quản trị.'
          : 'Thông tin cá nhân và bảo mật tài khoản.', 'muted account-subtitle'));
        const p = panel(isAdmin() ? 'Tài khoản của bạn' : 'Tài khoản của tôi', root);
        p.classList.add('account-self');
        const identity = el('div', null, 'account-identity');
        identity.append(el('h3', raw(state.profile.full_name), 'account-name'));
        const statuses = el('div', null, 'account-statuses');
        statuses.append(badge(state.profile.role),
          badge(state.profile.is_active ? 'ACTIVE' : 'INACTIVE'));
        identity.append(statuses);
        const linked = rows('players').find(item =>
          state.profile.player_id && String(item.id) === String(state.profile.player_id));
        identity.append(el('p', state.profile.player_id
          ? 'Đã liên kết VĐV' + (linked ? ': ' + raw(linked.full_name) : '')
          : 'Chưa liên kết VĐV', 'account-link muted'));
        identity.append(el('p', state.session.user.email || 'Chưa có thông tin email', 'account-email muted'));
        p.append(identity);
        if (canViewAudit()) auditWorkspace(root);

        if (!isAdmin()) {
          // IAM04-B MEMBER SELF PROFILE V1
          if (upper(state.profile?.role) !== 'MEMBER') {
            return;
          }

          memberPersonalSummary(p, linked);
          const selfActions = el('section', null, 'workflow-section workflow-actions');
          selfActions.append(el('h2', 'Thao tác', 'workflow-section-heading'));
          root.append(selfActions);
          accountAction(selfActions, 'Đổi mật khẩu', accountPassword);
          accountAction(selfActions, 'Đăng nhập & nickname', memberNickname);

          const playerId = state.profile?.player_id;
          const player = rows('players').find(
            item => playerId && String(item.id) === String(playerId)
          );
          const message = el('div', null, 'notice');
          message.hidden = true;
          message.setAttribute('role', 'status');
          p.append(message);

          if (!player || state.errors.players ||
              !Object.prototype.hasOwnProperty.call(player, 'phone') ||
              !Object.prototype.hasOwnProperty.call(player, 'date_of_birth')) {
            notice(message,
              'Chưa tải đủ hồ sơ VĐV của bạn. Vui lòng tải lại hoặc liên hệ ADMIN để kiểm tra liên kết tài khoản.',
              true);
            return;
          }

          const form = el('form');
          const grid = el('div', null, 'form-grid');
          const makeInput = (id, label, type, value) => {
            const group = el('div', null, 'form-group');
            const caption = el('label', label);
            caption.htmlFor = id;
            const input = el('input', null, 'field');
            input.id = id;
            input.name = id;
            input.type = type;
            input.value = value == null ? '' : String(value);
            group.append(caption, input);
            grid.append(group);
            return input;
          };
          const nameInput = makeInput('member-full-name', 'Họ và tên', 'text', player.full_name);
          nameInput.required = true;
          nameInput.autocomplete = 'name';
          const phoneInput = makeInput('member-phone', 'Số điện thoại', 'tel', player.phone);
          phoneInput.autocomplete = 'tel';
          const birthInput = makeInput('member-date-of-birth', 'Ngày sinh', 'date', player.date_of_birth);
          const today = new Date();
          birthInput.max = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
            .toISOString().slice(0, 10);
          const actions = el('div', null, 'form-actions');
          const submit = el('button', 'Lưu thông tin', 'btn primary');
          submit.type = 'submit';
          const controls = [nameInput, phoneInput, birthInput, submit];
          controls.forEach(input => { input.disabled = state.writeBusy; });
          actions.append(submit);
          form.append(grid, actions);
          p.append(form);

          form.addEventListener('submit', async event => {
            event.preventDefault();
            if (state.writeBusy || state.busy) return;
            if (upper(state.profile?.role) !== 'MEMBER' ||
                state.profile?.is_active !== true ||
                state.profile?.player_id !== playerId) return;
            const fullName = nameInput.value.trim();
            if (!fullName) {
              notice(message, 'Vui lòng nhập họ và tên.', true);
              nameInput.focus();
              return;
            }
            if (!form.reportValidity()) return;
            const sessionUserId = state.session?.user.id;
            state.writeBusy = true;
            controls.forEach(input => { input.disabled = true; });
            submit.textContent = 'Đang lưu…';
            notice(message, '');
            let saved = false;
            try {
              const { data, error } = await client.rpc('update_my_member_profile', {
                p_full_name: fullName,
                p_phone: phoneInput.value.trim() || null,
                p_date_of_birth: birthInput.value || null
              });
              if (error) throw error;
              if (data?.success !== true) {
                throw new Error('Máy chủ chưa xác nhận cập nhật hồ sơ.');
              }
              saved = true;
              if (state.session?.user.id !== sessionUserId) return;
              await load();
            } catch (error) {
              if (state.session?.user.id === sessionUserId) {
                notice(message.isConnected ? message : $('global-message'),
                  (saved ? 'Đã lưu nhưng chưa tải lại được hồ sơ. ' : 'Không lưu được hồ sơ. ') + explain(error),
                  true);
              }
            } finally {
              state.writeBusy = false;
              controls.forEach(input => { input.disabled = false; });
              submit.textContent = 'Lưu thông tin';
              if (saved && state.session?.user.id === sessionUserId) {
                render();
                const refreshed = state.profile && !state.errors.players &&
                  state.profile.full_name === fullName;
                notice($('global-message'),
                  refreshed ? 'Đã cập nhật thông tin cá nhân.' :
                    'Đã lưu thông tin. Dữ liệu tải lại chưa đầy đủ; vui lòng tải lại trang.',
                  !refreshed, !!refreshed);
              }
            }
          });
          return;
        }

        const memberWorkspace = el('section', null, 'workflow-section account-member-workspace');
        memberWorkspace.append(el('h2', 'Quản lý thành viên', 'workflow-section-heading'));
        root.append(memberWorkspace);
        accountAction(memberWorkspace, 'Thành viên', adminMemberLifecycle, 'info');

        const adminActions = el('section', null, 'workflow-section workflow-actions');
        adminActions.append(el('h2', 'Thao tác', 'workflow-section-heading'));
        root.append(adminActions);
        accountAction(adminActions, 'Đổi mật khẩu', accountPassword);
        accountAction(adminActions, 'Tạo tài khoản thành viên', adminCreateMember, 'success');
        accountAction(adminActions, 'Xác nhận email tài khoản', adminAccountVerification);
        accountAction(adminActions, 'Cấu hình hệ thống', adminSystemConfig, 'neutral');
        accountAction(adminActions, 'Sinh nhật thành viên', adminBirthdayReport, 'neutral');
        accountAction(adminActions, 'Dữ liệu cấu hình tham khảo', referenceRoot => {
        sources(
          referenceRoot,
          [
            'rating_settings',
            'rating_match_weights',
            'fund_rules'
          ]
        );

        settings(
          referenceRoot,
          'rating_settings'
        );

        settings(
          referenceRoot,
          'rating_match_weights'
        );

        settings(
          referenceRoot,
          'fund_rules'
        );
        }, 'neutral');
      }


      // PERM01D D5: ADMIN authority is independent of delegated capabilities.
      function adminMemberPermissions(root, selected = null, afterChange = null) {
        if (!isAdmin()) return;
        const actor = state.session?.user?.id;
        const generation = state.generation;
        const current = () => root.isConnected && isAdmin() &&
          state.session?.user?.id === actor && state.generation === generation;
        const capabilities = [
          ['can_approve_matches', 'Duyệt / quản lý trận đấu'],
          ['can_manage_tournaments', 'Quản lý giải đấu'],
          ['can_collect_tournament_fee', 'Thu phí giải đấu'],
          ['can_manage_fund', 'Quản lý quỹ'],
          ['can_collect_fund', 'Thu quỹ'],
          ['can_manage_members', 'Quản lý thành viên'],
          ['can_manage_players', 'Quản lý VĐV'],
          ['can_manage_player_lifecycle', 'Quản lý vòng đời VĐV'],
          ['can_adjust_rating', 'Điều chỉnh Rating'],
          ['can_view_audit', 'Xem Audit']
        ];
        const section = panel('Quản lý quyền thành viên', root);
        section.classList.add('member-permissions');
        section.append(el('p',
          'Điều chỉnh Rating mở workflow tăng/giảm điểm tại VĐV; Xem Audit mở lịch sử metadata an toàn tại Tài khoản. Sửa Rating ban đầu vẫn chỉ dành cho ADMIN.',
          'notice'));
        const message = el('div');
        message.hidden = true;
        message.setAttribute('role', 'status');
        const directory = el('div');
        const editor = el('div', null, 'member-permission-editor');
        const paging = el('div', null, 'form-actions');
        const pageLabel = el('span', '', 'muted');
        let members = [], offset = 0, reading = false, saving = false, loaded = false;
        const pageSize = 50;
        const reload = button('Tải lại danh sách', () => loadPage(offset));
        const previous = button('Trang trước', () => loadPage(Math.max(0, offset - pageSize)));
        const next = button('Trang sau', () => loadPage(offset + pageSize));
        paging.append(reload, previous, next, pageLabel);
        section.append(...(selected ? [message, editor] : [paging, message, directory, editor]));

        function sync() {
          const blocked = reading || saving || !current();
          reload.disabled = blocked;
          previous.disabled = blocked || offset === 0;
          next.disabled = blocked || !loaded || members.length < pageSize;
          directory.querySelectorAll('button, select').forEach(control => { control.disabled = blocked; });
        }

        function showMemberPermissions(member) {
          if (!current() || !members.includes(member)) return;

          editor.replaceChildren();

          const summary = el('div', null, 'member-permission-summary');

          const head = accountMemberSummary(member, capabilities.filter(([key]) => member[key] === true).length);

          const flags = el('div', null, 'member-permission-summary-flags');

          capabilities.forEach(([key, label]) => {
            const item = el('div', null, 'member-permission-summary-item');
            item.append(
              el('span', label),
              badge(member[key] === true ? 'Có quyền' : 'Không')
            );
            flags.append(item);
          });

          const actions = el('div', null, 'form-actions');
          actions.append(button('Chỉnh quyền', () => editMember(member), 'btn primary'));

          summary.append(...(selected ? [] : [head]), flags, actions);
          editor.append(summary);
        }

        function editMember(member) {
          if (!current() || reading || saving || !members.includes(member)) return;
          editor.replaceChildren();
          const form = el('form');
          form.append(el('h3', 'Chỉnh quyền: ' + (member.full_name || member.login_name || member.profile_id)));
          if (member.is_active !== true) {
            form.append(el('p', 'Thành viên ngừng hoạt động: chỉ được thu hồi quyền hiện có, không được cấp thêm quyền.', 'notice'));
          }
          const grid = el('div', null, 'form-grid');
          const checks = capabilities.map(([key, label]) => {
            const caption = el('label', null, 'permission-option');
            const input = el('input');
            input.type = 'checkbox';
            input.name = key;
            input.checked = member[key] === true;
            input.disabled = member.is_active !== true && member[key] !== true;
            caption.append(input, el('span', label));
            grid.append(caption);
            return [key, input];
          });
          const reasonGroup = el('div', null, 'form-group');
          const reasonLabel = el('label', 'Lý do thay đổi quyền');
          const reason = el('textarea', null, 'field');
          reason.id = 'member-permissions-reason';
          reasonLabel.htmlFor = reason.id;
          reason.required = true;
          reason.maxLength = 1000;
          reason.rows = 3;
          reasonGroup.append(reasonLabel, reason);
          const submit = el('button', 'Lưu quyền', 'btn primary');
          submit.type = 'submit';
          const cancel = button('Đóng chỉnh sửa', () => showMemberPermissions(member));
          const actions = el('div', null, 'form-actions');
          actions.append(submit, cancel);
          form.append(grid, reasonGroup, actions);
          editor.append(form);
          form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!isAdmin()) return;
            if (!current() || reading || saving || state.writeBusy || state.busy) return;
            if (!members.includes(member) || member.profile_id === actor ||
                (member.role && upper(member.role) !== 'MEMBER')) return;
            const patch = {};
            for (const [key, input] of checks) {
              if (member.is_active !== true && member[key] !== true && input.checked) {
                notice(message, 'Thành viên ngừng hoạt động chỉ được thu hồi quyền.', true);
                return;
              }
              if (input.checked !== (member[key] === true)) patch[key] = input.checked;
            }
            if (!Object.keys(patch).length) {
              notice(message, 'Không có thay đổi quyền để lưu.');
              return;
            }
            const reasonText = reason.value.trim();
            if (!reasonText || reasonText.length > 1000) {
              notice(message, 'Vui lòng nhập lý do thay đổi quyền (tối đa 1.000 ký tự).', true);
              reason.focus();
              return;
            }
            saving = true;
            state.writeBusy = true;
            sync();
            form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
            submit.textContent = 'Đang lưu…';
            notice(message, 'Đang lưu quyền thành viên…');
            let saved = false;
            try {
              const { data, error } = await query(client.rpc('admin_update_member_permissions', {
                p_profile_id: member.profile_id, p_capabilities: patch, p_reason: reasonText
              }));
              if (error) throw error;
              if (data?.success !== true) throw new Error('Unconfirmed permission update');
              saved = true;
              if (!current()) return;
              editor.replaceChildren();
              const refreshed = await loadPage(offset, member.profile_id, true);
              if (!current()) return;
              notice(message, refreshed
                ? (data.changed === false ? 'Quyền đã ở trạng thái yêu cầu. Đã tải lại danh sách.' : 'Đã lưu quyền và tải lại danh sách.')
                : 'Đã lưu quyền nhưng chưa tải lại được danh sách. Vui lòng bấm Tải lại danh sách.', !refreshed, refreshed);
            } catch (error) {
              if (current()) notice(message, 'Không lưu được quyền. ' +
                (error?.code === '22023'
                  ? 'Kiểm tra lý do và tải lại danh sách; thành viên có thể đã đổi trạng thái hoặc không còn là đối tượng được chỉnh quyền.'
                  : explain(error)), true);
            } finally {
              state.writeBusy = false;
              saving = false;
              if (current()) {
                if (!saved) {
                  reason.disabled = submit.disabled = cancel.disabled = false;
                  checks.forEach(([key, input]) => {
                    input.disabled = member.is_active !== true && member[key] !== true;
                  });
                  submit.textContent = 'Lưu quyền';
                }
                sync();
                if (saved && afterChange) afterChange();
              }
            }
          });
        }

        async function loadPage(newOffset = 0, selectedId = null, afterSave = false) {
          if (!current() || reading || (saving && !afterSave)) return false;
          reading = true;
          loaded = false;
          editor.replaceChildren();
          directory.replaceChildren();
          notice(message, 'Đang tải quyền thành viên…');
          sync();
          try {
            const { data, error } = await query(client.rpc('get_admin_member_permissions', {
              p_limit: pageSize, p_offset: newOffset
            }));
            if (error) throw error;
            if (!Array.isArray(data)) throw new Error('Invalid permission directory');
            if (!current()) return false;
            members = data.filter(member => member.profile_id && member.profile_id !== actor &&
              (!member.role || upper(member.role) === 'MEMBER'));
            offset = newOffset;
            loaded = true;
            pageLabel.textContent = 'Trang ' + (Math.floor(offset / pageSize) + 1);
            if (selected) {
              const match = members.find(m => m.profile_id === selected.profile_id);
              if (match) { Object.assign(match, {membership_status:selected.membership_status,player_status:selected.player_status}); reading = false; if (afterSave) showMemberPermissions(match); else editMember(match); notice(message, ''); return true; }
              if (data.length === pageSize) { reading = false; return await loadPage(newOffset + pageSize, selectedId, afterSave); }
              throw new Error('Thành viên không còn trong danh sách quyền');
            }
            const select = el('select', null, 'field');
            select.id = 'member-permissions-target';
            const label = el('label', 'Chọn thành viên để chỉnh quyền');
            label.htmlFor = select.id;
            const placeholder = el('option', 'Chọn thành viên');
            placeholder.value = '';
            select.append(placeholder);
            members.forEach(member => {
              const option = el('option', (member.full_name || member.login_name || member.profile_id) +
                (member.login_name ? ' • ' + member.login_name : '') +
                ' • Tài khoản: ' + (member.is_active === true ? 'Đang hoạt động' : 'Ngừng hoạt động'));
              option.value = member.profile_id;
              select.append(option);
            });
            select.addEventListener('change', () => {
              const member = members.find(item => item.profile_id === select.value);
              if (member) showMemberPermissions(member);
              else if (!saving) editor.replaceChildren();
            });
            directory.append(label, select);
            if (selectedId) {
              select.value = selectedId;
              const selectedMember = members.find(item => item.profile_id === selectedId);
              if (selectedMember) showMemberPermissions(selectedMember);
            }
            notice(message, members.length ? '' : 'Không có thành viên trong trang này.');
            return true;
          } catch (error) {
            if (current()) {
              members = [];
              notice(message, 'Không tải được danh sách quyền. ' + explain(error), true);
            }
            return false;
          } finally {
            reading = false;
            if (current()) sync();
          }
        }
        sync();
        if (selected) { void loadPage(0); return; }
        root.parentElement.addEventListener('toggle', () => {
          if (root.parentElement.open && !loaded && !reading && !saving) loadPage(offset);
        });
      }


      // IAM05C: ADMIN-only MEMBER account lifecycle UI.
      // IAM05D: lazy ADMIN signup review. No business writes outside approval RPCs.
      function membershipLabel(member) {
        return ({ PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' })[member.membership_status]
          || 'Không xác định trạng thái duyệt';
      }

      function accountMemberSummary(member, permissionCount = member.delegated_permissions_count) {
        const box = el('div', null, 'acc03-summary');
        box.append(el('strong', member.full_name || member.login_name || 'Chưa có họ tên'),
          el('p', member.login_name ? '@' + member.login_name : 'Chưa có nickname', 'muted'));
        const grid = el('div', null, 'member-lifecycle-summary-grid');
        const item = (label, text, tone = '') => {
          const row = el('div', null, 'member-lifecycle-summary-item');
          row.append(el('span', label), el('strong', text, tone ? 'badge acc03-' + tone : ''));
          grid.append(row);
        };
        const group = text => grid.append(el('h4', text, 'acc03-group'));
        group('Tài khoản');
        item('Email', member.email || 'Chưa được cung cấp trong danh sách');
        item('Trạng thái duyệt', membershipLabel(member),
          ({PENDING:'pending',APPROVED:'success',REJECTED:'danger'})[member.membership_status] || 'neutral');
        item('Tài khoản', member.is_active === true ? 'Đang hoạt động' : member.is_active === false ? 'Ngừng hoạt động' : 'Chưa có dữ liệu',
          member.is_active === true ? 'success' : 'neutral');
        // Both IAM directories contain MEMBER records only; no role is inferred from activation.
        item('Vai trò', member.role === 'ADMIN' ? 'Quản trị viên' : 'Thành viên', 'info');
        group('Hồ sơ VĐV');
        item('Trạng thái VĐV', member.player_status === 'ACTIVE' ? 'Đang tham gia' : member.player_status === 'INACTIVE' ? 'Ngừng tham gia' : 'Chưa có dữ liệu',
          member.player_status === 'ACTIVE' ? 'success' : 'neutral');
        item('Liên kết VĐV', member.player_id ? 'Đã liên kết VĐV' : 'Chưa liên kết VĐV', 'info');
        if (member.current_rating != null) item('Rating hiện tại', Number(member.current_rating).toFixed(3));
        group('Quyền');
        item('Quyền được cấp', permissionCount == null ? 'Chưa có dữ liệu' : String(permissionCount) + ' / 10');
        const technical = el('details', null, 'acc03-technical');
        technical.append(el('summary', 'Chi tiết kỹ thuật'), el('p', 'Profile ID: ' + (member.profile_id || '—')),
          el('p', 'Player ID: ' + (member.player_id || '—')));
        box.append(grid, technical);
        return box;
      }

      function memberApprovalStatus(root) {
        const pending = state.profile?.membership_status === 'PENDING';
        const box = panel(pending ? 'Tài khoản đang chờ ADMIN duyệt' : 'Hồ sơ đăng ký đã bị từ chối', root);
        box.classList.add('membership-status-panel');
        const statusBadge=badge(pending ? 'PENDING' : 'REJECTED');
        if (!pending) statusBadge.textContent='Đã từ chối';
        box.append(statusBadge);
        box.append(el('p', pending
          ? 'Hồ sơ đăng ký đã được tiếp nhận. Bạn có thể sử dụng nghiệp vụ câu lạc bộ sau khi ADMIN duyệt. Xác nhận email và duyệt thành viên là hai bước riêng biệt.'
          : 'Vui lòng liên hệ quản trị viên để được hỗ trợ. Hồ sơ và liên kết VĐV của bạn được giữ nguyên. Hiện chưa có chức năng gửi lại hồ sơ.', 'muted'));
        const actions = el('div', null, 'form-actions');
        actions.append(button('Kiểm tra lại trạng thái', () => load()));
        box.append(actions);
      }

      function adminMemberApproval(root, selected = null) {
        if (!isAdmin()) return;
        const actor = state.profile.id;
        const gen = state.generation;
        const current = () => root.isConnected && isAdmin() &&
          state.profile?.id === actor && state.generation === gen;
        const section = panel('Hồ sơ chờ duyệt', root);
        const message = el('div');
        message.hidden = true;
        message.setAttribute('role', 'status');
        const directory = el('div');
        const detail = el('div', null, 'member-lifecycle-detail');
        const paging = el('div', null, 'form-actions');
        const pageLabel = el('span', '', 'muted');
        let members = [], offset = 0, reading = false, saving = false, loaded = false, request = 0;
        const size = 25;
        const reload = button('Tải lại danh sách', () => loadPage(offset));
        const previous = button('Trang trước', () => loadPage(Math.max(0, offset - size)));
        const next = button('Trang sau', () => loadPage(offset + size));
        paging.append(reload, previous, next, pageLabel);
        section.append(...(selected ? [message, detail] : [paging, message, directory, detail]));
        function sync() {
          section.querySelectorAll('button, select, input, textarea').forEach(control => {
            control.disabled = reading || saving || !current();
          });
          previous.disabled ||= offset === 0;
          next.disabled ||= !loaded || members.length < size;
        }
        function show(member) {
          if (!current() || saving || reading || !members.includes(member)) return;
          detail.replaceChildren();
          const grid = el('div', null, 'member-lifecycle-summary-grid');
          const fields = [
            ['Điện thoại', member.phone],
            ['Ngày sinh', member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString('vi-VN') : null],
            ['Ngày đăng ký', date(member.created_at)],
            ['Rating khởi tạo', member.initial_rating == null ? null : Number(member.initial_rating).toFixed(3)],
          ];
          for (const [label, value] of fields) {
            const item = el('div', null, 'member-lifecycle-summary-item');
            item.append(el('span', label), el('strong', value == null || value === '' ? 'Chưa có' : String(value)));
            grid.append(item);
          }
          if (selected && !selected.email && member.email) { const emailRow=el('div',null,'member-lifecycle-summary-item'); emailRow.append(el('span','Email đăng ký'),el('strong',member.email)); grid.prepend(emailRow); }
          detail.append(...(selected ? [] : [accountMemberSummary(member)]), grid, el('p', 'Duyệt hoặc từ chối chỉ thay đổi quyền sử dụng tài khoản; giữ nguyên Player ID, Rating và lịch sử.', 'muted'));
          const rejectBox = el('details', null, 'app-action app-action-danger');
          rejectBox.append(el('summary', 'Từ chối', 'app-action-toggle'));
          const form = el('form', null, 'app-action-body');
          const reason = el('textarea', null, 'field');
          reason.id = 'member-signup-reject-reason';
          reason.required = true;
          reason.maxLength = 1000;
          reason.rows = 3;
          const label = el('label', 'Lý do từ chối (ghi chú nội bộ, tối đa 1000 ký tự)');
          label.htmlFor = reason.id;
          const reject = button('Xác nhận từ chối', () => {}, 'btn danger');
          reject.type = 'submit';
          const rejectActions = el('div', null, 'form-actions');
          rejectActions.append(reject);
          form.append(label, reason, rejectActions);
          form.addEventListener('submit', event => {
            event.preventDefault();
            const text = reason.value.trim();
            if (!text || text.length > 1000) {
              notice(message, 'Nhập lý do từ chối từ 1 đến 1000 ký tự.', true);
              return;
            }
            void decide(member, 'reject', text);
          });
          rejectBox.append(form);
          const actions = el('div', null, 'form-actions');
          actions.append(button('Duyệt thành viên', () => decide(member, 'approve'), 'btn membership-approve'));
          detail.append(actions, rejectBox);
        }
        async function decide(member, decision, reason) {
          if (!current() || !loaded || reading || saving || state.writeBusy || !members.includes(member)) return;
          saving = true;
          state.writeBusy = true;
          sync();
          notice(message, 'Đang xử lý hồ sơ…');
          let success = false;
          try {
            const args = { p_profile_id: member.profile_id };
            if (decision === 'reject') args.p_reason = reason;
            const { data, error } = await client.rpc('admin_' + decision + '_member_signup', args);
            if (error) throw error;
            if (data?.success !== true) throw new Error('APPROVAL_FAILED');
            if (!current()) return;
            success = true;
          } catch (error) {
            if (current()) notice(message, String(error?.message || '').includes('SIGNUP_NOT_PENDING')
              ? 'Hồ sơ đã được xử lý ở phiên khác. Hãy tải lại danh sách.'
              : 'Không xử lý được hồ sơ. Hãy tải lại trạng thái trước khi thử lại.', true);
          } finally {
            saving = false;
            if (state.generation === gen && state.profile?.id === actor) state.writeBusy = false;
            if (current()) {
              // Remove a potentially stale decision form even after a network error.
              detail.replaceChildren();
              directory.replaceChildren();
              loaded = false;
              sync();
            }
          }
          if (success && current()) {
            root.closest('.account-ui')?.dispatchEvent(new Event('membership-changed'));
            const refreshed = await loadPage(offset);
            if (current() && refreshed) notice(message, decision === 'approve'
              ? 'Đã duyệt thành viên.' : 'Đã từ chối yêu cầu đăng ký.', false, true);
          }
        }
        async function loadPage(newOffset) {
          if (!current() || reading || saving) return false;
          const id = ++request;
          reading = true;
          loaded = false;
          members = [];
          directory.replaceChildren();
          detail.replaceChildren();
          notice(message, 'Đang tải hồ sơ chờ duyệt…');
          sync();
          try {
            const { data, error } = await client.rpc('get_admin_pending_member_signups', { p_limit: size, p_offset: newOffset });
            if (error) throw error;
            if (!current() || request !== id) return false;
            if (!Array.isArray(data)) throw new Error('INVALID_DIRECTORY');
            members = data;
            offset = newOffset;
            loaded = true;
            pageLabel.textContent = 'Trang ' + (Math.floor(offset / size) + 1);
            if (selected) {
              const match = members.find(m => m.profile_id === selected.profile_id);
              if (match) { reading = false; show(match); notice(message, ''); return true; }
              if (data.length === size) { reading = false; return await loadPage(newOffset + size); }
              detail.append(el('p', 'Hồ sơ đã được xử lý. Tải lại danh sách để xem trạng thái mới.', 'muted'));
              return true;
            }
            const select = el('select', null, 'field');
            select.id = 'member-signup-target';
            const label = el('label', 'Chọn hồ sơ chờ duyệt');
            label.htmlFor = select.id;
            const placeholder = el('option', 'Chọn hồ sơ');
            placeholder.value = '';
            select.append(placeholder);
            for (const member of members) {
              const option = el('option', (member.full_name || 'Thành viên') + ' • ' + (member.login_name || 'Chưa có nickname'));
              option.value = member.profile_id;
              select.append(option);
            }
            select.addEventListener('change', () => {
              const selected = members.find(member => member.profile_id === select.value);
              if (selected) show(selected); else detail.replaceChildren();
            });
            directory.append(label, select);
            notice(message, members.length ? '' : 'Không có hồ sơ chờ duyệt trong trang này.');
            return true;
          } catch {
            if (current()) notice(message, 'Không tải được hồ sơ chờ duyệt. Vui lòng thử lại.', true);
            return false;
          } finally {
            reading = false;
            if (current()) sync();
          }
        }
        if (selected) { void loadPage(0); return; }
        root.parentElement.addEventListener('toggle', () => {
          if (root.parentElement.open && !loaded) void loadPage(offset);
        });
        sync();
      }

      function accountMemberPageRows(members, search, membership, activation) {
        const term = search.trim().toLocaleLowerCase('vi');
        return members.filter(m => (!membership || m.membership_status === membership) &&
          (!activation || String(m.is_active) === activation) &&
          (!term || [m.full_name,m.login_name,m.email].filter(Boolean)
            .some(v => String(v).toLocaleLowerCase('vi').includes(term))));
      }

      function adminMemberLifecycle(root) {
        if (!isAdmin()) return;

        const actor = state.session?.user?.id;
        const generation = state.generation;
        const current = () =>
          root.isConnected &&
          isAdmin() &&
          state.session?.user?.id === actor &&
          state.generation === generation;

        const section = panel(
          'Thành viên',
          root
        );

        section.classList.add('member-lifecycle');

        const message = el('div');
        message.hidden = true;
        message.setAttribute('role', 'status');

        const directory = el('div');
        const detail = el(
          'div',
          null,
          'member-lifecycle-detail'
        );

        const paging = el(
          'div',
          null,
          'form-actions'
        );

        const pageLabel = el(
          'span',
          '',
          'muted'
        );

        let members = [];
        let pendingMembers = [];
        let selectedProfileId = null;
        let offset = 0;
        let reading = false;
        let saving = false;
        let loaded = false;
        let membershipRevision = 0;
        let deletionRecoveryPending = false;

        const pageSize = 25;
        const queue = el('section', null, 'acc04-queue');
        queue.hidden = true;
        const toolbar = el('div', null, 'acc04-toolbar');
        const search = el('input', null, 'field');
        search.type = 'search'; search.placeholder = 'Tìm tên hoặc nickname trong trang';
        search.setAttribute('aria-label', 'Tìm thành viên trong trang');
        const membershipFilter = el('select', null, 'field');
        membershipFilter.setAttribute('aria-label', 'Lọc trạng thái duyệt');
        for (const [value,label] of [['','Tất cả trạng thái duyệt'],['PENDING','Chờ duyệt'],['APPROVED','Đã duyệt'],['REJECTED','Đã từ chối']]) {
          const option=el('option',label); option.value=value; membershipFilter.append(option);
        }
        const accountFilter = el('select', null, 'field');
        accountFilter.setAttribute('aria-label', 'Lọc tài khoản');
        for (const [value,label] of [['','Tất cả tài khoản'],['true','Đang hoạt động'],['false','Ngừng hoạt động']]) {
          const option=el('option',label); option.value=value; accountFilter.append(option);
        }
        const clearFilters = button('Xóa bộ lọc', () => {
          search.value = ''; membershipFilter.value = ''; accountFilter.value = '';
          renderDirectory();
        });
        toolbar.append(search,membershipFilter,accountFilter,clearFilters);
        const resultCount = el('p', '', 'muted text-sm');
        resultCount.setAttribute('role', 'status');
        resultCount.hidden = true;
        toolbar.append(resultCount);
        const renderDirectory = () => {
          directory.replaceChildren();
          const shown=accountMemberPageRows(members,search.value,membershipFilter.value,accountFilter.value);
          for (const member of shown) {
            const row=el('article',null,'acc04-member-row');
            row.dataset.profileId = member.profile_id;
            const identity=el('div'); identity.append(el('strong',member.full_name||member.login_name||'Thành viên'),
              el('p',member.login_name ? '@'+member.login_name : 'Chưa có nickname','muted'));
            const statuses=el('div',null,'account-statuses');
            statuses.append(el('span',membershipLabel(member),'badge acc03-'+({PENDING:'pending',APPROVED:'success',REJECTED:'danger'}[member.membership_status]||'neutral')),
              el('span',member.is_active===true?'Đang hoạt động':'Ngừng hoạt động','badge acc03-'+(member.is_active===true?'success':'neutral')),
              el('span','VĐV: '+playerStatusText(member.player_status),'muted'),
              el('span',String(member.delegated_permissions_count||0)+' quyền','muted'));

            const detailToggle = button(
              selectedProfileId === member.profile_id ? 'Thu gọn' : 'Xem chi tiết',
              () => {
                if (selectedProfileId === member.profile_id && detail.parentElement === directory) {
                  selectedProfileId = null;
                  detail.replaceChildren();
                  detail.remove();
                  renderDirectory();
                  return;
                }
                showMember(member);
              },
              'btn acc04-member-detail-toggle'
            );
            detailToggle.setAttribute(
              'aria-expanded',
              String(selectedProfileId === member.profile_id)
            );

            row.append(identity,statuses,detailToggle);
            directory.append(row);

            if (selectedProfileId === member.profile_id && detail.childElementCount) {
              row.after(detail);
            }
          }

          if (selectedProfileId && !shown.some(member => member.profile_id === selectedProfileId)) {
            selectedProfileId = null;
            detail.replaceChildren();
            detail.remove();
          }

          const countText = `${shown.length} / ${members.length} thành viên trong trang hiện tại`;
          resultCount.hidden = !loaded;
          if (resultCount.textContent !== countText) resultCount.textContent = countText;
          clearFilters.disabled = !search.value && !membershipFilter.value && !accountFilter.value;
          if (!shown.length) directory.append(el('p', members.length
            ? 'Không tìm thấy kết quả trong trang hiện tại. Hãy xóa bộ lọc hoặc chuyển trang.'
            : loaded ? 'Chưa có thành viên trong trang hiện tại.'
              : 'Danh sách chưa sẵn sàng. Hãy tải lại.', 'muted'));
          sync();
        };
        search.addEventListener('input',renderDirectory);
        membershipFilter.addEventListener('change',renderDirectory);
        accountFilter.addEventListener('change',renderDirectory);


        const reload = button(
          'Tải lại danh sách',
          () => loadPage(offset)
        );

        const previous = button(
          'Trang trước',
          () => loadPage(
            Math.max(0, offset - pageSize)
          )
        );

        const next = button(
          'Trang sau',
          () => loadPage(offset + pageSize)
        );

        paging.append(
          reload,
          previous,
          next,
          pageLabel
        );

        section.append(
          queue,
          el('p','Tìm kiếm và bộ lọc áp dụng trong trang đang tải (25 thành viên).','muted'),
          toolbar,
          paging,
          message,
          directory,
          detail
        );

        function sync() {
          const blocked =
            reading ||
            saving ||
            !current();

          toolbar.querySelectorAll('input, select').forEach(c => { c.disabled = blocked || deletionRecoveryPending || state.writeBusy; });
          clearFilters.disabled = blocked || deletionRecoveryPending || state.writeBusy ||
            (!search.value && !membershipFilter.value && !accountFilter.value);
          queue.querySelectorAll('button').forEach(c => { c.disabled = blocked || deletionRecoveryPending || state.writeBusy; });
          reload.disabled = blocked || deletionRecoveryPending || state.writeBusy;
          previous.disabled =
            blocked || deletionRecoveryPending || offset === 0;
          next.disabled =
            blocked ||
            deletionRecoveryPending ||
            !loaded ||
            members.length < pageSize;

          directory
            .querySelectorAll(
              'button, select'
            )
            .forEach(control => {
              control.disabled = blocked || deletionRecoveryPending;
            });

          detail
            .querySelectorAll(
              'button, input, textarea, select'
            )
            .forEach(control => {
              if (!control.closest('.acc04-context')) control.disabled = blocked;
            });
        }

        function statusText(value) {
          return value === true
            ? 'Hoạt động'
            : 'Vô hiệu hóa';
        }

        function playerStatusText(value) {
          if (!value) return 'Không có Player';
          return upper(value) === 'ACTIVE'
            ? 'Đang tham gia'
            : 'Ngừng tham gia';
        }

        function addSummaryItem(
          container,
          label,
          value,
          badgeValue = null
        ) {
          const item = el(
            'div',
            null,
            'member-lifecycle-summary-item'
          );

          item.append(
            el(
              'span',
              label,
              'muted'
            )
          );

          const valueWrap = el(
            'strong',
            value || '—'
          );

          if (badgeValue) {
            const wrap = el(
              'div',
              null,
              'member-lifecycle-summary-value'
            );

            wrap.append(
              valueWrap,
              badge(badgeValue)
            );

            item.append(wrap);
          } else {
            item.append(valueWrap);
          }

          container.append(item);
        }

        function showMember(member) {
          if (
            !current() ||
            (!members.includes(member) && !pendingMembers.includes(member))
          ) {
            return;
          }

          if (saving || state.writeBusy || deletionRecoveryPending) return;
          selectedProfileId = member.profile_id;
          detail.replaceChildren();

          const selectedRow = Array.from(
            directory.querySelectorAll('.acc04-member-row')
          ).find(row => row.dataset.profileId === member.profile_id);

          if (selectedRow) selectedRow.after(detail);

          directory.querySelectorAll('.acc04-member-detail-toggle').forEach(control => {
            const row = control.closest('.acc04-member-row');
            const open = row?.dataset.profileId === selectedProfileId;
            control.textContent = open ? 'Thu gọn' : 'Xem chi tiết';
            control.setAttribute('aria-expanded', String(open));
          });

          const summary = el(
            'div',
            null,
            'member-lifecycle-summary'
          );

          const head = accountMemberSummary(member);

          const distinction = el(
            'p',
            'Trạng thái tài khoản và trạng thái VĐV là hai khái niệm độc lập. Vô hiệu hóa tài khoản không làm thay đổi Player ID, Rating hoặc lịch sử thi đấu.',
            'notice'
          );

          const actions = el(
            'div',
            null,
            'form-actions member-lifecycle-actions'
          );

          const lifecycleButton = button(
            member.is_active === true
              ? 'Ngừng tài khoản'
              : 'Kích hoạt lại',
            () => editLifecycle(member),
            member.is_active === true
              ? 'btn lifecycle-deactivate'
              : 'btn primary'
          );

          lifecycleButton.hidden = member.membership_status !== 'APPROVED';

          const previewButton = button(
            'Xem điều kiện xóa',
            () => previewDeletion(member)
          );

          actions.append(
            lifecycleButton,
            previewButton
          );

          const dangerZone = el('section', null, 'acc03-danger-zone');
          dangerZone.append(el('h3', 'Vùng nguy hiểm'), actions);
          summary.append(head, distinction, dangerZone);

          detail.append(summary);
          const contextual = el('div', null, 'acc04-context'); detail.append(contextual);
          const permissionActions = el('div', null, 'form-actions');
          summary.insertBefore(permissionActions, dangerZone);
          permissionActions.append(button('Chỉnh quyền', () => {
            if (!current() || saving || state.writeBusy || deletionRecoveryPending) return;
            contextual.replaceChildren();
            adminMemberPermissions(contextual, member, () => { root.closest('.account-ui')?.dispatchEvent(new Event('membership-changed')); });
          }, 'btn'));
          if (member.is_active !== true && member.membership_status === 'APPROVED') permissionActions.append(lifecycleButton);
          if (member.membership_status === 'PENDING') adminMemberApproval(contextual, member);

        }

        function editLifecycle(member) {
          if (member.membership_status !== 'APPROVED') {
            notice(message, 'Hồ sơ chưa được duyệt. Hãy sử dụng mục Duyệt thành viên mới.', true);
            return;
          }
          if (
            !current() ||
            reading ||
            saving ||
            state.writeBusy ||
            (!members.includes(member) && !pendingMembers.includes(member))
          ) {
            return;
          }

          detail.replaceChildren();

          const form = el('form');

          const activating =
            member.is_active !== true;

          form.append(
            el(
              'h3',
              activating
                ? 'Kích hoạt lại'
                : 'Ngừng tài khoản'
            )
          );

          form.append(
            el(
              'p',
              activating
                ? 'Tài khoản sẽ được phép sử dụng lại hệ thống. Các quyền ủy quyền cũ không tự khôi phục.'
                : 'Tài khoản sẽ bị chặn sử dụng hệ thống. Player ID, Rating và lịch sử nghiệp vụ được giữ nguyên; toàn bộ quyền ủy quyền sẽ bị thu hồi.',
              activating
                ? 'notice'
                : 'notice error'
            )
          );

          const reasonGroup = el(
            'div',
            null,
            'form-group'
          );

          const reasonLabel = el(
            'label',
            'Lý do'
          );

          const reason = el(
            'textarea',
            null,
            'field'
          );

          reason.id =
            'member-lifecycle-reason';

          reasonLabel.htmlFor = reason.id;
          reason.required = true;
          reason.maxLength = 1000;
          reason.rows = 3;

          reasonGroup.append(
            reasonLabel,
            reason
          );

          const submit = el(
            'button',
            activating
              ? 'Kích hoạt tài khoản'
              : 'Ngừng tài khoản',
            activating
              ? 'btn primary'
              : 'btn lifecycle-deactivate'
          );

          submit.type = 'submit';

          const cancel = button(
            'Đóng',
            () => showMember(member)
          );

          const actions = el(
            'div',
            null,
            'form-actions'
          );

          actions.append(
            submit,
            cancel
          );

          form.append(
            reasonGroup,
            actions
          );

          detail.append(form);

          form.addEventListener(
            'submit',
            async event => {
              event.preventDefault();

              if (
                !current() ||
                reading ||
                saving ||
                state.writeBusy ||
                state.busy ||
                (!members.includes(member) && !pendingMembers.includes(member))
              ) {
                return;
              }

              const reasonText =
                reason.value.trim();

              if (
                !reasonText ||
                reasonText.length > 1000
              ) {
                notice(
                  message,
                  'Vui lòng nhập lý do (tối đa 1.000 ký tự).',
                  true
                );

                reason.focus();
                return;
              }

              saving = true;
              state.writeBusy = true;
              sync();

              submit.textContent =
                activating
                  ? 'Đang kích hoạt…'
                  : 'Đang vô hiệu hóa…';

              notice(
                message,
                activating
                  ? 'Đang kích hoạt lại tài khoản…'
                  : 'Đang vô hiệu hóa tài khoản…'
              );

              let saved = false;

              try {
                const {
                  data,
                  error
                } = await query(
                  client.rpc(
                    'admin_set_member_account_active',
                    {
                      p_profile_id:
                        member.profile_id,
                      p_is_active:
                        activating,
                      p_reason:
                        reasonText
                    }
                  )
                );

                if (error) throw error;

                if (
                  data?.success !== true
                ) {
                  throw new Error(
                    'Unconfirmed lifecycle update'
                  );
                }

                saved = true;

                if (!current()) return;

                detail.replaceChildren();

                const refreshed =
                  await loadPage(
                    offset,
                    member.profile_id,
                    true
                  );

                if (!current()) return;

                notice(
                  message,
                  refreshed
                    ? (
                        data.changed === false
                          ? 'Tài khoản đã ở trạng thái yêu cầu.'
                          : activating
                            ? 'Đã kích hoạt lại tài khoản.'
                            : 'Đã vô hiệu hóa tài khoản và thu hồi quyền ủy quyền.'
                      )
                    : 'Đã lưu trạng thái nhưng chưa tải lại được danh sách. Vui lòng bấm Tải lại danh sách.',
                  !refreshed,
                  refreshed
                );
              } catch (error) {
                if (current()) {
                  notice(
                    message,
                    'Không thay đổi được trạng thái tài khoản. ' +
                      explain(error),
                    true
                  );
                }
              } finally {
                state.writeBusy = false;
                saving = false;

                if (current()) {
                  if (!saved) {
                    reason.disabled = false;
                    submit.disabled = false;
                    cancel.disabled = false;
                    submit.textContent =
                      activating
                        ? 'Kích hoạt tài khoản'
                        : 'Ngừng tài khoản';
                  }

                  if (saved && loaded) { const refreshedMember = members.find(m => m.profile_id === member.profile_id); if (refreshedMember) showMember(refreshedMember); }
                  sync();
                }
              }
            }
          );
        }

        async function previewDeletion(member) {
          if (
            !current() ||
            reading ||
            saving ||
            state.writeBusy ||
            state.busy ||
            (!members.includes(member) && !pendingMembers.includes(member))
          ) {
            return;
          }

          reading = true;
          detail.replaceChildren();

          notice(
            message,
            'Đang kiểm tra lịch sử và ràng buộc dữ liệu…'
          );

          sync();

          try {
            const {
              data,
              error
            } = await query(
              client.rpc(
                'get_admin_member_deletion_preview',
                {
                  p_profile_id:
                    member.profile_id
                }
              )
            );

            if (error) throw error;
            if (!data || typeof data !== 'object') {
              throw new Error(
                'Invalid deletion preview'
              );
            }

            if (!current()) return;

            const preview = el(
              'div',
              null,
              'member-deletion-preview'
            );

            preview.append(
              el(
                'h3',
                'Khả năng xóa: ' +
                  (
                    member.full_name ||
                    member.login_name ||
                    member.profile_id
                  )
              )
            );

            const total =
              Number(
                data.reference_total || 0
              );

            const playerTotal =
              Number(
                data.player_references?.total ||
                0
              );

            const profileTotal =
              Number(
                data.profile_references?.total ||
                0
              );

            const resultNotice = el(
              'p',
              data.hard_delete_allowed === true
                ? 'Có thể xóa vĩnh viễn nếu máy chủ xác nhận không còn dữ liệu tham chiếu. Không thể hoàn tác; việc xóa tài khoản đăng nhập có thể cần thử lại riêng.'
                : 'Không thể xóa vĩnh viễn vì có dữ liệu hoặc lịch sử tham chiếu. Có thể ngừng tài khoản.',
              data.hard_delete_allowed === true
                ? 'notice'
                : 'notice error'
            );

            const grid = el(
              'div',
              null,
              'member-lifecycle-summary-grid'
            );

            addSummaryItem(
              grid,
              'Tổng tham chiếu',
              String(total)
            );

            addSummaryItem(
              grid,
              'Theo Player',
              String(playerTotal)
            );

            addSummaryItem(
              grid,
              'Theo tài khoản',
              String(profileTotal)
            );

            addSummaryItem(
              grid,
              'Khuyến nghị',
              data.recommended_action ===
                'DEACTIVATE_ONLY'
                ? 'Chỉ vô hiệu hóa'
                : 'Ứng viên xem xét xóa'
            );

            const blockers = [];

            const collect = (
              source,
              prefix
            ) => {
              if (
                !source ||
                typeof source !== 'object'
              ) {
                return;
              }

              Object.entries(source)
                .filter(
                  ([key, value]) =>
                    key !== 'total' &&
                    Number(value) > 0
                )
                .forEach(
                  ([key, value]) => {
                    blockers.push(
                      prefix +
                      ({audit_logs:'Lịch sử thao tác',match_players:'Tham gia trận',rating_events:'Lịch sử Rating',
                        rating_adjustments:'Điều chỉnh Rating',rating_adjustment_events:'Chi tiết điều chỉnh Rating',
                        fund_contributions:'Nghĩa vụ Quỹ',fund_payments:'Thanh toán Quỹ',fund_transactions:'Thu/chi Quỹ',
                        tournament_registrations:'Đăng ký giải',tournament_payments:'Thanh toán giải',awards:'Giải thưởng',
                        fund_obligation_campaigns_created:'Đợt thu Quỹ đã tạo',fund_payments_confirmed:'Thanh toán Quỹ đã xác nhận',
                        fund_transactions_created:'Thu/chi Quỹ đã tạo',leagues_created:'Mùa giải đã tạo',matches_created:'Trận đã tạo',
                        matches_opponent_confirmed:'Trận đã xác nhận',matches_opponent_rejected:'Trận đã từ chối',
                        rating_adjustments_created:'Điều chỉnh Rating đã tạo',tournament_expense_reversals_created:'Hoàn chi giải đã tạo',
                        tournament_expenses_created:'Chi giải đã tạo',tournament_payment_refunds_created:'Hoàn phí giải đã tạo',
                        tournament_payments_confirmed:'Thanh toán giải đã xác nhận',tournaments_created:'Giải đã tạo'}[key] || 'Tham chiếu khác') +
                      ': ' +
                      value
                    );
                  }
                );
            };

            collect(
              data.player_references,
              'VĐV • '
            );

            collect(
              data.profile_references,
              'Tài khoản • '
            );

            const blockerBox = el(
              'div',
              null,
              'member-deletion-blockers'
            );

            blockerBox.append(
              el(
                'strong',
                'Dữ liệu đang giữ lịch sử'
              )
            );

            if (blockers.length) {
              const list = el('ul');

              blockers.forEach(text => {
                list.append(
                  el('li', text)
                );
              });

              blockerBox.append(list);
            } else {
              blockerBox.append(
                el(
                  'p',
                  'Chưa phát hiện dữ liệu ngăn xóa. Máy chủ sẽ kiểm tra lại khi thực hiện.',
                  'muted'
                )
              );
            }

            const actions = el(
              'div',
              null,
              'form-actions acc03-danger-zone'
            );

            actions.append(
              button(
                'Quay lại',
                () => showMember(member)
              )
            );


            if (
              data.hard_delete_allowed === true
            ) {
              // Keep identity and reason in this preview until cleanup is confirmed.
              let recoveryReason = null;
              const hardDeleteButton = button(
                'Xóa vĩnh viễn',
                async () => {
                  if (!current() || saving || state.writeBusy) return;
                  let reason = recoveryReason;
                  if (reason === null) {
                    reason = prompt('Nhập lý do xóa vĩnh viễn tài khoản ' +
                      (member.login_name || member.full_name || member.profile_id) + ':');
                    if (reason === null) return;
                    reason = reason.trim();
                    if (!reason || reason.length > 1000) {
                      notice(message, 'Lý do xóa là bắt buộc và tối đa 1000 ký tự.', true);
                      return;
                    }
                    if (!confirm('Xóa vĩnh viễn tài khoản ' +
                      (member.login_name || member.full_name || member.profile_id) +
                      '?\n\nTài khoản và VĐV liên kết sẽ bị xóa. Không thể hoàn tác.')) return;
                  }
                  saving = true;
                  state.writeBusy = true;
                  hardDeleteButton.disabled = true;
                  hardDeleteButton.textContent = 'Đang xử lý…';
                  notice(message, '');
                  try {
                    const { data: deleteData, error: deleteError } = await client.functions.invoke(
                      'admin-hard-delete-member',
                      { body: { profile_id: member.profile_id, reason } }
                    );
                    let result = deleteData;
                    if (deleteError?.context?.clone) {
                      try { result = await deleteError.context.clone().json(); } catch { /* Preserve original error. */ }
                    }
                    if (!current()) return;
                    if (result?.recovery_required === true && result?.public_cleanup_completed === true &&
                        result.profile_id === member.profile_id) {
                      recoveryReason = reason;
                      deletionRecoveryPending = true;
                      resultNotice.textContent = result.auth_cleanup_status === 'UNCONFIRMED'
                        ? 'Dữ liệu thành viên đã được xóa. Cần thử lại để xác nhận hoàn tất xóa tài khoản đăng nhập.'
                        : 'Dữ liệu thành viên đã được xóa, nhưng tài khoản đăng nhập còn cần hoàn tất cleanup.';
                      resultNotice.className = 'notice';
                      grid.hidden = true;
                      blockerBox.hidden = true;
                      // Remove return-to-member: that profile no longer exists.
                      actions.replaceChildren(hardDeleteButton);
                      notice(message, 'Chọn “Hoàn tất xóa tài khoản đăng nhập” để thử lại.');
                      return;
                    }
                    if (deleteError) throw deleteError;
                    if (result?.ok !== true) throw new Error(result?.error || 'UNKNOWN_ERROR');
                    recoveryReason = null;
                    deletionRecoveryPending = false;
                    selectedProfileId = null;
                    detail.replaceChildren();
                    await loadPage(0, null, true);
                    if (current()) notice(message, 'Đã xóa vĩnh viễn tài khoản thành công.', false, true);
                  } catch (error) {
                    if (current()) notice(message,
                      (recoveryReason !== null
                        ? 'Dữ liệu thành viên đã được xóa. Chưa xác nhận hoàn tất tài khoản đăng nhập; hãy thử lại. '
                        : 'Chưa xác nhận hoàn tất xóa tài khoản. Có thể thử lại để kiểm tra và hoàn tất. ') + explain(error), true);
                  } finally {
                    saving = false;
                    state.writeBusy = false;
                    if (current()) {
                      hardDeleteButton.disabled = false;
                      hardDeleteButton.textContent = recoveryReason !== null
                        ? 'Hoàn tất xóa tài khoản đăng nhập' : 'Xóa vĩnh viễn';
                      sync();
                    }
                  }
                },
                'btn danger'
              );

              actions.append(
                hardDeleteButton
              );
            }
preview.append(
              resultNotice,
              grid,
              blockerBox,
              actions
            );

            detail.append(preview);

            notice(message, '');
          } catch (error) {
            if (current()) {
              notice(
                message,
                'Không kiểm tra được khả năng xóa. ' +
                  explain(error),
                true
              );

              showMember(member);
            }
          } finally {
            reading = false;

            if (current()) {
              sync();
            }
          }
        }

        async function loadPage(
          newOffset = 0,
          selectedId = null,
          afterSave = false
        ) {
          if (
            !current() ||
            deletionRecoveryPending ||
            reading ||
            ((saving || state.writeBusy) && !afterSave)
          ) {
            return false;
          }

          const revision = membershipRevision;
          reading = true;
          loaded = false;
          resultCount.hidden = true;

          detail.replaceChildren();
          directory.replaceChildren();

          notice(
            message,
            'Đang tải trạng thái tài khoản…'
          );

          sync();

          try {
            const {
              data,
              error
            } = await query(
              client.rpc(
                'get_admin_member_lifecycle',
                {
                  p_limit: pageSize,
                  p_offset: newOffset
                }
              )
            );

            if (error) throw error;

            if (!Array.isArray(data)) {
              throw new Error(
                'Invalid lifecycle directory'
              );
            }

            if (!current() || revision !== membershipRevision) return false;

            members = data.filter(
              member =>
                member.profile_id &&
                member.profile_id !== actor
            );

            offset = newOffset;
            loaded = true;

            pageLabel.textContent =
              'Trang ' +
              (
                Math.floor(
                  offset / pageSize
                ) + 1
              );

            renderDirectory();
            const keepId = selectedId || selectedProfileId;
            const chosen = members.find(m => m.profile_id === keepId);
            // Rendering after a write is deferred until saving is cleared by its handler.
            if (chosen && !saving) showMember(chosen);
            try {
              const pending = await query(client.rpc('get_admin_pending_member_signups', {p_limit:5,p_offset:0}));
              if (!current() || revision !== membershipRevision) return false;
              if (pending.error || !Array.isArray(pending.data)) throw new Error('PENDING_QUEUE_FAILED');
              pendingMembers = pending.data;
              queue.replaceChildren(); queue.hidden = pendingMembers.length === 0;
              if (pendingMembers.length) {
                queue.append(el('h3','Cần xử lý — '+pendingMembers.length+(pendingMembers.length===5?' hồ sơ đầu tiên':' hồ sơ chờ duyệt')));
                for (const m of pendingMembers) queue.append(button(m.full_name || m.login_name || 'Hồ sơ chờ duyệt',()=>showMember(m),'btn'));
              }
            } catch {
              pendingMembers=[];queue.hidden=false;queue.replaceChildren(el('p','Chưa tải được hồ sơ cần xử lý. Hãy tải lại danh sách.','notice'));
            }

            notice(
              message,
              members.length
                ? ''
                : 'Không có thành viên trong trang này.'
            );

            return true;
          } catch (error) {
            if (current()) {
              members = [];

              notice(
                message,
                'Không tải được vòng đời tài khoản. ' +
                  explain(error),
                true
              );
            }

            return false;
          } finally {
            reading = false;

            if (current()) {
              sync();
              if (revision !== membershipRevision && !root.hidden && !saving) void loadPage(offset);
            }
          }
        }

        sync();

        root.closest('.account-ui')?.addEventListener('membership-changed', () => {
          membershipRevision++;
          loaded = false;
          if (current()) {
            detail.replaceChildren();
            directory.replaceChildren();
            if (!reading && !saving && !root.hidden) void loadPage(offset);
          }
        });

        return () => {
          if (!loaded && !reading && !saving) return loadPage(offset);
        };
      }

      function adminCreateMember(root) {
        if (!isAdmin()) return;

        const section =
          panel(
            'Tạo tài khoản thành viên',
            root
          );

        section.append(
          el(
            'p',
            'Tạo MEMBER mới với mật khẩu tạm. Thành viên sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.',
            'muted'
          )
        );

        const form =
          el('form');

        const grid =
          el(
            'div',
            null,
            'form-grid'
          );

        const makeField = (
          id,
          labelText,
          type = 'text'
        ) => {
          const group =
            el(
              'div',
              null,
              'form-group'
            );

          const label =
            el(
              'label',
              labelText
            );

          label.htmlFor = id;

          const input =
            el(
              'input',
              null,
              'field'
            );

          input.id = id;
          input.type = type;
          input.required = true;

          group.append(
            label,
            input
          );

          grid.append(
            group
          );

          return input;
        };

        const fullName =
          makeField(
            'admin-create-member-name',
            'Họ và tên'
          );

        fullName.maxLength = 120;
        fullName.autocomplete = 'off';

        const loginName =
          makeField(
            'admin-create-member-login',
            'Nickname'
          );

        loginName.minLength = 3;
        loginName.maxLength = 32;
        loginName.pattern =
          '[A-Za-z0-9._-]{3,32}';
        loginName.autocapitalize =
          'none';
        loginName.spellcheck =
          false;
        loginName.placeholder =
          'Ví dụ: nguyenvana';

        const email =
          makeField(
            'admin-create-member-email',
            'Email',
            'email'
          );

        email.maxLength = 254;
        email.autocomplete = 'off';

        const password =
          makeField(
            'admin-create-member-password',
            'Mật khẩu tạm',
            'password'
          );

        password.minLength = 8;
        password.autocomplete =
          'new-password';
        password.placeholder =
          'Tối thiểu 8 ký tự';

        const rating =
          makeField(
            'admin-create-member-rating',
            'Rating ban đầu',
            'number'
          );

        rating.step = '0.001';

        if (signupRatingConfig) {
          rating.min =
            String(
              signupRatingConfig
                .minRating
            );

          rating.max =
            String(
              signupRatingConfig
                .maxRating
            );

          rating.value =
            signupRatingConfig
              .initialRating
              .toFixed(3);
        } else {
          rating.value = '4.000';
        }

        const message =
          el(
            'div',
            null,
            'notice'
          );

        message.hidden = true;
        message.setAttribute(
          'role',
          'status'
        );

        const submit =
          el(
            'button',
            'Tạo tài khoản',
            'btn primary'
          );

        submit.type =
          'submit';

        const actions =
          el(
            'div',
            null,
            'form-actions'
          );

        actions.append(submit);

        form.append(
          grid,
          actions,
          message
        );

        section.append(form);

        form.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              state.busy ||
              !isAdmin()
            ) {
              return;
            }

            const normalizedLoginName =
              loginName.value
                .trim()
                .toLowerCase();

            const initialRating =
              Number(
                rating.value
              );

            if (
              normalizedLoginName.length < 3 ||
              normalizedLoginName.length > 32 ||
              !/^[a-z0-9._-]+$/.test(
                normalizedLoginName
              )
            ) {
              notice(
                message,
                'Nickname phải dài 3–32 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.',
                true
              );

              return;
            }

            if (
              !Number.isFinite(
                initialRating
              )
            ) {
              notice(
                message,
                'Rating ban đầu không hợp lệ.',
                true
              );

              return;
            }

            if (
              signupRatingConfig &&
              (
                initialRating <
                  signupRatingConfig
                    .minRating ||
                initialRating >
                  signupRatingConfig
                    .maxRating
              )
            ) {
              notice(
                message,
                'Rating ban đầu phải nằm trong khoảng ' +
                  signupRatingConfig
                    .minRating
                    .toFixed(3) +
                  ' đến ' +
                  signupRatingConfig
                    .maxRating
                    .toFixed(3) +
                  '.',
                true
              );

              return;
            }

            if (!form.reportValidity()) {
              return;
            }

            state.writeBusy = true;

            Array.from(
              form.elements
            ).forEach(control => {
              control.disabled = true;
            });

            submit.textContent =
              'Đang tạo…';

            notice(
              message,
              ''
            );

            try {
              const {
                data,
                error
              } =
                await client.functions
                  .invoke(
                    'admin-create-member',
                    {
                      body: {
                        full_name:
                          fullName.value
                            .trim(),
                        login_name:
                          normalizedLoginName,
                        email:
                          email.value
                            .trim()
                            .toLowerCase(),
                        password:
                          password.value,
                        initial_rating:
                          initialRating
                      }
                    }
                  );

              let functionErrorCode =
                '';

              if (
                error?.context instanceof
                  Response
              ) {
                try {
                  const errorBody =
                    await error.context
                      .clone()
                      .json();

                  functionErrorCode =
                    String(
                      errorBody?.error ||
                      ''
                    );
                } catch {
                  // Keep generic error.
                }
              }

              if (error) {
                error.functionErrorCode =
                  functionErrorCode;

                throw error;
              }

              if (
                data?.ok !== true ||
                !data?.user_id
              ) {
                throw new Error(
                  data?.error ||
                  'CREATE_MEMBER_FAILED'
                );
              }

              const createdLoginName =
                data.login_name ||
                normalizedLoginName;

              form.reset();

              if (signupRatingConfig) {
                rating.value =
                  signupRatingConfig
                    .initialRating
                    .toFixed(3);
              } else {
                rating.value =
                  '4.000';
              }

              notice(
                message,
                'Đã tạo tài khoản "' +
                  createdLoginName +
                  '". Thành viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.',
                false,
                true
              );

            } catch (error) {
              console.error(
                'ADMIN_CREATE_MEMBER_UI_ERROR',
                error
              );

              const code =
                String(
                  error
                    ?.functionErrorCode ||
                  error?.message ||
                  ''
                );

              let text =
                'Không tạo được tài khoản thành viên.';

              if (
                code.includes(
                  'LOGIN_NAME_ALREADY_EXISTS'
                )
              ) {
                text =
                  'Nickname này đã được sử dụng.';
              } else if (
                code.includes(
                  'EMAIL_ALREADY_EXISTS'
                )
              ) {
                text =
                  'Email này đã có tài khoản.';
              } else if (
                code.includes(
                  'INVALID_LOGIN_NAME'
                )
              ) {
                text =
                  'Nickname không hợp lệ.';
              } else if (
                code.includes(
                  'INVALID_EMAIL'
                )
              ) {
                text =
                  'Email không hợp lệ.';
              } else if (
                code.includes(
                  'WEAK_PASSWORD'
                )
              ) {
                text =
                  'Mật khẩu tạm cần ít nhất 8 ký tự.';
              } else if (
                code.includes(
                  'FORBIDDEN'
                )
              ) {
                text =
                  'Tài khoản hiện tại không có quyền tạo thành viên.';
              }

              notice(
                message,
                text,
                true
              );

            } finally {
              state.writeBusy = false;

              Array.from(
                form.elements
              ).forEach(control => {
                control.disabled = false;
              });

              submit.textContent =
                'Tạo tài khoản';
            }
          }
        );
      }

      function adminAccountVerification(root) {
        if (!isAdmin()) return;

        const section =
          panel(
            'Xác nhận tài khoản',
            root
          );

        section.append(
          el(
            'p',
            'Dùng cho tài khoản cũ đang chờ xác minh email.',
            'muted'
          )
        );

        const form = el('form');

        const group =
          el(
            'div',
            null,
            'form-group'
          );

        const label =
          el(
            'label',
            'User ID'
          );

        label.htmlFor =
          'admin-confirm-user-id';

        const input =
          el(
            'input',
            null,
            'field'
          );

        input.id =
          'admin-confirm-user-id';

        input.type =
          'text';

        input.required =
          true;

        input.placeholder =
          'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

        group.append(
          label,
          input
        );

        const message =
          el(
            'div',
            null,
            'notice'
          );

        message.hidden =
          true;

        const submit =
          el(
            'button',
            'Xác nhận email',
            'btn primary'
          );

        submit.type =
          'submit';

        const actions =
          el(
            'div',
            null,
            'form-actions'
          );

        actions.append(submit);

        form.append(
          group,
          actions,
          message
        );

        section.append(form);

        const uuidPattern =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        form.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              state.busy ||
              !isAdmin()
            ) {
              return;
            }

            const userId =
              input.value.trim();

            if (!uuidPattern.test(userId)) {
              notice(
                message,
                'User ID không đúng định dạng UUID.',
                true
              );

              return;
            }

            if (
              !confirm(
                'Xác nhận email cho tài khoản ' +
                  userId +
                  '?'
              )
            ) {
              return;
            }

            state.writeBusy = true;
            input.disabled = true;
            submit.disabled = true;
            submit.textContent =
              'Đang xác nhận…';

            notice(message, '');

            try {
              const {
                data,
                error
              } =
                await client.functions.invoke(
                  'admin-confirm-user',
                  {
                    body: {
                      user_id: userId
                    }
                  }
                );

              if (error) {
                throw error;
              }

              if (
                !data ||
                data.ok !== true
              ) {
                throw new Error(
                  data?.error ||
                  'UNKNOWN_ERROR'
                );
              }

              notice(
                message,
                data.already_confirmed
                  ? 'Tài khoản đã được xác nhận từ trước.'
                  : 'Đã xác nhận email thành công.',
                false,
                true
              );

              input.value = '';

            } catch (error) {
              console.error(
                'ADMIN_CONFIRM_USER_UI_ERROR',
                error
              );

              notice(
                message,
                'Không xác nhận được tài khoản.',
                true
              );

            } finally {
              state.writeBusy = false;
              input.disabled = false;
              submit.disabled = false;
              submit.textContent =
                'Xác nhận email';
            }
          }
        );
      }
      function adminSystemConfig(root) {
        if (!isAdmin()) return;

        const section =
          panel(
            'Cấu hình hệ thống',
            root
          );

        section.classList.add('system-config-ui');

        const weights =
          rows('rating_match_weights');

        const message =
          el(
            'div',
            null,
            'notice'
          );

        message.hidden = true;
        message.setAttribute(
          'role',
          'status'
        );

        if (
          state.errors.rating_match_weights ||
          !Array.isArray(weights) ||
          weights.length === 0
        ) {
          notice(
            message,
            'Chưa tải được cấu hình trọng số trận.',
            true
          );

          section.append(message);
          return;
        }

        const form =
          el('form');

        const grid =
          el(
            'div',
            null,
            'form-grid'
          );

        const makeGroup = (
          labelText,
          control
        ) => {
          const group =
            el(
              'div',
              null,
              'form-group'
            );

          const label =
            el(
              'label',
              labelText
            );

          if (control.id) {
            label.htmlFor =
              control.id;
          }

          group.append(
            label,
            control
          );

          grid.append(group);

          return control;
        };

        const typeSelect =
          el(
            'select',
            null,
            'field'
          );

        typeSelect.id =
          'admin-rating-weight-type';

        weights
          .slice()
          .sort(
            (a, b) =>
              String(
                a.match_type
              ).localeCompare(
                String(
                  b.match_type
                )
              )
          )
          .forEach(
            item => {
              const option =
                el(
                  'option',
                  item.description
                    ? item.match_type +
                      ' — ' +
                      item.description
                    : item.match_type
                );

              option.value =
                item.match_type;

              typeSelect.append(
                option
              );
            }
          );

        makeGroup(
          'Loại trận cần cấu hình trọng số',
          typeSelect
        );

        const weightInput =
          el(
            'input',
            null,
            'field'
          );

        weightInput.id =
          'admin-rating-weight-value';

        weightInput.type =
          'number';

        weightInput.min =
          '0';

        weightInput.max =
          '1';

        weightInput.step =
          '0.01';

        weightInput.required =
          true;

        makeGroup(
          'Trọng số (0–1)',
          weightInput
        );

        const descriptionInput =
          el(
            'input',
            null,
            'field'
          );

        descriptionInput.id =
          'admin-rating-weight-description';

        descriptionInput.type =
          'text';

        makeGroup(
          'Mô tả',
          descriptionInput
        );

        const syncInputs = () => {
          const current =
            weights.find(
              item =>
                item.match_type ===
                typeSelect.value
            );

          weightInput.value =
            current?.weight == null
              ? ''
              : String(
                  current.weight
                );

          descriptionInput.value =
            current?.description ||
            '';
        };

        typeSelect.addEventListener(
          'change',
          syncInputs
        );

        syncInputs();

        const submit =
          el(
            'button',
            'Lưu cấu hình trọng số',
            'btn primary'
          );

        submit.type =
          'submit';

        const actions =
          el(
            'div',
            null,
            'form-actions'
          );

        actions.append(
          submit
        );

        form.append(
          el(
            'p',
            'Cập nhật trọng số của loại trận đang chọn, không tạo phiên bản mới. Trọng số được áp dụng khi tính lại các trận tính điểm.',
            'muted'
          ),
          grid,
          actions,
          message
        );

        accountAction(section, 'Cấu hình trọng số Rating', body => body.append(form));

        const controls = [
          typeSelect,
          weightInput,
          descriptionInput,
          submit
        ];

        controls.forEach(
          control => {
            control.disabled =
              state.writeBusy;
          }
        );

        form.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              state.busy ||
              !isAdmin()
            ) {
              return;
            }

            if (
              !form.reportValidity()
            ) {
              return;
            }

            const weight =
              Number(
                weightInput.value
              );

            if (
              !Number.isFinite(
                weight
              ) ||
              weight < 0 ||
              weight > 1
            ) {
              notice(
                message,
                'Trọng số phải nằm trong khoảng 0 đến 1.',
                true
              );

              return;
            }

            const sessionUserId =
              state.session?.user.id;

            state.writeBusy =
              true;

            controls.forEach(
              control => {
                control.disabled =
                  true;
              }
            );

            submit.textContent =
              'Đang lưu…';

            notice(
              message,
              ''
            );

            let saved =
              false;

            try {
              const {
                data,
                error
              } =
                await client.rpc(
                  'admin_update_rating_match_weight',
                  {
                    p_match_type:
                      typeSelect.value,

                    p_weight:
                      weight,

                    p_description:
                      descriptionInput
                        .value
                        .trim() ||
                      null
                  }
                );

              if (error) {
                throw error;
              }

              if (
                data?.success !==
                true
              ) {
                throw new Error(
                  'Máy chủ chưa xác nhận cập nhật trọng số.'
                );
              }

              saved = true;

              if (
                state.session
                  ?.user.id !==
                sessionUserId
              ) {
                return;
              }

              await load();

            } catch (error) {
              if (
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                notice(
                  message.isConnected
                    ? message
                    : $('global-message'),

                  'Không lưu được trọng số. ' +
                    explain(error),

                  true
                );
              }

            } finally {
              state.writeBusy =
                false;

              controls.forEach(
                control => {
                  control.disabled =
                    false;
                }
              );

              submit.textContent =
                'Lưu cấu hình trọng số';

              if (
                saved &&
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                render();

                notice(
                  $('global-message'),
                  'Đã cập nhật trọng số loại trận.',
                  false,
                  true
                );
              }
            }
          }
        );

        const fundRules =
          rows('fund_rules');

        const fundForm =
          el('form');

        const fundGrid =
          el(
            'div',
            null,
            'form-grid'
          );

        const fundMessage =
          el(
            'div',
            null,
            'notice'
          );

        fundMessage.hidden =
          true;

        fundMessage.setAttribute(
          'role',
          'status'
        );

        const makeFundGroup = (
          labelText,
          control
        ) => {
          const group =
            el(
              'div',
              null,
              'form-group'
            );

          const label =
            el(
              'label',
              labelText
            );

          if (control.id) {
            label.htmlFor =
              control.id;
          }

          group.append(
            label,
            control
          );

          fundGrid.append(
            group
          );

          return control;
        };

        const fundType =
          el(
            'select',
            null,
            'field'
          );

        fundType.id =
          'admin-fund-rule-type';

        weights.forEach(
          item => {
            const option =
              el(
                'option',
                item.description
                  ? item.match_type +
                    ' — ' +
                    item.description
                  : item.match_type
              );

            option.value =
              item.match_type;

            fundType.append(
              option
            );
          }
        );

        makeFundGroup(
          'Loại trận áp dụng quy định Quỹ',
          fundType
        );

        const makeMoneyInput = (
          id,
          label
        ) => {
          const input =
            el(
              'input',
              null,
              'field'
            );

          input.id = id;
          input.type = 'number';
          input.min = '0';
          input.step = '1000';
          input.required = true;

          makeFundGroup(
            label,
            input
          );

          return input;
        };

        const lossInput =
          makeMoneyInput(
            'admin-fund-loss',
            'Thua'
          );

        const drawInput =
          makeMoneyInput(
            'admin-fund-draw',
            'Hòa'
          );

        const winInput =
          makeMoneyInput(
            'admin-fund-win',
            'Thắng'
          );

        const effectiveInput =
          el(
            'input',
            null,
            'field'
          );

        effectiveInput.id =
          'admin-fund-effective-from';

        effectiveInput.type =
          'date';

        effectiveInput.required =
          true;

        makeFundGroup(
          'Hiệu lực từ',
          effectiveInput
        );

        const fundCurrent = el('div', null, 'system-config-current');
        fundCurrent.setAttribute('role', 'status');
        const syncFundInputs = () => {
          const current =
            fundRules
              .filter(
                item =>
                  item.match_type ===
                    fundType.value &&
                  item.is_active === true &&
                  item.effective_to == null
              )
              .sort(
                (a, b) =>
                  String(
                    b.effective_from ||
                    ''
                  ).localeCompare(
                    String(
                      a.effective_from ||
                      ''
                    )
                  )
              )[0];

          fundCurrent.replaceChildren();
          if (state.errors.fund_rules) {
            fundCurrent.append(el('p', 'Chưa tải được quy định Quỹ hiện hành.', 'notice error'));
          } else if (current) {
            fundCurrent.append(el('strong', 'Quy định Quỹ đang áp dụng'));
            if (current.version != null) fundCurrent.append(el('span', 'Phiên bản: ' + current.version));
            if (current.effective_from) fundCurrent.append(el('span', 'Hiệu lực từ: ' + current.effective_from));
            if (typeof current.is_active === 'boolean') fundCurrent.append(badge(current.is_active ? 'ACTIVE' : 'INACTIVE'));
          } else {
            fundCurrent.append(el('span', 'Chưa có quy định Quỹ hiện hành cho loại trận này.', 'muted'));
          }

          lossInput.value =
            current?.amount_loss == null
              ? '0'
              : String(
                  current.amount_loss
                );

          drawInput.value =
            current?.amount_draw == null
              ? '0'
              : String(
                  current.amount_draw
                );

          winInput.value =
            current?.amount_win == null
              ? '0'
              : String(
                  current.amount_win
                );

          effectiveInput.value =
            current?.effective_from ||
            new Date()
              .toISOString()
              .slice(0, 10);
        };

        fundType.addEventListener(
          'change',
          syncFundInputs
        );

        syncFundInputs();

        const fundSubmit =
          el(
            'button',
            'Tạo phiên bản Quỹ mới',
            'btn primary'
          );

        fundSubmit.type =
          'submit';

        const fundActions =
          el(
            'div',
            null,
            'form-actions'
          );

        fundActions.append(
          fundSubmit
        );

        fundForm.append(
          el(
            'p',
            'Quy định mới sẽ tạo phiên bản theo ngày hiệu lực; lịch sử cũ được giữ nguyên.',
            'muted'
          ),
          fundCurrent,
          fundGrid,
          fundActions,
          fundMessage
        );

        accountAction(section, 'Tạo phiên bản quy định Quỹ', body => body.append(fundForm), 'success');

        const fundControls = [
          fundType,
          lossInput,
          drawInput,
          winInput,
          effectiveInput,
          fundSubmit
        ];

        fundControls.forEach(
          control => {
            control.disabled =
              state.writeBusy;
          }
        );

        fundForm.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              state.busy ||
              !isAdmin()
            ) {
              return;
            }

            if (
              !fundForm.reportValidity()
            ) {
              return;
            }

            const amountLoss =
              Number(
                lossInput.value
              );

            const amountDraw =
              Number(
                drawInput.value
              );

            const amountWin =
              Number(
                winInput.value
              );

            if (
              !Number.isFinite(
                amountLoss
              ) ||
              !Number.isFinite(
                amountDraw
              ) ||
              !Number.isFinite(
                amountWin
              ) ||
              amountLoss < 0 ||
              amountDraw < 0 ||
              amountWin < 0
            ) {
              notice(
                fundMessage,
                'Mức tiền quỹ phải là số không âm.',
                true
              );

              return;
            }

            const sessionUserId =
              state.session?.user.id;

            state.writeBusy =
              true;

            fundControls.forEach(
              control => {
                control.disabled =
                  true;
              }
            );

            fundSubmit.textContent =
              'Đang lưu…';

            notice(
              fundMessage,
              ''
            );

            let saved =
              false;

            try {
              const {
                data,
                error
              } =
                await client.rpc(
                  'admin_create_fund_rule_version',
                  {
                    p_match_type:
                      fundType.value,

                    p_amount_loss:
                      amountLoss,

                    p_amount_draw:
                      amountDraw,

                    p_amount_win:
                      amountWin,

                    p_effective_from:
                      effectiveInput.value
                  }
                );

              if (error) {
                throw error;
              }

              if (
                data?.success !==
                true
              ) {
                throw new Error(
                  'Máy chủ chưa xác nhận tạo Fund Rule.'
                );
              }

              saved = true;

              if (
                state.session
                  ?.user.id !==
                sessionUserId
              ) {
                return;
              }

              await load();

            } catch (error) {
              if (
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                notice(
                  fundMessage.isConnected
                    ? fundMessage
                    : $('global-message'),

                  'Không lưu được quy định quỹ. ' +
                    explain(error),

                  true
                );
              }

            } finally {
              state.writeBusy =
                false;

              fundControls.forEach(
                control => {
                  control.disabled =
                    false;
                }
              );

              fundSubmit.textContent =
                'Tạo phiên bản Quỹ mới';

              if (
                saved &&
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                render();

                notice(
                  $('global-message'),
                  'Đã tạo phiên bản Quỹ mới.',
                  false,
                  true
                );
              }
            }
          }
        );

        const activeSettings =
          activeRatingSettings();

        const ratingForm =
          el('form');

        const ratingGrid =
          el(
            'div',
            null,
            'form-grid'
          );

        const ratingMessage =
          el(
            'div',
            null,
            'notice'
          );

        ratingMessage.hidden =
          true;

        ratingMessage.setAttribute(
          'role',
          'status'
        );

        const makeRatingInput = (
          id,
          labelText,
          type,
          value,
          step = null
        ) => {
          const group =
            el(
              'div',
              null,
              'form-group'
            );

          const label =
            el(
              'label',
              labelText
            );

          label.htmlFor = id;

          const input =
            el(
              'input',
              null,
              'field'
            );

          input.id = id;
          input.type = type;
          input.required = true;

          if (value != null) {
            input.value =
              String(value);
          }

          if (step != null) {
            input.step =
              String(step);
          }

          group.append(
            label,
            input
          );

          ratingGrid.append(
            group
          );

          return input;
        };

        const versionInput =
          makeRatingInput(
            'admin-rating-version',
            'Phiên bản mới',
            'text',
            ''
          );

        versionInput.placeholder =
          'Ví dụ: V1.2';

        const initialInput =
          makeRatingInput(
            'admin-rating-initial',
            'Điểm khởi tạo',
            'number',
            activeSettings?.initial_rating ?? 4,
            0.001
          );

        const minInput =
          makeRatingInput(
            'admin-rating-min',
            'Điểm tối thiểu',
            'number',
            activeSettings?.min_rating ?? 2,
            0.001
          );

        const maxInput =
          makeRatingInput(
            'admin-rating-max',
            'Điểm tối đa',
            'number',
            activeSettings?.max_rating ?? 8,
            0.001
          );

        const kInput =
          makeRatingInput(
            'admin-rating-k',
            'K-factor',
            'number',
            activeSettings?.k_factor ?? 0.55,
            0.001
          );

        const sensitivityInput =
          makeRatingInput(
            'admin-rating-sensitivity',
            'Expected sensitivity',
            'number',
            activeSettings?.expected_sensitivity ?? 0.9,
            0.001
          );

        const provisionalInput =
          makeRatingInput(
            'admin-rating-provisional',
            'Số trận provisional',
            'number',
            activeSettings?.provisional_matches ?? 5,
            1
          );

        provisionalInput.min = '0';

        const stableInput =
          makeRatingInput(
            'admin-rating-stable',
            'Số trận stable',
            'number',
            activeSettings?.stable_matches ?? 10,
            1
          );

        stableInput.min = '0';

        const halfLifeInput =
          makeRatingInput(
            'admin-rating-half-life',
            'Recency half-life (ngày)',
            'number',
            activeSettings?.recency_half_life_days ?? 60,
            1
          );

        halfLifeInput.min = '1';

        const recencyFloorInput =
          makeRatingInput(
            'admin-rating-recency-floor',
            'Recency floor',
            'number',
            activeSettings?.recency_floor ?? 0.35,
            0.01
          );

        recencyFloorInput.min = '0';
        recencyFloorInput.max = '1';

        const deltaCapInput =
          makeRatingInput(
            'admin-rating-delta-cap',
            'Giới hạn thay đổi / trận',
            'number',
            activeSettings?.rating_delta_cap ?? 0.35,
            0.001
          );

        const ratingSubmit =
          el(
            'button',
            'Tạo phiên bản Rating mới',
            'btn primary'
          );

        ratingSubmit.type =
          'submit';

        const ratingActions =
          el(
            'div',
            null,
            'form-actions'
          );

        ratingActions.append(
          ratingSubmit
        );

        const ratingCurrent = el('div', null, 'system-config-current');
        if (state.errors.rating_settings) {
          ratingCurrent.append(el('p', 'Chưa tải được phiên bản Rating hiện hành.', 'notice error'));
        } else if (activeSettings) {
          ratingCurrent.append(el('strong', 'Rating hiện hành: ' + (activeSettings.algorithm_version || 'Chưa có tên phiên bản')));
          if (typeof activeSettings.is_active === 'boolean') ratingCurrent.append(badge(activeSettings.is_active ? 'ACTIVE' : 'INACTIVE'));
        } else {
          ratingCurrent.append(el('span', 'Chưa có phiên bản Rating hiện hành.', 'muted'));
        }

        ratingForm.append(
          el(
            'p',
            'Tạo phiên bản mới, không ghi đè dữ liệu phiên bản hiện hành. Khi tạo thành công, phiên bản mới sẽ được kích hoạt; phiên bản cũ được giữ lịch sử.',
            'muted'
          ),
          ratingCurrent,
          ratingGrid,
          ratingActions,
          ratingMessage
        );

        accountAction(section, 'Tạo phiên bản Rating', body => body.append(ratingForm), 'success');

        const ratingControls = [
          versionInput,
          initialInput,
          minInput,
          maxInput,
          kInput,
          sensitivityInput,
          provisionalInput,
          stableInput,
          halfLifeInput,
          recencyFloorInput,
          deltaCapInput,
          ratingSubmit
        ];

        ratingControls.forEach(
          control => {
            control.disabled =
              state.writeBusy;
          }
        );

        ratingForm.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              state.busy ||
              !isAdmin()
            ) {
              return;
            }

            if (
              !ratingForm.reportValidity()
            ) {
              return;
            }

            const version =
              versionInput.value.trim();

            const initialRating =
              Number(initialInput.value);

            const minRating =
              Number(minInput.value);

            const maxRating =
              Number(maxInput.value);

            const kFactor =
              Number(kInput.value);

            const sensitivity =
              Number(
                sensitivityInput.value
              );

            const provisional =
              Number(
                provisionalInput.value
              );

            const stable =
              Number(
                stableInput.value
              );

            const halfLife =
              Number(
                halfLifeInput.value
              );

            const recencyFloor =
              Number(
                recencyFloorInput.value
              );

            const deltaCap =
              Number(
                deltaCapInput.value
              );

            if (
              !version ||
              !Number.isFinite(initialRating) ||
              !Number.isFinite(minRating) ||
              !Number.isFinite(maxRating) ||
              !Number.isFinite(kFactor) ||
              !Number.isFinite(sensitivity) ||
              !Number.isInteger(provisional) ||
              !Number.isInteger(stable) ||
              !Number.isInteger(halfLife) ||
              !Number.isFinite(recencyFloor) ||
              !Number.isFinite(deltaCap)
            ) {
              notice(
                ratingMessage,
                'Vui lòng kiểm tra lại các tham số Rating.',
                true
              );

              return;
            }

            if (
              minRating >= maxRating ||
              initialRating < minRating ||
              initialRating > maxRating ||
              kFactor <= 0 ||
              sensitivity <= 0 ||
              provisional < 0 ||
              stable < provisional ||
              halfLife <= 0 ||
              recencyFloor < 0 ||
              recencyFloor > 1 ||
              deltaCap <= 0
            ) {
              notice(
                ratingMessage,
                'Các tham số Rating không hợp lệ.',
                true
              );

              return;
            }

            const sessionUserId =
              state.session?.user.id;

            state.writeBusy =
              true;

            ratingControls.forEach(
              control => {
                control.disabled =
                  true;
              }
            );

            ratingSubmit.textContent =
              'Đang lưu…';

            notice(
              ratingMessage,
              ''
            );

            let saved =
              false;

            try {
              const {
                data,
                error
              } =
                await client.rpc(
                  'admin_create_rating_settings_version',
                  {
                    p_algorithm_version:
                      version,

                    p_initial_rating:
                      initialRating,

                    p_min_rating:
                      minRating,

                    p_max_rating:
                      maxRating,

                    p_k_factor:
                      kFactor,

                    p_expected_sensitivity:
                      sensitivity,

                    p_provisional_matches:
                      provisional,

                    p_stable_matches:
                      stable,

                    p_recency_half_life_days:
                      halfLife,

                    p_recency_floor:
                      recencyFloor,

                    p_rating_delta_cap:
                      deltaCap
                  }
                );

              if (error) {
                throw error;
              }

              if (
                data?.success !==
                true
              ) {
                throw new Error(
                  'Máy chủ chưa xác nhận tạo Rating Settings version.'
                );
              }

              saved = true;

              if (
                state.session
                  ?.user.id !==
                sessionUserId
              ) {
                return;
              }

              await load();

            } catch (error) {
              if (
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                notice(
                  ratingMessage.isConnected
                    ? ratingMessage
                    : $('global-message'),

                  'Không lưu được cấu hình Rating. ' +
                    explain(error),

                  true
                );
              }

            } finally {
              state.writeBusy =
                false;

              ratingControls.forEach(
                control => {
                  control.disabled =
                    false;
                }
              );

              ratingSubmit.textContent =
                'Tạo phiên bản Rating mới';

              if (
                saved &&
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                render();

                notice(
                  $('global-message'),
                  'Đã tạo và kích hoạt phiên bản Rating mới.',
                  false,
                  true
                );
              }
            }
          }
        );
      }

    return Object.freeze({
      accountPage: admin
    });
  }

  window.PickAccount = Object.freeze({ create });
})();
