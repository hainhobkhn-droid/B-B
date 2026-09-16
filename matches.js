'use strict';

(() => {
  function create(ctx) {
    if (!ctx || typeof ctx !== 'object') {
      throw new Error('PICK Matches: thiếu context.');
    }

    const {
      $,
      state,
      client,
      isAdmin,
  button,
      panel,
      el,
      rows,
      raw,
      pick,
      notice,
      load,
      render,
      explain,
      sources,
      recent,
      table,
      matchCols,
      matchCode
    } = ctx;
      function createMatchForm(root) {
        if (!isAdmin()) {
          return;
        }

        const section = panel(
          'Tạo trận mới',
          root
        );

        const description = el(
          'p',
          'Bước này chỉ tạo bản nháp PENDING. Sau khi tạo, bạn sẽ bổ sung 4 VĐV và duyệt trận ở các bước tiếp theo.',
          'notice'
        );

        const message = el(
          'div'
        );

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

        const playedGroup = el(
          'div',
          null,
          'form-group'
        );

        const playedLabel = el(
          'label',
          'Thời gian thi đấu'
        );

        const playedAt = el(
          'input',
          null,
          'field'
        );

        playedAt.type =
          'datetime-local';

        playedAt.required = true;

        playedLabel.htmlFor =
          'create-played-at';

        playedAt.id =
          'create-played-at';

        const now = new Date();
        const tzOffset =
          now.getTimezoneOffset() *
          60000;

        playedAt.value =
          new Date(
            now.getTime() -
              tzOffset
          )
            .toISOString()
            .slice(0, 16);

        playedGroup.append(
          playedLabel,
          playedAt
        );


        const matchTypeGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchTypeLabel = el(
          'label',
          'Loại trận'
        );

        matchTypeLabel.htmlFor =
          'create-match-type';

        const matchType = el(
          'select',
          null,
          'field'
        );

        matchType.id =
          'create-match-type';

        [
          [
            'CLUB_RATED',
            'CLUB_RATED • Trận tính Rating CLB'
          ],
          [
            'TOURNAMENT',
            'TOURNAMENT • Giải đấu'
          ],
          [
            'LEAGUE',
            'LEAGUE • Giải nội bộ'
          ],
          [
            'FRIENDLY_RATED',
            'FRIENDLY_RATED • Giao hữu tính Rating'
          ],
          [
            'SELF_REPORTED',
            'SELF_REPORTED • Tự khai báo'
          ],
          [
            'TRAINING',
            'TRAINING • Tập luyện'
          ]
        ].forEach(
          ([value, text]) =>
            matchType.append(
              new Option(
                text,
                value
              )
            )
        );

        matchType.value =
          'CLUB_RATED';

        matchTypeGroup.append(
          matchTypeLabel,
          matchType
        );

        const scoreModeGroup = el(
          'div',
          null,
          'form-group'
        );

        const scoreModeLabel = el(
          'label',
          'Cách tính kết quả'
        );

        scoreModeLabel.htmlFor =
          'create-score-mode';

        const scoreMode = el(
          'select',
          null,
          'field'
        );

        scoreMode.id =
          'create-score-mode';

        scoreMode.append(
          new Option(
            'POINTS • Nhập tỷ số điểm',
            'POINTS'
          ),
          new Option(
            'RESULT • Chỉ nhập kết quả thắng/thua/hòa',
            'RESULT'
          )
        );

        scoreMode.value =
          'POINTS';

        scoreModeGroup.append(
          scoreModeLabel,
          scoreMode
        );

        const scoreAGroup = el(
          'div',
          null,
          'form-group'
        );

        const scoreALabel = el(
          'label',
          'Điểm đội A'
        );

        scoreALabel.htmlFor =
          'create-score-a';

        const scoreA = el(
          'input',
          null,
          'field'
        );

        scoreA.id =
          'create-score-a';

        scoreA.type = 'number';
        scoreA.min = '0';
        scoreA.step = '1';
        scoreA.value = '0';
        scoreA.required = true;

        scoreAGroup.append(
          scoreALabel,
          scoreA
        );

        const scoreBGroup = el(
          'div',
          null,
          'form-group'
        );

        const scoreBLabel = el(
          'label',
          'Điểm đội B'
        );

        scoreBLabel.htmlFor =
          'create-score-b';

        const scoreB = el(
          'input',
          null,
          'field'
        );

        scoreB.id =
          'create-score-b';

        scoreB.type = 'number';
        scoreB.min = '0';
        scoreB.step = '1';
        scoreB.value = '0';
        scoreB.required = true;

        scoreBGroup.append(
          scoreBLabel,
          scoreB
        );

        const tournamentGroup = el(
          'div',
          null,
          'form-group'
        );

        const tournamentLabel = el(
          'label',
          'Giải đấu'
        );

        tournamentLabel.htmlFor =
          'create-tournament';

        const tournament = el(
          'select',
          null,
          'field'
        );

        tournament.id =
          'create-tournament';

                // TOURNAMENT ATTACH FRONTEND V1E
        const attachableTournamentStatuses =
          new Set([
            'DU_KIEN',
            'MO_DANG_KY',
            'DANG_DIEN_RA'
          ]);

        const tournamentStatusLabel =
          status => {
            const labels = {
              DU_KIEN: 'Dự kiến',
              MO_DANG_KY: 'Mở đăng ký',
              DANG_DIEN_RA: 'Đang diễn ra',
              DA_KET_THUC: 'Đã kết thúc',
              DA_QUYET_TOAN: 'Đã quyết toán',
              HUY: 'Đã hủy'
            };

            return (
              labels[raw(status)] ||
              raw(status) ||
              'Không rõ trạng thái'
            );
          };

        const tournamentOptionLabel =
          (item, current = false) => {
            const name =
              raw(
                pick(
                  item,
                  'name',
                  'tournament_name',
                  'title'
                )
              ) ||
              'Giải đấu';

            const code =
              raw(
                pick(
                  item,
                  'code',
                  'tournament_code'
                )
              );

            const status =
              tournamentStatusLabel(
                item.status
              );

            return (
              name +
              (
                code
                  ? ` (${code})`
                  : ''
              ) +
              ` — ${status}` +
              (
                current
                  ? ' — hiện tại'
                  : ''
              )
            );
          };

        const sortedTournaments =
          () =>
            rows('tournaments')
              .slice()
              .sort(
                (a, b) =>
                  raw(
                    pick(
                      a,
                      'name',
                      'tournament_name',
                      'title'
                    )
                  ).localeCompare(
                    raw(
                      pick(
                        b,
                        'name',
                        'tournament_name',
                        'title'
                      )
                    ),
                    'vi'
                  )
              );

        tournament.append(
          new Option(
            'Không thuộc giải đấu',
            ''
          )
        );

        sortedTournaments()
          .filter(
            item =>
              attachableTournamentStatuses.has(
                raw(item.status)
              )
          )
          .forEach(
            item => {
              tournament.append(
                new Option(
                  tournamentOptionLabel(
                    item
                  ),
                  item.id
                )
              );
            }
          );

        tournamentGroup.append(
          tournamentLabel,
          tournament
        );

        grid.append(
          playedGroup,
          matchTypeGroup,
          scoreModeGroup,
          scoreAGroup,
          scoreBGroup,
          tournamentGroup
        );

        const notesGroup = el(
          'div',
          null,
          'form-group mt-3'
        );

        const notesLabel = el(
          'label',
          'Ghi chú'
        );

        notesLabel.htmlFor =
          'create-notes';

        const notes = el(
          'textarea',
          null,
          'field'
        );

        notes.id =
          'create-notes';

        notes.maxLength = 2000;

        notes.placeholder =
          'Ghi chú tùy chọn';

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
          'Tạo trận PENDING',
          'btn primary'
        );

        submit.type = 'submit';

        const reset = button(
          'Đặt lại',
          () => {
            form.reset();

            const now2 =
              new Date();

            const offset =
              now2.getTimezoneOffset() *
              60000;

            playedAt.value =
              new Date(
                now2.getTime() -
                  offset
              )
                .toISOString()
                .slice(0, 16);

            matchType.value =
              'CLUB_RATED';

            scoreMode.value =
              'POINTS';

            scoreA.value = '0';
            scoreB.value = '0';

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

        function applyScoreMode() {
          if (
            scoreMode.value ===
            'RESULT'
          ) {
            scoreA.max = '1';
            scoreB.max = '1';

            if (
              Number(scoreA.value) >
              1
            ) {
              scoreA.value = '0';
            }

            if (
              Number(scoreB.value) >
              1
            ) {
              scoreB.value = '0';
            }
          } else {
            scoreA.removeAttribute(
              'max'
            );

            scoreB.removeAttribute(
              'max'
            );
          }
        }

        scoreMode.addEventListener(
          'change',
          applyScoreMode
        );

        applyScoreMode();

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

            const localDate =
              new Date(
                playedAt.value
              );

            if (
              !playedAt.value ||
              !Number.isFinite(
                localDate.getTime()
              )
            ) {
              notice(
                message,
                'Thời gian thi đấu không hợp lệ.',
                true
              );

              return;
            }

            const scoreAValue =
              Number(
                scoreA.value
              );

            const scoreBValue =
              Number(
                scoreB.value
              );

            if (
              !Number.isInteger(
                scoreAValue
              ) ||
              !Number.isInteger(
                scoreBValue
              ) ||
              scoreAValue < 0 ||
              scoreBValue < 0
            ) {
              notice(
                message,
                'Tỷ số phải là số nguyên không âm.',
                true
              );

              return;
            }

            if (
              scoreMode.value ===
                'RESULT' &&
              (
                scoreAValue > 1 ||
                scoreBValue > 1
              )
            ) {
              notice(
                message,
                'RESULT chỉ chấp nhận 0 hoặc 1 cho mỗi đội.',
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
              const payload = {
                p_played_at:
                  localDate.toISOString(),
                p_match_number:
                  null,
                p_match_type:
                  matchType.value,
                p_score_mode:
                  scoreMode.value,
                p_team_a_score:
                  scoreAValue,
                p_team_b_score:
                  scoreBValue,
                p_tournament_id:
                  tournament.value ||
                  null,
                p_notes:
                  notes.value.trim() ||
                  null
              };

              const {
                data,
                error
              } = await client.rpc(
                'create_pending_match',
                payload
              );

              if (error) {
                throw error;
              }

              notice(
                message,
                'Đã tạo trận PENDING thành công. Đang tải lại danh sách…',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã tạo trận PENDING thành công.',
                false,
                true
              );
            } catch (error) {
              let text =
                explain(error);

              if (
                error?.message
              ) {
                text =
                  'Không tạo được trận. ' +
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
                'Tạo trận PENDING';
            }
          }
        );
      }


      function createMyPendingMatchForm(root) {
        if (
          isAdmin() ||
          raw(state.profile?.role)
            .trim()
            .toUpperCase() !==
            'MEMBER'
        ) {
          return;
        }

        const section = panel(
          'Tạo trận của tôi',
          root
        );

        const description = el(
          'p',
          'Nhập kết quả trận đã chơi. Trận sẽ ở trạng thái PENDING và chỉ được tính Rating/Quỹ sau khi ADMIN duyệt.',
          'notice'
        );

        const message = el('div');

        message.hidden = true;
        message.setAttribute(
          'role',
          'alert'
        );

        const ownPlayerId =
          raw(
            state.profile?.player_id
          );

        if (!ownPlayerId) {
          section.append(
            description,
            el(
              'p',
              'Tài khoản chưa được liên kết với VĐV CLUB. Vui lòng liên hệ quản trị viên.',
              'notice error'
            )
          );

          return;
        }

        const activePlayers =
          rows('players')
            .filter(
              player =>
                raw(player.status)
                  .trim()
                  .toUpperCase() ===
                'ACTIVE'
            )
            .slice()
            .sort(
              (a, b) =>
                raw(a.full_name)
                  .localeCompare(
                    raw(b.full_name),
                    'vi'
                  )
            );

        const ownPlayer =
          activePlayers.find(
            player =>
              raw(player.id) ===
              ownPlayerId
          );

        if (!ownPlayer) {
          section.append(
            description,
            el(
              'p',
              'Không tìm thấy VĐV của tài khoản trong danh sách ACTIVE.',
              'notice error'
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

        const makeGroup =
          (labelText, control) => {
            const group = el(
              'div',
              null,
              'form-group'
            );

            const label = el(
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

            return group;
          };

        const playedAt = el(
          'input',
          null,
          'field'
        );

        playedAt.type =
          'datetime-local';

        playedAt.id =
          'my-match-played-at';

        playedAt.required =
          true;

        const setNow = () => {
          const now =
            new Date();

          const offset =
            now.getTimezoneOffset() *
            60000;

          playedAt.value =
            new Date(
              now.getTime() -
                offset
            )
              .toISOString()
              .slice(0, 16);
        };

        setNow();

        const matchType = el(
          'select',
          null,
          'field'
        );

        matchType.id =
          'my-match-type';

        [
          [
            'CLUB_RATED',
            'Trận tính Rating CLB'
          ],
          [
            'FRIENDLY_RATED',
            'Giao hữu tính Rating'
          ],
          [
            'SELF_REPORTED',
            'Tự khai báo'
          ],
          [
            'TRAINING',
            'Tập luyện'
          ]
        ].forEach(
          ([value, text]) =>
            matchType.append(
              new Option(
                text,
                value
              )
            )
        );

        matchType.value =
          'CLUB_RATED';

        const scoreMode = el(
          'select',
          null,
          'field'
        );

        scoreMode.id =
          'my-match-score-mode';

        scoreMode.append(
          new Option(
            'POINTS • Tỷ số điểm',
            'POINTS'
          ),
          new Option(
            'RESULT • Thắng/thua',
            'RESULT'
          )
        );

        const scoreA = el(
          'input',
          null,
          'field'
        );

        scoreA.id =
          'my-match-score-a';

        scoreA.type =
          'number';

        scoreA.min = '0';
        scoreA.step = '1';
        scoreA.value = '0';
        scoreA.required = true;

        const scoreB = el(
          'input',
          null,
          'field'
        );

        scoreB.id =
          'my-match-score-b';

        scoreB.type =
          'number';

        scoreB.min = '0';
        scoreB.step = '1';
        scoreB.value = '0';
        scoreB.required = true;

        const makePlayerSelect =
          (
            id,
            includeOwn,
            lockedOwn
          ) => {
            const select = el(
              'select',
              null,
              'field'
            );

            select.id = id;

            if (!lockedOwn) {
              select.append(
                new Option(
                  '— Chọn VĐV —',
                  ''
                )
              );
            }

            activePlayers
              .filter(
                player =>
                  includeOwn ||
                  raw(player.id) !==
                    ownPlayerId
              )
              .forEach(
                player => {
                  select.append(
                    new Option(
                      raw(
                        player.full_name
                      ) ||
                        raw(
                          player.id
                        ),
                      raw(
                        player.id
                      )
                    )
                  );
                }
              );

            if (lockedOwn) {
              select.value =
                ownPlayerId;

              select.disabled =
                true;
            }

            return select;
          };

        const teamA1 =
          makePlayerSelect(
            'my-match-a1',
            true,
            true
          );

        const teamA2 =
          makePlayerSelect(
            'my-match-a2',
            false,
            false
          );

        const teamB1 =
          makePlayerSelect(
            'my-match-b1',
            false,
            false
          );

        const teamB2 =
          makePlayerSelect(
            'my-match-b2',
            false,
            false
          );

        grid.append(
          makeGroup(
            'Thời gian thi đấu',
            playedAt
          ),
          makeGroup(
            'Loại trận',
            matchType
          ),
          makeGroup(
            'Cách tính kết quả',
            scoreMode
          ),
          makeGroup(
            'Điểm đội A',
            scoreA
          ),
          makeGroup(
            'Điểm đội B',
            scoreB
          ),
          makeGroup(
            'Đội A • Bạn',
            teamA1
          ),
          makeGroup(
            'Đội A • Đồng đội',
            teamA2
          ),
          makeGroup(
            'Đội B • VĐV 1',
            teamB1
          ),
          makeGroup(
            'Đội B • VĐV 2',
            teamB2
          )
        );

        const notes = el(
          'textarea',
          null,
          'field'
        );

        notes.id =
          'my-match-notes';

        notes.maxLength =
          2000;

        notes.placeholder =
          'Ghi chú tùy chọn';

        const notesGroup =
          makeGroup(
            'Ghi chú',
            notes
          );

        notesGroup.classList.add(
          'mt-3'
        );

        const actions = el(
          'div',
          null,
          'form-actions'
        );

        const submit = el(
          'button',
          'Gửi trận chờ duyệt',
          'btn primary'
        );

        submit.type =
          'submit';

        const reset = button(
          'Đặt lại',
          () => {
            form.reset();

            setNow();

            matchType.value =
              'CLUB_RATED';

            scoreMode.value =
              'POINTS';

            scoreA.value =
              '0';

            scoreB.value =
              '0';

            teamA1.value =
              ownPlayerId;

            applyScoreMode();

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

        function applyScoreMode() {
          if (
            scoreMode.value ===
            'RESULT'
          ) {
            scoreA.max = '1';
            scoreB.max = '1';

            if (
              Number(
                scoreA.value
              ) > 1
            ) {
              scoreA.value = '0';
            }

            if (
              Number(
                scoreB.value
              ) > 1
            ) {
              scoreB.value = '0';
            }
          } else {
            scoreA.removeAttribute(
              'max'
            );

            scoreB.removeAttribute(
              'max'
            );
          }
        }

        scoreMode.addEventListener(
          'change',
          applyScoreMode
        );

        applyScoreMode();

        form.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              isAdmin()
            ) {
              return;
            }

            notice(
              message,
              ''
            );

            const localDate =
              new Date(
                playedAt.value
              );

            if (
              !playedAt.value ||
              !Number.isFinite(
                localDate.getTime()
              )
            ) {
              notice(
                message,
                'Thời gian thi đấu không hợp lệ.',
                true
              );

              return;
            }

            const scoreAValue =
              Number(
                scoreA.value
              );

            const scoreBValue =
              Number(
                scoreB.value
              );

            if (
              !Number.isInteger(
                scoreAValue
              ) ||
              !Number.isInteger(
                scoreBValue
              ) ||
              scoreAValue < 0 ||
              scoreBValue < 0
            ) {
              notice(
                message,
                'Tỷ số phải là số nguyên không âm.',
                true
              );

              return;
            }

            if (
              scoreMode.value ===
                'POINTS' &&
              (
                scoreAValue +
                scoreBValue
              ) <= 0
            ) {
              notice(
                message,
                'POINTS không chấp nhận tỷ số 0-0.',
                true
              );

              return;
            }

            if (
              scoreMode.value ===
                'RESULT' &&
              (
                scoreAValue > 1 ||
                scoreBValue > 1
              )
            ) {
              notice(
                message,
                'RESULT chỉ chấp nhận 0 hoặc 1 cho mỗi đội.',
                true
              );

              return;
            }

            if (
              scoreMode.value ===
                'RESULT' &&
              scoreAValue === 0 &&
              scoreBValue === 0
            ) {
              notice(
                message,
                'RESULT phải có đội thắng.',
                true
              );

              return;
            }

            const selectedIds = [
              ownPlayerId,
              raw(
                teamA2.value
              ),
              raw(
                teamB1.value
              ),
              raw(
                teamB2.value
              )
            ];

            if (
              selectedIds.some(
                id => !id
              )
            ) {
              notice(
                message,
                'Phải chọn đủ 4 VĐV.',
                true
              );

              return;
            }

            if (
              new Set(
                selectedIds
              ).size !== 4
            ) {
              notice(
                message,
                '4 vị trí phải là 4 VĐV khác nhau.',
                true
              );

              return;
            }

            state.writeBusy =
              true;

            submit.disabled =
              true;

            reset.disabled =
              true;

            teamA2.disabled =
              true;

            teamB1.disabled =
              true;

            teamB2.disabled =
              true;

            submit.textContent =
              'Đang gửi…';

            try {
              const {
                data,
                error
              } = await client.rpc(
                'create_my_pending_match',
                {
                  p_played_at:
                    localDate.toISOString(),

                  p_match_type:
                    matchType.value,

                  p_score_mode:
                    scoreMode.value,

                  p_team_a_score:
                    scoreAValue,

                  p_team_b_score:
                    scoreBValue,

                  p_team_a_player_1:
                    ownPlayerId,

                  p_team_a_player_2:
                    selectedIds[1],

                  p_team_b_player_1:
                    selectedIds[2],

                  p_team_b_player_2:
                    selectedIds[3],

                  p_notes:
                    notes.value.trim() ||
                    null
                }
              );

              if (error) {
                throw error;
              }

              if (
                data &&
                data.success ===
                  false
              ) {
                throw new Error(
                  'Máy chủ không xác nhận tạo trận.'
                );
              }

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã gửi trận thành công. Trận đang chờ ADMIN duyệt.',
                false,
                true
              );
            } catch (error) {
              const code =
                String(
                  error?.message ||
                  ''
                );

              const friendly = {
                AUTH_REQUIRED:
                  'Phiên đăng nhập không hợp lệ.',
                MEMBER_ROLE_REQUIRED:
                  'Tài khoản không có quyền MEMBER.',
                PLAYER_LINK_REQUIRED:
                  'Tài khoản chưa được liên kết với VĐV.',
                CLUB_PLAYER_REQUIRED:
                  'VĐV của tài khoản phải là thành viên CLUB.',
                PLAYER_INACTIVE:
                  'VĐV hiện không còn hoạt động.',
                MEMBER_MUST_PARTICIPATE:
                  'Bạn phải là một trong 4 VĐV của trận.'
              };

              let text =
                explain(error);

              Object.entries(
                friendly
              ).some(
                ([key, value]) => {
                  if (
                    code.includes(
                      key
                    )
                  ) {
                    text = value;

                    return true;
                  }

                  return false;
                }
              );

              if (
                text ===
                  explain(error) &&
                error?.message
              ) {
                text =
                  'Không gửi được trận. ' +
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

              teamA2.disabled =
                false;

              teamB1.disabled =
                false;

              teamB2.disabled =
                false;

              submit.textContent =
                'Gửi trận chờ duyệt';
            }
          }
        );
      }


      function setPendingMatchPlayersForm(root) {
        if (!isAdmin()) {
          return;
        }

        const pendingMatches = rows('matches')
          .filter(
            match =>
              raw(match.status)
                .trim()
                .toUpperCase() ===
              'PENDING'
          )
          .slice()
          .sort((a, b) => {
            const aTime =
              new Date(
                a.played_at || 0
              ).getTime();

            const bTime =
              new Date(
                b.played_at || 0
              ).getTime();

            if (aTime !== bTime) {
              return bTime - aTime;
            }

            const aNo =
              Number.isFinite(
                Number(
                  a.match_number
                )
              )
                ? Number(
                    a.match_number
                  )
                : -1;

            const bNo =
              Number.isFinite(
                Number(
                  b.match_number
                )
              )
                ? Number(
                    b.match_number
                  )
                : -1;

            if (aNo !== bNo) {
              return bNo - aNo;
            }

            return raw(
              b.id
            ).localeCompare(
              raw(a.id)
            );
          });

        const activePlayers = rows('players')
          .filter(
            player =>
              raw(player.status)
                .trim()
                .toUpperCase() ===
              'ACTIVE'
          )
          .slice()
          .sort(
            (a, b) =>
              raw(
                a.full_name
              ).localeCompare(
                raw(
                  b.full_name
                ),
                'vi'
              )
          );

        const section = panel(
          'Xếp VĐV cho trận PENDING',
          root
        );

        const description = el(
          'p',
          'Chọn đúng 2 VĐV đội A và 2 VĐV đội B. Chỉ trận PENDING và VĐV ACTIVE được phép sử dụng.',
          'notice'
        );

        const message = el(
          'div'
        );

        message.hidden = true;

        message.setAttribute(
          'role',
          'alert'
        );

        if (
          !pendingMatches.length
        ) {
          section.append(
            description,
            el(
              'p',
              'Hiện không có trận PENDING để xếp VĐV.',
              'notice'
            )
          );

          return;
        }

        if (
          activePlayers.length < 4
        ) {
          section.append(
            description,
            el(
              'p',
              'Cần ít nhất 4 VĐV ACTIVE để xếp đội hình.',
              'notice bad'
            )
          );

          return;
        }

        const playerById =
          new Map(
            rows('players').map(
              player => [
                raw(
                  player.id
                ),
                player
              ]
            )
          );

        const matchSelect = el(
          'select',
          null,
          'field'
        );

        matchSelect.id =
          'pending-players-match';

        pendingMatches.forEach(
          match => {
            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN'
                  )
                : 'Không rõ thời gian';

            const numberText =
              match.match_number != null ? `${matchCode(match)} • ` : '';

            const scoreText =
              `${raw(match.team_a_score)}-${raw(match.team_b_score)}`;

            matchSelect.append(
              new Option(
                `${numberText}${playedText} • ${raw(match.match_type)} • ${scoreText}`,
                match.id
              )
            );
          }
        );

        const makePlayerSelect = (
          id,
          labelText
        ) => {
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
            id;

          const select = el(
            'select',
            null,
            'field'
          );

          select.id = id;

          select.required =
            true;

          select.append(
            new Option(
              'Chọn VĐV',
              ''
            )
          );

          activePlayers.forEach(
            player => {
              const type =
                raw(
                  player.player_type
                );

              const suffix =
                type
                  ? ` • ${type}`
                  : '';

              select.append(
                new Option(
                  `${raw(player.full_name)}${suffix}`,
                  player.id
                )
              );
            }
          );

          group.append(
            label,
            select
          );

          return {
            group,
            select
          };
        };

        const teamA1 =
          makePlayerSelect(
            'pending-team-a-1',
            'Đội A • VĐV 1'
          );

        const teamA2 =
          makePlayerSelect(
            'pending-team-a-2',
            'Đội A • VĐV 2'
          );

        const teamB1 =
          makePlayerSelect(
            'pending-team-b-1',
            'Đội B • VĐV 1'
          );

        const teamB2 =
          makePlayerSelect(
            'pending-team-b-2',
            'Đội B • VĐV 2'
          );

        const lineup = el(
          'div',
          null,
          'notice'
        );

        const form =
          el('form');

        const grid = el(
          'div',
          null,
          'form-grid'
        );

        const matchGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchLabel = el(
          'label',
          'Trận PENDING'
        );

        matchLabel.htmlFor =
          matchSelect.id;

        matchGroup.append(
          matchLabel,
          matchSelect
        );

        grid.append(
          matchGroup,
          teamA1.group,
          teamA2.group,
          teamB1.group,
          teamB2.group
        );

        const actions = el(
          'div',
          null,
          'form-actions'
        );

        const submit = el(
          'button',
          'Lưu 4 VĐV',
          'btn primary'
        );

        submit.type =
          'submit';

        const clear = button(
          'Xóa lựa chọn',
          () => {
            teamA1.select.value =
              '';

            teamA2.select.value =
              '';

            teamB1.select.value =
              '';

            teamB2.select.value =
              '';

            notice(
              message,
              ''
            );
          }
        );

        actions.append(
          submit,
          clear
        );

        form.append(
          grid,
          lineup,
          actions
        );

        section.append(
          description,
          message,
          form
        );

        const getMatchPlayers =
          matchId =>
            rows(
              'match_players'
            ).filter(
              item =>
                raw(
                  item.match_id
                ) ===
                raw(
                  matchId
                )
            );

        const playerName =
          playerId =>
            raw(
              playerById.get(
                raw(
                  playerId
                )
              )?.full_name
            ) ||
            raw(
              playerId
            );

        const refreshCurrentLineup =
          () => {
            const current =
              getMatchPlayers(
                matchSelect.value
              );

            const teamA =
              current
                .filter(
                  item =>
                    raw(
                      item.team
                    ).toUpperCase() ===
                    'A'
                )
                .slice(
                  0,
                  2
                );

            const teamB =
              current
                .filter(
                  item =>
                    raw(
                      item.team
                    ).toUpperCase() ===
                    'B'
                )
                .slice(
                  0,
                  2
                );

            const idsA =
              teamA.map(
                item =>
                  raw(
                    item.player_id
                  )
              );

            const idsB =
              teamB.map(
                item =>
                  raw(
                    item.player_id
                  )
              );

            teamA1.select.value =
              idsA[0] || '';

            teamA2.select.value =
              idsA[1] || '';

            teamB1.select.value =
              idsB[0] || '';

            teamB2.select.value =
              idsB[1] || '';

            if (
              idsA.length === 2 &&
              idsB.length === 2
            ) {
              lineup.textContent =
                `Đội hình hiện tại: A = ${playerName(idsA[0])} + ${playerName(idsA[1])} • B = ${playerName(idsB[0])} + ${playerName(idsB[1])}`;
            } else {
              lineup.textContent =
                'Trận này chưa có đủ đội hình 2A + 2B.';
            }
          };

        matchSelect.addEventListener(
          'change',
          refreshCurrentLineup
        );

        refreshCurrentLineup();

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

            const matchId =
              raw(
                matchSelect.value
              );

            const selectedIds = [
              raw(
                teamA1.select.value
              ),
              raw(
                teamA2.select.value
              ),
              raw(
                teamB1.select.value
              ),
              raw(
                teamB2.select.value
              )
            ];

            if (!matchId) {
              notice(
                message,
                'Chưa chọn trận PENDING.',
                true
              );

              return;
            }

            const selectedMatch =
              pendingMatches.find(
                match =>
                  raw(
                    match.id
                  ) ===
                  matchId
              );

            if (
              !selectedMatch ||
              raw(
                selectedMatch.status
              )
                .trim()
                .toUpperCase() !==
                'PENDING'
            ) {
              notice(
                message,
                'Trận đã chọn không còn ở trạng thái PENDING.',
                true
              );

              return;
            }

            if (
              selectedIds.some(
                id => !id
              )
            ) {
              notice(
                message,
                'Phải chọn đủ 4 VĐV.',
                true
              );

              return;
            }

            if (
              new Set(
                selectedIds
              ).size !== 4
            ) {
              notice(
                message,
                '4 vị trí phải là 4 VĐV khác nhau.',
                true
              );

              return;
            }

            const activeIds =
              new Set(
                activePlayers.map(
                  player =>
                    raw(
                      player.id
                    )
                )
              );

            if (
              selectedIds.some(
                id =>
                  !activeIds.has(
                    id
                  )
              )
            ) {
              notice(
                message,
                'Có VĐV không còn ACTIVE. Hãy tải lại và chọn lại.',
                true
              );

              return;
            }

            state.writeBusy =
              true;

            submit.disabled =
              true;

            clear.disabled =
              true;

            matchSelect.disabled =
              true;

            teamA1.select.disabled =
              true;

            teamA2.select.disabled =
              true;

            teamB1.select.disabled =
              true;

            teamB2.select.disabled =
              true;

            submit.textContent =
              'Đang lưu…';

            try {
              const {
                error
              } = await client.rpc(
                'set_pending_match_players',
                {
                  p_match_id:
                    matchId,

                  p_team_a_player_1:
                    selectedIds[0],

                  p_team_a_player_2:
                    selectedIds[1],

                  p_team_b_player_1:
                    selectedIds[2],

                  p_team_b_player_2:
                    selectedIds[3]
                }
              );

              if (error) {
                throw error;
              }

              notice(
                message,
                'Đã lưu đội hình 2A + 2B. Đang tải lại dữ liệu…',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã lưu 4 VĐV cho trận PENDING.',
                false,
                true
              );
            } catch (error) {
              let text =
                explain(
                  error
                );

              if (
                error?.message
              ) {
                text =
                  'Không lưu được đội hình. ' +
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

              clear.disabled =
                false;

              matchSelect.disabled =
                false;

              teamA1.select.disabled =
                false;

              teamA2.select.disabled =
                false;

              teamB1.select.disabled =
                false;

              teamB2.select.disabled =
                false;

              submit.textContent =
                'Lưu 4 VĐV';
            }
          }
        );
      }


      function editPendingMatchForm(root) {
        if (!isAdmin()) {
          return;
        }

        const pendingMatches =
          rows('matches')
            .filter(
              match =>
                raw(match.status)
                  .trim()
                  .toUpperCase() ===
                'PENDING'
            )
            .slice()
            .sort((a, b) => {
              const aTime =
                new Date(
                  a.played_at || 0
                ).getTime();

              const bTime =
                new Date(
                  b.played_at || 0
                ).getTime();

              if (aTime !== bTime) {
                return bTime - aTime;
              }

              const aNo =
                Number.isFinite(
                  Number(
                    a.match_number
                  )
                )
                  ? Number(
                      a.match_number
                    )
                  : -1;

              const bNo =
                Number.isFinite(
                  Number(
                    b.match_number
                  )
                )
                  ? Number(
                      b.match_number
                    )
                  : -1;

              if (aNo !== bNo) {
                return bNo - aNo;
              }

              return raw(
                b.id
              ).localeCompare(
                raw(
                  a.id
                )
              );
            });

        const attachableTournamentStatuses =
          new Set([
            'DU_KIEN',
            'MO_DANG_KY',
            'DANG_DIEN_RA'
          ]);

        const tournamentStatusLabel =
          status => {
            const labels = {
              DU_KIEN: 'Dự kiến',
              MO_DANG_KY: 'Mở đăng ký',
              DANG_DIEN_RA: 'Đang diễn ra',
              DA_KET_THUC: 'Đã kết thúc',
              DA_QUYET_TOAN: 'Đã quyết toán',
              HUY: 'Đã hủy'
            };

            return (
              labels[raw(status)] ||
              raw(status) ||
              'Không rõ trạng thái'
            );
          };

        const tournamentOptionLabel =
          (item, current = false) => {
            const name =
              raw(
                pick(
                  item,
                  'name',
                  'tournament_name',
                  'title'
                )
              ) ||
              'Giải đấu';

            const code =
              raw(
                pick(
                  item,
                  'code',
                  'tournament_code'
                )
              );

            const status =
              tournamentStatusLabel(
                item.status
              );

            return (
              name +
              (
                code
                  ? ` (${code})`
                  : ''
              ) +
              ` — ${status}` +
              (
                current
                  ? ' — hiện tại'
                  : ''
              )
            );
          };

        const sortedTournaments =
          () =>
            rows('tournaments')
              .slice()
              .sort(
                (a, b) =>
                  raw(
                    pick(
                      a,
                      'name',
                      'tournament_name',
                      'title'
                    )
                  ).localeCompare(
                    raw(
                      pick(
                        b,
                        'name',
                        'tournament_name',
                        'title'
                      )
                    ),
                    'vi'
                  )
              );

        const section = panel(
          'Sửa trận PENDING',
          root
        );

        const description = el(
          'p',
          'Chỉ chỉnh sửa bản nháp PENDING. Trận APPROVED hoặc VOIDED không thể sửa bằng chức năng này.',
          'notice'
        );

        const message = el(
          'div'
        );

        message.hidden =
          true;

        message.setAttribute(
          'role',
          'alert'
        );

        if (!pendingMatches.length) {
          section.append(
            description,
            el(
              'p',
              'Hiện không có trận PENDING để chỉnh sửa.',
              'notice'
            )
          );

          return;
        }

        const form =
          el('form');

        const grid = el(
          'div',
          null,
          'form-grid'
        );

        const matchGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchLabel = el(
          'label',
          'Trận PENDING'
        );

        const matchSelect = el(
          'select',
          null,
          'field'
        );

        matchSelect.id =
          'edit-pending-match';

        matchLabel.htmlFor =
          matchSelect.id;

        pendingMatches.forEach(
          match => {
            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN'
                  )
                : 'Không rõ thời gian';

            const numberText =
              match.match_number != null ? `${matchCode(match)} • ` : '';

            matchSelect.append(
              new Option(
                `${numberText}${playedText} • ${raw(match.match_type)} • ${raw(match.team_a_score)}-${raw(match.team_b_score)}`,
                match.id
              )
            );
          }
        );

        matchGroup.append(
          matchLabel,
          matchSelect
        );

        const playedGroup = el(
          'div',
          null,
          'form-group'
        );

        const playedLabel = el(
          'label',
          'Thời gian thi đấu'
        );

        const playedAt = el(
          'input',
          null,
          'field'
        );

        playedAt.type =
          'datetime-local';

        playedAt.required =
          true;

        playedAt.id =
          'edit-played-at';

        playedLabel.htmlFor =
          playedAt.id;

        playedGroup.append(
          playedLabel,
          playedAt
        );

        const matchNumberGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchNumberLabel = el(
          'label',
          'Số thứ tự trận'
        );

        const matchNumber = el(
          'input',
          null,
          'field'
        );

        matchNumber.type =
          'number';

        matchNumber.step =
          '1';

        matchNumber.min =
          '1';

        matchNumber.id =
          'edit-match-number';

        matchNumber.placeholder =
          'Có thể để trống';

        matchNumberLabel.htmlFor =
          matchNumber.id;

        matchNumberGroup.append(
          matchNumberLabel,
          matchNumber
        );

        const matchTypeGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchTypeLabel = el(
          'label',
          'Loại trận'
        );

        const matchType = el(
          'select',
          null,
          'field'
        );

        matchType.id =
          'edit-match-type';

        matchTypeLabel.htmlFor =
          matchType.id;

        [
          [
            'CLUB_RATED',
            'CLUB_RATED • Trận tính Rating CLB'
          ],
          [
            'TOURNAMENT',
            'TOURNAMENT • Giải đấu'
          ],
          [
            'LEAGUE',
            'LEAGUE • Giải nội bộ'
          ],
          [
            'FRIENDLY_RATED',
            'FRIENDLY_RATED • Giao hữu tính Rating'
          ],
          [
            'SELF_REPORTED',
            'SELF_REPORTED • Tự khai báo'
          ],
          [
            'TRAINING',
            'TRAINING • Tập luyện'
          ]
        ].forEach(
          ([value, text]) =>
            matchType.append(
              new Option(
                text,
                value
              )
            )
        );

        matchTypeGroup.append(
          matchTypeLabel,
          matchType
        );

        const scoreModeGroup = el(
          'div',
          null,
          'form-group'
        );

        const scoreModeLabel = el(
          'label',
          'Cách tính kết quả'
        );

        const scoreMode = el(
          'select',
          null,
          'field'
        );

        scoreMode.id =
          'edit-score-mode';

        scoreModeLabel.htmlFor =
          scoreMode.id;

        scoreMode.append(
          new Option(
            'POINTS • Nhập tỷ số điểm',
            'POINTS'
          ),
          new Option(
            'RESULT • Chỉ nhập kết quả thắng/thua/hòa',
            'RESULT'
          )
        );

        scoreModeGroup.append(
          scoreModeLabel,
          scoreMode
        );

        const scoreAGroup = el(
          'div',
          null,
          'form-group'
        );

        const scoreALabel = el(
          'label',
          'Điểm đội A'
        );

        const scoreA = el(
          'input',
          null,
          'field'
        );

        scoreA.type =
          'number';

        scoreA.min =
          '0';

        scoreA.step =
          '1';

        scoreA.required =
          true;

        scoreA.id =
          'edit-score-a';

        scoreALabel.htmlFor =
          scoreA.id;

        scoreAGroup.append(
          scoreALabel,
          scoreA
        );

        const scoreBGroup = el(
          'div',
          null,
          'form-group'
        );

        const scoreBLabel = el(
          'label',
          'Điểm đội B'
        );

        const scoreB = el(
          'input',
          null,
          'field'
        );

        scoreB.type =
          'number';

        scoreB.min =
          '0';

        scoreB.step =
          '1';

        scoreB.required =
          true;

        scoreB.id =
          'edit-score-b';

        scoreBLabel.htmlFor =
          scoreB.id;

        scoreBGroup.append(
          scoreBLabel,
          scoreB
        );

        const tournamentGroup = el(
          'div',
          null,
          'form-group'
        );

        const tournamentLabel = el(
          'label',
          'Giải đấu'
        );

        const tournament = el(
          'select',
          null,
          'field'
        );

        tournament.id =
          'edit-tournament';

        tournamentLabel.htmlFor =
          tournament.id;

                function rebuildEditTournamentOptions(
          currentTournamentId = ''
        ) {
          const currentId =
            raw(currentTournamentId);

          tournament.replaceChildren();

          tournament.append(
            new Option(
              'Không thuộc giải đấu',
              ''
            )
          );

          sortedTournaments()
            .filter(
              item =>
                attachableTournamentStatuses.has(
                  raw(item.status)
                )
            )
            .forEach(
              item => {
                tournament.append(
                  new Option(
                    tournamentOptionLabel(
                      item
                    ),
                    item.id
                  )
                );
              }
            );

          if (currentId) {
            const currentTournament =
              rows('tournaments').find(
                item =>
                  raw(item.id) ===
                  currentId
              );

            const alreadyListed =
              Array.from(
                tournament.options
              ).some(
                option =>
                  option.value ===
                  currentId
              );

            if (
              currentTournament &&
              !alreadyListed
            ) {
              tournament.append(
                new Option(
                  tournamentOptionLabel(
                    currentTournament,
                    true
                  ),
                  currentTournament.id
                )
              );
            }
          }

          tournament.value =
            currentId;

          if (
            currentId &&
            tournament.value !==
              currentId
          ) {
            tournament.value = '';
          }
        }

        rebuildEditTournamentOptions();

        tournamentGroup.append(
          tournamentLabel,
          tournament
        );

        grid.append(
          matchGroup,
          playedGroup,
          matchNumberGroup,
          matchTypeGroup,
          scoreModeGroup,
          scoreAGroup,
          scoreBGroup,
          tournamentGroup
        );

        const notesGroup = el(
          'div',
          null,
          'form-group mt-3'
        );

        const notesLabel = el(
          'label',
          'Ghi chú'
        );

        const notes = el(
          'textarea',
          null,
          'field'
        );

        notes.id =
          'edit-notes';

        notes.maxLength =
          2000;

        notesLabel.htmlFor =
          notes.id;

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
          'Lưu thay đổi PENDING',
          'btn primary'
        );

        submit.type =
          'submit';

        const reloadButton = button(
          'Khôi phục dữ liệu đang lưu',
          () => {
            fillSelectedMatch();

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

        function toLocalInputValue(
          value
        ) {
          const date =
            new Date(value);

          if (
            !Number.isFinite(
              date.getTime()
            )
          ) {
            return '';
          }

          const offset =
            date.getTimezoneOffset() *
            60000;

          return new Date(
            date.getTime() -
              offset
          )
            .toISOString()
            .slice(
              0,
              16
            );
        }

        function applyScoreMode() {
          if (
            scoreMode.value ===
            'RESULT'
          ) {
            scoreA.max =
              '1';

            scoreB.max =
              '1';

            if (
              Number(
                scoreA.value
              ) > 1
            ) {
              scoreA.value =
                '0';
            }

            if (
              Number(
                scoreB.value
              ) > 1
            ) {
              scoreB.value =
                '0';
            }
          }
          else {
            scoreA.removeAttribute(
              'max'
            );

            scoreB.removeAttribute(
              'max'
            );
          }
        }

        function fillSelectedMatch() {
          const match =
            pendingMatches.find(
              item =>
                raw(
                  item.id
                ) ===
                raw(
                  matchSelect.value
                )
            );

          if (!match) {
            return;
          }

          playedAt.value =
            toLocalInputValue(
              match.played_at
            );

          matchNumber.value =
            match.match_number != null
              ? String(
                  match.match_number
                )
              : '';

          matchType.value =
            raw(
              match.match_type
            ) ||
            'CLUB_RATED';

          scoreMode.value =
            raw(
              match.score_mode
            ) ||
            'POINTS';

          scoreA.value =
            String(
              Number(
                match.team_a_score
              ) || 0
            );

          scoreB.value =
            String(
              Number(
                match.team_b_score
              ) || 0
            );

          rebuildEditTournamentOptions(
            match.tournament_id ||
            ''
          );

          notes.value =
            raw(
              match.notes
            );

          applyScoreMode();
        }

        matchSelect.addEventListener(
          'change',
          () => {
            fillSelectedMatch();

            notice(
              message,
              ''
            );
          }
        );

        scoreMode.addEventListener(
          'change',
          applyScoreMode
        );

        fillSelectedMatch();

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

            const matchId =
              raw(
                matchSelect.value
              );

            const selectedMatch =
              pendingMatches.find(
                item =>
                  raw(
                    item.id
                  ) ===
                  matchId
              );

            if (
              !selectedMatch ||
              raw(
                selectedMatch.status
              )
                .trim()
                .toUpperCase() !==
                'PENDING'
            ) {
              notice(
                message,
                'Trận đã chọn không còn ở trạng thái PENDING.',
                true
              );

              return;
            }

            const localDate =
              new Date(
                playedAt.value
              );

            if (
              !playedAt.value ||
              !Number.isFinite(
                localDate.getTime()
              )
            ) {
              notice(
                message,
                'Thời gian thi đấu không hợp lệ.',
                true
              );

              return;
            }

            let matchNumberValue =
              null;

            if (
              matchNumber.value.trim() !==
              ''
            ) {
              matchNumberValue =
                Number(
                  matchNumber.value
                );

              if (
                !Number.isInteger(
                  matchNumberValue
                ) ||
                matchNumberValue < 1
              ) {
                notice(
                  message,
                  'Số thứ tự trận phải là số nguyên dương hoặc để trống.',
                  true
                );

                return;
              }
            }

            const scoreAValue =
              Number(
                scoreA.value
              );

            const scoreBValue =
              Number(
                scoreB.value
              );

            if (
              !Number.isInteger(
                scoreAValue
              ) ||
              !Number.isInteger(
                scoreBValue
              ) ||
              scoreAValue < 0 ||
              scoreBValue < 0
            ) {
              notice(
                message,
                'Tỷ số phải là số nguyên không âm.',
                true
              );

              return;
            }

            if (
              scoreMode.value ===
                'RESULT' &&
              (
                scoreAValue > 1 ||
                scoreBValue > 1
              )
            ) {
              notice(
                message,
                'RESULT chỉ chấp nhận 0 hoặc 1 cho mỗi đội.',
                true
              );

              return;
            }

            state.writeBusy =
              true;

            submit.disabled =
              true;

            reloadButton.disabled =
              true;

            matchSelect.disabled =
              true;

            submit.textContent =
              'Đang lưu…';

            try {
              const {
                error
              } = await client.rpc(
                'update_pending_match',
                {
                  p_match_id:
                    matchId,

                  p_played_at:
                    localDate.toISOString(),

                  p_match_number:
                    matchNumberValue,

                  p_match_type:
                    matchType.value,

                  p_score_mode:
                    scoreMode.value,

                  p_team_a_score:
                    scoreAValue,

                  p_team_b_score:
                    scoreBValue,

                  p_tournament_id:
                    tournament.value ||
                    null,

                  p_notes:
                    notes.value.trim() ||
                    null
                }
              );

              if (error) {
                throw error;
              }

              notice(
                message,
                'Đã cập nhật trận PENDING. Đang tải lại dữ liệu…',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã cập nhật trận PENDING thành công.',
                false,
                true
              );
            }
            catch (error) {
              let text =
                explain(
                  error
                );

              if (
                error?.message
              ) {
                text =
                  'Không cập nhật được trận. ' +
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
            }
            finally {
              state.writeBusy =
                false;

              submit.disabled =
                false;

              reloadButton.disabled =
                false;

              matchSelect.disabled =
                false;

              submit.textContent =
                'Lưu thay đổi PENDING';
            }
          }
        );
      }

      function rejectPendingMatchForm(root) {
        if (!isAdmin()) {
          return;
        }

        const pendingMatches =
          rows('matches')
            .filter(
              match =>
                raw(match.status)
                  .trim()
                  .toUpperCase() ===
                'PENDING'
            )
            .slice()
            .sort((a, b) => {
              const aTime =
                new Date(
                  a.played_at || 0
                ).getTime();

              const bTime =
                new Date(
                  b.played_at || 0
                ).getTime();

              if (aTime !== bTime) {
                return bTime - aTime;
              }

              return (
                Number(
                  b.match_number || 0
                ) -
                Number(
                  a.match_number || 0
                )
              );
            });

        const section = panel(
          'Từ chối trận PENDING',
          root
        );

        const description = el(
          'p',
          'Từ chối trận đang chờ duyệt. Trận sẽ chuyển sang INVALID và không được tính Rating hoặc Quỹ.',
          'notice'
        );

        const message = el('div');

        message.hidden = true;

        message.setAttribute(
          'role',
          'alert'
        );

        if (!pendingMatches.length) {
          section.append(
            description,
            el(
              'p',
              'Hiện không có trận PENDING để từ chối.',
              'notice'
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

        const matchGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchLabel = el(
          'label',
          'Trận cần từ chối'
        );

        const matchSelect = el(
          'select',
          null,
          'field'
        );

        matchSelect.id =
          'reject-pending-match';

        matchLabel.htmlFor =
          matchSelect.id;

        pendingMatches.forEach(
          match => {
            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN'
                  )
                : 'Không rõ thời gian';

            const numberText =
              match.match_number != null
                ? `${matchCode(match)} • `
                : '';

            matchSelect.append(
              new Option(
                `${numberText}${playedText} • ${raw(match.match_type)} • ${raw(match.team_a_score)}-${raw(match.team_b_score)}`,
                match.id
              )
            );
          }
        );

        matchGroup.append(
          matchLabel,
          matchSelect
        );

        const reasonGroup = el(
          'div',
          null,
          'form-group'
        );

        const reasonLabel = el(
          'label',
          'Lý do từ chối'
        );

        const reasonInput = el(
          'textarea',
          null,
          'field'
        );

        reasonInput.id =
          'reject-pending-reason';

        reasonInput.rows = 3;
        reasonInput.maxLength = 1000;
        reasonInput.required = true;

        reasonLabel.htmlFor =
          reasonInput.id;

        reasonGroup.append(
          reasonLabel,
          reasonInput
        );

        grid.append(
          matchGroup,
          reasonGroup
        );

        const actions = el(
          'div',
          null,
          'form-actions'
        );

        const submit = el(
          'button',
          'Từ chối trận',
          'btn'
        );

        submit.type = 'submit';

        actions.append(submit);

        form.append(
          grid,
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

            const matchId =
              raw(
                matchSelect.value
              );

            const reason =
              raw(
                reasonInput.value
              ).trim();

            if (!matchId) {
              notice(
                message,
                'Chưa chọn trận cần từ chối.',
                true
              );

              return;
            }

            if (!reason) {
              notice(
                message,
                'Phải nhập lý do từ chối.',
                true
              );

              return;
            }

            if (
              !window.confirm(
                `Từ chối trận này?\n\nLý do: ${reason}\n\nTrận sẽ chuyển sang INVALID và không được tính Rating/Quỹ.`
              )
            ) {
              return;
            }

            state.writeBusy = true;

            submit.disabled = true;
            matchSelect.disabled = true;
            reasonInput.disabled = true;

            submit.textContent =
              'Đang từ chối…';

            try {
              const {
                error
              } = await client.rpc(
                'reject_pending_match',
                {
                  p_match_id:
                    matchId,
                  p_reason:
                    reason
                }
              );

              if (error) {
                throw error;
              }

              notice(
                message,
                'Đã từ chối trận.',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã chuyển trận sang INVALID.',
                false,
                true
              );
            } catch (error) {
              let text =
                explain(
                  error
                );

              if (error?.message) {
                text =
                  'Không từ chối được trận. ' +
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
              state.writeBusy = false;

              submit.disabled = false;
              matchSelect.disabled = false;
              reasonInput.disabled = false;

              submit.textContent =
                'Từ chối trận';
            }
          }
        );
      }

function voidApprovedMatchForm(root) {
        if (!isAdmin()) {
          return;
        }

        const approvedMatches =
          rows('matches')
            .filter(
              match =>
                raw(match.status)
                  .trim()
                  .toUpperCase() ===
                'APPROVED'
            )
            .slice()
            .sort((a, b) => {
              const aTime =
                new Date(
                  a.played_at || 0
                ).getTime();

              const bTime =
                new Date(
                  b.played_at || 0
                ).getTime();

              if (aTime !== bTime) {
                return bTime - aTime;
              }

              const aNo =
                Number.isFinite(
                  Number(
                    a.match_number
                  )
                )
                  ? Number(
                      a.match_number
                    )
                  : -1;

              const bNo =
                Number.isFinite(
                  Number(
                    b.match_number
                  )
                )
                  ? Number(
                      b.match_number
                    )
                  : -1;

              if (aNo !== bNo) {
                return bNo - aNo;
              }

              return raw(
                b.id
              ).localeCompare(
                raw(
                  a.id
                )
              );
            });

        const section = panel(
          'Hủy trận đã duyệt',
          root
        );

        const description = el(
          'p',
          'VOID chỉ dành cho trận APPROVED bị nhập sai hoặc cần loại khỏi lịch sử tính Rating. Thao tác này không xóa trận.',
          'notice'
        );

        const warning = el(
          'p',
          'Sau khi VOID, backend sẽ xử lý lại Rating và các nghiệp vụ Quỹ liên quan theo workflow đã cấu hình.',
          'notice'
        );

        const message = el(
          'div'
        );

        message.hidden =
          true;

        message.setAttribute(
          'role',
          'alert'
        );

        if (!approvedMatches.length) {
          section.append(
            description,
            warning,
            el(
              'p',
              'Hiện không có trận APPROVED để VOID.',
              'notice'
            )
          );

          return;
        }

        const form =
          el('form');

        const grid = el(
          'div',
          null,
          'form-grid'
        );

        const matchGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchLabel = el(
          'label',
          'Trận APPROVED'
        );

        const matchSelect = el(
          'select',
          null,
          'field'
        );

        matchSelect.id =
          'void-approved-match';

        matchLabel.htmlFor =
          matchSelect.id;

        approvedMatches.forEach(
          match => {
            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN'
                  )
                : 'Không rõ thời gian';

            const numberText =
              match.match_number != null ? `${matchCode(match)} • ` : '';

            matchSelect.append(
              new Option(
                `${numberText}${playedText} • ${raw(match.match_type)} • ${raw(match.team_a_score)}-${raw(match.team_b_score)}`,
                match.id
              )
            );
          }
        );

        matchGroup.append(
          matchLabel,
          matchSelect
        );

        const reasonGroup = el(
          'div',
          null,
          'form-group'
        );

        const reasonLabel = el(
          'label',
          'Lý do VOID'
        );

        const reason = el(
          'textarea',
          null,
          'field'
        );

        reason.id =
          'void-match-reason';

        reason.required =
          true;

        reason.maxLength =
          1000;

        reason.placeholder =
          'Ví dụ: Nhập sai tỷ số, cần tạo trận thay thế';

        reasonLabel.htmlFor =
          reason.id;

        reasonGroup.append(
          reasonLabel,
          reason
        );

        grid.append(
          matchGroup,
          reasonGroup
        );

        const detailBox = el(
          'div',
          null,
          'notice mt-3'
        );

        const actions = el(
          'div',
          null,
          'form-actions'
        );

        const submit = el(
          'button',
          'VOID trận',
          'btn'
        );

        submit.type =
          'submit';

        actions.append(
          submit
        );

        form.append(
          grid,
          detailBox,
          actions
        );

        section.append(
          description,
          warning,
          message,
          form
        );

        function playerName(playerId) {
          const player =
            rows('players').find(
              item =>
                raw(item.id) ===
                raw(playerId)
            );

          return player
            ? raw(player.full_name) ||
                raw(player.name) ||
                'Không rõ VĐV'
            : 'Không rõ VĐV';
        }

        function updateDetail() {
          const matchId =
            raw(
              matchSelect.value
            );

          const selectedMatch =
            approvedMatches.find(
              item =>
                raw(item.id) ===
                matchId
            );

          if (!selectedMatch) {
            detailBox.textContent =
              'Không tìm thấy thông tin trận.';

            return;
          }

          const assignments =
            rows('match_players')
              .filter(
                item =>
                  raw(item.match_id) ===
                  matchId
              )
              .slice();

          const teamA =
            assignments
              .filter(
                item =>
                  raw(item.team)
                    .trim()
                    .toUpperCase() ===
                  'A'
              )
              .map(
                item =>
                  playerName(
                    item.player_id
                  )
              );

          const teamB =
            assignments
              .filter(
                item =>
                  raw(item.team)
                    .trim()
                    .toUpperCase() ===
                  'B'
              )
              .map(
                item =>
                  playerName(
                    item.player_id
                  )
              );

          const played =
            selectedMatch.played_at
              ? new Date(
                  selectedMatch.played_at
                )
              : null;

          const playedText =
            played &&
            Number.isFinite(
              played.getTime()
            )
              ? played.toLocaleString(
                  'vi-VN'
                )
              : 'Không rõ thời gian';

          const numberText =
            selectedMatch.match_number != null ? matchCode(selectedMatch) : 'Không có mã trận';

          detailBox.textContent =
            `${numberText} • ${playedText} • ` +
            `${raw(selectedMatch.match_type)} • ` +
            `${raw(selectedMatch.score_mode)} • ` +
            `${raw(selectedMatch.team_a_score)}-${raw(selectedMatch.team_b_score)} | ` +
            `A: ${teamA.join(' + ') || 'Chưa rõ'} | ` +
            `B: ${teamB.join(' + ') || 'Chưa rõ'}`;
        }

        matchSelect.addEventListener(
          'change',
          () => {
            updateDetail();

            notice(
              message,
              ''
            );
          }
        );

        updateDetail();

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

            const matchId =
              raw(
                matchSelect.value
              );

            const selectedMatch =
              approvedMatches.find(
                item =>
                  raw(item.id) ===
                  matchId
              );

            if (
              !selectedMatch ||
              raw(
                selectedMatch.status
              )
                .trim()
                .toUpperCase() !==
                'APPROVED'
            ) {
              notice(
                message,
                'Trận đã chọn không còn ở trạng thái APPROVED.',
                true
              );

              return;
            }

            const reasonText =
              reason.value.trim();

            if (!reasonText) {
              notice(
                message,
                'Bắt buộc nhập lý do VOID.',
                true
              );

              reason.focus();

              return;
            }

            if (reasonText.length < 3) {
              notice(
                message,
                'Lý do VOID quá ngắn.',
                true
              );

              reason.focus();

              return;
            }

            const numberText =
              selectedMatch.match_number != null ? matchCode(selectedMatch) : '';

            const confirmation =
              window.confirm(
                'Xác nhận VOID trận ' +
                `${numberText} ` +
                `${raw(selectedMatch.team_a_score)}-${raw(selectedMatch.team_b_score)}?\n\n` +
                'Trận sẽ không bị xóa. Backend sẽ xử lý lại Rating và Quỹ liên quan.\n\n' +
                'Lý do: ' +
                reasonText
              );

            if (!confirmation) {
              return;
            }

            state.writeBusy =
              true;

            submit.disabled =
              true;

            matchSelect.disabled =
              true;

            reason.disabled =
              true;

            submit.textContent =
              'Đang VOID…';

            try {
              const {
                error
              } = await client.rpc(
                'void_match_active',
                {
                  p_match_id:
                    matchId,

                  p_reason:
                    reasonText
                }
              );

              if (error) {
                throw error;
              }

              notice(
                message,
                'Đã VOID trận. Đang tải lại Rating và Quỹ…',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã VOID trận thành công. Rating và Quỹ đã được backend xử lý lại.',
                false,
                true
              );
            }
            catch (error) {
              let text =
                explain(
                  error
                );

              if (
                error?.message
              ) {
                text =
                  'Không VOID được trận. ' +
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
            }
            finally {
              state.writeBusy =
                false;

              submit.disabled =
                false;

              matchSelect.disabled =
                false;

              reason.disabled =
                false;

              submit.textContent =
                'VOID trận';
            }
          }
        );
      }

      function replacementMatchForm(root) {
        if (!isAdmin()) {
          return;
        }

        const allMatches =
          rows('matches');

        const voidedMatches =
          allMatches
            .filter(
              match => {
                const status =
                  raw(match.status)
                    .trim()
                    .toUpperCase();

                if (status !== 'VOIDED') {
                  return false;
                }

                const alreadyReplaced =
                  allMatches.some(
                    candidate =>
                      raw(
                        candidate.replaces_match_id
                      ) ===
                      raw(
                        match.id
                      )
                  );

                return !alreadyReplaced;
              }
            )
            .slice()
            .sort((a, b) => {
              const aTime =
                new Date(
                  a.played_at || 0
                ).getTime();

              const bTime =
                new Date(
                  b.played_at || 0
                ).getTime();

              if (aTime !== bTime) {
                return bTime - aTime;
              }

              const aNo =
                Number.isFinite(
                  Number(
                    a.match_number
                  )
                )
                  ? Number(
                      a.match_number
                    )
                  : -1;

              const bNo =
                Number.isFinite(
                  Number(
                    b.match_number
                  )
                )
                  ? Number(
                      b.match_number
                    )
                  : -1;

              if (aNo !== bNo) {
                return bNo - aNo;
              }

              return raw(
                b.id
              ).localeCompare(
                raw(
                  a.id
                )
              );
            });

        const section = panel(
          'Tạo trận thay thế',
          root
        );

        const description = el(
          'p',
          'Tạo một trận PENDING mới từ trận VOIDED. Backend sẽ sao chép thông tin trận và 4 VĐV, đồng thời lưu liên kết với trận gốc.',
          'notice'
        );

        const message =
          el('div');

        message.hidden =
          true;

        message.setAttribute(
          'role',
          'alert'
        );

        if (!voidedMatches.length) {
          section.append(
            description,
            el(
              'p',
              'Hiện không có trận VOIDED nào đủ điều kiện tạo trận thay thế.',
              'notice'
            )
          );

          return;
        }

        const form =
          el('form');

        const grid = el(
          'div',
          null,
          'form-grid'
        );

        const matchGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchLabel = el(
          'label',
          'Trận VOIDED'
        );

        const matchSelect = el(
          'select',
          null,
          'field'
        );

        matchSelect.id =
          'replacement-voided-match';

        matchLabel.htmlFor =
          matchSelect.id;

        voidedMatches.forEach(
          match => {
            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN'
                  )
                : 'Không rõ thời gian';

            const numberText =
              match.match_number != null ? `${matchCode(match)} • ` : '';

            matchSelect.append(
              new Option(
                `${numberText}${playedText} • ${raw(match.match_type)} • ${raw(match.team_a_score)}-${raw(match.team_b_score)}`,
                match.id
              )
            );
          }
        );

        matchGroup.append(
          matchLabel,
          matchSelect
        );

        grid.append(
          matchGroup
        );

        const detailBox = el(
          'div',
          null,
          'notice mt-3'
        );

        const actions = el(
          'div',
          null,
          'form-actions'
        );

        const submit = el(
          'button',
          'Tạo trận thay thế',
          'btn primary'
        );

        submit.type =
          'submit';

        actions.append(
          submit
        );

        form.append(
          grid,
          detailBox,
          actions
        );

        section.append(
          description,
          message,
          form
        );

        function playerName(playerId) {
          const player =
            rows('players').find(
              item =>
                raw(item.id) ===
                raw(playerId)
            );

          return player
            ? raw(player.full_name) ||
                raw(player.name) ||
                'Không rõ VĐV'
            : 'Không rõ VĐV';
        }

        function updateDetail() {
          const matchId =
            raw(
              matchSelect.value
            );

          const selectedMatch =
            voidedMatches.find(
              item =>
                raw(item.id) ===
                matchId
            );

          if (!selectedMatch) {
            detailBox.textContent =
              'Không tìm thấy thông tin trận.';

            return;
          }

          const assignments =
            rows('match_players')
              .filter(
                item =>
                  raw(item.match_id) ===
                  matchId
              )
              .slice();

          const teamA =
            assignments
              .filter(
                item =>
                  raw(item.team)
                    .trim()
                    .toUpperCase() ===
                  'A'
              )
              .map(
                item =>
                  playerName(
                    item.player_id
                  )
              );

          const teamB =
            assignments
              .filter(
                item =>
                  raw(item.team)
                    .trim()
                    .toUpperCase() ===
                  'B'
              )
              .map(
                item =>
                  playerName(
                    item.player_id
                  )
              );

          const played =
            selectedMatch.played_at
              ? new Date(
                  selectedMatch.played_at
                )
              : null;

          const playedText =
            played &&
            Number.isFinite(
              played.getTime()
            )
              ? played.toLocaleString(
                  'vi-VN'
                )
              : 'Không rõ thời gian';

          const numberText =
            selectedMatch.match_number != null ? matchCode(selectedMatch) : 'Không có mã trận';

          detailBox.textContent =
            `${numberText} • ${playedText} • ` +
            `${raw(selectedMatch.match_type)} • ` +
            `${raw(selectedMatch.score_mode)} • ` +
            `${raw(selectedMatch.team_a_score)}-${raw(selectedMatch.team_b_score)} | ` +
            `A: ${teamA.join(' + ') || 'Chưa rõ'} | ` +
            `B: ${teamB.join(' + ') || 'Chưa rõ'}`;
        }

        matchSelect.addEventListener(
          'change',
          () => {
            updateDetail();

            notice(
              message,
              ''
            );
          }
        );

        updateDetail();

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

            const matchId =
              raw(
                matchSelect.value
              );

            const selectedMatch =
              voidedMatches.find(
                item =>
                  raw(item.id) ===
                  matchId
              );

            if (
              !selectedMatch ||
              raw(
                selectedMatch.status
              )
                .trim()
                .toUpperCase() !==
                'VOIDED'
            ) {
              notice(
                message,
                'Trận đã chọn không còn ở trạng thái VOIDED.',
                true
              );

              return;
            }

            const alreadyReplaced =
              rows('matches').some(
                candidate =>
                  raw(
                    candidate.replaces_match_id
                  ) ===
                  matchId
              );

            if (alreadyReplaced) {
              notice(
                message,
                'Trận VOIDED này đã có trận thay thế.',
                true
              );

              return;
            }

            const numberText =
              selectedMatch.match_number != null ? matchCode(selectedMatch) : '';

            const confirmed =
              window.confirm(
                'Tạo trận thay thế cho trận ' +
                `${numberText} ` +
                `${raw(selectedMatch.team_a_score)}-${raw(selectedMatch.team_b_score)}?\n\n` +
                'Một trận PENDING mới sẽ được tạo. Trận VOIDED gốc vẫn được giữ trong lịch sử.'
              );

            if (!confirmed) {
              return;
            }

            state.writeBusy =
              true;

            submit.disabled =
              true;

            matchSelect.disabled =
              true;

            submit.textContent =
              'Đang tạo…';

            try {
              const {
                data,
                error
              } = await client.rpc(
                'create_replacement_match',
                {
                  p_voided_match_id:
                    matchId
                }
              );

              if (error) {
                throw error;
              }

              let replacementId =
                '';

              if (
                typeof data ===
                'string'
              ) {
                replacementId =
                  data;
              }
              else if (
                data &&
                typeof data ===
                  'object'
              ) {
                replacementId =
                  raw(
                    data.match_id ||
                    data.replacement_match_id ||
                    data.id
                  );
              }

              notice(
                message,
                'Đã tạo trận thay thế. Đang tải lại dữ liệu…',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              const successText =
                replacementId
                  ? `Đã tạo trận thay thế PENDING thành công. ID: ${replacementId}`
                  : 'Đã tạo trận thay thế PENDING thành công.';

              notice(
                $('global-message'),
                successText,
                false,
                true
              );
            }
            catch (error) {
              let text =
                explain(
                  error
                );

              if (error?.message) {
                text =
                  'Không tạo được trận thay thế. ' +
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
            }
            finally {
              state.writeBusy =
                false;

              submit.disabled =
                false;

              matchSelect.disabled =
                false;

              submit.textContent =
                'Tạo trận thay thế';
            }
          }
        );
      }
      function approvePendingMatchForm(root) {
        if (!isAdmin()) {
          return;
        }

        const pendingMatches =
          rows('matches')
            .filter(
              match =>
                raw(match.status)
                  .trim()
                  .toUpperCase() ===
                'PENDING'
            )
            .slice()
            .sort((a, b) => {
              const aTime =
                new Date(
                  a.played_at || 0
                ).getTime();

              const bTime =
                new Date(
                  b.played_at || 0
                ).getTime();

              if (aTime !== bTime) {
                return bTime - aTime;
              }

              const aNo =
                Number.isFinite(
                  Number(
                    a.match_number
                  )
                )
                  ? Number(
                      a.match_number
                    )
                  : -1;

              const bNo =
                Number.isFinite(
                  Number(
                    b.match_number
                  )
                )
                  ? Number(
                      b.match_number
                    )
                  : -1;

              if (aNo !== bNo) {
                return bNo - aNo;
              }

              return raw(
                b.id
              ).localeCompare(
                raw(
                  a.id
                )
              );
            });

        const playerById =
          new Map(
            rows('players').map(
              player => [
                raw(
                  player.id
                ),
                player
              ]
            )
          );

        const eligibleMatches =
          pendingMatches.filter(
            match => {
              const assigned =
                rows(
                  'match_players'
                ).filter(
                  item =>
                    raw(
                      item.match_id
                    ) ===
                    raw(
                      match.id
                    )
                );

              const teamA =
                assigned.filter(
                  item =>
                    raw(
                      item.team
                    ).toUpperCase() ===
                    'A'
                );

              const teamB =
                assigned.filter(
                  item =>
                    raw(
                      item.team
                    ).toUpperCase() ===
                    'B'
                );

              const distinctPlayers =
                new Set(
                  assigned.map(
                    item =>
                      raw(
                        item.player_id
                      )
                  )
                );

              return (
                assigned.length === 4 &&
                teamA.length === 2 &&
                teamB.length === 2 &&
                distinctPlayers.size === 4
              );
            }
          );

        const section = panel(
          'Duyệt trận PENDING',
          root
        );

        const description = el(
          'p',
          'Chỉ các trận PENDING đã đủ đội hình 2A + 2B mới xuất hiện. Khi duyệt, backend sẽ tự tính Rating và Quỹ theo cấu hình hiện hành.',
          'notice'
        );

        const message =
          el('div');

        message.hidden =
          true;

        message.setAttribute(
          'role',
          'alert'
        );

        if (
          !eligibleMatches.length
        ) {
          section.append(
            description,
            el(
              'p',
              'Hiện chưa có trận PENDING đủ 4 VĐV để duyệt.',
              'notice'
            )
          );

          return;
        }

        const form =
          el('form');

        const grid = el(
          'div',
          null,
          'form-grid'
        );

        const matchGroup = el(
          'div',
          null,
          'form-group'
        );

        const matchLabel = el(
          'label',
          'Trận cần duyệt'
        );

        const matchSelect = el(
          'select',
          null,
          'field'
        );

        matchSelect.id =
          'approve-pending-match';

        matchLabel.htmlFor =
          matchSelect.id;

        eligibleMatches.forEach(
          match => {
            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN'
                  )
                : 'Không rõ thời gian';

            const numberText =
              match.match_number != null ? `${matchCode(match)} • ` : '';

            matchSelect.append(
              new Option(
                `${numberText}${playedText} • ${raw(match.match_type)} • ${raw(match.team_a_score)}-${raw(match.team_b_score)}`,
                match.id
              )
            );
          }
        );

        matchGroup.append(
          matchLabel,
          matchSelect
        );

        const detail =
          el(
            'div',
            null,
            'notice'
          );

        grid.append(
          matchGroup
        );

        const actions = el(
          'div',
          null,
          'form-actions'
        );

        const submit = el(
          'button',
          'Duyệt trận',
          'btn primary'
        );

        submit.type =
          'submit';

        actions.append(
          submit
        );

        form.append(
          grid,
          detail,
          actions
        );

        section.append(
          description,
          message,
          form
        );

        const playerName =
          playerId =>
            raw(
              playerById.get(
                raw(
                  playerId
                )
              )?.full_name
            ) ||
            raw(
              playerId
            );

        const refreshDetail =
          () => {
            const match =
              eligibleMatches.find(
                item =>
                  raw(
                    item.id
                  ) ===
                  raw(
                    matchSelect.value
                  )
              );

            if (!match) {
              detail.textContent =
                '';

              return;
            }

            const assigned =
              rows(
                'match_players'
              ).filter(
                item =>
                  raw(
                    item.match_id
                  ) ===
                  raw(
                    match.id
                  )
              );

            const teamA =
              assigned
                .filter(
                  item =>
                    raw(
                      item.team
                    ).toUpperCase() ===
                    'A'
                )
                .map(
                  item =>
                    playerName(
                      item.player_id
                    )
                );

            const teamB =
              assigned
                .filter(
                  item =>
                    raw(
                      item.team
                    ).toUpperCase() ===
                    'B'
                )
                .map(
                  item =>
                    playerName(
                      item.player_id
                    )
                );

            detail.textContent =
              `Đội A: ${teamA.join(' + ')} • Đội B: ${teamB.join(' + ')} • Tỷ số: ${raw(match.team_a_score)}-${raw(match.team_b_score)} • Chế độ: ${raw(match.score_mode)}`;
          };

        matchSelect.addEventListener(
          'change',
          refreshDetail
        );

        refreshDetail();

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

            const matchId =
              raw(
                matchSelect.value
              );

            const match =
              eligibleMatches.find(
                item =>
                  raw(
                    item.id
                  ) ===
                  matchId
              );

            if (!match) {
              notice(
                message,
                'Trận đã chọn không còn đủ điều kiện duyệt.',
                true
              );

              return;
            }

            const confirmText =
              `Duyệt trận ${match.match_number != null ? matchCode(match) + ' ' : ''}${raw(match.team_a_score)}-${raw(match.team_b_score)}?\n\nSau khi duyệt, backend sẽ tính Rating và Quỹ.`;

            if (
              !window.confirm(
                confirmText
              )
            ) {
              return;
            }

            state.writeBusy =
              true;

            submit.disabled =
              true;

            matchSelect.disabled =
              true;

            submit.textContent =
              'Đang duyệt…';

            try {
              const {
                error
              } = await client.rpc(
                'approve_match_active',
                {
                  p_match_id:
                    matchId
                }
              );

              if (error) {
                throw error;
              }

              notice(
                message,
                'Đã duyệt trận. Đang tải lại Rating và Quỹ…',
                false,
                true
              );

              await load();

              state.page =
                'matches';

              render();

              notice(
                $('global-message'),
                'Đã APPROVE trận thành công. Rating và Quỹ đã được backend xử lý.',
                false,
                true
              );
            } catch (error) {
              let text =
                explain(
                  error
                );

              if (
                error?.message
              ) {
                text =
                  'Không duyệt được trận. ' +
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

              matchSelect.disabled =
                false;

              submit.textContent =
                'Duyệt trận';
            }
          }
        );
      }
      function adminMatchCenter(root) {
        if (!isAdmin()) {
          return;
        }

        const allMatches =
          rows('matches')
            .slice()
            .sort((a, b) => {
              const aTime =
                new Date(
                  a.played_at || 0
                ).getTime();

              const bTime =
                new Date(
                  b.played_at || 0
                ).getTime();

              if (aTime !== bTime) {
                return bTime - aTime;
              }

              return (
                Number(
                  b.match_number || 0
                ) -
                Number(
                  a.match_number || 0
                )
              );
            });

        const assignments =
          rows('match_players');

        const playerRows =
          rows('players');

        const makeNode =
          (
            tag,
            className = '',
            text = null
          ) => {
            const item =
              document.createElement(tag);

            if (className) {
              item.className =
                className;
            }

            if (text != null) {
              item.textContent =
                text;
            }

            return item;
          };

        const playerName =
          playerId => {
            const player =
              playerRows.find(
                item =>
                  raw(item.id) ===
                  raw(playerId)
              );

            return (
              raw(
                pick(
                  player || {},
                  'full_name',
                  'name'
                )
              ) ||
              'Không rõ VĐV'
            );
          };

        const matchPlayers =
          matchId =>
            assignments.filter(
              item =>
                raw(item.match_id) ===
                raw(matchId)
            );

        const teamNames =
          (
            matchId,
            team
          ) =>
            matchPlayers(matchId)
              .filter(
                item =>
                  raw(item.team)
                    .toUpperCase() ===
                  team
              )
              .map(
                item =>
                  playerName(
                    item.player_id
                  )
              );

        const isApproveEligible =
          match => {
            const assigned =
              matchPlayers(match.id);

            const teamA =
              assigned.filter(
                item =>
                  raw(item.team)
                    .toUpperCase() ===
                  'A'
              );

            const teamB =
              assigned.filter(
                item =>
                  raw(item.team)
                    .toUpperCase() ===
                  'B'
              );

            const distinct =
              new Set(
                assigned.map(
                  item =>
                    raw(
                      item.player_id
                    )
                )
              );

            return (
              assigned.length === 4 &&
              teamA.length === 2 &&
              teamB.length === 2 &&
              distinct.size === 4
            );
          };

        const hasReplacement =
          matchId =>
            allMatches.some(
              item =>
                raw(
                  item.replaces_match_id
                ) ===
                raw(matchId)
            );

        const statusInfo = {
          PENDING: {
            label: 'Chờ duyệt',
            badge:
              'bg-amber-100 text-amber-800',
            open: true
          },

          APPROVED: {
            label: 'Đã duyệt',
            badge:
              'bg-emerald-100 text-emerald-800',
            open: false
          },

          INVALID: {
            label: 'Không hợp lệ',
            badge:
              'bg-rose-100 text-rose-800',
            open: false
          },

          VOIDED: {
            label: 'Đã hủy',
            badge:
              'bg-slate-200 text-slate-700',
            open: false
          }
        };

        const center =
          makeNode(
            'div',
            'space-y-4'
          );

        root.append(center);

        const createToggle =
          makeNode(
            'details',
            'rounded-2xl border border-slate-200 bg-white shadow-sm'
          );

        const createSummary =
          makeNode(
            'summary',
            'cursor-pointer select-none list-none px-5 py-4 font-semibold text-slate-900',
            '＋ Tạo trận mới'
          );

        const createHost =
          makeNode(
            'div',
            'border-t border-slate-100 p-4'
          );

        createToggle.append(
          createSummary,
          createHost
        );

        center.append(
          createToggle
        );

        createMatchForm(
          createHost
        );

        const actionArea =
          makeNode(
            'div',
            'rounded-2xl border border-indigo-200 bg-indigo-50/40 shadow-sm'
          );

        actionArea.hidden =
          true;

        const actionHeader =
          makeNode(
            'div',
            'flex items-center justify-between gap-3 border-b border-indigo-100 px-5 py-3'
          );

        const actionTitle =
          makeNode(
            'div',
            'font-semibold text-slate-900',
            'Thao tác trận đấu'
          );

        const closeAction =
          makeNode(
            'button',
            'rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900',
            'Đóng'
          );

        closeAction.type =
          'button';

        const actionContent =
          makeNode(
            'div',
            'p-3 sm:p-4'
          );

        actionHeader.append(
          actionTitle,
          closeAction
        );

        actionArea.append(
          actionHeader,
          actionContent
        );

        center.append(
          actionArea
        );

        const actionHosts = {};

        [
          'edit',
          'players',
          'approve',
          'reject',
          'void',
          'replacement'
        ].forEach(
          key => {
            const host =
              makeNode(
                'div',
                ''
              );

            host.hidden =
              true;

            actionHosts[key] =
              host;

            actionContent.append(
              host
            );
          }
        );

        editPendingMatchForm(
          actionHosts.edit
        );

        setPendingMatchPlayersForm(
          actionHosts.players
        );

        approvePendingMatchForm(
          actionHosts.approve
        );

        rejectPendingMatchForm(
          actionHosts.reject
        );

        voidApprovedMatchForm(
          actionHosts.void
        );

        replacementMatchForm(
          actionHosts.replacement
        );

        const actionConfig = {
          edit: {
            label: 'Sửa trận',
            select:
              '#edit-pending-match'
          },

          players: {
            label: 'Xếp VĐV',
            select:
              '#pending-players-match'
          },

          approve: {
            label: 'Duyệt trận',
            select:
              '#approve-pending-match'
          },

          reject: {
            label: 'Từ chối trận',
            select:
              '#reject-pending-match'
          },

          void: {
            label: 'Hủy trận',
            select:
              '#void-approved-match'
          },

          replacement: {
            label:
              'Tạo trận thay thế',
            select:
              '#replacement-voided-match'
          }
        };

        const hideActions =
          () => {
            Object.values(
              actionHosts
            ).forEach(
              host => {
                host.hidden =
                  true;
              }
            );

            actionArea.hidden =
              true;
          };

        closeAction.addEventListener(
          'click',
          hideActions
        );

        const openAction =
          (
            action,
            match
          ) => {
            const config =
              actionConfig[action];

            const host =
              actionHosts[action];

            if (
              !config ||
              !host
            ) {
              return;
            }

            Object.values(
              actionHosts
            ).forEach(
              item => {
                item.hidden =
                  true;
              }
            );

            host.hidden =
              false;

            actionArea.hidden =
              false;

            actionTitle.textContent =
              `${config.label} • ${matchCode(match)}`;

            const select =
              host.querySelector(
                config.select
              );

            if (select) {
              select.value =
                raw(match.id);

              select.dispatchEvent(
                new Event(
                  'change',
                  {
                    bubbles: true
                  }
                )
              );
            }

            actionArea.scrollIntoView(
              {
                behavior: 'smooth',
                block: 'start'
              }
            );
          };

        const actionButton =
          (
            label,
            action,
            match,
            tone = 'default',
            enabled = true
          ) => {
            const tones = {
              default:
                'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',

              primary:
                'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',

              danger:
                'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',

              strong:
                'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
            };

            const btn =
              makeNode(
                'button',
                'rounded-lg border px-3 py-2 text-sm font-medium transition ' +
                (
                  tones[tone] ||
                  tones.default
                ),
                label
              );

            btn.type =
              'button';

            btn.disabled =
              !enabled;

            if (!enabled) {
              btn.className +=
                ' cursor-not-allowed opacity-40';
            } else {
              btn.addEventListener(
                'click',
                () =>
                  openAction(
                    action,
                    match
                  )
              );
            }

            return btn;
          };

        const renderCard =
          match => {
            const status =
              raw(match.status)
                .trim()
                .toUpperCase();

            const info =
              statusInfo[status] ||
              {
                label: status,
                badge:
                  'bg-slate-100 text-slate-700'
              };

            const card =
              makeNode(
                'article',
                'rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md'
              );

            const head =
              makeNode(
                'div',
                'flex flex-wrap items-start justify-between gap-3'
              );

            const titleWrap =
              makeNode(
                'div',
                'min-w-0'
              );

            const title =
              makeNode(
                'div',
                'font-semibold text-slate-900',
                matchCode(match)
              );

            const played =
              match.played_at
                ? new Date(
                    match.played_at
                  )
                : null;

            const playedText =
              played &&
              Number.isFinite(
                played.getTime()
              )
                ? played.toLocaleString(
                    'vi-VN',
                    {
                      dateStyle:
                        'short',
                      timeStyle:
                        'short'
                    }
                  )
                : 'Chưa rõ thời gian';

            const meta =
              makeNode(
                'div',
                'mt-1 text-xs text-slate-500',
                `${playedText} • ${raw(match.match_type)}`
              );

            titleWrap.append(
              title,
              meta
            );

            const badge =
              makeNode(
                'span',
                'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                info.badge,
                info.label
              );

            head.append(
              titleWrap,
              badge
            );

            const teams =
              makeNode(
                'div',
                'mt-4 grid items-center gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_1fr]'
              );

            const teamA =
              teamNames(
                match.id,
                'A'
              );

            const teamB =
              teamNames(
                match.id,
                'B'
              );

            const teamABox =
              makeNode(
                'div',
                'text-sm font-medium text-slate-800',
                teamA.length
                  ? teamA.join(
                      ' + '
                    )
                  : 'Đội A chưa đủ VĐV'
              );

            const score =
              makeNode(
                'div',
                'text-center text-xl font-bold tabular-nums text-slate-950',
                `${raw(match.team_a_score)} – ${raw(match.team_b_score)}`
              );

            const teamBBox =
              makeNode(
                'div',
                'text-sm font-medium text-slate-800 sm:text-right',
                teamB.length
                  ? teamB.join(
                      ' + '
                    )
                  : 'Đội B chưa đủ VĐV'
              );

            teams.append(
              teamABox,
              score,
              teamBBox
            );

            card.append(
              head,
              teams
            );

            const extraText =
              status === 'INVALID' ||
              status === 'VOIDED'
                ? raw(
                    match.invalid_reason
                  )
                : raw(
                    match.notes
                  );

            if (extraText) {
              card.append(
                makeNode(
                  'div',
                  'mt-3 text-sm text-slate-500',
                  (
                    status ===
                      'INVALID' ||
                    status ===
                      'VOIDED'
                      ? 'Lý do: '
                      : 'Ghi chú: '
                  ) +
                    extraText
                )
              );
            }

            const actions =
              makeNode(
                'div',
                'mt-4 flex flex-wrap gap-2'
              );

            if (
              status ===
              'PENDING'
            ) {
              actions.append(
                actionButton(
                  '✏ Sửa',
                  'edit',
                  match
                ),

                actionButton(
                  '👥 Xếp VĐV',
                  'players',
                  match
                ),

                actionButton(
                  '✓ Duyệt',
                  'approve',
                  match,
                  'primary',
                  isApproveEligible(
                    match
                  )
                ),

                actionButton(
                  '✕ Từ chối',
                  'reject',
                  match,
                  'danger'
                )
              );
            }

            if (
              status ===
              'APPROVED'
            ) {
              actions.append(
                actionButton(
                  'Hủy trận',
                  'void',
                  match,
                  'danger'
                )
              );
            }

            if (
              status ===
                'VOIDED' &&
              !hasReplacement(
                match.id
              )
            ) {
              actions.append(
                actionButton(
                  'Tạo trận thay thế',
                  'replacement',
                  match,
                  'strong'
                )
              );
            }

            if (
              actions.childElementCount >
              0
            ) {
              card.append(
                actions
              );
            }

            return card;
          };

        [
          'PENDING',
          'APPROVED',
          'INVALID',
          'VOIDED'
        ].forEach(
          status => {
            const info =
              statusInfo[status];

            const matches =
              allMatches.filter(
                match =>
                  raw(match.status)
                    .trim()
                    .toUpperCase() ===
                  status
              );

            const group =
              makeNode(
                'details',
                'rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm'
              );

            group.open =
              info.open;

            const summary =
              makeNode(
                'summary',
                'cursor-pointer select-none list-none px-5 py-4'
              );

            const summaryRow =
              makeNode(
                'div',
                'flex items-center justify-between gap-3'
              );

            const label =
              makeNode(
                'div',
                'font-semibold text-slate-900',
                info.label
              );

            const count =
              makeNode(
                'span',
                'rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm',
                String(
                  matches.length
                )
              );

            summaryRow.append(
              label,
              count
            );

            summary.append(
              summaryRow
            );

            const body =
              makeNode(
                'div',
                'space-y-3 border-t border-slate-200 p-3 sm:p-4'
              );

            if (
              matches.length === 0
            ) {
              body.append(
                makeNode(
                  'div',
                  'rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500',
                  'Không có trận nào.'
                )
              );
            } else {
              matches.forEach(
                match => {
                  body.append(
                    renderCard(match)
                  );
                }
              );
            }

            group.append(
              summary,
              body
            );

            center.append(
              group
            );
          }
        );
      }
      function matchesPage() {
        const root = $('content');

        sources(
          root,
          [
            'matches',
            'match_players',
            'players',
            'tournaments'
          ]
        );

        if (isAdmin()) {
          adminMatchCenter(root);
        } else {
          createMyPendingMatchForm(root);

          table(
            root,
            'Danh sách trận đấu',
            recent(
              rows('matches'),
              'played_at'
            ),
            matchCols,
            {
              status: true,
              unavailable:
                !!state.errors.matches
            }
          );
        }
      }
    return Object.freeze({
      matchesPage
    });
  }

  window.PickMatches = Object.freeze({
    create
  });
})();