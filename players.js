(function () {
  'use strict';

  function create(context) {
    const {
      $,
      state,
      client,
      isAdmin,
      canManageMembers,
      canManagePlayers,
      canManagePlayerLifecycle,
      button,
      el,
      rows,
      raw,
      upper,
      number,
      dateCol,
      sources,
      table,
      panel,
      notice,
      load,
      render,
      explain,
      playerName,
      matchCode,
      CURRENT_RATING_VERSION
    } = context;

    function clean(value) {
      const text =
        String(
          value ?? ''
        ).trim();

      return text || null;
    }

    // PLAYER ACTIONS VISUAL V1
    
    // PLAYER ADMIN ACCORDION V1
    const adminActionSections = [];
function collapsibleAdminSection(
      root,
      title,
      buildContent,
      variant = 'neutral'
    ) {
      const wrapper =
        el(
          'div',
          null,
          `app-action app-action-${variant} mb-3`
        );

      const toggle =
        button(
          `▶ ${title}`,
          () => {
            const willOpen =
              body.hidden;

            if (willOpen) {
              adminActionSections.forEach(
                item => {
                  if (
                    item.body !==
                    body
                  ) {
                    item.body.hidden =
                      true;
                    item.toggle.setAttribute('aria-expanded', 'false');

                    item.toggle.textContent =
                      `▶ ${item.title}`;
                  }
                }
              );
            }

            body.hidden =
              !willOpen;
            toggle.setAttribute('aria-expanded', String(willOpen));

            toggle.textContent =
              body.hidden
                ? `▶ ${title}`
                : `▼ ${title}`;
          },
          'app-action-toggle'
        );

      toggle.type =
        'button';

      const body =
        el(
          'div',
          null,
          'app-action-body'
        );

      body.hidden =
        true;

      const inner =
        el(
          'div'
        );

      const close =
        button(
          'Thu gọn',
          () => {
            body.hidden =
              true;
            toggle.setAttribute('aria-expanded', 'false');

            toggle.textContent =
              `▶ ${title}`;
          },
          'btn player-section-close mt-3'
        );

      close.type =
        'button';

      body.id = 'player-action-' + adminActionSections.length;
      toggle.setAttribute('aria-controls', body.id);
      toggle.setAttribute('aria-expanded', 'false');
      body.append(
        inner,
        close
      );

      wrapper.append(
        toggle,
        body
      );

      root.append(
        wrapper
      );

      buildContent(
        inner
      );

      // The accordion already names the action; avoid a repeated panel heading.
      const repeatedHeading = inner.querySelector('.panel > h2');
      if (repeatedHeading) repeatedHeading.hidden = true;
      adminActionSections.push(
        {
          title,
          toggle,
          body
        }
      );

      return {
        wrapper,
        toggle,
        body
      };
    }
    function createPlayerForm(root) {
      if (!canManagePlayers()) {
        return;
      }

      const section = panel(
        'Tạo VĐV',
        root
      );

      const description = el(
        'p',
        'Tạo VĐV mới qua Player Write API. Điểm khởi tạo chỉ được đặt khi tạo; điểm hiện tại do hệ thống Rating quản lý.',
        'notice'
      );

      const message = el('div');

      message.hidden = true;
      message.setAttribute(
        'role',
        'alert'
      );

      const form = el('form');

      const grid = el(
        'div',
        null,
        'form-grid'
      );

      function fieldGroup(
        labelText,
        input
      ) {
        const group = el(
          'div',
          null,
          'form-group'
        );

        const label = el(
          'label',
          labelText
        );

        label.htmlFor =
          input.id;

        group.append(
          label,
          input
        );

        return group;
      }

      const fullName = el(
        'input',
        null,
        'field'
      );

      fullName.id =
        'create-player-name';

      fullName.type = 'text';
      fullName.required = true;
      fullName.maxLength = 200;

      const playerType = el(
        'select',
        null,
        'field'
      );

      playerType.id =
        'create-player-type';

      [
        ['CLUB', 'CLUB'],
        ['GUEST', 'GUEST']
      ].forEach(
        ([value, text]) => {
          const option =
            el(
              'option',
              text
            );

          option.value =
            value;

          playerType.append(
            option
          );
        }
      );

      const phone = el(
        'input',
        null,
        'field'
      );

      phone.id =
        'create-player-phone';

      phone.type = 'tel';

      const dateOfBirth = el(
        'input',
        null,
        'field'
      );

      dateOfBirth.id =
        'create-player-date-of-birth';

      dateOfBirth.type = 'date';

      dateOfBirth.max =
        new Date()
          .toISOString()
          .slice(0, 10);

      const activeRatingSettings =
        rows('rating_settings')
          .find(
            item =>
              item.is_active === true
          ) ||
        null;

      const ratingMin =
        Number(
          activeRatingSettings
            ?.min_rating
        );

      const ratingMax =
        Number(
          activeRatingSettings
            ?.max_rating
        );

      const ratingDefault =
        Number(
          activeRatingSettings
            ?.initial_rating
        );

      const effectiveRatingMin =
        Number.isFinite(ratingMin)
          ? ratingMin
          : 2;

      const effectiveRatingMax =
        Number.isFinite(ratingMax)
          ? ratingMax
          : 8;

      const effectiveRatingDefault =
        Number.isFinite(ratingDefault)
          ? ratingDefault
          : 4;

      const initialRating = el(
        'input',
        null,
        'field'
      );

      initialRating.id =
        'create-player-rating';

      initialRating.type =
        'number';

      initialRating.min =
        String(effectiveRatingMin);

      initialRating.max =
        String(effectiveRatingMax);

      initialRating.step =
        '0.001';

      initialRating.value =
        effectiveRatingDefault
          .toFixed(3);

      initialRating.required =
        true;

      const joinedAt = el(
        'input',
        null,
        'field'
      );

      joinedAt.id =
        'create-player-joined';

      joinedAt.type = 'date';

      grid.append(
        fieldGroup(
          'Họ tên',
          fullName
        ),
        fieldGroup(
          'Loại VĐV',
          playerType
        ),
        fieldGroup(
          'Điện thoại',
          phone
        ),
        fieldGroup(
          'Ngày sinh',
          dateOfBirth
        ),
        fieldGroup(
          'Điểm khởi tạo',
          initialRating
        ),
        fieldGroup(
          'Ngày tham gia',
          joinedAt
        )
      );

      const notesGroup = el(
        'div',
        null,
        'form-group'
      );

      const notesLabel = el(
        'label',
        'Ghi chú'
      );

      notesLabel.htmlFor =
        'create-player-notes';

      const notes = el(
        'textarea',
        null,
        'field'
      );

      notes.id =
        'create-player-notes';

      notes.rows = 3;

      notesGroup.append(
        notesLabel,
        notes
      );

      const actions = el(
        'div',
        null,
        'form-actions'
      );

      const submit = el(
        'button',
        'Tạo VĐV',
        'btn primary'
      );

      submit.type = 'submit';

      const reset = button(
        'Đặt lại',
        () => {
          form.reset();

          playerType.value =
            'CLUB';

          initialRating.value =
            effectiveRatingDefault
              .toFixed(3);

          notice(
            message,
            ''
          );
        }
      );

      actions.append(
        submit,
        reset
      );

      form.append(
        grid,
        notesGroup,
        actions
      );

      section.append(
        description,
        message,
        form
      );

      form.addEventListener(
        'submit',
        async event => {
          event.preventDefault();

          if (
            state.writeBusy ||
            !canManagePlayers()
          ) {
            return;
          }

          notice(
            message,
            ''
          );

          const name =
            fullName.value.trim();

          if (!name) {
            notice(
              message,
              'Họ tên VĐV không được để trống.',
              true
            );

            return;
          }

          const rating =
            Number(
              initialRating.value
            );

          if (
            !Number.isFinite(
              rating
            ) ||
            rating <
              effectiveRatingMin ||
            rating >
              effectiveRatingMax
          ) {
            notice(
              message,
              'Điểm khởi tạo phải từ ' +
                effectiveRatingMin
                  .toFixed(3) +
                ' đến ' +
                effectiveRatingMax
                  .toFixed(3) +
                '.',
              true
            );

            return;
          }

          state.writeBusy = true;

          submit.disabled = true;
          reset.disabled = true;

          submit.textContent =
            'Đang tạo…';

          try {
            const {
              error
            } = await client.rpc(
              'create_player',
              {
                p_full_name:
                  name,
                p_player_type:
                  playerType.value,
                p_phone:
                  clean(
                    phone.value
                  ),
                p_email:
                  null,
                p_initial_rating:
                  rating,
                p_joined_at:
                  joinedAt.value ||
                  null,
                p_date_of_birth:
                  dateOfBirth.value ||
                  null,
                p_notes:
                  clean(
                    notes.value
                  )
              }
            );

            if (error) {
              throw error;
            }

            notice(
              message,
              'Đã tạo VĐV thành công. Đang tải lại danh sách…',
              false,
              true
            );

            await load();

            state.page =
              'players';

            render();

            notice(
              $('global-message'),
              'Đã tạo VĐV thành công.',
              false,
              true
            );
          } catch (error) {
            const code = String(
              error?.message ||
              error?.code ||
              ''
            );

            const text =
              code.includes(
                'PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
              )
                ? 'Tài khoản không có quyền quản lý VĐV.'
                : explain(error);

            notice(
              message,
              text,
              true
            );
          } finally {
            state.writeBusy =
              false;

            submit.disabled =
              false;

            reset.disabled =
              false;

            submit.textContent =
              'Tạo VĐV';
          }
        }
      );
    }

    function updatePlayerForm(root) {
      if (!canManagePlayers()) {
        return;
      }

      const playerRows =
        rows('players')
          .slice()
          .sort(
            (a, b) =>
              String(
                a.full_name || ''
              ).localeCompare(
                String(
                  b.full_name || ''
                ),
                'vi'
              )
          );

      const section = panel(
        'Sửa VĐV',
        root
      );

      const description = el(
        'p',
        'Chỉ sửa thông tin hồ sơ. Trạng thái được quản lý riêng trong mục Vòng đời VĐV; điểm Rating chỉ để xem.',
        'notice'
      );

      const message = el('div');

      message.hidden = true;
      message.setAttribute(
        'role',
        'alert'
      );

      if (!playerRows.length) {
        section.append(
          description,
          el(
            'p',
            'Chưa có VĐV để chỉnh sửa.',
            'muted'
          )
        );

        return;
      }

      const form = el('form');

      const grid = el(
        'div',
        null,
        'form-grid'
      );

      function fieldGroup(
        labelText,
        input
      ) {
        const group = el(
          'div',
          null,
          'form-group'
        );

        const label = el(
          'label',
          labelText
        );

        label.htmlFor =
          input.id;

        group.append(
          label,
          input
        );

        return group;
      }

      const playerSelect = el(
        'select',
        null,
        'field'
      );

      playerSelect.id =
        'update-player-id';

      playerRows.forEach(
        player => {
          const option = el(
            'option',
            raw(
              player.full_name
            ) ||
              'Không rõ VĐV'
          );

          option.value =
            player.id;

          playerSelect.append(
            option
          );
        }
      );

      const fullName = el(
        'input',
        null,
        'field'
      );

      fullName.id =
        'update-player-name';

      fullName.type = 'text';
      fullName.required = true;

      const playerType = el(
        'select',
        null,
        'field'
      );

      playerType.id =
        'update-player-type';

      [
        ['CLUB', 'CLUB'],
        ['GUEST', 'GUEST']
      ].forEach(
        ([value, text]) => {
          const option =
            el(
              'option',
              text
            );

          option.value =
            value;

          playerType.append(
            option
          );
        }
      );

      const statusInfo = el(
        'div',
        null,
        'player-status-readonly'
      );

      statusInfo.id =
        'update-player-status';

      statusInfo.setAttribute(
        'aria-live',
        'polite'
      );

      const phone = el(
        'input',
        null,
        'field'
      );

      phone.id =
        'update-player-phone';

      phone.type = 'tel';

      const dateOfBirth = el(
        'input',
        null,
        'field'
      );

      dateOfBirth.id =
        'update-player-date-of-birth';

      dateOfBirth.type = 'date';

      dateOfBirth.max =
        new Date()
          .toISOString()
          .slice(0, 10);

      const joinedAt = el(
        'input',
        null,
        'field'
      );

      joinedAt.id =
        'update-player-joined';

      joinedAt.type = 'date';

      const ratingInfo = el(
        'input',
        null,
        'field'
      );

      ratingInfo.id =
        'update-player-rating';

      ratingInfo.type = 'text';
      ratingInfo.readOnly = true;

      grid.append(
        fieldGroup(
          'Chọn VĐV',
          playerSelect
        ),
        fieldGroup(
          'Họ tên',
          fullName
        ),
        fieldGroup(
          'Loại VĐV',
          playerType
        ),
        fieldGroup(
          'Trạng thái (chỉ xem)',
          statusInfo
        ),
        fieldGroup(
          'Điện thoại',
          phone
        ),
        fieldGroup(
          'Ngày sinh',
          dateOfBirth
        ),
        fieldGroup(
          'Ngày tham gia',
          joinedAt
        ),
        fieldGroup(
          'Rating (chỉ xem)',
          ratingInfo
        )
      );

      const notesGroup = el(
        'div',
        null,
        'form-group'
      );

      const notesLabel = el(
        'label',
        'Ghi chú'
      );

      notesLabel.htmlFor =
        'update-player-notes';

      const notes = el(
        'textarea',
        null,
        'field'
      );

      notes.id =
        'update-player-notes';

      notes.rows = 3;

      notesGroup.append(
        notesLabel,
        notes
      );

      const actions = el(
        'div',
        null,
        'form-actions'
      );

      const submit = el(
        'button',
        'Lưu thay đổi',
        'btn primary'
      );

      submit.type = 'submit';

      const reloadButton =
        button(
          'Khôi phục dữ liệu đang lưu',
          () => {
            fillSelectedPlayer();

            notice(
              message,
              ''
            );
          }
        );

      actions.append(
        submit,
        reloadButton
      );

      form.append(
        grid,
        notesGroup,
        actions
      );

      section.append(
        description,
        message,
        form
      );

      function selectedPlayer() {
        return (
          playerRows.find(
            player =>
              player.id ===
              playerSelect.value
          ) ||
          null
        );
      }

      function fillSelectedPlayer() {
        const player =
          selectedPlayer();

        if (!player) {
          return;
        }

        fullName.value =
          raw(
            player.full_name
          );

        playerType.value =
          upper(
            player.player_type
          ) === 'GUEST'
            ? 'GUEST'
            : 'CLUB';

        const currentStatus =
          upper(
            player.status
          ) === 'INACTIVE'
            ? 'INACTIVE'
            : 'ACTIVE';

        statusInfo.replaceChildren(
          el(
            'span',
            currentStatus === 'ACTIVE'
              ? 'Đang hoạt động'
              : 'Ngừng hoạt động',
            'badge player-state-' +
              (currentStatus === 'ACTIVE'
                ? 'active'
                : 'neutral')
          )
        );

        phone.value =
          raw(
            player.phone
          );

        dateOfBirth.value =
          player.date_of_birth
            ? String(
                player.date_of_birth
              ).slice(
                0,
                10
              )
            : '';

        joinedAt.value =
          player.joined_at
            ? String(
                player.joined_at
              ).slice(
                0,
                10
              )
            : '';

        notes.value =
          raw(
            player.notes
          );

        ratingInfo.value =
          'Khởi tạo: ' +
          number(
            player.initial_rating
          ) +
          ' • Hiện tại: ' +
          number(
            player.current_rating
          );
      }

      playerSelect.addEventListener(
        'change',
        () => {
          fillSelectedPlayer();

          notice(
            message,
            ''
          );
        }
      );

      fillSelectedPlayer();

      form.addEventListener(
        'submit',
        async event => {
          event.preventDefault();

          if (
            state.writeBusy ||
            !canManagePlayers()
          ) {
            return;
          }

          notice(
            message,
            ''
          );

          const player =
            selectedPlayer();

          if (!player) {
            notice(
              message,
              'Không tìm thấy VĐV đã chọn.',
              true
            );

            return;
          }

          const name =
            fullName.value.trim();

          if (!name) {
            notice(
              message,
              'Họ tên VĐV không được để trống.',
              true
            );

            return;
          }

          state.writeBusy = true;

          submit.disabled = true;
          reloadButton.disabled =
            true;

          submit.textContent =
            'Đang lưu…';

          try {
            const {
              error
            } = await client.rpc(
              'update_player',
              {
                p_player_id:
                  player.id,
                p_full_name:
                  name,
                p_player_type:
                  playerType.value,
                p_phone:
                  clean(
                    phone.value
                  ),
                p_email:
                  null,
                p_status:
                  upper(
                    player.status
                  ) === 'INACTIVE'
                    ? 'INACTIVE'
                    : 'ACTIVE',
                p_joined_at:
                  joinedAt.value ||
                  null,
                p_date_of_birth:
                  dateOfBirth.value ||
                  null,
                p_notes:
                  clean(
                    notes.value
                  )
              }
            );

            if (error) {
              throw error;
            }

            notice(
              message,
              'Đã cập nhật VĐV thành công. Đang tải lại dữ liệu…',
              false,
              true
            );

            await load();

            state.page =
              'players';

            render();

            notice(
              $('global-message'),
              'Đã cập nhật VĐV thành công.',
              false,
              true
            );
          } catch (error) {
            const code = String(
              error?.message ||
              error?.code ||
              ''
            );

            const text =
              code.includes(
                'PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
              )
                ? 'Tài khoản không có quyền quản lý VĐV.'
                : explain(error);

            notice(
              message,
              text,
              true
            );
          } finally {
            state.writeBusy =
              false;

            submit.disabled =
              false;

            reloadButton.disabled =
              false;

            submit.textContent =
              'Lưu thay đổi';
          }
        }
      );
    }

    function initialRatingAdjustmentForm(root) {
      if (!isAdmin()) return;

      const actor = state.session?.user?.id;
      const generation = state.generation;
      const current = () =>
        root.isConnected &&
        isAdmin() &&
        state.session?.user?.id === actor &&
        state.generation === generation;

      const playerRows = rows('players')
        .slice()
        .sort((a, b) =>
          playerName(a.id).localeCompare(playerName(b.id), 'vi')
        );

      const section = panel('Điều chỉnh Rating ban đầu', root);
      const description = el(
        'p',
        'Chỉ có thể điều chỉnh khi VĐV chưa có lịch sử trận Rated được duyệt. Hệ thống sẽ kiểm tra điều kiện này khi lưu.',
        'notice'
      );
      const message = el('div');
      message.hidden = true;
      message.setAttribute('role', 'status');

      if (!playerRows.length) {
        section.append(
          description,
          el('p', 'Chưa có VĐV để điều chỉnh Rating.', 'muted')
        );
        return;
      }

      const activeRatingSettings = rows('rating_settings')
        .find(item => item.is_active === true) || null;
      const configuredMin = Number(activeRatingSettings?.min_rating);
      const configuredMax = Number(activeRatingSettings?.max_rating);
      const ratingMin = Number.isFinite(configuredMin) ? configuredMin : 2;
      const ratingMax = Number.isFinite(configuredMax) ? configuredMax : 8;

      const form = el('form');
      const grid = el('div', null, 'form-grid');
      const playerSelect = el('select', null, 'field');
      playerSelect.id = 'initial-rating-player-id';
      playerRows.forEach(player => {
        const option = el('option', playerName(player.id));
        option.value = player.id;
        playerSelect.append(option);
      });

      const ratingSummary = el(
        'div',
        null,
        'player-status-readonly'
      );
      ratingSummary.id = 'initial-rating-current-summary';
      ratingSummary.setAttribute('aria-live', 'polite');

      const ratingInput = el('input', null, 'field');
      ratingInput.id = 'initial-rating-new-value';
      ratingInput.type = 'number';
      ratingInput.min = String(ratingMin);
      ratingInput.max = String(ratingMax);
      ratingInput.step = '0.001';
      ratingInput.required = true;

      const reason = el('textarea', null, 'field');
      reason.id = 'initial-rating-reason';
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.required = true;

      function fieldGroup(labelText, input) {
        const group = el('div', null, 'form-group');
        const label = el('label', labelText);
        label.htmlFor = input.id;
        group.append(label, input);
        return group;
      }

      grid.append(
        fieldGroup('Chọn VĐV', playerSelect),
        fieldGroup('Rating hiện tại', ratingSummary),
        fieldGroup('Rating mới', ratingInput),
        fieldGroup('Lý do', reason)
      );

      const actions = el('div', null, 'form-actions');
      const submit = el('button', 'Lưu Rating ban đầu', 'btn primary');
      submit.type = 'submit';
      const reset = button('Khôi phục', () => {
        fillSelectedPlayer(true);
        notice(message, '');
      });
      reset.type = 'button';
      actions.append(submit, reset);
      form.append(grid, actions);
      section.append(description, message, form);

      let saving = false;

      function selectedPlayer() {
        return playerRows.find(player => player.id === playerSelect.value) || null;
      }

      function ratingText(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toFixed(3) : '—';
      }

      function fillSelectedPlayer(clearReason = false) {
        const player = selectedPlayer();
        if (!player) return;
        ratingSummary.replaceChildren(
          el(
            'span',
            `Khởi tạo: ${ratingText(player.initial_rating)} • Hiện tại: ${ratingText(player.current_rating)}`,
            'text-sm'
          )
        );
        const initial = Number(player.initial_rating);
        ratingInput.value = Number.isFinite(initial)
          ? initial.toFixed(3)
          : '';
        if (clearReason) reason.value = '';
      }

      function errorText(error) {
        const code = String(error?.message || error?.code || '');
        if (code.includes('PLAYER_RATING_HISTORY_EXISTS')) {
          return 'VĐV đã có lịch sử Rated. Không thể chỉnh trực tiếp Rating ban đầu.';
        }
        if (code.includes('PLAYER_RATING_STATE_INCONSISTENT')) {
          return 'Dữ liệu Rating hiện tại không đồng nhất. Không thể chỉnh tự động.';
        }
        if (code.includes('PLAYER_RATING_OUT_OF_RANGE')) {
          return 'Rating nằm ngoài phạm vi cho phép.';
        }
        if (code.includes('PLAYER_RATING_REQUIRED')) {
          return 'Rating mới là bắt buộc và phải là một số hợp lệ.';
        }
        if (
          code.includes('RATING_ACTIVE_SETTINGS_INVALID') ||
          code.includes('RATING_ACTIVE_SETTINGS_HARD_RANGE_CONFLICT')
        ) {
          return 'Cấu hình Rating hiện tại không hợp lệ. Vui lòng kiểm tra cấu hình hệ thống.';
        }
        if (code.includes('REASON_REQUIRED_MAX_1000')) {
          return 'Lý do là bắt buộc và không được vượt quá 1000 ký tự.';
        }
        if (code.includes('PLAYER_NOT_FOUND')) {
          return 'Không tìm thấy VĐV đã chọn. Hãy tải lại danh sách.';
        }
        if (code.includes('ADMIN_REQUIRED')) {
          return 'Chỉ ADMIN đang hoạt động mới được điều chỉnh Rating ban đầu.';
        }
        if (code.includes('BUSINESS_ACCESS_REQUIRED')) {
          return 'Tài khoản hiện không được phép thực hiện thao tác nghiệp vụ này.';
        }
        if (code.includes('AUTH_REQUIRED')) {
          return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
        }
        return explain(error);
      }

      function sync() {
        const disabled = saving || state.writeBusy || !current();
        playerSelect.disabled = disabled;
        ratingInput.disabled = disabled;
        reason.disabled = disabled;
        reset.disabled = disabled;
        submit.disabled = disabled;
        submit.textContent = saving
          ? 'Đang lưu…'
          : 'Lưu Rating ban đầu';
      }

      playerSelect.addEventListener('change', () => {
        fillSelectedPlayer(true);
        notice(message, '');
      });
      fillSelectedPlayer();
      sync();

      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving || state.writeBusy || !current()) return;

        notice(message, '');
        const player = selectedPlayer();
        if (!player) {
          notice(message, 'Không tìm thấy VĐV đã chọn.', true);
          return;
        }

        const rating = Number(ratingInput.value);
        if (
          !ratingInput.value.trim() ||
          !Number.isFinite(rating)
        ) {
          notice(message, 'Rating mới là bắt buộc và phải là một số hợp lệ.', true);
          ratingInput.focus();
          return;
        }
        if (rating < ratingMin || rating > ratingMax) {
          notice(
            message,
            `Rating phải từ ${ratingMin.toFixed(3)} đến ${ratingMax.toFixed(3)}.`,
            true
          );
          ratingInput.focus();
          return;
        }

        const trimmedReason = reason.value.trim();
        if (!trimmedReason) {
          notice(message, 'Lý do là bắt buộc.', true);
          reason.focus();
          return;
        }
        if (trimmedReason.length > 1000) {
          notice(message, 'Lý do không được vượt quá 1000 ký tự.', true);
          reason.focus();
          return;
        }

        saving = true;
        state.writeBusy = true;
        sync();
        notice(message, 'Đang kiểm tra lịch sử Rated và lưu thay đổi…');

        try {
          const { data, error } = await client.rpc(
            'set_player_initial_rating_before_history',
            {
              p_player_id: player.id,
              p_rating: rating,
              p_reason: trimmedReason
            }
          );
          if (error) throw error;
          if (!current()) return;

          if (data?.changed === true) {
            const nextInitial = Number(data.new_initial_rating);
            const nextCurrent = Number(data.new_current_rating);
            player.initial_rating = Number.isFinite(nextInitial)
              ? nextInitial
              : rating;
            player.current_rating = Number.isFinite(nextCurrent)
              ? nextCurrent
              : rating;
            reason.value = '';
            state.writeBusy = false;
            saving = false;
            state.page = 'players';
            render();
            notice(
              $('global-message'),
              'Đã cập nhật Rating ban đầu.',
              false,
              true
            );
            return;
          }

          if (data?.changed === false) {
            fillSelectedPlayer(true);
            notice(message, 'Rating ban đầu không thay đổi.');
            return;
          }

          throw new Error('RATING_UPDATE_UNCONFIRMED');
        } catch (error) {
          if (current()) notice(message, errorText(error), true);
        } finally {
          saving = false;
          if (state.session?.user?.id === actor) state.writeBusy = false;
          if (root.isConnected) sync();
        }
      });
    }

    function playerLifecycleManager(
      root,
      deleteMode = false
    ) {
      if (
        (deleteMode && !isAdmin()) ||
        (!deleteMode && !canManagePlayerLifecycle())
      ) {
        return null;
      }

      const playerRows = rows('players')
        .slice()
        .sort((a, b) =>
          playerName(a.id).localeCompare(
            playerName(b.id),
            'vi'
          )
        );

      const section = panel(
        deleteMode
          ? 'Xóa vĩnh viễn VĐV'
          : 'Vòng đời VĐV',
        root
      );

      const message = el('div');
      message.setAttribute('role', 'status');

      if (!playerRows.length) {
        section.append(
          el(
            'p',
            'Chưa có VĐV để quản lý.',
            'muted'
          )
        );
        return null;
      }

      const playerSelect = el(
        'select',
        null,
        'field'
      );
      playerSelect.id = deleteMode
        ? 'delete-player-id'
        : 'lifecycle-player-id';

      playerRows.forEach(player => {
        const status =
          upper(player.status) === 'INACTIVE'
            ? 'Ngừng hoạt động'
            : 'Đang hoạt động';
        const option = el(
          'option',
          `${playerName(player.id)} — ${status}`
        );
        option.value = player.id;
        playerSelect.append(option);
      });

      const selectGroup = el(
        'div',
        null,
        'form-group'
      );
      const selectLabel = el(
        'label',
        'Chọn VĐV'
      );
      selectLabel.htmlFor = playerSelect.id;
      selectGroup.append(
        selectLabel,
        playerSelect
      );

      const previewBox = el(
        'div',
        null,
        'player-lifecycle-preview'
      );
      previewBox.setAttribute(
        'aria-live',
        'polite'
      );

      const reason = el(
        'textarea',
        null,
        'field'
      );
      reason.id = deleteMode
        ? 'delete-player-reason'
        : 'lifecycle-player-reason';
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.placeholder = deleteMode
        ? 'Nhập lý do xóa vĩnh viễn'
        : 'Nhập lý do thay đổi trạng thái';

      const reasonGroup = el(
        'div',
        null,
        'form-group player-lifecycle-reason'
      );
      const reasonLabel = el(
        'label',
        'Lý do (bắt buộc, tối đa 1000 ký tự)'
      );
      reasonLabel.htmlFor = reason.id;
      reasonGroup.append(
        reasonLabel,
        reason
      );

      const submit = el(
        'button',
        deleteMode
          ? 'Xóa vĩnh viễn'
          : 'Đang tải trạng thái…',
        deleteMode
          ? 'btn player-lifecycle-delete'
          : 'btn primary'
      );
      submit.type = 'submit';

      const reloadButton = button(
        'Kiểm tra lại',
        () => {
          void loadPreview();
        },
        'btn'
      );
      reloadButton.type = 'button';

      const actions = el(
        'div',
        null,
        'form-actions player-lifecycle-actions'
      );
      actions.append(
        submit,
        reloadButton
      );

      const form = el('form');
      form.append(
        selectGroup,
        previewBox,
        reasonGroup,
        message,
        actions
      );

      section.append(
        el(
          'p',
          deleteMode
            ? 'Chỉ xóa được VĐV chưa từng có dữ liệu liên quan. Backend sẽ kiểm tra lại ngay trước khi xóa.'
            : 'Thay đổi trạng thái không xóa hoặc đặt lại lịch sử, Rating, liên kết tài khoản và dữ liệu nghiệp vụ.',
          deleteMode
            ? 'notice player-lifecycle-danger-note'
            : 'notice'
        ),
        form
      );

      let preview = null;
      let loading = false;
      let saving = false;
      let requestVersion = 0;

      const current = () =>
        root.isConnected &&
        (deleteMode
          ? isAdmin()
          : canManagePlayerLifecycle());

      function selectedPlayer() {
        return playerRows.find(
          player =>
            String(player.id) ===
            String(playerSelect.value)
        ) || null;
      }

      function lifecycleErrorText(error) {
        const code = String(
          error?.message ||
          error?.details ||
          error?.code ||
          ''
        );

        const known = [
          ['PLAYER_NOT_FOUND', 'Không tìm thấy VĐV. Hãy tải lại danh sách.'],
          ['PLAYER_STATUS_INVALID', 'Trạng thái VĐV không hợp lệ.'],
          ['REASON_REQUIRED_MAX_1000', 'Lý do là bắt buộc và không được quá 1000 ký tự.'],
          ['ADMIN_REQUIRED', 'Chỉ ADMIN đang hoạt động mới được xóa vĩnh viễn VĐV.'],
          ['PLAYER_LIFECYCLE_PERMISSION_REQUIRED', 'Tài khoản không có quyền quản lý vòng đời VĐV.'],
          ['BUSINESS_ACCESS_REQUIRED', 'Tài khoản chưa đủ điều kiện truy cập nghiệp vụ.'],
          ['PLAYER_STATUS_CHANGE_REQUIRES_LIFECYCLE_RPC', 'Trạng thái phải được đổi trong mục Vòng đời VĐV.']
        ];

        const match = known.find(
          ([token]) => code.includes(token)
        );
        return match
          ? match[1]
          : explain(error);
      }

      function referenceDetails(info) {
        const labels = [
          ['profile_link_count', 'Tài khoản liên kết'],
          ['match_players_count', 'Lượt tham gia trận'],
          ['rating_events_count', 'Lịch sử Rating'],
          ['rating_adjustments_count', 'Điều chỉnh Rating'],
          ['rating_adjustment_events_count', 'Sự kiện điều chỉnh Rating'],
          ['fund_contributions_count', 'Nghĩa vụ Quỹ'],
          ['fund_payments_count', 'Thanh toán Quỹ'],
          ['fund_transactions_count', 'Giao dịch Quỹ'],
          ['tournament_registrations_count', 'Đăng ký giải'],
          ['tournament_payments_count', 'Thanh toán giải'],
          ['awards_count', 'Danh hiệu']
        ];

        return labels
          .map(([key, label]) => [
            label,
            Number(info?.[key] || 0)
          ])
          .filter(([, count]) => count > 0);
      }

      function renderPreview() {
        previewBox.replaceChildren();

        if (!preview) {
          previewBox.append(
            el(
              'p',
              loading
                ? 'Đang kiểm tra trạng thái và dữ liệu liên quan…'
                : 'Chưa tải được dữ liệu vòng đời.',
              'muted'
            )
          );
          sync();
          return;
        }

        const status =
          upper(preview.current_status) === 'INACTIVE'
            ? 'INACTIVE'
            : 'ACTIVE';
        const referenceTotal = Math.max(
          0,
          Number(preview.reference_total || 0)
        );
        const summary = el(
          'div',
          null,
          'player-lifecycle-summary'
        );
        summary.append(
          el(
            'span',
            status === 'ACTIVE'
              ? 'Đang hoạt động'
              : 'Ngừng hoạt động',
            'badge player-state-' +
              (status === 'ACTIVE'
                ? 'active'
                : 'neutral')
          ),
          el(
            'span',
            referenceTotal > 0
              ? `${referenceTotal} dữ liệu liên quan`
              : 'Chưa có dữ liệu liên quan',
            'player-lifecycle-reference-total'
          )
        );
        previewBox.append(summary);

        if (deleteMode) {
          previewBox.append(
            el(
              'p',
              preview.hard_delete_allowed === true
                ? 'Backend xác nhận VĐV hiện đủ điều kiện xóa. Điều kiện sẽ được kiểm tra lại khi xác nhận.'
                : `VĐV đã có dữ liệu liên quan và không thể xóa vĩnh viễn. Hãy dùng Ngừng hoạt động${referenceTotal > 0 ? ` (${referenceTotal} tham chiếu)` : ''}.`,
              preview.hard_delete_allowed === true
                ? 'notice player-lifecycle-delete-ready'
                : 'notice player-lifecycle-delete-blocked'
            )
          );
        } else {
          previewBox.append(
            el(
              'p',
              status === 'ACTIVE'
                ? 'Có thể ngừng hoạt động; toàn bộ lịch sử vẫn được giữ nguyên.'
                : 'Có thể kích hoạt lại; Rating và lịch sử hiện có không thay đổi.',
              'player-lifecycle-recommendation'
            )
          );
        }

        const details = referenceDetails(preview);
        if (details.length) {
          const disclosure = el(
            'details',
            null,
            'player-lifecycle-references'
          );
          disclosure.append(
            el(
              'summary',
              'Chi tiết dữ liệu liên quan'
            )
          );
          const list = el('ul');
          details.forEach(([label, count]) => {
            list.append(
              el(
                'li',
                `${label}: ${count}`
              )
            );
          });
          disclosure.append(list);
          previewBox.append(disclosure);
        }

        sync();
      }

      function sync() {
        const unavailable =
          loading ||
          saving ||
          state.writeBusy ||
          !current();
        playerSelect.disabled = unavailable;
        reason.disabled = unavailable;
        reloadButton.disabled = unavailable;

        if (!preview) {
          submit.disabled = true;
          submit.textContent = loading
            ? 'Đang kiểm tra…'
            : deleteMode
              ? 'Xóa vĩnh viễn'
              : 'Chưa có trạng thái';
          return;
        }

        const status =
          upper(preview.current_status) === 'INACTIVE'
            ? 'INACTIVE'
            : 'ACTIVE';
        submit.textContent = saving
          ? 'Đang xử lý…'
          : deleteMode
            ? 'Xóa vĩnh viễn'
            : status === 'ACTIVE'
              ? 'Ngừng hoạt động'
              : 'Kích hoạt lại';
        submit.disabled =
          unavailable ||
          (deleteMode &&
            preview.hard_delete_allowed !== true);
        submit.className = deleteMode
          ? 'btn player-lifecycle-delete'
          : status === 'ACTIVE'
            ? 'btn player-lifecycle-warning'
            : 'btn primary';
      }

      async function loadPreview(options = {}) {
        if (!current() || saving) {
          return;
        }

        const player = selectedPlayer();
        if (!player) {
          return;
        }

        const token = ++requestVersion;
        loading = true;
        preview = null;
        renderPreview();
        if (!options.keepMessage) {
          notice(message, '');
        }

        try {
          const { data, error } = await client.rpc(
            'get_player_lifecycle_preview',
            {
              p_player_id: player.id
            }
          );
          if (error) {
            throw error;
          }
          if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            String(data.player_id) !== String(player.id)
          ) {
            throw new Error(
              'PLAYER_LIFECYCLE_PREVIEW_INVALID'
            );
          }
          if (!current() || token !== requestVersion) {
            return;
          }
          preview = data;
        } catch (error) {
          if (current() && token === requestVersion) {
            notice(
              message,
              'Không tải được dữ liệu vòng đời. ' +
                lifecycleErrorText(error),
              true
            );
          }
        } finally {
          if (token === requestVersion) {
            loading = false;
            renderPreview();
          }
        }
      }

      playerSelect.addEventListener(
        'change',
        () => {
          reason.value = '';
          void loadPreview();
        }
      );

      form.addEventListener(
        'submit',
        async event => {
          event.preventDefault();

          if (
            state.writeBusy ||
            saving ||
            !current() ||
            !preview
          ) {
            return;
          }

          const player = selectedPlayer();
          const cleanReason = reason.value.trim();

          if (!player) {
            notice(
              message,
              'Không tìm thấy VĐV đã chọn.',
              true
            );
            return;
          }

          if (!cleanReason || cleanReason.length > 1000) {
            notice(
              message,
              'Lý do là bắt buộc và không được quá 1000 ký tự.',
              true
            );
            reason.focus();
            return;
          }

          if (
            deleteMode &&
            preview.hard_delete_allowed !== true
          ) {
            notice(
              message,
              'VĐV hiện không đủ điều kiện xóa vĩnh viễn. Hãy kiểm tra lại dữ liệu liên quan.',
              true
            );
            return;
          }

          const currentStatus =
            upper(preview.current_status) === 'INACTIVE'
              ? 'INACTIVE'
              : 'ACTIVE';
          const targetStatus =
            currentStatus === 'ACTIVE'
              ? 'INACTIVE'
              : 'ACTIVE';
          const actionLabel = deleteMode
            ? 'xóa vĩnh viễn'
            : targetStatus === 'INACTIVE'
              ? 'ngừng hoạt động'
              : 'kích hoạt lại';
          const confirmation = deleteMode
            ? `Xóa vĩnh viễn VĐV ${playerName(player.id)}?\nThao tác này không thể hoàn tác. Backend sẽ kiểm tra lại toàn bộ dữ liệu liên quan.`
            : `${targetStatus === 'INACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt lại'} VĐV ${playerName(player.id)}?\nLịch sử và Rating sẽ được giữ nguyên.`;

          if (!window.confirm(confirmation)) {
            return;
          }

          saving = true;
          state.writeBusy = true;
          sync();
          notice(
            message,
            `Đang ${actionLabel} VĐV…`
          );

          try {
            const rpcName = deleteMode
              ? 'delete_player_if_unreferenced'
              : 'set_player_lifecycle_status';
            const args = deleteMode
              ? {
                  p_player_id: player.id,
                  p_reason: cleanReason
                }
              : {
                  p_player_id: player.id,
                  p_status: targetStatus,
                  p_reason: cleanReason
                };
            const { data, error } = await client.rpc(
              rpcName,
              args
            );

            if (error) {
              throw error;
            }

            if (
              !data ||
              data.success !== true ||
              (deleteMode && data.deleted !== true)
            ) {
              throw new Error(
                'PLAYER_LIFECYCLE_WRITE_UNCONFIRMED'
              );
            }

            state.writeBusy = false;
            await load();
            state.page = 'players';
            render();
            notice(
              $('global-message'),
              deleteMode
                ? 'Đã xóa vĩnh viễn VĐV chưa có dữ liệu liên quan.'
                : targetStatus === 'INACTIVE'
                  ? 'Đã chuyển VĐV sang Ngừng hoạt động. Lịch sử và Rating được giữ nguyên.'
                  : 'Đã kích hoạt lại VĐV. Lịch sử và Rating được giữ nguyên.',
              false,
              true
            );
          } catch (error) {
            const code = String(
              error?.message ||
              error?.details ||
              ''
            );

            if (
              deleteMode &&
              code.includes('PLAYER_HAS_REFERENCES')
            ) {
              notice(
                message,
                'VĐV vừa phát sinh dữ liệu liên quan nên không thể xóa vĩnh viễn. Hãy dùng Ngừng hoạt động.',
                true
              );
              saving = false;
              state.writeBusy = false;
              await loadPreview({
                keepMessage: true
              });
              return;
            }

            notice(
              message,
              `Không thể ${actionLabel} VĐV. ` +
                lifecycleErrorText(error),
              true
            );
          } finally {
            saving = false;
            state.writeBusy = false;
            sync();
          }
        }
      );

      sync();
      return loadPreview;
    }

    function playerDetailSection(root) {
      let adminMemberDirectoryPromise = null;

      async function getAdminMemberDirectory() {
        if (
          upper(state.profile?.role) !== 'ADMIN' ||
          state.profile?.is_active !== true
        ) {
          return [];
        }

        if (adminMemberDirectoryPromise) {
          return adminMemberDirectoryPromise;
        }

        adminMemberDirectoryPromise = (async () => {
          const result = [];
          const pageSize = 200;

          for (
            let offset = 0;
            ;
            offset += pageSize
          ) {
            const {
              data,
              error
            } = await client.rpc(
              'get_admin_member_permissions',
              {
                p_limit: pageSize,
                p_offset: offset
              }
            );

            if (error) {
              throw error;
            }

            if (!Array.isArray(data)) {
              throw new Error(
                'INVALID_MEMBER_DIRECTORY'
              );
            }

            result.push(...data);

            if (data.length < pageSize) {
              break;
            }
          }

          return result;
        })();

        try {
          return await adminMemberDirectoryPromise;
        } catch (error) {
          adminMemberDirectoryPromise = null;
          throw error;
        }
      }
      const section =
        panel(
          'Hồ sơ & thành tích VĐV',
          root
        );

      const description =
        el(
          'p',
          'Thông tin chính được giữ gọn. Bấm Xem chi tiết để xem thành tích, phong độ và lịch sử Rating.',
          'notice'
        );

      section.append(
        description
      );

      if (
        !rows('players').length
      ) {
        section.append(
          el(
            'p',
            'Chưa có VĐV.',
            'muted'
          )
        );

        return;
      }

      const approvedMatches =
        new Map(
          rows('matches')
            .filter(
              match =>
                upper(
                  match.status
                ) === 'APPROVED'
            )
            .map(
              match => [
                match.id,
                match
              ]
            )
        );

      const membershipsByMatch =
        new Map();

      rows('match_players')
        .forEach(mp => {
          if (
            !membershipsByMatch.has(
              mp.match_id
            )
          ) {
            membershipsByMatch.set(
              mp.match_id,
              []
            );
          }

          membershipsByMatch
            .get(
              mp.match_id
            )
            .push(
              mp
            );
        });

      const ratingEventsByPlayer =
        new Map();

      rows('rating_events')
        .filter(
          event =>
            event.algorithm_version ===
              CURRENT_RATING_VERSION &&
            event.player_id
        )
        .forEach(event => {
          if (
            !ratingEventsByPlayer.has(
              event.player_id
            )
          ) {
            ratingEventsByPlayer.set(
              event.player_id,
              []
            );
          }

          ratingEventsByPlayer
            .get(
              event.player_id
            )
            .push(
              event
            );
        });

      function matchTypeLabel(
        value
      ) {
        const labels = {
          TOURNAMENT:
            'Giải đấu',
          LEAGUE:
            'Giải nội bộ',
          CLUB_RATED:
            'CLB Rated',
          FRIENDLY_RATED:
            'Giao hữu Rated',
          SELF_REPORTED:
            'Tự khai báo',
          TRAINING:
            'Tập luyện'
        };

        const key =
          upper(
            value
          );

        return (
          labels[key] ||
          raw(
            value
          ) ||
          'Không xác định'
        );
      }

      function playerResults(
        playerId
      ) {
        const seen =
          new Set();

        const results = [];

        rows('match_players')
          .forEach(mp => {
            if (
              mp.player_id !==
              playerId
            ) {
              return;
            }

            const match =
              approvedMatches.get(
                mp.match_id
              );

            if (!match) {
              return;
            }

            const key =
              `${match.id}:${playerId}`;

            if (seen.has(key)) {
              return;
            }

            const side =
              upper(
                mp.team ||
                mp.team_side
              );

            if (
              side !== 'A' &&
              side !== 'B'
            ) {
              return;
            }

            const scoreA =
              Number(
                match.team_a_score
              );

            const scoreB =
              Number(
                match.team_b_score
              );

            if (
              !Number.isFinite(
                scoreA
              ) ||
              !Number.isFinite(
                scoreB
              )
            ) {
              return;
            }

            let result = 'D';

            if (scoreA !== scoreB) {
              const winner =
                scoreA > scoreB
                  ? 'A'
                  : 'B';

              result =
                side === winner
                  ? 'W'
                  : 'L';
            }

            const playedAt =
              new Date(
                match.played_at
              );

            seen.add(key);

            results.push({
              match,
              side,
              result,
              playedAt
            });
          });

        return results.sort(
          (a, b) =>
            (
              Number.isFinite(
                b.playedAt.getTime()
              )
                ? b.playedAt.getTime()
                : 0
            ) -
              (
                Number.isFinite(
                  a.playedAt.getTime()
                )
                  ? a.playedAt.getTime()
                  : 0
              ) ||
            (
              Number(
                b.match.match_number
              ) || 0
            ) -
              (
                Number(
                  a.match.match_number
                ) || 0
              ) ||
            String(
              b.match.id
            ).localeCompare(
              String(
                a.match.id
              )
            )
        );
      }

      const playerRows =
        rows('players')
          .slice()
          .sort(
            (a, b) => {
              const activeA =
                upper(
                  a.status
                ) === 'ACTIVE'
                  ? 0
                  : 1;

              const activeB =
                upper(
                  b.status
                ) === 'ACTIVE'
                  ? 0
                  : 1;

              return (
                activeA -
                  activeB ||
                playerName(
                  a.id
                ).localeCompare(
                  playerName(
                    b.id
                  ),
                  'vi'
                )
              );
            }
          );

      const grid =
        el(
          'div',
          null,
          'grid gap-3 player-card-list ui-card-list'
        );

      playerRows.forEach(
        player => {
          const results =
            playerResults(
              player.id
            );

          const wins =
            results.filter(
              item =>
                item.result === 'W'
            ).length;

          const losses =
            results.filter(
              item =>
                item.result === 'L'
            ).length;

          const draws =
            results.filter(
              item =>
                item.result === 'D'
            ).length;

          const winRate =
            results.length
              ? (
                  wins /
                  results.length *
                  100
                ).toFixed(1)
              : '0.0';

          const recentForm =
            results.slice(
              0,
              5
            );

          const card =
            el(
              'div',
              null,
              'player-record-card ui-compact-card'
            );

          // PICK MOBILE PLAYER CARD V1
          const header =
            el(
              'div',
              null,
              'player-card-header'
            );

          const identity =
            el(
              'div',
              null,
              'player-card-identity'
            );

          const name = el('h3', playerName(player.id), 'player-card-name');
          name.title = playerName(player.id);
          const metadata = el('div', null, 'player-card-meta');
          metadata.append(
            el('span', upper(player.player_type) || 'CLUB', 'badge'),
            el('span', upper(player.status) === 'ACTIVE' ? 'Đang hoạt động' :
              upper(player.status) === 'INACTIVE' ? 'Ngừng hoạt động' : 'Chưa rõ trạng thái',
              'badge player-state-' + (upper(player.status) === 'ACTIVE' ? 'active' : 'neutral'))
          );
          if (state.profile?.player_id === player.id) {
            metadata.append(el('span', 'Hồ sơ của bạn', 'badge player-self-badge'));
          }
          identity.append(name, metadata);
          const summary = el('div', null, 'player-card-rating');
          summary.append(
            el('span', 'Rating', 'player-rating-label'),
            el('strong', number(player.current_rating), 'player-rating-value')
          );

          const detail =
            el(
              'div',
              null,
              'player-card-detail'
            );

          detail.hidden =
            true;

          const toggle =
            button(
              'Xem chi tiết',
              () => {
                detail.hidden =
                  !detail.hidden;

                toggle.setAttribute('aria-expanded', String(!detail.hidden));
                toggle.textContent =
                  detail.hidden
                    ? 'Xem chi tiết'
                    : 'Thu gọn';

                if (!detail.hidden) {
                  void loadLinkedAccount();
                }
              },
              'btn player-card-toggle'
            );

          toggle.type =
            'button';

          detail.id = 'player-detail-' + player.id;
          toggle.setAttribute('aria-controls', detail.id);
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Chi tiết VĐV ' + playerName(player.id));
          header.append(
            identity,
            summary,
            toggle
          );

          const stats =
            el(
              'div',
              null,
              'player-stats ui-kpi-grid ui-kpi-grid-compact'
            );

          [
            [
              'Trận',
              results.length
            ],
            [
              'Thắng',
              wins
            ],
            [
              'Thua',
              losses
            ],
            [
              'Hòa',
              draws
            ],
            [
              'Tỷ lệ thắng',
              `${winRate}%`
            ]
          ].forEach(
            ([label, value]) => {
              const stat =
                el(
                  'div',
                  null,
                  'player-stat ui-summary-card'
                );

              stat.append(
                el(
                  'div',
                  label,
                  'text-xs opacity-60 ui-card-label'
                ),
                el(
                  'div',
                  String(
                    value
                  ),
                  'font-semibold mt-1 ui-card-value'
                )
              );

              stats.append(
                stat
              );
            }
          );

          const profile =
            el(
              'div',
              null,
              'mt-4'
            );

          profile.append(
            el(
              'div',
              'Hồ sơ',
              'font-semibold mb-2'
            ),
            el(
              'div',
              `Điện thoại: ${
                raw(
                  player.phone
                ) ||
                '—'
              }`,
              'text-sm'
            ),
            el(
              'div',
              `Ngày sinh: ${
                player.date_of_birth
                  ? String(
                      player.date_of_birth
                    ).slice(
                      0,
                      10
                    )
                  : '—'
              }`,
              'text-sm mt-1'
            ),
            el(
              'div',
              `Ngày tham gia: ${
                player.joined_at
                  ? String(
                      player.joined_at
                    ).slice(
                      0,
                      10
                    )
                  : '—'
              }`,
              'text-sm mt-1'
            ),
            el(
              'div',
              `Rating khởi tạo: ${number(
                player.initial_rating
              )} • Hiện tại: ${number(
                player.current_rating
              )}`,
              'text-sm mt-1'
            )
          );

          const linkedAccount =
            el(
              'div',
              null,
              'mt-4 rounded-xl border p-3'
            );

          const linkedAccountBody =
            el(
              'div',
              null,
              'text-sm'
            );

          linkedAccount.append(
            el(
              'div',
              'Tài khoản liên kết',
              'font-semibold mb-2'
            ),
            linkedAccountBody
          );

          profile.append(
            linkedAccount
          );

          let linkedAccountLoaded =
            false;

          let linkedAccountLoading =
            false;

          function linkedAccountErrorText(error) {
            const code =
              String(
                error?.message ||
                error?.code ||
                ''
              );

            if (code.includes('LOGIN_NAME_TAKEN')) {
              return 'Nickname này đã được sử dụng.';
            }

            if (code.includes('LOGIN_NAME_INVALID_LENGTH')) {
              return 'Nickname phải có từ 3 đến 32 ký tự.';
            }

            if (code.includes('LOGIN_NAME_INVALID_FORMAT')) {
              return 'Nickname chỉ được dùng chữ cái, số, dấu chấm, gạch dưới và gạch ngang.';
            }

            if (code.includes('LOGIN_NAME_ALREADY_SET')) {
              return 'Tài khoản này đã có nickname.';
            }

            if (code.includes('TARGET_ACCOUNT_INACTIVE')) {
              return 'Tài khoản đang bị vô hiệu hóa.';
            }

            if (code.includes('ADMIN_REQUIRED')) {
              return 'Chỉ ADMIN đang hoạt động mới được thực hiện thao tác này.';
            }

            return explain(error);
          }

          function renderLinkedAccount(account) {
            linkedAccountBody.replaceChildren();

            if (!account) {
              linkedAccountBody.append(
                el(
                  'div',
                  'Tài khoản: Chưa liên kết',
                  'muted'
                )
              );

              return;
            }

            linkedAccountBody.append(
              el(
                'div',
                `Nickname: ${
                  raw(account.login_name) ||
                  'Chưa có'
                }`
              ),
              el(
                'div',
                `Trạng thái tài khoản: ${
                  account.is_active === true
                    ? 'Đang hoạt động'
                    : 'Đã vô hiệu hóa'
                }`,
                'mt-1'
              )
            );

            if (
              account.login_name ||
              account.is_active !== true
            ) {
              return;
            }

            const form =
              el(
                'form',
                null,
                'mt-3'
              );

            const group =
              el(
                'div',
                null,
                'form-group'
              );

            const label =
              el(
                'label',
                'Tạo nickname'
              );

            const input =
              el(
                'input',
                null,
                'field'
              );

            input.type = 'text';
            input.autocomplete = 'off';
            input.minLength = 3;
            input.maxLength = 32;
            input.placeholder = 'Ví dụ: nguyen.van.a';

            group.append(
              label,
              input
            );

            const message =
              el('div');

            message.setAttribute(
              'role',
              'status'
            );

            const submit =
              el(
                'button',
                'Lưu nickname',
                'btn primary'
              );

            submit.type = 'submit';

            const actions =
              el(
                'div',
                null,
                'form-actions mt-3'
              );

            actions.append(
              submit
            );

            form.append(
              group,
              message,
              actions
            );

            form.addEventListener(
              'submit',
              async event => {
                event.preventDefault();

                if (
                  state.writeBusy ||
                  account.login_name ||
                  account.is_active !== true
                ) {
                  return;
                }

                const loginName =
                  input.value
                    .trim()
                    .toLowerCase();

                if (
                  !/^[a-z0-9._-]{3,32}$/
                    .test(loginName)
                ) {
                  notice(
                    message,
                    'Nickname phải có 3–32 ký tự và chỉ dùng chữ cái, số, dấu chấm, gạch dưới hoặc gạch ngang.',
                    true
                  );

                  input.focus();
                  return;
                }

                state.writeBusy = true;
                input.disabled = true;
                submit.disabled = true;
                submit.textContent = 'Đang lưu…';

                notice(
                  message,
                  'Đang tạo nickname…'
                );

                try {
                  const {
                    data,
                    error
                  } = await client.rpc(
                    'admin_set_member_nickname',
                    {
                      p_profile_id:
                        account.profile_id,
                      p_nickname:
                        loginName
                    }
                  );

                  if (error) {
                    throw error;
                  }

                  if (data?.success !== true) {
                    throw new Error(
                      'NICKNAME_SAVE_UNCONFIRMED'
                    );
                  }

                  account.login_name =
                    data.login_name ||
                    loginName;

                  renderLinkedAccount(
                    account
                  );

                  notice(
                    $('global-message'),
                    `Đã tạo nickname "${account.login_name}" cho ${playerName(player.id)}.`
                  );
                } catch (error) {
                  input.disabled = false;
                  submit.disabled = false;
                  submit.textContent = 'Lưu nickname';

                  notice(
                    message,
                    'Không tạo được nickname. ' +
                      linkedAccountErrorText(error),
                    true
                  );
                } finally {
                  state.writeBusy = false;
                }
              }
            );

            linkedAccountBody.append(
              form
            );
          }

          async function loadLinkedAccount() {
            if (
              linkedAccountLoaded ||
              linkedAccountLoading
            ) {
              return;
            }

            if (
              upper(state.profile?.role) !== 'ADMIN' ||
              state.profile?.is_active !== true
            ) {
              linkedAccount.hidden = true;
              return;
            }

            linkedAccountLoading = true;

            linkedAccountBody.replaceChildren(
              el(
                'div',
                'Đang tải tài khoản liên kết…',
                'muted'
              )
            );

            try {
              const members =
                await getAdminMemberDirectory();

              const account =
                members.find(
                  item =>
                    item.player_id &&
                    String(item.player_id) ===
                      String(player.id)
                ) ||
                null;

              linkedAccountLoaded = true;

              renderLinkedAccount(
                account
              );
            } catch (error) {
              linkedAccountBody.replaceChildren();

              notice(
                linkedAccountBody,
                'Không tải được tài khoản liên kết. ' +
                  explain(error),
                true
              );
            } finally {
              linkedAccountLoading = false;
            }
          }

          if (
            upper(state.profile?.role) !== 'ADMIN'
          ) {
            linkedAccount.hidden = true;
          }
          const formSection =
            el(
              'div',
              null,
              'mt-4'
            );

          formSection.append(
            el(
              'div',
              'Phong độ 5 trận gần nhất',
              'font-semibold mb-2'
            )
          );

          if (!recentForm.length) {
            formSection.append(
              el(
                'div',
                'Chưa có trận.',
                'text-sm opacity-60'
              )
            );
          } else {
            const formLine =
              el(
                'div',
                null,
                'flex flex-wrap gap-2'
              );

            const formDetail =
              el(
                'div',
                null,
                'mt-3'
              );

            let openedMatchId =
              null;

            recentForm.forEach(
              item => {
                const resultButton =
                  button(
                    item.result,
                    () => {
                      if (
                        openedMatchId ===
                        item.match.id
                      ) {
                        formDetail
                          .replaceChildren();

                        openedMatchId =
                          null;

                        return;
                      }

                      formDetail
                        .replaceChildren();

                      openedMatchId =
                        item.match.id;

                      const members =
                        membershipsByMatch.get(
                          item.match.id
                        ) || [];

                      const partners =
                        members
                          .filter(mp =>
                            mp.player_id !==
                              player.id &&
                            upper(
                              mp.team ||
                              mp.team_side
                            ) ===
                              item.side
                          )
                          .map(mp =>
                            playerName(
                              mp.player_id
                            )
                          );

                      const opponents =
                        members
                          .filter(mp => {
                            const side =
                              upper(
                                mp.team ||
                                mp.team_side
                              );

                            return (
                              mp.player_id !==
                                player.id &&
                              side &&
                              side !==
                                item.side
                            );
                          })
                          .map(mp =>
                            playerName(
                              mp.player_id
                            )
                          );

                      const box =
                        el(
                          'div',
                          null,
                          'rounded-lg border p-3 text-sm'
                        );

                      box.append(
                        el(
                          'div',
                          matchCode(
                            item.match
                          ),
                          'font-semibold'
                        ),
                        el(
                          'div',
                          `Kết quả: ${item.result}`,
                          'mt-1'
                        ),
                        el(
                          'div',
                          `Tỷ số: ${number(
                            item.match
                              .team_a_score
                          )} – ${number(
                            item.match
                              .team_b_score
                          )}`,
                          'mt-1'
                        ),
                        el(
                          'div',
                          `Đồng đội: ${
                            partners.length
                              ? partners.join(
                                  ', '
                                )
                              : '—'
                          }`,
                          'mt-1'
                        ),
                        el(
                          'div',
                          `Đối thủ: ${
                            opponents.length
                              ? opponents.join(
                                  ', '
                                )
                              : '—'
                          }`,
                          'mt-1'
                        ),
                        el(
                          'div',
                          `Loại trận: ${matchTypeLabel(
                            item.match
                              .match_type
                          )}`,
                          'mt-1'
                        )
                      );

                      const close =
                        button(
                          'Thu gọn',
                          () => {
                            formDetail
                              .replaceChildren();

                            openedMatchId =
                              null;
                          },
                          'border rounded-lg px-3 py-1 text-xs mt-3'
                        );

                      close.type =
                        'button';

                      box.append(
                        close
                      );

                      formDetail.append(
                        box
                      );
                    },
                    'btn player-result player-result-' + item.result
                  );

                resultButton.type =
                  'button';

                resultButton.setAttribute('aria-label', (item.result === 'W' ? 'Thắng' : item.result === 'L' ? 'Thua' : 'Hòa') + ' — ' + matchCode(item.match) + ' — Xem chi tiết');
                resultButton.title =
                  'Xem/thu gọn chi tiết trận';

                formLine.append(
                  resultButton
                );
              }
            );

            formSection.append(
              formLine,
              formDetail
            );
          }

          const ratingSection =
            el(
              'div',
              null,
              'mt-4'
            );

          const ratingToggle =
            button(
              'Lịch sử Rating',
              () => {
                ratingBody.hidden =
                  !ratingBody.hidden;

                ratingToggle.setAttribute('aria-expanded', String(!ratingBody.hidden));
                ratingToggle.textContent =
                  ratingBody.hidden
                    ? 'Lịch sử Rating'
                    : 'Thu gọn lịch sử Rating';
              },
              'btn player-history-toggle'
            );

          ratingToggle.type =
            'button';

          const ratingBody =
            el(
              'div',
              null,
              'mt-3'
            );

          ratingBody.hidden =
            true;

          ratingBody.id = 'player-rating-history-' + player.id;
          ratingToggle.setAttribute('aria-controls', ratingBody.id);
          ratingToggle.setAttribute('aria-expanded', 'false');

          const ratingHistory =
            (
              ratingEventsByPlayer.get(
                player.id
              ) || []
            )
              .slice()
              .sort(
                (a, b) => {
                  const matchA =
                    approvedMatches.get(
                      a.match_id
                    );

                  const matchB =
                    approvedMatches.get(
                      b.match_id
                    );

                  const timeA =
                    matchA?.played_at
                      ? new Date(
                          matchA.played_at
                        ).getTime()
                      : new Date(
                          a.created_at || 0
                        ).getTime();

                  const timeB =
                    matchB?.played_at
                      ? new Date(
                          matchB.played_at
                        ).getTime()
                      : new Date(
                          b.created_at || 0
                        ).getTime();

                  return (
                    (
                      Number.isFinite(
                        timeB
                      )
                        ? timeB
                        : 0
                    ) -
                    (
                      Number.isFinite(
                        timeA
                      )
                        ? timeA
                        : 0
                    )
                  );
                }
              );

          if (!ratingHistory.length) {
            ratingBody.append(
              el(
                'div',
                'Chưa có lịch sử Rating trong phiên bản hiện hành.',
                'text-sm opacity-60'
              )
            );
          } else {
            ratingHistory.forEach(
              event => {
                const match =
                  approvedMatches.get(
                    event.match_id
                  );

                const delta =
                  Number(
                    event.rating_delta
                  );

                const deltaText =
                  Number.isFinite(
                    delta
                  )
                    ? (
                        delta >= 0
                          ? '+'
                          : ''
                      ) +
                      delta.toFixed(3)
                    : '—';

                const row =
                  el(
                    'div',
                    null,
                    'player-history-row'
                  );

                row.append(
                  el(
                    'div',
                    match
                      ? matchCode(
                          match
                        )
                      : (
                          event.match_id
                            ? String(
                                event.match_id
                              ).slice(
                                0,
                                8
                              )
                            : 'Điều chỉnh'
                        ),
                    'font-semibold'
                  ),
                  el(
                    'div',
                    `${number(
                      event.rating_before
                    )} → ${number(
                      event.rating_after
                    )} (${deltaText})`,
                    'opacity-70 mt-1'
                  )
                );

                ratingBody.append(
                  row
                );
              }
            );
          }

          ratingSection.append(
            ratingToggle,
            ratingBody
          );

          detail.append(
            stats,
            profile,
            formSection,
            ratingSection
          );

          card.append(
            header,
            detail
          );

          grid.append(
            card
          );
        }
      );

      section.append(
        grid
      );
    }

    // P0.4F: read-only preview; the RPC remains the final transactional guard.
    function promoteGuestForm(root) {
      if (!(canManageMembers() && canManagePlayers())) return;
      const actor = state.session?.user?.id;
      const generation = state.generation;
      const section = panel('Chuyển VĐV khách thành thành viên', root);
      const message = el('div');
      message.setAttribute('role', 'status');
      const preview = el('div', null, 'player-promotion-preview');
      preview.setAttribute('aria-live', 'polite');
      const account = el('select', null, 'field');
      const guest = el('select', null, 'field');
      account.id = 'promote-member-account';
      guest.id = 'promote-guest-player';
      const fields = el('div', null, 'form-grid');
      [[account, 'Tài khoản thành viên'], [guest, 'VĐV khách được giữ']].forEach(([input, text]) => {
        const group = el('div', null, 'form-group');
        const label = el('label', text);
        label.htmlFor = input.id;
        group.append(label, input);
        fields.append(group);
      });
      let members = [], guests = [], checked = null;
      let reading = false, saving = false, version = 0, committed = false;
      const current = () => root.isConnected && canManageMembers() && canManagePlayers() &&
        state.profile?.is_active === true && state.session?.user?.id === actor &&
        state.generation === generation && !state.busy;
      const reload = button('Tải danh sách thành viên và khách', loadChoices, 'btn');
      const submit = button('Xác nhận chuyển thành viên', promote, 'btn primary');
      reload.type = submit.type = 'button';
      const controls = el('div', null, 'form-actions player-promotion-actions');
      controls.append(reload, submit);
      section.append(el('p',
        'Chọn đúng tài khoản và VĐV của cùng một người. Giữ nguyên ID, Rating và toàn bộ lịch sử của khách; hồ sơ VĐV tạm sẽ ngừng hoạt động. Tên và thông tin liên hệ không tự sao chép.',
        'notice'), fields, preview, message, controls);

      function sync() {
        const locked = reading || saving || committed || !current() || state.writeBusy;
        account.disabled = guest.disabled = reload.disabled = locked;
        submit.disabled = locked || !checked || checked.blocked;
        submit.textContent = saving ? 'Đang chuyển…' : 'Xác nhận chuyển thành viên';
      }
      function options(input, data, placeholder) {
        input.replaceChildren(new Option(placeholder, ''));
        data.forEach(item => input.append(new Option(
          `${item.full_name || 'Chưa có tên'}`, item.id)));
      }
      async function allRows(tableName, columns, filters) {
        const result = [];
        for (let offset = 0; ; offset += 500) {
          let query = client.from(tableName).select(columns).order('id').range(offset, offset + 499);
          for (const [key, value] of filters) query = query.eq(key, value);
          const { data, error } = await query;
          if (error) throw error;
          if (!Array.isArray(data)) throw new Error('Không đọc được danh sách.');
          result.push(...data);
          if (data.length < 500) return result;
        }
      }
      async function loadChoices() {
        if (!current() || reading || saving || committed || state.writeBusy) return;
        reading = true; checked = null; const token = ++version;
        preview.replaceChildren(); sync();
        notice(message, 'Đang tải danh sách…');
        try {
          const result = await Promise.all([
            client.rpc('get_admin_member_promotion_candidates'),
            allRows('players', 'id,full_name,player_type,status,current_rating', [['player_type', 'GUEST'], ['status', 'ACTIVE']])
          ]);
          if (!current() || token !== version) return;
          if (result[0].error) throw result[0].error;
          if (!Array.isArray(result[0].data)) throw new Error('Không đọc được danh sách MEMBER.');
          members = result[0].data.map(item => ({ id: item.profile_id, full_name: item.profile_full_name, player_id: item.player_id }));
          guests = result[1];
          options(account, members, '— Chọn tài khoản MEMBER —');
          options(guest, guests, '— Chọn GUEST ACTIVE —');
          notice(message, !members.length ? 'Không có MEMBER đang hoạt động có Player liên kết.' :
            !guests.length ? 'Không có VĐV khách đang hoạt động.' : 'Chọn hai hồ sơ để kiểm tra trước khi chuyển.');
        } catch (error) {
          if (current()) {
            members = []; guests = [];
            options(account, [], '— Chưa tải được —'); options(guest, [], '— Chưa tải được —');
            notice(message, 'Không tải được danh sách. ' + explain(error), true);
          }
        } finally { reading = false; sync(); }
      }
      async function inspect(profileId, guestId) {
        const { data, error } = await client.rpc('get_admin_member_promotion_preview', {
          p_profile_id: profileId,
          p_guest_player_id: guestId
        });
        if (error) throw error;
        if (!data || typeof data !== 'object' || Array.isArray(data))
          throw new Error('Không đọc được dữ liệu kiểm tra chuyển thành viên.');
        if (!data.profile || !data.temp || !data.target || !Array.isArray(data.counts))
          throw new Error('Dữ liệu kiểm tra chuyển thành viên không đầy đủ.');
        return data;
      }
      function show(info) {
        preview.replaceChildren();
        const rating = player => player.current_rating == null ? '—' : String(player.current_rating);
        preview.append(el('p', 'Tài khoản: ' + info.profile.full_name, 'player-promotion-account'));
        [
          ['Player hiện tại', info.temp, info.counts[0], info.counts[1], 'CLUB / ACTIVE', 'Hồ sơ tạm sẽ ngừng hoạt động'],
          ['Guest được giữ', info.target, info.matches, info.ratings, 'GUEST / ACTIVE', 'Giữ nguyên Rating và toàn bộ lịch sử']
        ].forEach(([title, player, matches, ratings, status, outcome]) => {
          const card = el('section', null, 'player-promotion-card');
          card.append(
            el('h3', title, 'player-promotion-label'),
            el('p', player.full_name, 'player-card-name'),
            el('p', status, 'player-card-meta'),
            el('p', 'Rating ' + rating(player), 'player-promotion-rating'),
            el('p', matches + ' lượt tham gia trận • ' + ratings + ' Rating events', 'player-promotion-history'),
            el('p', outcome, 'player-promotion-outcome')
          );
          preview.append(card);
        });
        const status = el('div', null, 'player-promotion-status');
        notice(status, info.links ? 'Không thể chuyển: Guest đã liên kết với một tài khoản.' : info.blocked ?
          'Không thể chuyển tự động: Player hiện tại đã có dữ liệu thi đấu, Rating, quỹ, giải đấu hoặc thành tích.' :
          'Player hiện tại chưa có dữ liệu nghiệp vụ cản trở việc chuyển. Hệ thống sẽ kiểm tra lại khi xác nhận.',
          !!(info.links || info.blocked), !(info.links || info.blocked));
        preview.append(status);
      }
      async function selectionChanged() {
        checked = null; const token = ++version; preview.replaceChildren(); sync();
        if (!current() || !account.value || !guest.value) return;
        const profileId = account.value, guestId = guest.value;
        notice(message, 'Đang kiểm tra hồ sơ và dữ liệu nghiệp vụ…');
        try {
          const result = await inspect(profileId, guestId);
          if (!current() || token !== version) return;
          checked = result; show(result); notice(message, '');
        } catch (error) {
          if (current() && token === version) {
            const code = String(
              error?.message ||
              error?.code ||
              ''
            );

            const detail =
              code.includes(
                'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
              )
                ? 'Tài khoản cần đồng thời quyền quản lý thành viên và quyền quản lý VĐV.'
                : explain(error);

            notice(
              message,
              'Chưa thể xác nhận. ' + detail,
              true
            );
          }
        } finally { if (token === version) sync(); }
      }
      async function promote() {
        if (!current() || state.writeBusy || saving || committed || !checked || checked.blocked || submit.disabled) return;
        const before = checked;
        saving = true; state.writeBusy = true; ++version; sync();
        try {
          // Recheck before confirmation; concurrent writes are still guarded by the RPC.
          const fresh = await inspect(before.profile.id, before.target.id);
          if (!current()) return;
          checked = fresh; show(fresh);
          if (fresh.blocked) { notice(message, 'Không thể chuyển: dữ liệu nghiệp vụ đã thay đổi.', true); return; }
          if (fresh.temp.id !== before.temp.id) {
            notice(message, 'Liên kết Player đã thay đổi. Hãy kiểm tra preview mới và xác nhận lại.', true); return;
          }
          if (!window.confirm(`Chuyển tài khoản ${fresh.profile.full_name} sang ${fresh.target.full_name}?\nGiữ nguyên Rating ${fresh.target.current_rating} và toàn bộ lịch sử Guest.\nPlayer ${fresh.temp.full_name} sẽ thành INACTIVE.\nBạn đã xác minh đây là cùng một người?`)) return;
          if (!current()) return;
          const { data, error } = await client.rpc('promote_guest_player_to_member', {
            p_profile_id: fresh.profile.id, p_guest_player_id: fresh.target.id
          });
          if (error) throw error;
          // Never enable a retry after a successful RPC, even if refreshing fails.
          committed = true; checked = null;
          if (!data?.ok) throw new Error('Phản hồi chưa xác định; tải lại dữ liệu để kiểm tra trước khi thao tác tiếp.');
          if (!current()) return;
          state.writeBusy = false;
          await load();
          if (state.session?.user?.id !== actor || !(canManageMembers() && canManagePlayers())) return;
          const incomplete = state.busy || state.errors?.players || state.partial?.players ||
            !rows('players').some(p => p.id === fresh.target.id && p.player_type === 'CLUB') ||
            !rows('players').some(p => p.id === fresh.temp.id && p.status === 'INACTIVE');
          notice($('global-message'), incomplete ?
            'Đã chuyển thành công nhưng dữ liệu hiển thị chưa tải đầy đủ. Hãy tải lại trang; không gửi lại thao tác.' :
            'Đã chuyển thành viên thành công. Giữ nguyên Player ID, Rating và lịch sử của khách.', !!incomplete, !incomplete);
        } catch (error) {
          checked = null;
          if (state.session?.user?.id === actor && canManageMembers() && canManagePlayers()) {
            const text = String(
              error?.message ||
              error?.code ||
              ''
            );

            const detail =
              text.includes('TEMP_PLAYER_HAS_BUSINESS_DATA')
                ? 'Player hiện tại đã có dữ liệu nghiệp vụ.'
                : text.includes(
                    'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
                  )
                  ? 'Tài khoản cần đồng thời quyền quản lý thành viên và quyền quản lý VĐV.'
                  : explain(error);
            notice(root.isConnected ? message : $('global-message'), committed ?
              'RPC đã trả phản hồi; chưa xác minh được dữ liệu sau chuyển. Hãy tải lại trang, không gửi lại thao tác. ' + detail :
              'Chưa xác nhận chuyển thành công. Tải lại danh sách để kiểm tra trước khi thử lại. ' + detail, true);
          }
        } finally {
          saving = false;
          if (state.session?.user?.id === actor) state.writeBusy = false;
          sync();
        }
      }
      account.addEventListener('change', selectionChanged);
      guest.addEventListener('change', selectionChanged);
      options(account, [], '— Tải danh sách để chọn —');
      options(guest, [], '— Tải danh sách để chọn —');
      sync();
      return loadChoices;
    }


    function playersPage() {
      const root = el('div', null, 'players-ui');
      $('content').append(root);

      sources(
        root,
        [
          'players',
          'matches',
          'match_players',
          'rating_events'
        ]
      );

      if (canManagePlayers()) {
        collapsibleAdminSection(
          root,
          'Tạo VĐV',
          container => {
            createPlayerForm(
              container
            );
          },
          'success'
        );
      }

      if (canManageMembers() && canManagePlayers()) {
        let loadPromotion;
        const promotion = collapsibleAdminSection(
          root,
          'Chuyển VĐV khách thành thành viên',
          container => {
            loadPromotion = promoteGuestForm(
              container
            );
          },
          'info'
        );
        promotion.toggle.addEventListener(
          'click',
          () => {
            if (!promotion.body.hidden) {
              void loadPromotion?.();
            }
          }
        );
      }

      if (canManagePlayers()) {
        collapsibleAdminSection(
          root,
          'Sửa thông tin VĐV',
          container => {
            updatePlayerForm(
              container
            );
          },
          'info'
        );
      }

      if (isAdmin()) {
          collapsibleAdminSection(
            root,
            'Điều chỉnh Rating ban đầu',
            container => {
              initialRatingAdjustmentForm(container);
            },
            'info'
          );
      }

      if (canManagePlayerLifecycle()) {
        let loadLifecycle;
        const lifecycle = collapsibleAdminSection(
          root,
          'Vòng đời VĐV',
          container => {
            loadLifecycle = playerLifecycleManager(
              container
            );
          },
          'neutral'
        );
        lifecycle.toggle.addEventListener(
          'click',
          () => {
            if (!lifecycle.body.hidden) {
              void loadLifecycle?.();
            }
          }
        );
      }

      if (isAdmin()) {
        let loadDeletePreview;
        const deletion = collapsibleAdminSection(
          root,
          'Xóa vĩnh viễn VĐV',
          container => {
            loadDeletePreview = playerLifecycleManager(
              container,
              true
            );
          },
          'danger'
        );
        deletion.toggle.addEventListener(
          'click',
          () => {
            if (!deletion.body.hidden) {
              void loadDeletePreview?.();
            }
          }
        );
      }

      playerDetailSection(root);
    }
    return {
      playersPage
    };
  }

  window.PickPlayers = {
    create
  };
})();

