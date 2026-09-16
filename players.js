(function () {
  'use strict';

  function create(context) {
    const {
      $,
      state,
      client,
      isAdmin,
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

                    item.toggle.textContent =
                      `▶ ${item.title}`;
                  }
                }
              );
            }

            body.hidden =
              !willOpen;

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

            toggle.textContent =
              `▶ ${title}`;
          },
          'border rounded-lg px-3 py-1 text-sm mt-3'
        );

      close.type =
        'button';

      buildContent(
        inner
      );

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
      if (!isAdmin()) {
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
            !isAdmin()
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
            let text =
              explain(error);

            if (error?.message) {
              text =
                'Không tạo được VĐV. ' +
                String(
                  error.message
                ).slice(
                  0,
                  300
                );
            }

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
      if (!isAdmin()) {
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
        'Chỉ sửa thông tin hồ sơ và trạng thái. Không sửa trực tiếp điểm khởi tạo hoặc điểm hiện tại.',
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

      const status = el(
        'select',
        null,
        'field'
      );

      status.id =
        'update-player-status';

      [
        [
          'ACTIVE',
          'Đang hoạt động'
        ],
        [
          'INACTIVE',
          'Ngừng hoạt động'
        ]
      ].forEach(
        ([value, text]) => {
          const option =
            el(
              'option',
              text
            );

          option.value =
            value;

          status.append(
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
          'Trạng thái',
          status
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

        status.value =
          upper(
            player.status
          ) === 'INACTIVE'
            ? 'INACTIVE'
            : 'ACTIVE';

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
            !isAdmin()
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
                  status.value,
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
            let text =
              explain(error);

            if (error?.message) {
              text =
                'Không cập nhật được VĐV. ' +
                String(
                  error.message
                ).slice(
                  0,
                  300
                );
            }

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

    function playerDetailSection(root) {
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
          'grid gap-3'
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
              'rounded-xl border p-4'
            );

          const header =
            el(
              'div',
              null,
              'flex flex-wrap items-center justify-between gap-3'
            );

          const identity =
            el(
              'div'
            );

          identity.append(
            el(
              'div',
              playerName(
                player.id
              ),
              'font-semibold'
            ),
            el(
              'div',
              `${upper(
                player.player_type
              ) || 'CLUB'} • ${
                upper(
                  player.status
                ) === 'INACTIVE'
                  ? 'Ngừng hoạt động'
                  : 'Đang hoạt động'
              }`,
              'text-xs opacity-60 mt-1'
            )
          );

          const summary =
            el(
              'div',
              `Rating ${number(
                player.current_rating
              )}`,
              'font-semibold'
            );

          const detail =
            el(
              'div',
              null,
              'mt-4'
            );

          detail.hidden =
            true;

          const toggle =
            button(
              'Xem chi tiết',
              () => {
                detail.hidden =
                  !detail.hidden;

                toggle.textContent =
                  detail.hidden
                    ? 'Xem chi tiết'
                    : 'Thu gọn';
              },
              'border rounded-lg px-3 py-1 text-sm'
            );

          toggle.type =
            'button';

          header.append(
            identity,
            summary,
            toggle
          );

          const stats =
            el(
              'div',
              null,
              'grid grid-cols-2 md:grid-cols-5 gap-2'
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
              'Win Rate',
              `${winRate}%`
            ]
          ].forEach(
            ([label, value]) => {
              const stat =
                el(
                  'div',
                  null,
                  'rounded-lg border p-2'
                );

              stat.append(
                el(
                  'div',
                  label,
                  'text-xs opacity-60'
                ),
                el(
                  'div',
                  String(
                    value
                  ),
                  'font-semibold mt-1'
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
                    'border rounded-lg px-3 py-1 font-semibold'
                  );

                resultButton.type =
                  'button';

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

                ratingToggle.textContent =
                  ratingBody.hidden
                    ? 'Lịch sử Rating'
                    : 'Thu gọn lịch sử Rating';
              },
              'border rounded-lg px-3 py-1 text-sm'
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
                    'border-b py-2 text-sm'
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

    function playersPage() {
      const root =
        $('content');

      sources(
        root,
        [
          'players',
          'matches',
          'match_players',
          'rating_events'
        ]
      );

      if (isAdmin()) {
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

