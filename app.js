'use strict';

    (() => {
      const $ = id => document.getElementById(id);

      const modules = [
        ['overview', '◉', 'Tổng quan'],
        ['matches', '▦', 'Trận đấu'],
        ['players', '♧', 'VĐV'],
        ['ranking', '↗', 'BXH'],
        ['fund', '₫', 'Quỹ'],
        ['contribution', '♡', 'Cống hiến'],
        ['tournaments', '⚑', 'Giải đấu'],
        ['admin', '⚙', 'Quản trị']
      ];

      const FALLBACK_RATING_VERSION = 'V1.1';
      const FALLBACK_OFFICIAL_MIN_MATCHES = 5;

      const tables = [
        'players',
        'matches',
        'match_players',
        'rating_events',
        'rating_settings',
        'rating_match_weights',
        'fund_rules',
        'fund_contributions',
        'fund_payments',
        'fund_transactions',
        'tournaments',
       'tournament_registrations',
        'tournament_payments'
      ];

      const labels = {
        players: 'Vận động viên',
        matches: 'Trận đấu',
        match_players: 'Thành phần trận đấu',
        rating_events: 'Lịch sử điểm',
        rating_settings: 'Thiết lập điểm',
        rating_match_weights: 'Trọng số trận đấu',
        fund_rules: 'Quy định quỹ',
        fund_contributions: 'Khoản đóng góp',
        fund_payments: 'Thanh toán',
        fund_transactions: 'Sổ giao dịch',
        tournaments: 'Giải đấu'
      };

      const state = {
        session: null,
        profile: null,
        data: {},
        errors: {},
        partial: {},
        page: 'overview',
        busy: false,
        writeBusy: false,
        generation: 0,
        controller: null,
        updated: null
      };

      let client;
      let subscription;
      let authSequence = 0;

      const num = v =>
        v === null ||
        v === undefined ||
        v === '' ||
        typeof v === 'boolean'
          ? null
          : Number.isFinite(Number(v))
            ? Number(v)
            : null;

      const number = v =>
        num(v) === null
          ? '—'
          : new Intl.NumberFormat('vi-VN', {
              maximumFractionDigits: 2
            }).format(Number(v));

      const money = v =>
        num(v) === null
          ? '—'
          : new Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
              maximumFractionDigits: 0
            }).format(Number(v));

      const date = v =>
        !v || !Number.isFinite(new Date(v).getTime())
          ? '—'
          : new Intl.DateTimeFormat('vi-VN', {
              dateStyle: 'short',
              timeStyle: 'short'
            }).format(new Date(v));

      const pick = (r, ...keys) => {
        for (const k of keys) {
          if (r[k] !== null && r[k] !== undefined) {
            return r[k];
          }
        }
        return null;
      };

      const raw = v =>
        v == null || v === ''
          ? '—'
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v);

      const upper = v =>
        String(v || '').toUpperCase();

      const fold = v =>
        String(v)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .toLowerCase();

      const rows = t =>
        state.data[t] || [];

      const activeRatingSettings = () =>
        rows('rating_settings')
          .find(
            item =>
              item.is_active === true
          ) ||
        null;

      const currentRatingVersion = () =>
        String(
          activeRatingSettings()
            ?.algorithm_version ||
          FALLBACK_RATING_VERSION
        );

      const officialMinMatches = () => {
        const value =
          Number(
            activeRatingSettings()
              ?.provisional_matches
          );

        return Number.isFinite(value) &&
          value >= 0
          ? value
          : FALLBACK_OFFICIAL_MIN_MATCHES;
      };

      const ready = (...ts) =>
        ts.every(
          t =>
            Array.isArray(state.data[t]) &&
            !state.errors[t] &&
            !state.partial[t]
        );

      const isAdmin = () =>
        upper(state.profile?.role) === 'ADMIN' &&
        state.profile?.is_active === true;

const canCollectTournamentFee = () =>
  state.profile?.is_active === true &&
  state.profile?.can_collect_tournament_fee === true;

      function el(tag, text, cls) {
        const n = document.createElement(tag);

        if (text !== undefined && text !== null) {
          n.textContent = String(text);
        }

        if (cls) {
          n.className = cls;
        }

        return n;
      }

      function button(text, fn, cls = 'btn') {
        const n = el('button', text, cls);
        n.type = 'button';
        n.addEventListener('click', fn);
        return n;
      }

      function notice(target, text, isError = false, isSuccess = false) {
        target.replaceChildren();
        target.hidden = !text;

        target.className =
          'notice' +
          (isError ? ' error' : '') +
          (isSuccess ? ' success' : '');

        if (text) {
          target.textContent = text;
        }
      }

      function panel(title, parent = $('content')) {
        const n = el('section', null, 'panel');
        n.append(el('h2', title));
        parent.append(n);
        return n;
      }

      function badge(value) {
        const s = upper(value);

        const texts = {
          APPROVED: 'Đã duyệt',
          PENDING: 'Chờ duyệt',
          VOIDED: 'Đã hủy',
          INVALID: 'Không hợp lệ',
          ACTIVE: 'Đang hoạt động',
          INACTIVE: 'Ngừng hoạt động',
          COMPLETED: 'Hoàn tất',
          CANCELLED: 'Đã hủy',
          PAID: 'Đã thanh toán',
          UNPAID: 'Chưa thanh toán',
          PARTIAL: 'Thanh toán một phần',
          CHUA_DONG: 'Chưa đóng',
          DONG_MOT_PHAN: 'Đóng một phần',
          DA_DONG: 'Đã đóng',
          MIEN: 'Miễn',
          DIEU_CHINH: 'Điều chỉnh',
          ADMIN: 'Quản trị viên',
          MEMBER: 'Thành viên'
        };

        return el(
          'span',
          texts[s] || raw(value),
          'badge ' +
            (
              [
                'APPROVED',
                'ACTIVE',
                'PAID',
                'COMPLETED',
                'DA_DONG'
              ].includes(s)
                ? 'good'
                : [
                    'PENDING',
                    'PARTIAL',
                    'UNPAID',
                    'CHUA_DONG',
                    'DONG_MOT_PHAN'
                  ].includes(s)
                  ? 'pending'
                  : [
                      'VOIDED',
                      'INVALID',
                      'CANCELLED',
                      'INACTIVE'
                    ].includes(s)
                    ? 'bad'
                    : ''
            )
        );
      }

      const playerName = id => {
        const r = rows('players').find(p => p.id === id);

        return r
          ? raw(
              pick(
                r,
                'full_name',
                'display_name',
                'name',
                'player_name'
              )
            )
          : id
            ? String(id)
            : '—';
      };

      function sources(parent, ts) {
        for (const t of ts) {
          if (state.errors[t]) {
            const n = el('div', null, 'notice error');

            n.append(
              el(
                'span',
                labels[t] + ': ' + state.errors[t] + ' '
              ),
              button(
                'Thử lại',
                () => load()
              )
            );

            parent.append(n);
          } else if (state.partial[t]) {
            parent.append(
              el(
                'p',
                labels[t] +
                  ': chỉ hiển thị tối đa 10.000 dòng. Các chỉ số tổng hợp liên quan tạm ẩn.',
                'notice'
              )
            );
          }
        }
      }

      function grid(parent, items, extraClass = '') {
        const n = el(
          'div',
          null,
          (
            'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 ' +
            extraClass
          ).trim()
        );

        for (const [label, value, hint] of items) {
          const c = el('div', null, 'stat');

          c.append(
            el('div', label, 'muted'),
            el('strong', value)
          );

          if (hint) {
            c.append(
              el(
                'p',
                hint,
                'muted mt-2 mb-0'
              )
            );
          }

          n.append(c);
        }

        parent.append(n);
      }

      function table(
        parent,
        title,
        data,
        columns,
        opts = {}
      ) {
        const section = panel(title, parent);
        const tools = el('div', null, 'tools');
        const search = el('input', null, 'field');

        search.type = 'search';
        search.placeholder =
          'Tìm trong ' + title.toLowerCase() + '…';

        search.setAttribute(
          'aria-label',
          search.placeholder
        );

        tools.append(search);

        let filter = null;

        if (opts.status) {
          filter = el('select', null, 'field');

          filter.setAttribute(
            'aria-label',
            'Lọc trạng thái'
          );

          filter.append(
            new Option(
              'Tất cả trạng thái',
              ''
            )
          );

          [
            ...new Set(
              data
                .map(r => r.status)
                .filter(Boolean)
            )
          ]
            .sort()
            .forEach(s =>
              filter.append(
                new Option(
                  badge(s).textContent,
                  s
                )
              )
            );

          tools.append(filter);
        }

        section.append(tools);

        const host = el('div');
        section.append(host);

        let page = 1;

        const values = r =>
          columns.map(c => c[1](r));

        function draw() {
          host.replaceChildren();

          const q = fold(
            search.value.trim()
          );

          const found = data.filter(
            r =>
              (
                !filter ||
                !filter.value ||
                r.status === filter.value
              ) &&
              (
                !q ||
                values(r).some(v =>
                  fold(
                    v instanceof Node
                      ? v.textContent
                      : raw(v)
                  ).includes(q)
                )
              )
          );

          const pages = Math.max(
            1,
            Math.ceil(found.length / 20)
          );

          page = Math.min(
            page,
            pages
          );

          if (!found.length) {
            host.append(
              el(
                'p',
                data.length
                  ? 'Không có kết quả phù hợp. Hãy thay đổi từ khóa hoặc bộ lọc.'
                  : opts.unavailable
                    ? 'Chưa có dữ liệu để hiển thị do nguồn dữ liệu tải chưa thành công.'
                    : 'Chưa có dữ liệu hiển thị trong phạm vi quyền của bạn.',
                'muted py-6'
              )
            );

            return;
          }

          const wrap = el(
            'div',
            null,
            'table-wrap'
          );

          wrap.tabIndex = 0;

          wrap.setAttribute(
            'role',
            'region'
          );

          wrap.setAttribute(
            'aria-label',
            title
          );

          const t = el('table');
          const caption = el(
            'caption',
            title,
            'sr-only'
          );

          const head = el('thead');
          const hr = el('tr');

          columns.forEach(c => {
            const th = el(
              'th',
              c[0]
            );

            th.scope = 'col';
            hr.append(th);
          });

          head.append(hr);

          const body = el('tbody');

          found
            .slice(
              (page - 1) * 20,
              page * 20
            )
            .forEach(r => {
              const tr = el('tr');

              values(r).forEach(v => {
                const td = el('td');

                if (v instanceof Node) {
                  td.append(v);
                } else {
                  td.textContent = raw(v);
                }

                tr.append(td);
              });

              body.append(tr);
            });

          t.append(
            caption,
            head,
            body
          );

          wrap.append(t);
          host.append(wrap);

          const pg = el(
            'div',
            null,
            'pager'
          );

          const actions = el(
            'div',
            null,
            'flex gap-2'
          );

          const prev = button(
            '← Trước',
            () => {
              page--;
              draw();
            }
          );

          const next = button(
            'Sau →',
            () => {
              page++;
              draw();
            }
          );

          prev.disabled =
            page === 1;

          next.disabled =
            page === pages;

          actions.append(
            prev,
            next
          );

          pg.append(
            el(
              'span',
              number(found.length) +
                ' dòng • Trang ' +
                page +
                '/' +
                pages,
              'muted'
            ),
            actions
          );

          host.append(pg);
        }

        search.addEventListener(
          'input',
          () => {
            page = 1;
            draw();
          }
        );

        if (filter) {
          filter.addEventListener(
            'change',
            () => {
              page = 1;
              draw();
            }
          );
        }

        draw();
      }

      const col = (label, ...keys) => [
        label,
        r => pick(r, ...keys)
      ];

      const moneyCol = (label, ...keys) => [
        label,
        r => money(
          pick(r, ...keys)
        )
      ];

      const dateCol = (label, ...keys) => [
        label,
        r => date(
          pick(r, ...keys)
        )
      ];

      const statusCol = [
        'Trạng thái',
        r => badge(r.status)
      ];

      const playerCol = [
        'VĐV',
        r => playerName(r.player_id)
      ];

      function team(match, side) {
        if (!ready('match_players')) {
          return 'Chưa tải thành phần';
        }

        const entries = rows('match_players')
          .filter(
            p =>
              p.match_id === match.id &&
              upper(
                pick(
                  p,
                  'team',
                  'team_side'
                )
              ) === side
          );

        return entries.length
          ? entries
              .map(
                p =>
                  playerName(
                    p.player_id
                  )
              )
              .join(' / ')
          : 'Chưa có VĐV';
      }

      function matchCode(match) {
        if (
          !match ||
          match.match_number === null ||
          match.match_number === undefined ||
          match.match_number === ''
        ) {
          return match?.id
            ? String(match.id).slice(0, 8)
            : 'Không rõ trận';
        }

        const matchNumber =
          Number(match.match_number);

        const numberText =
          Number.isFinite(matchNumber)
            ? String(
                Math.trunc(matchNumber)
              ).padStart(4, '0')
            : String(
                match.match_number
              );

        const playedAt =
          new Date(match.played_at);

        if (
          !Number.isFinite(
            playedAt.getTime()
          )
        ) {
          return numberText;
        }

        const parts =
          new Intl.DateTimeFormat(
            'en-GB',
            {
              timeZone:
                'Asia/Ho_Chi_Minh',
              day: '2-digit',
              month: '2-digit',
              year: '2-digit'
            }
          ).formatToParts(
            playedAt
          );

        const values =
          Object.fromEntries(
            parts.map(
              part => [
                part.type,
                part.value
              ]
            )
          );

        const dateText =
          `${values.day}${values.month}${values.year}`;

        return `${dateText}-${numberText}`;
      }
      const matchCols = [
        [
          'Mã trận',
          r => matchCode(r)
        ],
        dateCol(
          'Thời gian',
          'played_at'
        ),
        [
          'Đội A',
          r => team(r, 'A')
        ],
        [
          'Tỷ số',
          r =>
            number(r.team_a_score) +
            ' – ' +
            number(r.team_b_score)
        ],
        [
          'Đội B',
          r => team(r, 'B')
        ],
        col(
          'Thể thức',
          'match_type'
        ),
        statusCol
      ];

      const recent = (data, key) =>
        [...data].sort(
          (a, b) =>
            (Date.parse(b[key]) || 0) -
            (Date.parse(a[key]) || 0)
        );

      function ranking() {
        const matchCounts =
          new Map();

        rows('rating_events')
          .filter(
            event =>
              event.algorithm_version ===
                currentRatingVersion() &&
              event.player_id &&
              event.match_id
          )
          .forEach(event => {
            const playerId =
              String(
                event.player_id
              );

            if (
              !matchCounts.has(
                playerId
              )
            ) {
              matchCounts.set(
                playerId,
                new Set()
              );
            }

            matchCounts
              .get(playerId)
              .add(
                String(
                  event.match_id
                )
              );
          });

        return rows('players')
          .map(player => ({
            ...player,
            rated_matches:
              matchCounts.has(
                String(
                  player.id
                )
              )
                ? matchCounts
                    .get(
                      String(
                        player.id
                      )
                    ).size
                : 0
          }))
          .filter(
            player =>
              upper(
                player.status
              ) ===
                'ACTIVE' &&
              upper(
                player.player_type
              ) ===
                'CLUB' &&
              num(
                player.current_rating
              ) !==
                null &&
              player.rated_matches >=
                officialMinMatches()
          )
          .sort(
            (a, b) =>
              Number(
                b.current_rating
              ) -
                Number(
                  a.current_rating
                ) ||
              playerName(a.id)
                .localeCompare(
                  playerName(b.id),
                  'vi'
                )
          )
          .map(
            (player, index, all) => ({
              ...player,
              rank:
                all.findIndex(
                  other =>
                    Number(
                      other.current_rating
                    ) ===
                    Number(
                      player.current_rating
                    )
                ) + 1
            })
          );
      }

      const rankCols = [
        col('Hạng', 'rank'),
        [
          'Vận động viên',
          r => playerName(r.id)
        ],
        [
          'Điểm hiện tại',
          r => number(r.current_rating)
        ],
        [
          'Trận Rated',
          r => number(r.rated_matches)
        ]
      ];

      function memberOverview(root) {
        sources(
          root,
          [
            'players',
            'matches',
            'match_players',
            'fund_contributions',
            'tournaments',
            'tournament_registrations'
          ]
        );

        const playerId =
          raw(
            state.profile?.player_id
          );

        const player =
          rows('players').find(
            item =>
              raw(item.id) ===
              playerId
          );

        const hero =
          el(
            'section',
            null,
            'hero overview-hero overview-member-hero'
          );

        hero.append(
          el(
            'p',
            'TRANG CÁ NHÂN',
            'text-xs tracking-widest mb-3'
          ),
          el(
            'h2',
            player
              ? raw(player.full_name)
              : raw(
                  state.profile?.full_name
                ) ||
                'Thành viên CLB',
            'text-2xl sm:text-3xl mb-2'
          ),
          el(
            'p',
            player
              ? `Rating hiện tại: ${raw(
                  player.current_rating
                )}`
              : 'Tài khoản chưa liên kết VĐV.',
            'mb-5 text-green-100'
          )
        );

        root.append(hero);

        if (!playerId || !player) {
          root.append(
            el(
              'p',
              'Tài khoản MEMBER chưa được liên kết với VĐV CLUB đang hoạt động. Vui lòng liên hệ ADMIN.',
              'notice error'
            )
          );

          return;
        }

        const approvedMatches =
          rows('matches').filter(
            match =>
              upper(match.status) ===
              'APPROVED'
          );

        const ownAssignments =
          rows('match_players').filter(
            item =>
              raw(item.player_id) ===
              playerId
          );

        const ownApproved =
          ownAssignments
            .map(mp => {
              const match =
                approvedMatches.find(
                  item =>
                    raw(item.id) ===
                    raw(mp.match_id)
                );

              if (!match) {
                return null;
              }

              const side =
                upper(mp.team);

              const scoreA =
                Number(
                  match.team_a_score
                );

              const scoreB =
                Number(
                  match.team_b_score
                );

              let result = 'D';

              if (
                Number.isFinite(scoreA) &&
                Number.isFinite(scoreB) &&
                scoreA !== scoreB
              ) {
                const winner =
                  scoreA > scoreB
                    ? 'A'
                    : 'B';

                result =
                  side === winner
                    ? 'W'
                    : 'L';
              }

              return {
                match,
                result
              };
            })
            .filter(Boolean);

        const wins =
          ownApproved.filter(
            item =>
              item.result === 'W'
          ).length;

        const losses =
          ownApproved.filter(
            item =>
              item.result === 'L'
          ).length;

        const draws =
          ownApproved.filter(
            item =>
              item.result === 'D'
          ).length;

        const ownContributions =
          rows('fund_contributions').filter(
            item =>
              raw(item.player_id) ===
              playerId &&
              upper(item.status) ===
              'CHUA_DONG'
          );

        const outstandingFund =
          ownContributions.reduce(
            (sum, item) =>
              sum +
              (
                Number(
                  item.amount_due
                ) || 0
              ),
            0
          );

        const ownRegistrations =
          rows(
            'tournament_registrations'
          ).filter(
            item =>
              raw(item.player_id) ===
                playerId ||
              raw(
                item.partner_player_id
              ) ===
                playerId
          );

        const activeRegistrations =
          ownRegistrations.filter(
            item =>
              upper(item.status) !==
              'HUY'
          );

        grid(
          root,
          [
            [
              'Rating',
              raw(
                player.current_rating
              ) || '—'
            ],
            [
              'Trận đã duyệt',
              number(
                ownApproved.length
              )
            ],
            [
              'Thắng / Thua / Hòa',
              `${wins} / ${losses} / ${draws}`
            ],
            [
              'Quỹ chưa đóng',
              money(
                outstandingFund
              )
            ],
            [
              'Đăng ký giải',
              number(
                activeRegistrations.length
              )
            ]
          ],
          'overview-kpi-grid overview-member-kpis'
        );

        const shortcuts =
          panel(
            'Thao tác nhanh',
            root
          );

        shortcuts.classList.add(
          'overview-quick-actions'
        );

        const actions =
          el(
            'div',
            null,
            'flex flex-wrap gap-2'
          );

        actions.append(
          button(
            'Tạo trận',
            () =>
              navigate('matches'),
            'btn primary'
          ),
          button(
            'Đăng ký giải',
            () =>
              navigate('tournaments'),
            'btn'
          ),
          button(
            'Xem BXH',
            () =>
              navigate('ranking'),
            'btn'
          )
        );

        shortcuts.append(
          actions
        );

        const recentOwn =
          ownApproved
            .slice()
            .sort(
              (a, b) =>
                new Date(
                  b.match.played_at || 0
                ).getTime() -
                new Date(
                  a.match.played_at || 0
                ).getTime()
            )
            .slice(
              0,
              5
            );

        const recentPanel =
          panel(
            '5 trận gần nhất của tôi',
            root
          );

        if (!recentOwn.length) {
          recentPanel.append(
            el(
              'div',
              'Chưa có trận APPROVED.',
              'text-sm opacity-70'
            )
          );

          return;
        }

        const list =
          el(
            'div',
            null,
            'space-y-2'
          );

        recentOwn.forEach(
          item => {
            const played =
              item.match.played_at
                ? new Date(
                    item.match.played_at
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

            list.append(
              el(
                'div',
                `${item.result} • ${matchCode(
                  item.match
                )} • ${raw(
                  item.match.team_a_score
                )}-${raw(
                  item.match.team_b_score
                )} • ${playedText}`,
                'rounded-xl border p-3 text-sm'
              )
            );
          }
        );

        recentPanel.append(
          list
        );
      }
      function overview() {
        const root = $('content');

        if (!isAdmin()) {
          memberOverview(root);
          return;
        }

        const hero = el(
          'section',
          null,
          'hero overview-hero overview-admin-hero'
        );

        hero.append(
          el(
            'p',
            'MỖI TRẬN ĐẤU, MỘT BƯỚC TIẾN',
            'text-xs tracking-widest mb-3'
          ),
          el(
            'h2',
            'Sẵn sàng cho buổi ra sân tiếp theo?',
            'text-2xl sm:text-3xl mb-3'
          ),
          el(
            'p',
            'Theo dõi nhịp hoạt động của câu lạc bộ tại một nơi.',
            'mb-5 text-green-100'
          ),
          button(
            'Xem các trận đấu →',
            () =>
              navigate('matches'),
            'btn'
          )
        );

        root.append(hero);

        if (ready('players')) {
          const activePlayers =
            rows('players').filter(
              p =>
                upper(
                  p.status
                ) !==
                'INACTIVE' &&
                p.date_of_birth
            );

          const today =
            new Date();

          const currentMonth =
            today.getMonth();

          const currentDay =
            today.getDate();

          const currentQuarter =
            Math.floor(
              currentMonth / 3
            );

          const birthdayRows =
            activePlayers
              .map(player => {
                const parts =
                  String(
                    player.date_of_birth
                  ).slice(
                    0,
                    10
                  ).split('-');

                const month =
                  Number(
                    parts[1]
                  ) - 1;

                const day =
                  Number(
                    parts[2]
                  );

                return {
                  player,
                  month,
                  day
                };
              })
              .filter(
                item =>
                  Number.isInteger(
                    item.month
                  ) &&
                  Number.isInteger(
                    item.day
                  )
              );

          const todayBirthdays =
            birthdayRows.filter(
              item =>
                item.month ===
                  currentMonth &&
                item.day ===
                  currentDay
            );

          const monthBirthdays =
            birthdayRows
              .filter(
                item =>
                  item.month ===
                  currentMonth
              )
              .sort(
                (a, b) =>
                  a.day -
                  b.day
              );

          const quarterBirthdays =
            birthdayRows.filter(
              item =>
                Math.floor(
                  item.month / 3
                ) ===
                currentQuarter
            );

          const birthdayPanel =
            panel(
              '🎂 Sinh nhật VĐV',
              root
            );

          birthdayPanel.classList.add(
            'overview-birthday-panel'
          );

          if (
            todayBirthdays.length
          ) {
            const todayBox =
              el(
                'div',
                null,
                'mb-4 rounded-xl border p-4'
              );

            todayBox.append(
              el(
                'div',
                '🎉 Chúc mừng sinh nhật!',
                'font-semibold mb-2'
              )
            );

            todayBirthdays.forEach(
              item => {
                todayBox.append(
                  el(
                    'div',
                    `Chúc ${raw(
                      item.player.full_name
                    )} một ngày sinh nhật thật vui và nhiều trận thắng!`
                  )
                );
              }
            );

            birthdayPanel.append(
              todayBox
            );
          }

          const summary =
            el(
              'div',
              null,
              'grid gap-3 sm:grid-cols-2 mb-4'
            );

          summary.append(
            el(
              'div',
              `Tháng này: ${number(
                monthBirthdays.length
              )} VĐV`,
              'rounded-xl border p-3'
            ),
            el(
              'div',
              `Quý này: ${number(
                quarterBirthdays.length
              )} VĐV`,
              'rounded-xl border p-3'
            )
          );

          birthdayPanel.append(
            summary
          );

          if (
            monthBirthdays.length
          ) {
            const list =
              el(
                'div',
                null,
                'space-y-2'
              );

            monthBirthdays.forEach(
              item => {
                list.append(
                  el(
                    'div',
                    `${String(
                      item.day
                    ).padStart(
                      2,
                      '0'
                    )}/${String(
                      item.month + 1
                    ).padStart(
                      2,
                      '0'
                    )} • ${raw(
                      item.player.full_name
                    )}`,
                    'text-sm'
                  )
                );
              }
            );

            birthdayPanel.append(
              list
            );
          }
          else {
            birthdayPanel.append(
              el(
                'div',
                'Không có sinh nhật VĐV trong tháng này.',
                'text-sm opacity-70'
              )
            );
          }
        }

        if (ready('matches')) {
          const statsNow =
            new Date();

          const statsYear =
            statsNow.getFullYear();

          const statsMonth =
            statsNow.getMonth();

          const statsQuarter =
            Math.floor(
              statsMonth / 3
            );

          const approvedMatches =
            rows('matches')
              .filter(
                match =>
                  upper(
                    match.status
                  ) ===
                    'APPROVED' &&
                  match.played_at
              )
              .map(match => {
                const playedAt =
                  new Date(
                    match.played_at
                  );

                return {
                  match,
                  playedAt
                };
              })
              .filter(
                item =>
                  Number.isFinite(
                    item.playedAt
                      .getTime()
                  )
              );

          const monthMatches =
            approvedMatches.filter(
              item =>
                item.playedAt
                  .getFullYear() ===
                  statsYear &&
                item.playedAt
                  .getMonth() ===
                  statsMonth
            );

          const quarterMatches =
            approvedMatches.filter(
              item =>
                item.playedAt
                  .getFullYear() ===
                  statsYear &&
                Math.floor(
                  item.playedAt
                    .getMonth() / 3
                ) ===
                  statsQuarter
            );

          const yearMatches =
            approvedMatches.filter(
              item =>
                item.playedAt
                  .getFullYear() ===
                  statsYear
            );

          const recentFormPanel =
            panel(
              '🔥 PHONG ĐỘ 5 TRẬN GẦN NHẤT',
              root
            );

          recentFormPanel.append(
            el(
              'div',
              'W = Thắng • L = Thua • D = Hòa • Kết quả mới nhất nằm bên trái.',
              'text-sm opacity-70 mb-4'
            )
          );

          if (
            !ready(
              'players',
              'matches',
              'match_players'
            )
          ) {
            recentFormPanel.append(
              el(
                'div',
                'Cần tải đủ VĐV, trận đấu và thành phần trận để tính phong độ.',
                'text-sm opacity-70'
              )
            );
          } else {
            const approvedFormMatches =
              new Map(
                rows('matches')
                  .filter(
                    match =>
                      upper(
                        match.status
                      ) ===
                        'APPROVED' &&
                      match.played_at
                  )
                  .map(
                    match => [
                      match.id,
                      match
                    ]
                  )
              );

            const formByPlayer =
              new Map();

            const seenFormAppearances =
              new Set();

            rows('match_players')
              .forEach(mp => {
                const match =
                  approvedFormMatches.get(
                    mp.match_id
                  );

                if (
                  !match ||
                  !mp.player_id
                ) {
                  return;
                }

                const appearanceKey =
                  `${mp.match_id}:${mp.player_id}`;

                if (
                  seenFormAppearances.has(
                    appearanceKey
                  )
                ) {
                  return;
                }

                const side =
                  upper(
                    pick(
                      mp,
                      'team',
                      'team_side'
                    )
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
                  !Number.isFinite(scoreA) ||
                  !Number.isFinite(scoreB)
                ) {
                  return;
                }

                const playedAt =
                  new Date(
                    match.played_at
                  );

                if (
                  !Number.isFinite(
                    playedAt.getTime()
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

                seenFormAppearances.add(
                  appearanceKey
                );

                if (
                  !formByPlayer.has(
                    mp.player_id
                  )
                ) {
                  formByPlayer.set(
                    mp.player_id,
                    []
                  );
                }

                formByPlayer
                  .get(
                    mp.player_id
                  )
                  .push({
                    match_id:
                      match.id,
                    played_at:
                      playedAt,
                    match_number:
                      match.match_number,
                    result
                  });
              });

            const recentFormRows =
              rows('players')
                .filter(
                  player =>
                    upper(
                      player.status
                    ) ===
                    'ACTIVE'
                )
                .map(player => {
                  const form =
                    [
                      ...(
                        formByPlayer.get(
                          player.id
                        ) || []
                      )
                    ]
                      .sort(
                        (a, b) =>
                          b.played_at.getTime() -
                            a.played_at.getTime() ||
                          (
                            Number(
                              b.match_number
                            ) || 0
                          ) -
                            (
                              Number(
                                a.match_number
                              ) || 0
                            ) ||
                          String(
                            b.match_id
                          ).localeCompare(
                            String(
                              a.match_id
                            )
                          )
                      )
                      .slice(
                        0,
                        5
                      );

                  return {
                    player,
                    form
                  };
                })
                .sort(
                  (a, b) =>
                    playerName(
                      a.player.id
                    ).localeCompare(
                      playerName(
                        b.player.id
                      ),
                      'vi'
                    )
                );

            if (!recentFormRows.length) {
              recentFormPanel.append(
                el(
                  'div',
                  'Chưa có VĐV đang hoạt động.',
                  'text-sm opacity-70'
                )
              );
            } else {
              const recentFormGrid =
                el(
                  'div',
                  null,
                  'grid gap-3 md:grid-cols-2'
                );

              recentFormRows.forEach(
                item => {
                  const card =
                    el(
                      'div',
                      null,
                      'rounded-xl border p-4'
                    );

                  card.append(
                    el(
                      'div',
                      playerName(
                        item.player.id
                      ),
                      'font-semibold mb-3'
                    )
                  );

                  if (!item.form.length) {
                    card.append(
                      el(
                        'div',
                        'Chưa có trận',
                        'text-sm opacity-60'
                      )
                    );

                    recentFormGrid.append(
                      card
                    );

                    return;
                  }

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

                  let openedFormMatchId =
                    null;

                  function friendlyMatchType(
                    matchType
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
                        matchType
                      );

                    return (
                      labels[key] ||
                      raw(
                        matchType
                      ) ||
                      'Không xác định'
                    );
                  }

                  function showFormDetail(
                    formItem
                  ) {
                    if (
                      openedFormMatchId ===
                      formItem.match_id
                    ) {
                      formDetail.replaceChildren();

                      openedFormMatchId =
                        null;

                      return;
                    }

                    formDetail.replaceChildren();

                    const match =
                      approvedFormMatches.get(
                        formItem.match_id
                      );

                    if (!match) {
                      openedFormMatchId =
                        null;

                      formDetail.append(
                        el(
                          'div',
                          'Không tìm thấy dữ liệu trận.',
                          'text-sm opacity-70'
                        )
                      );

                      return;
                    }

                    openedFormMatchId =
                      formItem.match_id;

                    const playerId =
                      item.player.id;

                    const memberships =
                      rows('match_players')
                        .filter(
                          mp =>
                            mp.match_id ===
                              match.id
                        );

                    const currentMembership =
                      memberships.find(
                        mp =>
                          mp.player_id ===
                          playerId
                      );

                    const currentSide =
                      upper(
                        pick(
                          currentMembership || {},
                          'team',
                          'team_side'
                        )
                      );

                    const partnerNames =
                      memberships
                        .filter(mp => {
                          const side =
                            upper(
                              pick(
                                mp,
                                'team',
                                'team_side'
                              )
                            );

                          return (
                            mp.player_id !==
                              playerId &&
                            side ===
                              currentSide
                          );
                        })
                        .map(
                          mp =>
                            playerName(
                              mp.player_id
                            )
                        );

                    const opponentNames =
                      memberships
                        .filter(mp => {
                          const side =
                            upper(
                              pick(
                                mp,
                                'team',
                                'team_side'
                              )
                            );

                          return (
                            mp.player_id !==
                              playerId &&
                            side &&
                            currentSide &&
                            side !==
                              currentSide
                          );
                        })
                        .map(
                          mp =>
                            playerName(
                              mp.player_id
                            )
                        );

                    const playedAt =
                      new Date(
                        match.played_at
                      );

                    const playedText =
                      Number.isFinite(
                        playedAt.getTime()
                      )
                        ? new Intl.DateTimeFormat(
                            'vi-VN',
                            {
                              timeZone:
                                'Asia/Ho_Chi_Minh',
                              day:
                                '2-digit',
                              month:
                                '2-digit',
                              year:
                                'numeric',
                              hour:
                                '2-digit',
                              minute:
                                '2-digit'
                            }
                          ).format(
                            playedAt
                          )
                        : 'Không rõ thời gian';

                    const detailBox =
                      el(
                        'div',
                        null,
                        'rounded-xl border p-3 text-sm'
                      );

                    const closeButton =
                      button(
                        'Thu gọn',
                        () => {
                          formDetail.replaceChildren();

                          openedFormMatchId =
                            null;
                        },
                        'border rounded-lg px-3 py-1 text-xs mt-3'
                      );

                    closeButton.type =
                      'button';

                    detailBox.append(
                      el(
                        'div',
                        `${matchCode(
                          match
                        )} • ${playedText}`,
                        'font-semibold'
                      ),
                      el(
                        'div',
                        `Kết quả: ${formItem.result}`,
                        'mt-2'
                      ),
                      el(
                        'div',
                        `Tỷ số: ${number(
                          match.team_a_score
                        )} – ${number(
                          match.team_b_score
                        )}`,
                        'mt-1'
                      ),
                      el(
                        'div',
                        `Đồng đội: ${
                          partnerNames.length
                            ? partnerNames.join(
                                ', '
                              )
                            : 'Không rõ'
                        }`,
                        'mt-1'
                      ),
                      el(
                        'div',
                        `Đối thủ: ${
                          opponentNames.length
                            ? opponentNames.join(
                                ', '
                              )
                            : 'Không rõ'
                        }`,
                        'mt-1'
                      ),
                      el(
                        'div',
                        `Loại trận: ${friendlyMatchType(
                          match.match_type
                        )}`,
                        'mt-1'
                      ),
                      closeButton
                    );

                    formDetail.append(
                      detailBox
                    );
                  }

                  item.form.forEach(
                    formItem => {
                      const resultButton =
                        button(
                          formItem.result,
                          () =>
                            showFormDetail(
                              formItem
                            ),
                          'border rounded-lg px-3 py-1 font-semibold'
                        );

                      resultButton.type =
                        'button';

                      resultButton.title =
                        'Bấm để xem/thu gọn chi tiết trận';

                      formLine.append(
                        resultButton
                      );
                    }
                  );

                  card.append(
                    formLine,
                    el(
                      'div',
                      `${number(
                        item.form.length
                      )}/5 trận gần nhất`,
                      'text-xs opacity-60 mt-2'
                    ),
                    formDetail
                  );
                  recentFormGrid.append(
                    card
                  );
                });

              recentFormPanel.append(
                recentFormGrid
              );
            }
          }
        }
        sources(
          root,
          [
            'players',
            'matches',
            'fund_payments',
            'tournaments'
          ]
        );

        grid(
          root,
          [
            [
              'Vận động viên',
              ready('players')
                ? number(
                    rows('players').filter(
                      p =>
                        p.status !==
                        'INACTIVE'
                    ).length
                  )
                : '—',
              'Không gồm VĐV đã ngừng hoạt động'
            ],
            [
              'Trận đã duyệt',
              ready('matches')
                ? number(
                    rows('matches').filter(
                      m =>
                        upper(
                          m.status
                        ) ===
                        'APPROVED'
                    ).length
                  )
                : '—',
              'Theo dữ liệu tài khoản được xem'
            ],
            [
              'Chờ duyệt',
              ready('matches')
                ? number(
                    rows('matches').filter(
                      m =>
                        upper(
                          m.status
                        ) ===
                        'PENDING'
                    ).length
                  )
                : '—',
              'Có thể tiếp tục hoàn thiện ở module Trận đấu'
            ],
            [
              'Giải đấu',
              ready('tournaments')
                ? number(
                    rows('tournaments').length
                  )
                : '—',
              'Tất cả giải được hiển thị'
            ]
          ],
          'overview-kpi-grid overview-admin-kpis'
        );

        sources(
          root,
          ['match_players']
        );

        table(
          root,
          'Trận đấu gần đây',
          recent(
            rows('matches'),
            'played_at'
          ).slice(0, 5),
          matchCols,
          {
            unavailable:
              !!state.errors.matches
          }
        );

        table(
          root,
          'Dẫn đầu bảng xếp hạng',
          ranking().slice(0, 5),
          rankCols,
          {
            unavailable:
              !!state.errors.players
          }
        );
      }

      function playersPage() {
    if (
      !window.PickPlayers ||
      typeof window.PickPlayers.create !== 'function'
    ) {
      throw new Error(
        'Không tải được module VĐV (players.js).'
      );
    }

    const playerModule =
      window.PickPlayers.create({
        $,
        state,
        client,
        isAdmin,
        button,
        el,
        rows,
        raw,
        upper,
      num,
      pick,
      grid,
      number,
      dateCol,
      col,
      money,
      moneyCol,
      ready,
      recent,
      settings,
      sources,
        table,
        panel,
        notice,
        load,
        render,
        explain,
        playerName,
      matchCode,
      load,
      render,
        CURRENT_RATING_VERSION:
          currentRatingVersion()
      });

    playerModule.playersPage();
  }
  function matchesPage() {
        if (
          !window.PickMatches ||
          typeof window.PickMatches.create !== 'function'
        ) {
          throw new Error(
            'Không tải được module Trận đấu (matches.js).'
          );
        }

        const matchModule =
          window.PickMatches.create({
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
          });

        matchModule.matchesPage();
      }

      function fund() {
  if (
    !window.PickFund ||
    typeof window.PickFund.create !== 'function'
  ) {
    throw new Error(
      'Không tải được module Quỹ (fund.js).'
    );
  }

  const fundModule =
    window.PickFund.create({
      $,
      state,
      client,
      isAdmin,
      button,
      el,
      rows,
      raw,
      upper,
      num,
      pick,
      grid,
      number,
      dateCol,
      col,
      money,
      moneyCol,
      ready,
      recent,
      settings,
      sources,
      table,
      panel,
      notice,
      playerName,
      matchCode,
      load,
      render
    });

  fundModule.fund();
}
const fieldLabels = {
        id: 'Mã',
        name: 'Tên',
        key: 'Khóa',
        value: 'Giá trị',
        setting_key: 'Thiết lập',
        setting_value: 'Giá trị',
        description: 'Mô tả',
        algorithm_version: 'Phiên bản',
        match_type: 'Thể thức',
        weight: 'Trọng số',
        is_active: 'Đang áp dụng',
        amount: 'Số tiền',
        amount_loss: 'Mức thua',
        amount_draw: 'Mức hòa',
        amount_win: 'Mức thắng',
        effective_from: 'Hiệu lực từ',
        effective_to: 'Hiệu lực đến',
        created_at: 'Ngày tạo',
        updated_at: 'Cập nhật',
        rule_type: 'Loại quy định',
        score_mode: 'Cách tính tỷ số'
      };

      function settings(root, t) {
        const data = rows(t);

        const keys = [
          ...new Set(
            data.flatMap(
              r =>
                Object.keys(r)
            )
          )
        ];

        table(
          root,
          labels[t],
          data,
          keys.map(k => [
            fieldLabels[k] || k,
            r =>
              typeof r[k] ===
              'boolean'
                ? r[k]
                  ? 'Có'
                  : 'Không'
                : raw(r[k])
          ]),
          {
            unavailable:
              !!state.errors[t]
          }
        );
      }
      // CONTRIBUTION FUN UI V2
      function contributions() {
        const root = $('content');

        sources(
          root,
          [
            'players',
            'matches',
            'match_players',
            'fund_contributions'
          ]
        );

        root.append(
          el(
            'p',
            'Góc vui của CLB: vinh danh người âm thầm nuôi quỹ, người chăm ra sân và nhắc nhẹ những thành viên hơi lâu chưa thấy mặt. 😄',
            'notice'
          )
        );

        if (
          !ready(
            'players',
            'matches',
            'match_players',
            'fund_contributions'
          )
        ) {
          root.append(
            el(
              'p',
              'Cần tải đủ VĐV, trận đấu, thành phần trận và nghĩa vụ quỹ để tổng hợp Cống hiến.',
              'muted'
            )
          );

          return;
        }

        const clubPlayers =
          rows('players')
            .filter(
              player =>
                upper(
                  player.player_type
                ) === 'CLUB' &&
                upper(
                  player.status
                ) === 'ACTIVE'
            );

        const clubPlayerIds =
          new Set(
            clubPlayers.map(
              player =>
                player.id
            )
          );

        const approvedMatches =
          new Map(
            rows('matches')
              .filter(
                match =>
                  upper(
                    match.status
                  ) ===
                  'APPROVED'
              )
              .map(
                match => [
                  match.id,
                  match
                ]
              )
          );

        const participation =
          new Map();

        for (
          const matchPlayer of rows(
            'match_players'
          )
        ) {
          if (
            !clubPlayerIds.has(
              matchPlayer.player_id
            ) ||
            !approvedMatches.has(
              matchPlayer.match_id
            )
          ) {
            continue;
          }

          if (
            !participation.has(
              matchPlayer.player_id
            )
          ) {
            participation.set(
              matchPlayer.player_id,
              new Set()
            );
          }

          participation
            .get(
              matchPlayer.player_id
            )
            .add(
              matchPlayer.match_id
            );
        }

        const contributionStats =
          new Map();

        for (
          const contribution of rows(
            'fund_contributions'
          )
        ) {
          const playerId =
            contribution.player_id;

          const reason =
            upper(
              contribution.reason
            );

          const status =
            upper(
              contribution.status
            );

          const amount =
            Number(
              contribution.amount_due
            ) || 0;

          if (
            !clubPlayerIds.has(
              playerId
            ) ||
            !approvedMatches.has(
              contribution.match_id
            ) ||
            ![
              'THUA',
              'HOA'
            ].includes(
              reason
            ) ||
            [
              'MIEN',
              'DIEU_CHINH'
            ].includes(
              status
            ) ||
            amount <= 0
          ) {
            continue;
          }

          if (
            !contributionStats.has(
              playerId
            )
          ) {
            contributionStats.set(
              playerId,
              {
                amount: 0,
                losses: 0,
                draws: 0
              }
            );
          }

          const stat =
            contributionStats.get(
              playerId
            );

          stat.amount += amount;

          if (
            reason === 'THUA'
          ) {
            stat.losses += 1;
          }

          if (
            reason === 'HOA'
          ) {
            stat.draws += 1;
          }
        }

        const totalApprovedMatches =
          approvedMatches.size;

        const playerStats =
          clubPlayers.map(
            player => {
              const matchIds =
                participation.get(
                  player.id
                ) ||
                new Set();

              const contribution =
                contributionStats.get(
                  player.id
                ) || {
                  amount: 0,
                  losses: 0,
                  draws: 0
                };

              const matchCount =
                matchIds.size;

              return {
                player,
                playerId:
                  player.id,
                name:
                  playerName(
                    player.id
                  ),
                matchCount,
                participationRate:
                  totalApprovedMatches
                    ? (
                        matchCount /
                        totalApprovedMatches
                      ) * 100
                    : 0,
                contributionAmount:
                  contribution.amount,
                losses:
                  contribution.losses,
                draws:
                  contribution.draws
              };
            }
          );

        const contributionRanking =
          [...playerStats]
            .filter(
              row =>
                row.contributionAmount >
                0
            )
            .sort(
              (a, b) =>
                b.contributionAmount -
                  a.contributionAmount ||
                b.losses -
                  a.losses ||
                a.name.localeCompare(
                  b.name,
                  'vi'
                )
            );

        const energeticRanking =
          [...playerStats]
            .filter(
              row =>
                row.matchCount > 0
            )
            .sort(
              (a, b) =>
                b.matchCount -
                  a.matchCount ||
                a.name.localeCompare(
                  b.name,
                  'vi'
                )
            );

        const sleepyRanking =
          [...playerStats]
            .filter(
              row =>
                row.matchCount > 0
            )
            .sort(
              (a, b) =>
                a.matchCount -
                  b.matchCount ||
                a.name.localeCompare(
                  b.name,
                  'vi'
                )
            );

        const sharedRanks = (
          data,
          value
        ) => {
          let previous = null;
          let rank = 0;

          return data.map(
            (
              row,
              index
            ) => {
              const current =
                value(row);

              if (
                index === 0 ||
                current !== previous
              ) {
                rank =
                  index + 1;

                previous =
                  current;
              }

              return {
                ...row,
                rank
              };
            }
          );
        };

        const contributionRows =
          sharedRanks(
            contributionRanking,
            row =>
              row.contributionAmount
          );

        const energeticRows =
          sharedRanks(
            energeticRanking,
            row =>
              row.matchCount
          );

        const sleepyRows =
          sharedRanks(
            sleepyRanking,
            row =>
              row.matchCount
          );

        const medal = rank => {
          if (rank === 1) {
            return '🥇';
          }

          if (rank === 2) {
            return '🥈';
          }

          if (rank === 3) {
            return '🥉';
          }

          return '#' + rank;
        };

        const percent = value =>
          (
            Math.round(
              value * 10
            ) / 10
          ).toLocaleString(
            'vi-VN'
          ) + '%';

        const topLine = (
          row,
          valueText,
          detailText
        ) => {
          const line =
            el(
              'div',
              null,
              'contribution-top-line'
            );

          line.append(
            el(
              'span',
              medal(
                row.rank
              ),
              'contribution-medal'
            ),
            el(
              'span',
              row.name,
              'contribution-top-name'
            ),
            el(
              'span',
              valueText,
              'contribution-top-value'
            )
          );

          if (detailText) {
            line.append(
              el(
                'span',
                detailText,
                'contribution-top-detail'
              )
            );
          }

          return line;
        };

        const emptyTop = text =>
          el(
            'p',
            text,
            'muted contribution-empty'
          );

        let openedSection = null;

        const sections =
          new Map();

        const closeSection = key => {
          const section =
            sections.get(key);

          if (!section) {
            return;
          }

          section.body.hidden =
            true;

          section.toggle.textContent =
            '▶ ' +
            section.closedLabel;

          section.card.classList.remove(
            'contribution-card-open'
          );
        };

        const createCard = ({
          key,
          variant,
          icon,
          title,
          joke,
          topRows,
          renderTop,
          closedLabel,
          openLabel,
          renderDetail
        }) => {
          const card =
            el(
              'section',
              null,
              'contribution-card contribution-card-' +
                variant
            );

          const head =
            el(
              'div',
              null,
              'contribution-card-head'
            );

          const titleWrap =
            el(
              'div',
              null,
              'contribution-card-title-wrap'
            );

          titleWrap.append(
            el(
              'div',
              icon,
              'contribution-card-icon'
            ),
            el(
              'h3',
              title,
              'contribution-card-title'
            )
          );

          head.append(
            titleWrap
          );

          card.append(
            head,
            el(
              'p',
              joke,
              'contribution-card-joke'
            )
          );

          const podium =
            el(
              'div',
              null,
              'contribution-podium'
            );

          if (
            topRows.length
          ) {
            topRows
              .slice(
                0,
                3
              )
              .forEach(
                row =>
                  podium.append(
                    renderTop(
                      row
                    )
                  )
              );
          } else {
            podium.append(
              emptyTop(
                'Chưa đủ dữ liệu để trao danh hiệu. Ban tổ chức đang ngồi chờ drama. 😄'
              )
            );
          }

          card.append(
            podium
          );

          const body =
            el(
              'div',
              null,
              'contribution-detail'
            );

          body.hidden =
            true;

          const toggle =
            button(
              '▶ ' +
                closedLabel,
              () => {
                const willOpen =
                  body.hidden;

                if (
                  openedSection &&
                  openedSection !==
                    key
                ) {
                  closeSection(
                    openedSection
                  );
                }

                if (
                  willOpen
                ) {
                  body.hidden =
                    false;

                  toggle.textContent =
                    '▼ ' +
                    openLabel;

                  card.classList.add(
                    'contribution-card-open'
                  );

                  openedSection =
                    key;
                } else {
                  closeSection(
                    key
                  );

                  openedSection =
                    null;
                }
              },
              'contribution-detail-toggle'
            );

          renderDetail(
            body
          );

          card.append(
            toggle,
            body
          );

          sections.set(
            key,
            {
              body,
              toggle,
              card,
              closedLabel
            }
          );

          return card;
        };

        const createDetailTable = (
          data,
          columns
        ) => {
          const wrap =
            el(
              'div',
              null,
              'table-wrap'
            );

          const tableEl =
            document.createElement(
              'table'
            );

          const thead =
            document.createElement(
              'thead'
            );

          const headerRow =
            document.createElement(
              'tr'
            );

          columns.forEach(
            column => {
              const th =
                document.createElement(
                  'th'
                );

              th.textContent =
                column[0];

              headerRow.append(
                th
              );
            }
          );

          thead.append(
            headerRow
          );

          const tbody =
            document.createElement(
              'tbody'
            );

          data.forEach(
            row => {
              const tr =
                document.createElement(
                  'tr'
                );

              columns.forEach(
                column => {
                  const td =
                    document.createElement(
                      'td'
                    );

                  td.textContent =
                    String(
                      column[1](
                        row
                      ) ?? ''
                    );

                  tr.append(
                    td
                  );
                }
              );

              tbody.append(
                tr
              );
            }
          );

          tableEl.append(
            thead,
            tbody
          );

          wrap.append(
            tableEl
          );

          return wrap;
        };

        const cards =
          el(
            'div',
            null,
            'contribution-fun-grid'
          );

        cards.append(
          createCard({
            key:
              'contribution',
            variant:
              'gold',
            icon:
              '❤️',
            title:
              'Bảng vàng Cống hiến',
            joke:
              '“Thua không đáng sợ. Quan trọng là sau trận, quỹ CLB lại khỏe hơn một chút.” 😄',
            topRows:
              contributionRows,
            renderTop:
              row =>
                topLine(
                  row,
                  money(
                    row.contributionAmount
                  ),
                  row.losses +
                    ' thua · ' +
                    row.draws +
                    ' hòa'
                ),
            closedLabel:
              'Xem bảng vàng đầy đủ',
            openLabel:
              'Thu gọn bảng vàng',
            renderDetail:
              body => {
                if (
                  !contributionRows.length
                ) {
                  body.append(
                    emptyTop(
                      'Chưa phát sinh nghĩa vụ quỹ hợp lệ từ các trận đã duyệt.'
                    )
                  );

                  return;
                }

                body.append(
                  createDetailTable(
                    contributionRows,
                    [
                      [
                        'Hạng',
                        row =>
                          medal(
                            row.rank
                          )
                      ],
                      [
                        'VĐV',
                        row =>
                          row.name
                      ],
                      [
                        'Cống hiến',
                        row =>
                          money(
                            row.contributionAmount
                          )
                      ],
                      [
                        'Thua',
                        row =>
                          number(
                            row.losses
                          )
                      ],
                      [
                        'Hòa',
                        row =>
                          number(
                            row.draws
                          )
                      ]
                    ]
                  ),
                  el(
                    'p',
                    'Chỉ tính nghĩa vụ THUA/HÒA từ trận APPROVED. Đã đóng hay chưa đóng không làm thay đổi danh hiệu.',
                    'muted contribution-footnote'
                  )
                );
              }
          }),

          createCard({
            key:
              'energetic',
            variant:
              'fire',
            icon:
              '🔥',
            title:
              'Năng nổ nhất',
            joke:
              '“Có mặt đều đến mức sân mà biết nói chắc cũng gọi tên.” ⚡',
            topRows:
              energeticRows,
            renderTop:
              row =>
                topLine(
                  row,
                  number(
                    row.matchCount
                  ) +
                    ' trận',
                  percent(
                    row.participationRate
                  ) +
                    ' số trận CLB'
                ),
            closedLabel:
              'Xem hội mê ra sân',
            openLabel:
              'Thu gọn hội mê ra sân',
            renderDetail:
              body => {
                if (
                  !energeticRows.length
                ) {
                  body.append(
                    emptyTop(
                      'Chưa có VĐV CLUB nào tham gia trận APPROVED.'
                    )
                  );

                  return;
                }

                body.append(
                  createDetailTable(
                    energeticRows,
                    [
                      [
                        'Hạng',
                        row =>
                          medal(
                            row.rank
                          )
                      ],
                      [
                        'VĐV',
                        row =>
                          row.name
                      ],
                      [
                        'Trận',
                        row =>
                          number(
                            row.matchCount
                          )
                      ],
                      [
                        'Tỷ lệ tham gia',
                        row =>
                          percent(
                            row.participationRate
                          )
                      ]
                    ]
                  )
                );
              }
          }),

          createCard({
            key:
              'sleepy',
            variant:
              'sleepy',
            icon:
              '😴',
            title:
              'Khiển trách nhẹ',
            joke:
              '“CLB đang xác minh xem bạn còn nhớ đường ra sân không…” 👀',
            topRows:
              sleepyRows,
            renderTop:
              row =>
                topLine(
                  row,
                  number(
                    row.matchCount
                  ) +
                    ' trận',
                  'Khiển trách rất nhẹ thôi 😇'
                ),
            closedLabel:
              'Xem sổ điểm danh đáng ngờ',
            openLabel:
              'Thu gọn sổ điểm danh',
            renderDetail:
              body => {
                if (
                  !sleepyRows.length
                ) {
                  body.append(
                    emptyTop(
                      'Chưa có ai đủ dữ liệu để bị nhắc. Mọi người đang rất ngoan. 😇'
                    )
                  );

                  return;
                }

                body.append(
                  createDetailTable(
                    sleepyRows,
                    [
                      [
                        'Mức độ đáng ngờ',
                        row =>
                          row.rank === 1
                            ? '👀 Cần quan tâm'
                            : '#' +
                              row.rank
                      ],
                      [
                        'VĐV',
                        row =>
                          row.name
                      ],
                      [
                        'Đã ra sân',
                        row =>
                          number(
                            row.matchCount
                          ) +
                          ' trận'
                      ],
                      [
                        'Tỷ lệ',
                        row =>
                          percent(
                            row.participationRate
                          )
                      ]
                    ]
                  ),
                  el(
                    'p',
                    'Chỉ xét ACTIVE + CLUB đã từng ra sân ít nhất 1 trận. Thành viên 0 trận chưa bị “khiển trách” để tránh oan cho người mới.',
                    'muted contribution-footnote'
                  )
                );
              }
          })
        );

        root.append(
          cards
        );
      }


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
        const submit = el('button', 'Đổi mật khẩu', 'btn');
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


      function admin() {
        const root = $('content');

        const p = panel(
          'Tài khoản của bạn'
        );

        p.append(
          el(
            'p',
            raw(
              state.profile.full_name
            ),
            'font-semibold'
          ),
          el(
            'p',
            state.session.user.email ||
              '',
            'muted'
          ),
          badge(
            state.profile.role
          ),
          el(
            'p',
            state.profile.is_active
              ? 'Tài khoản đang hoạt động'
              : 'Tài khoản ngừng hoạt động',
            'muted mt-3'
          )
        );

        accountPassword(root);

        if (!isAdmin()) {
          // IAM04-B MEMBER SELF PROFILE V1
          if (upper(state.profile?.role) !== 'MEMBER') {
            return;
          }

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
          const submit = el('button', 'Lưu thông tin', 'btn');
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

        root.append(
          el(
            'p',
            'ADMIN hiện đã có thể tạo trận PENDING qua RPC. Các thao tác chọn 4 VĐV, sửa trận, duyệt và hủy sẽ được mở theo từng bước kiểm thử.',
            'notice'
          )
        );




        adminCreateMember(root);

        adminAccountVerification(root);

        adminSystemConfig(root);

        adminBirthdayReport(root);

        sources(
          root,
          [
            'rating_settings',
            'rating_match_weights',
            'fund_rules'
          ]
        );

        settings(
          root,
          'rating_settings'
        );

        settings(
          root,
          'rating_match_weights'
        );

        settings(
          root,
          'fund_rules'
        );
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
          'Loại trận',
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
            'Lưu trọng số',
            'btn'
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
            'Thay đổi trọng số sẽ áp dụng cho engine Rating khi rebuild các trận tính điểm.',
            'muted'
          ),
          grid,
          actions,
          message
        );

        section.append(form);

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
                'Lưu trọng số';

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
          'Loại trận',
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
            'Tạo phiên bản quy định quỹ',
            'btn'
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
          fundGrid,
          fundActions,
          fundMessage
        );

        section.append(
          fundForm
        );

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
                'Tạo phiên bản quy định quỹ';

              if (
                saved &&
                state.session
                  ?.user.id ===
                sessionUserId
              ) {
                render();

                notice(
                  $('global-message'),
                  'Đã cập nhật quy định quỹ.',
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
            'btn'
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

        ratingForm.append(
          el(
            'p',
            'Phiên bản cũ được giữ nguyên. Phiên bản mới sẽ trở thành cấu hình Rating đang hoạt động.',
            'muted'
          ),
          ratingGrid,
          ratingActions,
          ratingMessage
        );

        section.append(
          ratingForm
        );

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

      function forcedPasswordChange(root) {
        if (
          !state.session ||
          state.profile?.must_change_password !== true
        ) {
          return;
        }

        const section =
          panel(
            'Đổi mật khẩu lần đầu',
            root
          );

        section.append(
          el(
            'p',
            'Bạn cần đổi mật khẩu tạm trước khi sử dụng hệ thống.',
            'notice'
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
          labelText
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
          input.type = 'password';
          input.required = true;
          input.minLength = 8;
          input.autocomplete =
            'new-password';

          group.append(
            label,
            input
          );

          grid.append(
            group
          );

          return input;
        };

        const password =
          makeField(
            'forced-new-password',
            'Mật khẩu mới'
          );

        const confirmPassword =
          makeField(
            'forced-confirm-password',
            'Nhập lại mật khẩu mới'
          );

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
            'Đổi mật khẩu và tiếp tục',
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
          grid,
          actions,
          message
        );

        section.append(
          form
        );

        form.addEventListener(
          'submit',
          async event => {
            event.preventDefault();

            if (
              state.writeBusy ||
              state.busy ||
              !state.session
            ) {
              return;
            }

            if (
              password.value.length < 8
            ) {
              notice(
                message,
                'Mật khẩu mới cần ít nhất 8 ký tự.',
                true
              );

              return;
            }

            if (
              password.value !==
              confirmPassword.value
            ) {
              notice(
                message,
                'Mật khẩu xác nhận không khớp.',
                true
              );

              return;
            }

            if (
              !form.reportValidity()
            ) {
              return;
            }

            state.writeBusy = true;

            password.disabled = true;
            confirmPassword.disabled = true;
            submit.disabled = true;

            submit.textContent =
              'Đang cập nhật…';

            notice(
              message,
              ''
            );

            try {
              const {
                data: updateData,
                error: updateError
              } =
                await client.auth
                  .updateUser({
                    password:
                      password.value
                  });

              if (updateError) {
                throw updateError;
              }

              if (
                !updateData?.user ||
                updateData.user.id !==
                  state.session.user.id
              ) {
                throw new Error(
                  'PASSWORD_UPDATE_NOT_CONFIRMED'
                );
              }

              const {
                data: completeData,
                error: completeError
              } =
                await client.rpc(
                  'complete_my_password_change'
                );

              if (completeError) {
                throw completeError;
              }

              if (
                completeData?.success !==
                true
              ) {
                throw new Error(
                  'PASSWORD_CHANGE_FLAG_NOT_CLEARED'
                );
              }

              password.value = '';
              confirmPassword.value = '';

              await load();

              render();

              notice(
                $('global-message'),
                'Đã đổi mật khẩu thành công.',
                false,
                true
              );

            } catch (error) {
              console.error(
                'FORCED_PASSWORD_CHANGE_ERROR',
                error
              );

              let text =
                'Không đổi được mật khẩu. Vui lòng thử lại.';

              if (
                error?.code ===
                'weak_password'
              ) {
                text =
                  'Mật khẩu chưa đủ mạnh. Hãy chọn mật khẩu khó đoán hơn.';
              } else if (
                error?.code ===
                'same_password'
              ) {
                text =
                  'Mật khẩu mới phải khác mật khẩu hiện tại.';
              }

              notice(
                message,
                text,
                true
              );

            } finally {
              state.writeBusy = false;

              password.disabled = false;
              confirmPassword.disabled = false;
              submit.disabled = false;

              submit.textContent =
                'Đổi mật khẩu và tiếp tục';
            }
          }
        );
      }

      function navigate(page) {
        state.page =
          modules.some(
            m => m[0] === page
          )
            ? page
            : 'overview';

        render();
      }

      function render() {
        const current =
          modules.find(
            m =>
              m[0] ===
              state.page
          );

        const visiblePageTitle =
          current[0] === 'admin' &&
          !isAdmin()
            ? 'Tài khoản'
            : current[2];

        $('page-title').textContent =
          visiblePageTitle;

        document
          .querySelectorAll(
            '[data-page]'
          )
          .forEach(n => {
            if (
              n.dataset.page ===
              state.page
            ) {
              n.setAttribute(
                'aria-current',
                'page'
              );
            } else {
              n.removeAttribute(
                'aria-current'
              );
            }
          });

        const root =
          $('content');

        root.replaceChildren();

        root.setAttribute(
          'aria-busy',
          String(
            state.busy
          )
        );

        if (!state.profile) {
          root.append(
            el(
              'p',
              state.busy
                ? 'Đang xác nhận tài khoản…'
                : 'Chưa thể tải hồ sơ. Chọn Làm mới để thử lại.',
              'notice'
            )
          );

          return;
        }

        if (state.busy) {
          root.append(
            el(
              'p',
              'Đang tải dữ liệu câu lạc bộ…',
              'muted'
            )
          );

          const sk = el(
            'div',
            null,
            'grid grid-cols-1 sm:grid-cols-2 gap-4'
          );

          for (
            let i = 0;
            i < 4;
            i++
          ) {
            sk.append(
              el(
                'div',
                null,
                'skeleton'
              )
            );
          }

          root.append(sk);

          return;
        }

        if (
          state.profile
            .is_active !==
          true
        ) {
          root.append(
            el(
              'p',
              'Tài khoản chưa được kích hoạt. Vui lòng liên hệ quản trị viên.',
              'notice error'
            )
          );

          return;
        }


        if (
          state.profile
            .must_change_password ===
          true
        ) {
          forcedPasswordChange(root);
          return;
        }

        switch (
          state.page
        ) {
          case 'overview':
            overview();
            break;

          case 'matches':
            matchesPage();
            break;

          case 'players':
        playersPage();
        break;
      case 'ranking': {
        // BXH DETAIL V1
        // RANKING DETAIL VISUAL V1

        sources(
          root,
          [
            'players',
            'rating_events',
            'matches',
            'match_players'
          ]
        );

        root.append(
          el(
            'p',
            'BXH chính thức chỉ gồm VĐV CLUB đang hoạt động, có ít nhất 5 trận Rated hợp lệ trong phiên bản Rating hiện hành; đồng điểm cùng hạng.',
            'notice'
          )
        );

        const rankingRows =
          ranking();

        // BXH EXCLUSIVE ACCORDION V1.1
        let openedRankingPlayerId =
          null;

        let renderRankingList =
          null;

        const rankingSection =
          panel(
            'Bảng xếp hạng',
            root
          );

        if (!rankingRows.length) {
          rankingSection.append(
            el(
              'p',
              'Chưa có VĐV đủ điều kiện vào BXH chính thức.',
              'muted'
            )
          );
        } else {
          const rankingList =
            el(
              'div',
              null,
              'space-y-2'
            );

          renderRankingList = () => {
              rankingList.innerHTML =
                '';

              rankingRows.forEach(
                player => {
                  const isRankingOpen =
                    openedRankingPlayerId ===
                    player.id;

                  const card =
                    el(
                      'div',
                      null,
                      isRankingOpen
                        ? 'ranking-card ranking-card-open'
                        : 'ranking-card'
                    );

                  const header =
                    el(
                      'div',
                      null,
                      'flex flex-wrap items-center justify-between gap-3'
                    );

                  const summary =
                    el(
                      'div'
                    );

                  summary.append(
                    el(
                      'div',
                      `#${player.rank} • ${playerName(player.id)}`,
                      'font-semibold'
                    ),
                    el(
                      'div',
                      `Rating ${number(player.current_rating)} • ${number(player.rated_matches)} trận Rated`,
                      'text-sm opacity-70 mt-1'
                    )
                  );

                  const toggle =
                    button(
                      openedRankingPlayerId ===
                        player.id
                        ? 'Thu gọn'
                        : 'Xem chi tiết',
                      () => {
                        const willOpenRanking =
                          openedRankingPlayerId !==
                          player.id;

                        if (willOpenRanking) {
                          if (
                            typeof memberHistoryBody !==
                              'undefined' &&
                            !memberHistoryBody.hidden
                          ) {
                            memberHistoryBody.hidden =
                              true;

                            memberHistoryToggle.textContent =
                              '▶ Lịch sử Rating theo thành viên';
                          }

                          openedRankingPlayerId =
                            player.id;
                        } else {
                          openedRankingPlayerId =
                            null;
                        }

                        renderRankingList();
                      },
                      'ranking-card-toggle'
                    );

                  toggle.type =
                    'button';

                  header.append(
                    summary,
                    toggle
                  );

                  card.append(
                    header
                  );

                  if (
                    openedRankingPlayerId ===
                    player.id
                  ) {
                    const detail =
                      el(
                        'div',
                        null,
                        'mt-4 border-t pt-4'
                      );

                    const approvedMatches =
                      new Map(
                        rows('matches')
                          .filter(
                            match =>
                              upper(
                                match.status
                              ) ===
                              'APPROVED'
                          )
                          .map(
                            match => [
                              match.id,
                              match
                            ]
                          )
                      );

                    const appearances =
                      [];
                    const seen =
                      new Set();

                    rows('match_players')
                      .filter(
                        item =>
                          item.player_id ===
                          player.id &&
                          approvedMatches.has(
                            item.match_id
                          )
                      )
                      .forEach(
                        item => {
                          const key =
                            `${item.match_id}:${player.id}`;

                          if (
                            seen.has(key)
                          ) {
                            return;
                          }

                          seen.add(key);

                          const match =
                            approvedMatches.get(
                              item.match_id
                            );

                          const scoreA =
                            Number(
                              match.team_a_score
                            );

                          const scoreB =
                            Number(
                              match.team_b_score
                            );

                          let result =
                            'D';

                          if (
                            scoreA !== scoreB
                          ) {
                            const teamAWon =
                              scoreA > scoreB;

                            result =
                              (
                                item.team === 'A' &&
                                teamAWon
                              ) ||
                              (
                                item.team === 'B' &&
                                !teamAWon
                              )
                                ? 'W'
                                : 'L';
                          }

                          appearances.push({
                            match,
                            result
                          });
                        }
                      );

                    appearances.sort(
                      (a, b) => {
                        const timeDiff =
                          new Date(
                            b.match.played_at
                          ).getTime() -
                          new Date(
                            a.match.played_at
                          ).getTime();

                        if (timeDiff) {
                          return timeDiff;
                        }

                        const numberDiff =
                          Number(
                            b.match.match_number ||
                            0
                          ) -
                          Number(
                            a.match.match_number ||
                            0
                          );

                        if (numberDiff) {
                          return numberDiff;
                        }

                        return String(
                          b.match.id
                        ).localeCompare(
                          String(
                            a.match.id
                          )
                        );
                      }
                    );

                    const recentForm =
                      appearances.slice(
                        0,
                        5
                      );

                    const formSection =
                      el(
                        'div',
                        null,
                        'mt-2'
                      );

                    formSection.append(
                      el(
                        'div',
                        'Phong độ gần đây',
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

                      recentForm.forEach(
                        item => {
                          const badge =
                            el(
                              'span',
                              item.result,
                              'border rounded-lg px-3 py-1 text-sm font-semibold'
                            );

                          badge.title =
                            matchCode(
                              item.match
                            );

                          formLine.append(
                            badge
                          );
                        }
                      );

                      formSection.append(
                        formLine
                      );
                    }

                    const ratingEvents =
                      rows('rating_events')
                        .filter(
                          event =>
                            event.player_id ===
                              player.id &&
                            (
                              !event.algorithm_version ||
                              event.algorithm_version ===
                                currentRatingVersion()
                            )
                        )
                        .map(
                          event => {
                            const match =
                              rows('matches')
                                .find(
                                  item =>
                                    item.id ===
                                    event.match_id
                                );

                            return {
                              ...event,
                              played_at:
                                match?.played_at ||
                                event.created_at,
                              match
                            };
                          }
                        )
                        .sort(
                          (a, b) =>
                            new Date(
                              b.played_at
                            ).getTime() -
                            new Date(
                              a.played_at
                            ).getTime()
                        );

                    const ratingSection =
                      el(
                        'div',
                        null,
                        'mt-4'
                      );

                    const ratingBody =
                      el(
                        'div',
                        null,
                        'mt-2 space-y-2'
                      );

                    ratingBody.hidden =
                      true;

                    const ratingToggle =
                      button(
                        'Xem lịch sử Rating',
                        () => {
                          ratingBody.hidden =
                            !ratingBody.hidden;

                          ratingToggle.textContent =
                            ratingBody.hidden
                              ? 'Xem lịch sử Rating'
                              : 'Thu gọn lịch sử Rating';
                        },
                        'ranking-card-toggle'
                      );

                    ratingToggle.type =
                      'button';

                    if (!ratingEvents.length) {
                      ratingBody.append(
                        el(
                          'div',
                          'Chưa có lịch sử Rating.',
                          'text-sm opacity-60'
                        )
                      );
                    } else {
                      ratingEvents
                        .slice(
                          0,
                          10
                        )
                        .forEach(
                          event => {
                            const before =
                              num(
                                pick(
                                  event,
                                  'rating_before',
                                  'before_rating'
                                )
                              );

                            const after =
                              num(
                                pick(
                                  event,
                                  'rating_after',
                                  'after_rating'
                                )
                              );

                            const delta =
                              num(
                                pick(
                                  event,
                                  'rating_delta',
                                  'delta',
                                  'change',
                                  'delta_applied'
                                )
                              );

                            const deltaText =
                              delta === null
                                ? '—'
                                : (
                                    delta >= 0
                                      ? '+'
                                      : ''
                                  ) +
                                  Number(
                                    delta
                                  ).toFixed(3);

                            const eventLine =
                              el(
                                'div',
                                null,
                                'border rounded-lg p-2 text-sm'
                              );

                            eventLine.append(
                              el(
                                'div',
                                event.match
                                  ? matchCode(
                                      event.match
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
                                `${
                                  before === null
                                    ? '—'
                                    : number(before)
                                } → ${
                                  after === null
                                    ? '—'
                                    : number(after)
                                } (${deltaText})`,
                                'opacity-70'
                              )
                            );

                            ratingBody.append(
                              eventLine
                            );
                          }
                        );
                    }

                    ratingSection.append(
                      ratingToggle,
                      ratingBody
                    );

                    detail.append(
                      el(
                        'div',
                        `Rating hiện tại: ${number(player.current_rating)}`,
                        'font-semibold'
                      ),
                      el(
                        'div',
                        `Trận Rated hợp lệ: ${number(player.rated_matches)}`,
                        'text-sm opacity-70 mt-1'
                      ),
                      formSection,
                      ratingSection
                    );

                    card.append(
                      detail
                    );
                  }

                  rankingList.append(
                    card
                  );
                }
              );
            };

          renderRankingList();

          rankingSection.append(
            rankingList
          );
        }
    // BXH EXCLUSIVE ACCORDION V1
    // MEMBER RATING HISTORY V1
    // MEMBER RATING HISTORY VISUAL V1

    const memberHistoryWrapper =
      el(
        'div',
        null,
        'member-rating-history mt-4'
      );

    const memberHistoryBody =
      el(
        'div',
        null,
        'member-rating-history-body'
      );

    memberHistoryBody.hidden =
      true;

    const memberHistoryToggle =
      button(
        '▶ Lịch sử Rating theo thành viên',
        () => {
          const willOpenMemberHistory =
            memberHistoryBody.hidden;

          if (willOpenMemberHistory) {
            openedRankingPlayerId =
              null;

            if (
              typeof renderRankingList ===
              'function'
            ) {
              renderRankingList();
            }

            memberHistoryBody.hidden =
              false;
          } else {
            memberHistoryBody.hidden =
              true;
          }

          memberHistoryToggle.textContent =
            memberHistoryBody.hidden
              ? '▶ Lịch sử Rating theo thành viên'
              : '▼ Thu gọn lịch sử Rating theo thành viên';
        },
        'member-rating-history-toggle'
      );

    memberHistoryToggle.type =
      'button';

    const memberHistoryControls =
      el(
        'div',
        null,
        'mb-3'
      );

    memberHistoryControls.append(
      el(
        'div',
        'Chọn VĐV',
        'text-sm font-semibold mb-2'
      )
    );

    const memberHistorySelect =
      el(
        'select',
        null,
        'field'
      );

    memberHistorySelect.setAttribute(
      'aria-label',
      'Chọn VĐV để xem lịch sử Rating'
    );

    memberHistorySelect.append(
      new Option(
        '— Chọn VĐV —',
        ''
      )
    );

    rows('players')
      .slice()
      .sort(
        (a, b) =>
          playerName(a.id)
            .localeCompare(
              playerName(b.id),
              'vi'
            )
      )
      .forEach(
        player => {
          memberHistorySelect.append(
            new Option(
              playerName(player.id),
              player.id
            )
          );
        }
      );

    memberHistoryControls.append(
      memberHistorySelect
    );

    const memberHistoryContent =
      el('div');

    const renderMemberHistory =
      () => {
        memberHistoryContent.innerHTML =
          '';

        const playerId =
          memberHistorySelect.value;

        if (!playerId) {
          memberHistoryContent.append(
            el(
              'p',
              'Chọn một VĐV để xem toàn bộ lịch sử Rating.',
              'muted'
            )
          );

          return;
        }

        const selectedPlayer =
          rows('players')
            .find(
              player =>
                player.id ===
                playerId
            );

        const playerEvents =
          rows('rating_events')
            .filter(
              event =>
                event.player_id ===
                  playerId &&
                (
                  !event.algorithm_version ||
                  event.algorithm_version ===
                    currentRatingVersion()
                )
            )
            .map(
              event => {
                const match =
                  rows('matches')
                    .find(
                      item =>
                        item.id ===
                        event.match_id
                    );

                return {
                  ...event,
                  played_at:
                    match?.played_at ||
                    event.created_at,
                  match_reference:
                    match
                      ? (
                          'Trận ' +
                          matchCode(match) +
                          ' • ' +
                          number(
                            match.team_a_score
                          ) +
                          ' – ' +
                          number(
                            match.team_b_score
                          )
                        )
                      : (
                          event.match_id
                            ? '#' +
                              String(
                                event.match_id
                              ).slice(
                                0,
                                8
                              )
                            : 'Điều chỉnh'
                        )
                };
              }
            )
            .sort(
              (a, b) => {
                const timeDiff =
                  new Date(
                    b.played_at
                  ).getTime() -
                  new Date(
                    a.played_at
                  ).getTime();

                if (timeDiff) {
                  return timeDiff;
                }

                return String(
                  b.id || ''
                ).localeCompare(
                  String(
                    a.id || ''
                  )
                );
              }
            );

        memberHistoryContent.append(
          el(
            'div',
            selectedPlayer
              ? playerName(
                  selectedPlayer.id
                )
              : 'VĐV',
            'font-semibold mb-1'
          ),
          el(
            'div',
            `Rating hiện tại: ${
              selectedPlayer
                ? number(
                    selectedPlayer.current_rating
                  )
                : '—'
            } • ${
              playerEvents.length
            } thay đổi Rating`,
            'text-sm opacity-70 mb-3'
          )
        );

        if (!playerEvents.length) {
          memberHistoryContent.append(
            el(
              'p',
              'VĐV này chưa có lịch sử Rating trong phiên bản hiện hành.',
              'muted'
            )
          );

          return;
        }

        table(
          memberHistoryContent,
          'Toàn bộ lịch sử Rating',
          playerEvents,
          [
            dateCol(
              'Thời gian trận',
              'played_at'
            ),
            [
              'Điểm trước',
              r =>
                number(
                  pick(
                    r,
                    'rating_before',
                    'before_rating'
                  )
                )
            ],
            [
              'Thay đổi',
              r => {
                const delta =
                  num(
                    pick(
                      r,
                      'rating_delta',
                      'delta',
                      'change',
                      'delta_applied'
                    )
                  );

                if (delta === null) {
                  return '—';
                }

                return (
                  delta >= 0
                    ? '+'
                    : ''
                ) +
                Number(
                  delta
                ).toFixed(3);
              }
            ],
            [
              'Điểm sau',
              r =>
                number(
                  pick(
                    r,
                    'rating_after',
                    'after_rating'
                  )
                )
            ],
            [
              'Trận liên quan',
              r =>
                r.match_reference ||
                (
                  r.match_id
                    ? '#' +
                      String(
                        r.match_id
                      ).slice(
                        0,
                        8
                      )
                    : 'Điều chỉnh'
                )
            ]
          ],
          {
            unavailable:
              !!state.errors.rating_events ||
              !!state.errors.matches
          }
        );
      };

    memberHistorySelect.addEventListener(
      'change',
      renderMemberHistory
    );

    renderMemberHistory();

    memberHistoryBody.append(
      memberHistoryControls,
      memberHistoryContent
    );

    memberHistoryWrapper.append(
      memberHistoryToggle,
      memberHistoryBody
    );

    root.append(
      memberHistoryWrapper
    );

        break;
      }
      case 'fund':
            fund();
            break;

          case 'contribution':
            contributions();
            break;
          case 'tournaments': {
            // TOURNAMENT CREATE UI V1A
            sources(
              root,
              [
                'tournaments',
                'matches',
                'match_players',
                'players',
                'tournament_registrations',
                'tournament_payments'
              ]
            );

            // TOURNAMENT UNIFIED ACCORDION V1D.1
            let openedTournamentId =
              null;

            const tournamentCards =
              new Map();

            let closeTournamentCard =
              () => {};

            let closeTournamentDetail =
              () => {};

            let closeTournamentAdminActions =
              () => {};

            if (isAdmin()) {
              const createWrapper =
                el(
                  'section',
                  null,
                  'app-action app-action-success mb-4'
                );

              const createToggle =
                button(
                  '＋ Tạo giải đấu',
                  () => {
                    const opening =
                      createBody.hidden;

                    if (opening) {
                      closeTournamentDetail();

                      editBody.hidden =
                        true;

                      editToggle.textContent =
                        '✎ Sửa thông tin giải';

                      lifecycleBody.hidden =
                        true;

                      lifecycleToggle.textContent =
                        '⇄ Chuyển trạng thái giải';
                    }

                    createBody.hidden =
                      !opening;

                    createToggle.textContent =
                      createBody.hidden
                        ? '＋ Tạo giải đấu'
                        : '− Thu gọn tạo giải';
                  },
                  'app-action-toggle'
                );

              createToggle.type =
                'button';

              const createBody =
                el(
                  'div',
                  null,
                  'app-action-body'
                );

              createBody.hidden =
                true;

              const description =
                el(
                  'p',
                  'Tạo hồ sơ giải đấu trước. Sau đó các trận có thể được gắn vào giải ngay từ màn hình Trận đấu.',
                  'notice'
                );

              const message =
                el(
                  'div'
                );

              message.hidden =
                true;

              message.setAttribute(
                'role',
                'alert'
              );

              const form =
                el(
                  'form'
                );

              const grid =
                el(
                  'div',
                  null,
                  'form-grid'
                );

              const makeInput = (
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

                label.htmlFor =
                  id;

                const input =
                  el(
                    'input',
                    null,
                    'field'
                  );

                input.id =
                  id;

                input.type =
                  type;

                group.append(
                  label,
                  input
                );

                return {
                  group,
                  input
                };
              };

              const nameField =
                makeInput(
                  'tournament-create-name',
                  'Tên giải'
                );

              nameField.input.required =
                true;

              nameField.input.maxLength =
                200;

              nameField.input.placeholder =
                'Ví dụ: Pickleball Open 2026';

              const codeField =
                makeInput(
                  'tournament-create-code',
                  'Mã giải'
                );

              codeField.input.maxLength =
                100;

              codeField.input.placeholder =
                'Ví dụ: OPEN-2026';

              const startField =
                makeInput(
                  'tournament-create-start',
                  'Ngày bắt đầu',
                  'date'
                );

              startField.input.required =
                true;

              const today =
                new Date();

              const localToday =
                new Date(
                  today.getTime() -
                    today.getTimezoneOffset() *
                    60000
                )
                  .toISOString()
                  .slice(
                    0,
                    10
                  );

              startField.input.value =
                localToday;

              const endField =
                makeInput(
                  'tournament-create-end',
                  'Ngày kết thúc',
                  'date'
                );

              const locationField =
                makeInput(
                  'tournament-create-location',
                  'Địa điểm'
                );

              locationField.input.maxLength =
                300;

              const categoryField =
                makeInput(
                  'tournament-create-category',
                  'Loại sự kiện'
                );

              categoryField.input.maxLength =
                150;

              categoryField.input.placeholder =
                'Ví dụ: Giải nội bộ CLB';

              const formatField =
                makeInput(
                  'tournament-create-format',
                  'Thể thức'
                );

              formatField.input.maxLength =
                150;

              formatField.input.placeholder =
                'Ví dụ: Đôi nam nữ';

              const feeField =
                makeInput(
                  'tournament-create-fee',
                  'Phí đăng ký',
                  'number'
                );

              feeField.input.min =
                '0';

              feeField.input.step =
                '1000';

              feeField.input.value =
                '0';

              feeField.input.required =
                true;

              grid.append(
                nameField.group,
                codeField.group,
                startField.group,
                endField.group,
                locationField.group,
                categoryField.group,
                formatField.group,
                feeField.group
              );

              const notesGroup =
                el(
                  'div',
                  null,
                  'form-group mt-3'
                );

              const notesLabel =
                el(
                  'label',
                  'Ghi chú'
                );

              notesLabel.htmlFor =
                'tournament-create-notes';

              const notes =
                el(
                  'textarea',
                  null,
                  'field'
                );

              notes.id =
                'tournament-create-notes';

              notes.maxLength =
                2000;

              notes.placeholder =
                'Thông tin thêm về giải đấu';

              notesGroup.append(
                notesLabel,
                notes
              );

              const actions =
                el(
                  'div',
                  null,
                  'form-actions'
                );

              const submit =
                el(
                  'button',
                  'Tạo giải',
                  'btn primary'
                );

              submit.type =
                'submit';

              const reset =
                button(
                  'Đặt lại',
                  () => {
                    form.reset();

                    startField.input.value =
                      localToday;

                    feeField.input.value =
                      '0';

                    notice(
                      message,
                      '',
                      false
                    );
                  }
                );

              reset.type =
                'button';

              actions.append(
                submit,
                reset
              );

              form.append(
                grid,
                notesGroup,
                actions
              );

              form.addEventListener(
                'submit',
                async event => {
                  event.preventDefault();

                  if (
                    state.writeBusy
                  ) {
                    return;
                  }

                  const tournamentName =
                    nameField.input.value.trim();

                  if (!tournamentName) {
                    notice(
                      message,
                      'Vui lòng nhập tên giải.',
                      true
                    );

                    return;
                  }

                  const startDate =
                    startField.input.value;

                  const endDate =
                    endField.input.value ||
                    null;

                  if (!startDate) {
                    notice(
                      message,
                      'Vui lòng chọn ngày bắt đầu.',
                      true
                    );

                    return;
                  }

                  if (
                    endDate &&
                    endDate <
                      startDate
                  ) {
                    notice(
                      message,
                      'Ngày kết thúc không được trước ngày bắt đầu.',
                      true
                    );

                    return;
                  }

                  const fee =
                    Number(
                      feeField.input.value
                    );

                  if (
                    !Number.isFinite(
                      fee
                    ) ||
                    fee < 0
                  ) {
                    notice(
                      message,
                      'Phí đăng ký phải là số không âm.',
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

                  submit.textContent =
                    'Đang tạo…';

                  try {
                    const {
                      data,
                      error
                    } =
                      await client.rpc(
                        'create_tournament',
                        {
                          p_name:
                            tournamentName,
                          p_code:
                            codeField.input.value.trim() ||
                            null,
                          p_start_date:
                            startDate,
                          p_end_date:
                            endDate,
                          p_location:
                            locationField.input.value.trim() ||
                            null,
                          p_event_category:
                            categoryField.input.value.trim() ||
                            null,
                          p_format:
                            formatField.input.value.trim() ||
                            null,
                          p_registration_fee:
                            fee,
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
                        'Máy chủ không xác nhận tạo giải.'
                      );
                    }

                    await load();

                    state.page =
                      'tournaments';

                    render();

                    notice(
                      $('global-message'),
                      'Đã tạo giải đấu thành công. 🏆',
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
                        'Không tạo được giải. ' +
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
                      'Tạo giải';
                  }
                }
              );

              createBody.append(
                description,
                message,
                form
              );

              createWrapper.append(
                createToggle,
                createBody
              );

              // TOURNAMENT EDIT UI V1B
              const editWrapper =
                el(
                  'section',
                  null,
                  'app-action app-action-info mb-4'
                );

              const editToggle =
                button(
                  '✎ Sửa thông tin giải',
                  () => {
                    const opening =
                      editBody.hidden;

                    if (opening) {
                      closeTournamentDetail();

                      createBody.hidden =
                        true;

                      createToggle.textContent =
                        '＋ Tạo giải đấu';

                      lifecycleBody.hidden =
                        true;

                      lifecycleToggle.textContent =
                        '⇄ Chuyển trạng thái giải';
                    }

                    editBody.hidden =
                      !opening;

                    editToggle.textContent =
                      editBody.hidden
                        ? '✎ Sửa thông tin giải'
                        : '− Thu gọn sửa giải';
                  },
                  'app-action-toggle'
                );

              editToggle.type =
                'button';

              const editBody =
                el(
                  'div',
                  null,
                  'app-action-body'
                );

              editBody.hidden =
                true;

              const editDescription =
                el(
                  'p',
                  'Chỉ sửa thông tin hồ sơ giải. Trạng thái giải được quản lý riêng để tránh thay đổi vòng đời ngoài ý muốn.',
                  'notice'
                );

              const editMessage =
                el(
                  'div'
                );

              editMessage.hidden =
                true;

              editMessage.setAttribute(
                'role',
                'alert'
              );

              const editForm =
                el(
                  'form'
                );

              const selectorGroup =
                el(
                  'div',
                  null,
                  'form-group mb-3'
                );

              const selectorLabel =
                el(
                  'label',
                  'Chọn giải cần sửa'
                );

              selectorLabel.htmlFor =
                'tournament-edit-select';

              const tournamentSelect =
                el(
                  'select',
                  null,
                  'field'
                );

              tournamentSelect.id =
                'tournament-edit-select';

              tournamentSelect.required =
                true;

              tournamentSelect.append(
                new Option(
                  '— Chọn giải đấu —',
                  ''
                )
              );

              rows(
                'tournaments'
              )
                .slice()
                .sort(
                  (a, b) =>
                    String(
                      b.start_date ||
                      ''
                    ).localeCompare(
                      String(
                        a.start_date ||
                        ''
                      )
                    )
                )
                .forEach(
                  tournament => {
                    const statusLabels = {
                      DU_KIEN:
                        'Dự kiến',
                      MO_DANG_KY:
                        'Mở đăng ký',
                      DANG_DIEN_RA:
                        'Đang diễn ra',
                      DA_KET_THUC:
                        'Đã kết thúc',
                      DA_QUYET_TOAN:
                        'Đã quyết toán',
                      HUY:
                        'Đã hủy'
                    };

                    const status =
                      upper(
                        tournament.status
                      );

                    const label =
                      raw(
                        tournament.name
                      ) +
                      (
                        tournament.code
                          ? ' · ' +
                            raw(
                              tournament.code
                            )
                          : ''
                      ) +
                      ' · ' +
                      (
                        statusLabels[
                          status
                        ] ||
                        raw(
                          tournament.status
                        )
                      );

                    tournamentSelect.append(
                      new Option(
                        label,
                        tournament.id
                      )
                    );
                  }
                );

              selectorGroup.append(
                selectorLabel,
                tournamentSelect
              );

              const editGrid =
                el(
                  'div',
                  null,
                  'form-grid'
                );

              const makeEditInput = (
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

                label.htmlFor =
                  id;

                const input =
                  el(
                    'input',
                    null,
                    'field'
                  );

                input.id =
                  id;

                input.type =
                  type;

                group.append(
                  label,
                  input
                );

                return {
                  group,
                  input
                };
              };

              const editName =
                makeEditInput(
                  'tournament-edit-name',
                  'Tên giải'
                );

              editName.input.required =
                true;

              editName.input.maxLength =
                200;

              const editCode =
                makeEditInput(
                  'tournament-edit-code',
                  'Mã giải'
                );

              editCode.input.maxLength =
                100;

              const editStart =
                makeEditInput(
                  'tournament-edit-start',
                  'Ngày bắt đầu',
                  'date'
                );

              editStart.input.required =
                true;

              const editEnd =
                makeEditInput(
                  'tournament-edit-end',
                  'Ngày kết thúc',
                  'date'
                );

              const editLocation =
                makeEditInput(
                  'tournament-edit-location',
                  'Địa điểm'
                );

              editLocation.input.maxLength =
                300;

              const editCategory =
                makeEditInput(
                  'tournament-edit-category',
                  'Loại sự kiện'
                );

              editCategory.input.maxLength =
                150;

              const editFormat =
                makeEditInput(
                  'tournament-edit-format',
                  'Thể thức'
                );

              editFormat.input.maxLength =
                150;

              const editFee =
                makeEditInput(
                  'tournament-edit-fee',
                  'Phí đăng ký',
                  'number'
                );

              editFee.input.min =
                '0';

              editFee.input.step =
                '1000';

              editFee.input.required =
                true;

              editGrid.append(
                editName.group,
                editCode.group,
                editStart.group,
                editEnd.group,
                editLocation.group,
                editCategory.group,
                editFormat.group,
                editFee.group
              );

              const editNotesGroup =
                el(
                  'div',
                  null,
                  'form-group mt-3'
                );

              const editNotesLabel =
                el(
                  'label',
                  'Ghi chú'
                );

              editNotesLabel.htmlFor =
                'tournament-edit-notes';

              const editNotes =
                el(
                  'textarea',
                  null,
                  'field'
                );

              editNotes.id =
                'tournament-edit-notes';

              editNotes.maxLength =
                2000;

              editNotesGroup.append(
                editNotesLabel,
                editNotes
              );

              const selectedStatus =
                el(
                  'p',
                  'Chưa chọn giải.',
                  'muted mt-3'
                );

              const clearEditFields =
                () => {
                  editName.input.value =
                    '';

                  editCode.input.value =
                    '';

                  editStart.input.value =
                    '';

                  editEnd.input.value =
                    '';

                  editLocation.input.value =
                    '';

                  editCategory.input.value =
                    '';

                  editFormat.input.value =
                    '';

                  editFee.input.value =
                    '0';

                  editNotes.value =
                    '';

                  selectedStatus.textContent =
                    'Chưa chọn giải.';
                };

              const loadSelectedTournament =
                () => {
                  const tournament =
                    rows(
                      'tournaments'
                    ).find(
                      item =>
                        item.id ===
                        tournamentSelect.value
                    );

                  if (!tournament) {
                    clearEditFields();

                    return;
                  }

                  editName.input.value =
                    raw(
                      tournament.name
                    );

                  editCode.input.value =
                    raw(
                      tournament.code
                    );

                  editStart.input.value =
                    tournament.start_date ||
                    '';

                  editEnd.input.value =
                    tournament.end_date ||
                    '';

                  editLocation.input.value =
                    raw(
                      tournament.location
                    );

                  editCategory.input.value =
                    raw(
                      tournament.event_category
                    );

                  editFormat.input.value =
                    raw(
                      tournament.format
                    );

                  editFee.input.value =
                    String(
                      Number(
                        tournament.registration_fee ||
                        0
                      )
                    );

                  editNotes.value =
                    raw(
                      tournament.notes
                    );

                  const statusLabels = {
                    DU_KIEN:
                      '🗓️ Dự kiến',
                    MO_DANG_KY:
                      '📝 Mở đăng ký',
                    DANG_DIEN_RA:
                      '🔥 Đang diễn ra',
                    DA_KET_THUC:
                      '🏁 Đã kết thúc',
                    DA_QUYET_TOAN:
                      '✅ Đã quyết toán',
                    HUY:
                      '⛔ Đã hủy'
                  };

                  const status =
                    upper(
                      tournament.status
                    );

                  selectedStatus.textContent =
                    'Trạng thái hiện tại: ' +
                    (
                      statusLabels[
                        status
                      ] ||
                      raw(
                        tournament.status
                      )
                    ) +
                    '. Trạng thái không được thay đổi tại đây.';
                };

              tournamentSelect.addEventListener(
                'change',
                () => {
                  notice(
                    editMessage,
                    '',
                    false
                  );

                  loadSelectedTournament();
                }
              );

              const editActions =
                el(
                  'div',
                  null,
                  'form-actions'
                );

              const editSubmit =
                el(
                  'button',
                  'Lưu thay đổi',
                  'btn primary'
                );

              editSubmit.type =
                'submit';

              const editReset =
                button(
                  'Khôi phục dữ liệu',
                  () => {
                    if (
                      !tournamentSelect.value
                    ) {
                      clearEditFields();

                      return;
                    }

                    loadSelectedTournament();

                    notice(
                      editMessage,
                      '',
                      false
                    );
                  }
                );

              editReset.type =
                'button';

              editActions.append(
                editSubmit,
                editReset
              );

              editForm.append(
                selectorGroup,
                editGrid,
                editNotesGroup,
                selectedStatus,
                editActions
              );

              editForm.addEventListener(
                'submit',
                async event => {
                  event.preventDefault();

                  if (
                    state.writeBusy
                  ) {
                    return;
                  }

                  const tournamentId =
                    tournamentSelect.value;

                  if (!tournamentId) {
                    notice(
                      editMessage,
                      'Vui lòng chọn giải cần sửa.',
                      true
                    );

                    return;
                  }

                  const tournamentName =
                    editName.input.value.trim();

                  if (!tournamentName) {
                    notice(
                      editMessage,
                      'Vui lòng nhập tên giải.',
                      true
                    );

                    return;
                  }

                  const startDate =
                    editStart.input.value;

                  const endDate =
                    editEnd.input.value ||
                    null;

                  if (!startDate) {
                    notice(
                      editMessage,
                      'Vui lòng chọn ngày bắt đầu.',
                      true
                    );

                    return;
                  }

                  if (
                    endDate &&
                    endDate <
                      startDate
                  ) {
                    notice(
                      editMessage,
                      'Ngày kết thúc không được trước ngày bắt đầu.',
                      true
                    );

                    return;
                  }

                  const fee =
                    Number(
                      editFee.input.value
                    );

                  if (
                    !Number.isFinite(
                      fee
                    ) ||
                    fee < 0
                  ) {
                    notice(
                      editMessage,
                      'Phí đăng ký phải là số không âm.',
                      true
                    );

                    return;
                  }

                  state.writeBusy =
                    true;

                  editSubmit.disabled =
                    true;

                  editReset.disabled =
                    true;

                  tournamentSelect.disabled =
                    true;

                  editSubmit.textContent =
                    'Đang lưu…';

                  try {
                    const {
                      data,
                      error
                    } =
                      await client.rpc(
                        'update_tournament',
                        {
                          p_tournament_id:
                            tournamentId,
                          p_name:
                            tournamentName,
                          p_code:
                            editCode.input.value.trim() ||
                            null,
                          p_start_date:
                            startDate,
                          p_end_date:
                            endDate,
                          p_location:
                            editLocation.input.value.trim() ||
                            null,
                          p_event_category:
                            editCategory.input.value.trim() ||
                            null,
                          p_format:
                            editFormat.input.value.trim() ||
                            null,
                          p_registration_fee:
                            fee,
                          p_notes:
                            editNotes.value.trim() ||
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
                        'Máy chủ không xác nhận cập nhật giải.'
                      );
                    }

                    await load();

                    state.page =
                      'tournaments';

                    render();

                    notice(
                      $('global-message'),
                      'Đã cập nhật thông tin giải đấu thành công. ✎',
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
                        'Không cập nhật được giải. ' +
                        String(
                          error.message
                        ).slice(
                          0,
                          300
                        );
                    }

                    notice(
                      editMessage,
                      text,
                      true
                    );
                  } finally {
                    state.writeBusy =
                      false;

                    editSubmit.disabled =
                      false;

                    editReset.disabled =
                      false;

                    tournamentSelect.disabled =
                      false;

                    editSubmit.textContent =
                      'Lưu thay đổi';
                  }
                }
              );

              editBody.append(
                editDescription,
                editMessage,
                editForm
              );

              editWrapper.append(
                editToggle,
                editBody
              );

              // TOURNAMENT LIFECYCLE UI V1C
              const lifecycleWrapper =
                el(
                  'section',
                  null,
                  'app-action app-action-neutral mb-4'
                );

              const lifecycleToggle =
                button(
                  '⇄ Chuyển trạng thái giải',
                  () => {
                    const opening =
                      lifecycleBody.hidden;

                    if (opening) {
                      closeTournamentDetail();

                      createBody.hidden =
                        true;

                      createToggle.textContent =
                        '＋ Tạo giải đấu';

                      editBody.hidden =
                        true;

                      editToggle.textContent =
                        '✎ Sửa thông tin giải';
                    }

                    lifecycleBody.hidden =
                      !opening;

                    lifecycleToggle.textContent =
                      lifecycleBody.hidden
                        ? '⇄ Chuyển trạng thái giải'
                        : '− Thu gọn trạng thái giải';
                  },
                  'app-action-toggle'
                );

              lifecycleToggle.type =
                'button';

              const lifecycleBody =
                el(
                  'div',
                  null,
                  'app-action-body'
                );

              lifecycleBody.hidden =
                true;

              const lifecycleDescription =
                el(
                  'p',
                  'Trạng thái giải được chuyển tuần tự. Hệ thống không cho nhảy cóc hoặc quay ngược lifecycle.',
                  'notice'
                );

              const lifecycleMessage =
                el(
                  'div'
                );

              lifecycleMessage.hidden =
                true;

              lifecycleMessage.setAttribute(
                'role',
                'alert'
              );

              const lifecycleForm =
                el(
                  'form'
                );

              const lifecycleGrid =
                el(
                  'div',
                  null,
                  'form-grid'
                );

              const tournamentGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const tournamentLabel =
                el(
                  'label',
                  'Chọn giải đấu'
                );

              tournamentLabel.htmlFor =
                'tournament-lifecycle-select';

              const lifecycleTournament =
                el(
                  'select',
                  null,
                  'field'
                );

              lifecycleTournament.id =
                'tournament-lifecycle-select';

              lifecycleTournament.required =
                true;

              lifecycleTournament.append(
                new Option(
                  '— Chọn giải đấu —',
                  ''
                )
              );

              const lifecycleStatusLabels = {
                DU_KIEN:
                  '🗓️ Dự kiến',
                MO_DANG_KY:
                  '📝 Mở đăng ký',
                DANG_DIEN_RA:
                  '🔥 Đang diễn ra',
                DA_KET_THUC:
                  '🏁 Đã kết thúc',
                DA_QUYET_TOAN:
                  '✅ Đã quyết toán',
                HUY:
                  '⛔ Đã hủy'
              };

              const lifecycleTransitions = {
                DU_KIEN: [
                  'MO_DANG_KY',
                  'HUY'
                ],
                MO_DANG_KY: [
                  'DANG_DIEN_RA',
                  'HUY'
                ],
                DANG_DIEN_RA: [
                  'DA_KET_THUC'
                ],
                DA_KET_THUC: [
                  'DA_QUYET_TOAN'
                ],
                DA_QUYET_TOAN: [],
                HUY: []
              };

              rows(
                'tournaments'
              )
                .slice()
                .sort(
                  (a, b) =>
                    String(
                      b.start_date ||
                      ''
                    ).localeCompare(
                      String(
                        a.start_date ||
                        ''
                      )
                    )
                )
                .forEach(
                  tournament => {
                    const status =
                      upper(
                        tournament.status
                      );

                    const label =
                      raw(
                        tournament.name
                      ) +
                      (
                        tournament.code
                          ? ' · ' +
                            raw(
                              tournament.code
                            )
                          : ''
                      ) +
                      ' · ' +
                      (
                        lifecycleStatusLabels[
                          status
                        ] ||
                        raw(
                          tournament.status
                        )
                      );

                    lifecycleTournament.append(
                      new Option(
                        label,
                        tournament.id
                      )
                    );
                  }
                );

              tournamentGroup.append(
                tournamentLabel,
                lifecycleTournament
              );

              const targetGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const targetLabel =
                el(
                  'label',
                  'Chuyển sang'
                );

              targetLabel.htmlFor =
                'tournament-lifecycle-target';

              const lifecycleTarget =
                el(
                  'select',
                  null,
                  'field'
                );

              lifecycleTarget.id =
                'tournament-lifecycle-target';

              lifecycleTarget.required =
                true;

              lifecycleTarget.disabled =
                true;

              targetGroup.append(
                targetLabel,
                lifecycleTarget
              );

              lifecycleGrid.append(
                tournamentGroup,
                targetGroup
              );

              const lifecycleCurrent =
                el(
                  'p',
                  'Chưa chọn giải.',
                  'muted mt-3'
                );

              const reasonGroup =
                el(
                  'div',
                  null,
                  'form-group mt-3'
                );

              const reasonLabel =
                el(
                  'label',
                  'Lý do / ghi chú chuyển trạng thái'
                );

              reasonLabel.htmlFor =
                'tournament-lifecycle-reason';

              const lifecycleReason =
                el(
                  'textarea',
                  null,
                  'field'
                );

              lifecycleReason.id =
                'tournament-lifecycle-reason';

              lifecycleReason.maxLength =
                1000;

              lifecycleReason.placeholder =
                'Có thể để trống. Hệ thống vẫn ghi audit tự động.';

              reasonGroup.append(
                reasonLabel,
                lifecycleReason
              );

              const lifecycleActions =
                el(
                  'div',
                  null,
                  'form-actions'
                );

              const lifecycleSubmit =
                el(
                  'button',
                  'Xác nhận chuyển trạng thái',
                  'btn primary'
                );

              lifecycleSubmit.type =
                'submit';

              lifecycleSubmit.disabled =
                true;

              lifecycleActions.append(
                lifecycleSubmit
              );

              const refreshLifecycleTarget =
                () => {
                  lifecycleTarget.innerHTML =
                    '';

                  lifecycleTarget.append(
                    new Option(
                      '— Chọn trạng thái mới —',
                      ''
                    )
                  );

                  const tournament =
                    rows(
                      'tournaments'
                    ).find(
                      item =>
                        item.id ===
                        lifecycleTournament.value
                    );

                  if (!tournament) {
                    lifecycleCurrent.textContent =
                      'Chưa chọn giải.';

                    lifecycleTarget.disabled =
                      true;

                    lifecycleSubmit.disabled =
                      true;

                    return;
                  }

                  const currentStatus =
                    upper(
                      tournament.status
                    );

                  const allowed =
                    lifecycleTransitions[
                      currentStatus
                    ] ||
                    [];

                  lifecycleCurrent.textContent =
                    'Trạng thái hiện tại: ' +
                    (
                      lifecycleStatusLabels[
                        currentStatus
                      ] ||
                      raw(
                        tournament.status
                      )
                    );

                  if (!allowed.length) {
                    lifecycleTarget.disabled =
                      true;

                    lifecycleSubmit.disabled =
                      true;

                    lifecycleCurrent.textContent +=
                      currentStatus ===
                        'HUY'
                        ? ' · Giải đã hủy, lifecycle đã kết thúc.'
                        : ' · Đây là trạng thái cuối, không còn bước chuyển tiếp.';

                    return;
                  }

                  allowed.forEach(
                    status => {
                      lifecycleTarget.append(
                        new Option(
                          lifecycleStatusLabels[
                            status
                          ] ||
                            status,
                          status
                        )
                      );
                    }
                  );

                  lifecycleTarget.disabled =
                    false;

                  lifecycleSubmit.disabled =
                    true;
                };

              lifecycleTournament.addEventListener(
                'change',
                () => {
                  notice(
                    lifecycleMessage,
                    '',
                    false
                  );

                  lifecycleReason.value =
                    '';

                  refreshLifecycleTarget();
                }
              );

              lifecycleTarget.addEventListener(
                'change',
                () => {
                  lifecycleSubmit.disabled =
                    !lifecycleTarget.value ||
                    state.writeBusy;
                }
              );

              lifecycleForm.append(
                lifecycleGrid,
                lifecycleCurrent,
                reasonGroup,
                lifecycleActions
              );

              lifecycleForm.addEventListener(
                'submit',
                async event => {
                  event.preventDefault();

                  if (
                    state.writeBusy
                  ) {
                    return;
                  }

                  const tournamentId =
                    lifecycleTournament.value;

                  const newStatus =
                    lifecycleTarget.value;

                  if (
                    !tournamentId ||
                    !newStatus
                  ) {
                    notice(
                      lifecycleMessage,
                      'Vui lòng chọn giải và trạng thái chuyển tiếp.',
                      true
                    );

                    return;
                  }

                  const tournament =
                    rows(
                      'tournaments'
                    ).find(
                      item =>
                        item.id ===
                        tournamentId
                    );

                  if (!tournament) {
                    notice(
                      lifecycleMessage,
                      'Không tìm thấy giải đấu đã chọn.',
                      true
                    );

                    return;
                  }

                  const currentStatus =
                    upper(
                      tournament.status
                    );

                  const allowed =
                    lifecycleTransitions[
                      currentStatus
                    ] ||
                    [];

                  if (
                    !allowed.includes(
                      newStatus
                    )
                  ) {
                    notice(
                      lifecycleMessage,
                      'Chuyển trạng thái này không hợp lệ.',
                      true
                    );

                    return;
                  }

                  state.writeBusy =
                    true;

                  lifecycleSubmit.disabled =
                    true;

                  lifecycleTournament.disabled =
                    true;

                  lifecycleTarget.disabled =
                    true;

                  lifecycleSubmit.textContent =
                    'Đang chuyển…';

                  try {
                    const {
                      data,
                      error
                    } =
                      await client.rpc(
                        'change_tournament_status',
                        {
                          p_tournament_id:
                            tournamentId,
                          p_new_status:
                            newStatus,
                          p_reason:
                            lifecycleReason.value.trim() ||
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
                        'Máy chủ không xác nhận chuyển trạng thái.'
                      );
                    }

                    await load();

                    state.page =
                      'tournaments';

                    render();

                    notice(
                      $('global-message'),
                      'Đã chuyển trạng thái giải đấu thành công. ⇄',
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
                        'Không chuyển được trạng thái giải. ' +
                        String(
                          error.message
                        ).slice(
                          0,
                          300
                        );
                    }

                    notice(
                      lifecycleMessage,
                      text,
                      true
                    );
                  } finally {
                    state.writeBusy =
                      false;

                    lifecycleSubmit.disabled =
                      false;

                    lifecycleTournament.disabled =
                      false;

                    lifecycleTarget.disabled =
                      false;

                    lifecycleSubmit.textContent =
                      'Xác nhận chuyển trạng thái';
                  }
                }
              );

              lifecycleBody.append(
                lifecycleDescription,
                lifecycleMessage,
                lifecycleForm
              );

              lifecycleWrapper.append(
                lifecycleToggle,
                lifecycleBody
              );

              
              // TOURNAMENT REGISTRATION UI V1F.1
              const registrationWrapper =
                el(
                  'section',
                  null,
                  'app-action app-action-success mb-4'
                );

              const registrationToggle =
                button(
                  '👥 Đăng ký VĐV',
                  () => {
                    const opening =
                      registrationBody.hidden;

                    if (opening) {
                      closeTournamentDetail();

                      createBody.hidden =
                        true;

                      createToggle.textContent =
                        '＋ Tạo giải đấu';

                      editBody.hidden =
                        true;

                      editToggle.textContent =
                        '✎ Sửa thông tin giải';

                      lifecycleBody.hidden =
                        true;

                      lifecycleToggle.textContent =
                        '⇄ Chuyển trạng thái giải';
                    }

                    registrationBody.hidden =
                      !opening;

                    registrationToggle.textContent =
                      registrationBody.hidden
                        ? '👥 Đăng ký VĐV'
                        : '− Thu gọn đăng ký VĐV';
                  },
                  'app-action-toggle'
                );

              registrationToggle.type =
                'button';

              const registrationBody =
                el(
                  'div',
                  null,
                  'app-action-body'
                );

              registrationBody.hidden =
                true;

              const registrationDescription =
                el(
                  'p',
                  'Đăng ký VĐV vào nội dung thi đấu. Phí phải thu được chụp lại tại thời điểm đăng ký.',
                  'notice'
                );

              const registrationMessage =
                el(
                  'div'
                );

              registrationMessage.hidden =
                true;

              registrationMessage.setAttribute(
                'role',
                'alert'
              );

              const registrationForm =
                el(
                  'form'
                );

              const registrationGrid =
                el(
                  'div',
                  null,
                  'form-grid'
                );

              const registrationTournamentGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const registrationTournamentLabel =
                el(
                  'label',
                  'Giải đấu'
                );

              registrationTournamentLabel.htmlFor =
                'tournament-registration-tournament';

              const registrationTournament =
                el(
                  'select',
                  null,
                  'field'
                );

              registrationTournament.id =
                'tournament-registration-tournament';

              registrationTournament.required =
                true;

              registrationTournament.append(
                new Option(
                  '— Chọn giải đang nhận đăng ký —',
                  ''
                )
              );

              rows(
                'tournaments'
              )
                .filter(
                  tournament =>
                    [
                      'DU_KIEN',
                      'MO_DANG_KY'
                    ].includes(
                      upper(
                        tournament.status
                      )
                    )
                )
                .slice()
                .sort(
                  (a, b) =>
                    String(
                      b.start_date ||
                      ''
                    ).localeCompare(
                      String(
                        a.start_date ||
                        ''
                      )
                    )
                )
                .forEach(
                  tournament => {
                    const status =
                      upper(
                        tournament.status
                      );

                    const statusLabel =
                      status ===
                        'DU_KIEN'
                        ? 'Dự kiến'
                        : 'Mở đăng ký';

                    const label =
                      raw(
                        tournament.name
                      ) +
                      (
                        tournament.code
                          ? ' · ' +
                            raw(
                              tournament.code
                            )
                          : ''
                      ) +
                      ' · ' +
                      statusLabel;

                    registrationTournament.append(
                      new Option(
                        label,
                        tournament.id
                      )
                    );
                  }
                );

              registrationTournamentGroup.append(
                registrationTournamentLabel,
                registrationTournament
              );

              const registrationEventGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const registrationEventLabel =
                el(
                  'label',
                  'Nội dung thi đấu'
                );

              registrationEventLabel.htmlFor =
                'tournament-registration-event';

              const registrationEvent =
                el(
                  'input',
                  null,
                  'field'
                );

              registrationEvent.id =
                'tournament-registration-event';

              registrationEvent.type =
                'text';

              registrationEvent.required =
                true;

              registrationEvent.maxLength =
                200;

              registrationEvent.placeholder =
                'Ví dụ: Đôi nam nữ';

              registrationEventGroup.append(
                registrationEventLabel,
                registrationEvent
              );

              const registrationPlayers =
                rows(
                  'players'
                )
                  .filter(
                    player =>
                      upper(
                        player.status
                      ) ===
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

              const registrationPlayerGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const registrationPlayerLabel =
                el(
                  'label',
                  'VĐV chính'
                );

              registrationPlayerLabel.htmlFor =
                'tournament-registration-player';

              const registrationPlayer =
                el(
                  'select',
                  null,
                  'field'
                );

              registrationPlayer.id =
                'tournament-registration-player';

              registrationPlayer.required =
                true;

              registrationPlayerGroup.append(
                registrationPlayerLabel,
                registrationPlayer
              );

              const registrationPartnerGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const registrationPartnerLabel =
                el(
                  'label',
                  'Partner'
                );

              registrationPartnerLabel.htmlFor =
                'tournament-registration-partner';

              const registrationPartner =
                el(
                  'select',
                  null,
                  'field'
                );

              registrationPartner.id =
                'tournament-registration-partner';

              registrationPartnerGroup.append(
                registrationPartnerLabel,
                registrationPartner
              );

              const refreshRegistrationPlayers =
                () => {
                  const selectedPlayer =
                    registrationPlayer.value;

                  const selectedPartner =
                    registrationPartner.value;

                  registrationPlayer.replaceChildren(
                    new Option(
                      '— Chọn VĐV —',
                      ''
                    )
                  );

                  registrationPlayers.forEach(
                    player => {
                      registrationPlayer.append(
                        new Option(
                          raw(
                            player.full_name
                          ) ||
                            player.id,
                          player.id
                        )
                      );
                    }
                  );

                  if (
                    selectedPlayer &&
                    registrationPlayers.some(
                      player =>
                        player.id ===
                        selectedPlayer
                    )
                  ) {
                    registrationPlayer.value =
                      selectedPlayer;
                  }

                  registrationPartner.replaceChildren(
                    new Option(
                      '— Không có / chọn sau —',
                      ''
                    )
                  );

                  registrationPlayers
                    .filter(
                      player =>
                        player.id !==
                        registrationPlayer.value
                    )
                    .forEach(
                      player => {
                        registrationPartner.append(
                          new Option(
                            raw(
                              player.full_name
                            ) ||
                              player.id,
                            player.id
                          )
                        );
                      }
                    );

                  if (
                    selectedPartner &&
                    selectedPartner !==
                      registrationPlayer.value &&
                    registrationPlayers.some(
                      player =>
                        player.id ===
                        selectedPartner
                    )
                  ) {
                    registrationPartner.value =
                      selectedPartner;
                  }
                };

              refreshRegistrationPlayers();

              registrationPlayer.addEventListener(
                'change',
                () => {
                  refreshRegistrationPlayers();
                }
              );

              const registrationFeeGroup =
                el(
                  'div',
                  null,
                  'form-group'
                );

              const registrationFeeLabel =
                el(
                  'label',
                  'Phí phải thu'
                );

              registrationFeeLabel.htmlFor =
                'tournament-registration-fee';

              const registrationFee =
                el(
                  'input',
                  null,
                  'field'
                );

              registrationFee.id =
                'tournament-registration-fee';

              registrationFee.type =
                'number';

              registrationFee.min =
                '0';

              registrationFee.step =
                '1000';

              registrationFee.required =
                true;

              registrationFee.value =
                '0';

              registrationFeeGroup.append(
                registrationFeeLabel,
                registrationFee
              );

              registrationGrid.append(
                registrationTournamentGroup,
                registrationEventGroup,
                registrationPlayerGroup,
                registrationPartnerGroup,
                registrationFeeGroup
              );

              const registrationHint =
                el(
                  'p',
                  'Chọn giải để lấy phí mặc định và gợi ý thể thức.',
                  'muted mt-3'
                );

              const refreshRegistrationTournament =
                () => {
                  const tournament =
                    rows(
                      'tournaments'
                    ).find(
                      item =>
                        item.id ===
                        registrationTournament.value
                    );

                  if (!tournament) {
                    registrationFee.value =
                      '0';

                    registrationHint.textContent =
                      'Chọn giải để lấy phí mặc định và gợi ý thể thức.';

                    return;
                  }

                  registrationFee.value =
                    String(
                      Number(
                        tournament.registration_fee ||
                        0
                      )
                    );

                  if (
                    !registrationEvent.value.trim() &&
                    tournament.format
                  ) {
                    registrationEvent.value =
                      raw(
                        tournament.format
                      );
                  }

                  registrationHint.textContent =
                    'Phí mặc định: ' +
                    Number(
                      tournament.registration_fee ||
                      0
                    ).toLocaleString(
                      'vi-VN'
                    ) +
                    'đ · Có thể điều chỉnh riêng cho registration này.';
                };

              registrationTournament.addEventListener(
                'change',
                () => {
                  notice(
                    registrationMessage,
                    '',
                    false
                  );

                  refreshRegistrationTournament();
                }
              );

              const registrationActions =
                el(
                  'div',
                  null,
                  'form-actions'
                );

              const registrationSubmit =
                el(
                  'button',
                  'Đăng ký VĐV',
                  'btn primary'
                );

              registrationSubmit.type =
                'submit';

              const registrationReset =
                button(
                  'Đặt lại',
                  () => {
                    registrationForm.reset();

                    registrationFee.value =
                      '0';

                    refreshRegistrationPlayers();

                    registrationHint.textContent =
                      'Chọn giải để lấy phí mặc định và gợi ý thể thức.';

                    notice(
                      registrationMessage,
                      '',
                      false
                    );
                  }
                );

              registrationReset.type =
                'button';

              registrationActions.append(
                registrationSubmit,
                registrationReset
              );

              registrationForm.append(
                registrationGrid,
                registrationHint,
                registrationActions
              );

              registrationForm.addEventListener(
                'submit',
                async event => {
                  event.preventDefault();

                  if (
                    state.writeBusy
                  ) {
                    return;
                  }

                  const tournamentId =
                    registrationTournament.value;

                  const playerId =
                    registrationPlayer.value;

                  const partnerId =
                    registrationPartner.value ||
                    null;

                  const eventName =
                    registrationEvent.value.trim();

                  if (!tournamentId) {
                    notice(
                      registrationMessage,
                      'Vui lòng chọn giải đấu.',
                      true
                    );

                    return;
                  }

                  if (!eventName) {
                    notice(
                      registrationMessage,
                      'Vui lòng nhập nội dung thi đấu.',
                      true
                    );

                    return;
                  }

                  if (!playerId) {
                    notice(
                      registrationMessage,
                      'Vui lòng chọn VĐV.',
                      true
                    );

                    return;
                  }

                  if (
                    partnerId &&
                    partnerId ===
                      playerId
                  ) {
                    notice(
                      registrationMessage,
                      'VĐV và partner không được trùng nhau.',
                      true
                    );

                    return;
                  }

                  const feeDue =
                    Number(
                      registrationFee.value
                    );

                  if (
                    !Number.isFinite(
                      feeDue
                    ) ||
                    feeDue < 0
                  ) {
                    notice(
                      registrationMessage,
                      'Phí phải thu phải là số không âm.',
                      true
                    );

                    return;
                  }

                  state.writeBusy =
                    true;

                  registrationSubmit.disabled =
                    true;

                  registrationReset.disabled =
                    true;

                  registrationTournament.disabled =
                    true;

                  registrationPlayer.disabled =
                    true;

                  registrationPartner.disabled =
                    true;

                  registrationSubmit.textContent =
                    'Đang đăng ký…';

                  try {
                    const {
                      data,
                      error
                    } =
                      await client.rpc(
                        'create_tournament_registration',
                        {
                          p_tournament_id:
                            tournamentId,
                          p_player_id:
                            playerId,
                          p_event_name:
                            eventName,
                          p_partner_player_id:
                            partnerId,
                          p_fee_due:
                            feeDue
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
                        'Máy chủ không xác nhận đăng ký VĐV.'
                      );
                    }

                    await load();

                    state.page =
                      'tournaments';

                    render();

                    notice(
                      $('global-message'),
                      'Đã đăng ký VĐV vào giải thành công. 👥',
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
                      PLAYER_ALREADY_REGISTERED_FOR_EVENT:
                        'VĐV này đã có đăng ký đang hoạt động trong nội dung.',
                      PARTNER_ALREADY_REGISTERED_FOR_EVENT:
                        'Partner này đã có đăng ký đang hoạt động trong nội dung.',
                      PARTNER_CANNOT_BE_SELF:
                        'VĐV và partner không được trùng nhau.',
                      PLAYER_INACTIVE:
                        'VĐV hiện không còn hoạt động.',
                      PARTNER_INACTIVE:
                        'Partner hiện không còn hoạt động.',
                      TOURNAMENT_NOT_OPEN_FOR_REGISTRATION:
                        'Giải hiện không còn nhận đăng ký.'
                    };

                    let text =
                      explain(
                        error
                      );

                    Object.entries(
                      friendly
                    ).some(
                      ([key, value]) => {
                        if (
                          code.includes(
                            key
                          )
                        ) {
                          text =
                            value;

                          return true;
                        }

                        return false;
                      }
                    );

                    notice(
                      registrationMessage,
                      text,
                      true
                    );
                  } finally {
                    state.writeBusy =
                      false;

                    registrationSubmit.disabled =
                      false;

                    registrationReset.disabled =
                      false;

                    registrationTournament.disabled =
                      false;

                    registrationPlayer.disabled =
                      false;

                    registrationPartner.disabled =
                      false;

                    registrationSubmit.textContent =
                      'Đăng ký VĐV';
                  }
                }
              );

              registrationBody.append(
                registrationDescription,
                registrationMessage,
                registrationForm
              );

              registrationWrapper.append(
                registrationToggle,
                registrationBody
              );

              /*
                Không sửa sâu callback V1A/V1B/V1C.
                Chỉ thêm listener cùng cấp để đóng Registration
                khi Admin mở action khác.
              */
              createToggle.addEventListener(
                'click',
                () => {
                  registrationBody.hidden =
                    true;

                  registrationToggle.textContent =
                    '👥 Đăng ký VĐV';
                }
              );

              editToggle.addEventListener(
                'click',
                () => {
                  registrationBody.hidden =
                    true;

                  registrationToggle.textContent =
                    '👥 Đăng ký VĐV';
                }
              );

              lifecycleToggle.addEventListener(
                'click',
                () => {
                  registrationBody.hidden =
                    true;

                  registrationToggle.textContent =
                    '👥 Đăng ký VĐV';
                }
              );
              closeTournamentAdminActions =
                () => {
                  createBody.hidden =
                    true;

                  createToggle.textContent =
                    '＋ Tạo giải đấu';

                  editBody.hidden =
                    true;

                  editToggle.textContent =
                    '✎ Sửa thông tin giải';

                  lifecycleBody.hidden =
                    true;

                  lifecycleToggle.textContent =
                    '⇄ Chuyển trạng thái giải';
                  registrationBody.hidden =
                    true;

                  registrationToggle.textContent =
                    '👥 Đăng ký VĐV';
                };

              root.append(
                createWrapper,
                editWrapper,
                lifecycleWrapper,
                registrationWrapper
              );
            }

            // MEMBER SELF TOURNAMENT REGISTRATION UI V1M
        if (
          upper(state.profile?.role) === 'MEMBER' &&
          state.profile?.is_active === true
        ) {
          const myRegistrationWrapper =
            el(
              'section',
              null,
              'app-action app-action-success mb-4'
            );

          const myRegistrationBody =
            el(
              'div',
              null,
              'app-action-body'
            );

          myRegistrationBody.hidden =
            true;

          const myRegistrationToggle =
            button(
              '📝 Đăng ký giải của tôi',
              () => {
                const opening =
                  myRegistrationBody.hidden;

                if (opening) {
                  closeTournamentDetail();
                }

                myRegistrationBody.hidden =
                  !opening;

                myRegistrationToggle.textContent =
                  myRegistrationBody.hidden
                    ? '📝 Đăng ký giải của tôi'
                    : '− Thu gọn đăng ký';
              },
              'app-action-toggle'
            );

          const myRegistrationDescription =
            el(
              'p',
              'Đăng ký chính bạn tham gia giải. Hệ thống tự xác định VĐV từ tài khoản đăng nhập.',
              'notice'
            );

          const myRegistrationMessage =
            el(
              'div'
            );

          myRegistrationMessage.hidden =
            true;

          myRegistrationMessage.setAttribute(
            'role',
            'alert'
          );

          const myRegistrationForm =
            el(
              'form'
            );

          const myRegistrationGrid =
            el(
              'div',
              null,
              'form-grid'
            );

          const myPlayer =
            rows(
              'players'
            ).find(
              player =>
                player.id ===
                state.profile?.player_id
            );

          const myPlayerGroup =
            el(
              'div',
              null,
              'form-group'
            );

          const myPlayerLabel =
            el(
              'label',
              'VĐV đăng ký'
            );

          const myPlayerValue =
            el(
              'div',
              myPlayer
                ? raw(
                    myPlayer.full_name
                  )
                : 'Chưa liên kết tài khoản với VĐV.',
              'field'
            );

          myPlayerGroup.append(
            myPlayerLabel,
            myPlayerValue
          );

          const myTournamentGroup =
            el(
              'div',
              null,
              'form-group'
            );

          const myTournamentLabel =
            el(
              'label',
              'Giải đấu'
            );

          myTournamentLabel.htmlFor =
            'my-tournament-registration-tournament';

          const myTournament =
            el(
              'select',
              null,
              'field'
            );

          myTournament.id =
            'my-tournament-registration-tournament';

          myTournament.required =
            true;

          myTournament.append(
            new Option(
              '— Chọn giải đang mở đăng ký —',
              ''
            )
          );

          rows(
            'tournaments'
          )
            .filter(
              tournament =>
                upper(
                  tournament.status
                ) ===
                'MO_DANG_KY'
            )
            .slice()
            .sort(
              (a, b) =>
                String(
                  b.start_date ||
                  ''
                ).localeCompare(
                  String(
                    a.start_date ||
                    ''
                  )
                )
            )
            .forEach(
              tournament => {
                myTournament.append(
                  new Option(
                    raw(
                      tournament.name
                    ) +
                      (
                        tournament.code
                          ? ' · ' +
                            raw(
                              tournament.code
                            )
                          : ''
                      ),
                    tournament.id
                  )
                );
              }
            );

          myTournamentGroup.append(
            myTournamentLabel,
            myTournament
          );

          const myEventGroup =
            el(
              'div',
              null,
              'form-group'
            );

          const myEventLabel =
            el(
              'label',
              'Nội dung thi đấu'
            );

          myEventLabel.htmlFor =
            'my-tournament-registration-event';

          const myEvent =
            el(
              'input',
              null,
              'field'
            );

          myEvent.id =
            'my-tournament-registration-event';

          myEvent.type =
            'text';

          myEvent.required =
            true;

          myEvent.maxLength =
            200;

          myEvent.placeholder =
            'Ví dụ: Đôi';

          myEventGroup.append(
            myEventLabel,
            myEvent
          );

          const myPartnerGroup =
            el(
              'div',
              null,
              'form-group'
            );

          const myPartnerLabel =
            el(
              'label',
              'Partner'
            );

          myPartnerLabel.htmlFor =
            'my-tournament-registration-partner';

          const myPartner =
            el(
              'select',
              null,
              'field'
            );

          myPartner.id =
            'my-tournament-registration-partner';

          myPartner.append(
            new Option(
              '— Không có / chọn sau —',
              ''
            )
          );

          rows(
            'players'
          )
            .filter(
              player =>
                upper(
                  player.status
                ) ===
                  'ACTIVE' &&
                player.id !==
                  state.profile?.player_id
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
            )
            .forEach(
              player => {
                myPartner.append(
                  new Option(
                    raw(
                      player.full_name
                    ),
                    player.id
                  )
                );
              }
            );

          myPartnerGroup.append(
            myPartnerLabel,
            myPartner
          );

          const myFeeGroup =
            el(
              'div',
              null,
              'form-group'
            );

          const myFeeLabel =
            el(
              'label',
              'Phí đăng ký'
            );

          const myFeeValue =
            el(
              'div',
              '—',
              'field'
            );

          myFeeGroup.append(
            myFeeLabel,
            myFeeValue
          );

          const refreshMyTournament =
            () => {
              const tournament =
                rows(
                  'tournaments'
                ).find(
                  item =>
                    item.id ===
                    myTournament.value
                );

              if (!tournament) {
                myFeeValue.textContent =
                  '—';

                return;
              }

              myFeeValue.textContent =
                Number(
                  tournament.registration_fee ||
                  0
                ).toLocaleString(
                  'vi-VN'
                ) +
                'đ';

              if (
                !myEvent.value.trim() &&
                tournament.format
              ) {
                myEvent.value =
                  raw(
                    tournament.format
                  );
              }
            };

          myTournament.addEventListener(
            'change',
            () => {
              notice(
                myRegistrationMessage,
                '',
                false
              );

              refreshMyTournament();
            }
          );

          const myRegistrationActions =
            el(
              'div',
              null,
              'form-actions'
            );

          const myRegistrationSubmit =
            el(
              'button',
              'Đăng ký tham gia',
              'btn primary'
            );

          myRegistrationSubmit.type =
            'submit';

          myRegistrationSubmit.disabled =
            !state.profile?.player_id;

          myRegistrationActions.append(
            myRegistrationSubmit
          );

          myRegistrationGrid.append(
            myPlayerGroup,
            myTournamentGroup,
            myEventGroup,
            myPartnerGroup,
            myFeeGroup
          );

          myRegistrationForm.append(
            myRegistrationGrid,
            myRegistrationActions
          );

          myRegistrationForm.addEventListener(
            'submit',
            async event => {
              event.preventDefault();

              if (
                state.writeBusy
              ) {
                return;
              }

              const tournamentId =
                myTournament.value;

              const eventName =
                myEvent.value.trim();

              const partnerId =
                myPartner.value ||
                null;

              if (!tournamentId) {
                notice(
                  myRegistrationMessage,
                  'Vui lòng chọn giải đấu.',
                  true
                );

                return;
              }

              if (!eventName) {
                notice(
                  myRegistrationMessage,
                  'Vui lòng nhập nội dung thi đấu.',
                  true
                );

                return;
              }

              state.writeBusy =
                true;

              myRegistrationSubmit.disabled =
                true;

              myTournament.disabled =
                true;

              myEvent.disabled =
                true;

              myPartner.disabled =
                true;

              myRegistrationSubmit.textContent =
                'Đang đăng ký…';

              try {
                const {
                  data,
                  error
                } =
                  await client.rpc(
                    'create_my_tournament_registration',
                    {
                      p_tournament_id:
                        tournamentId,
                      p_event_name:
                        eventName,
                      p_partner_player_id:
                        partnerId
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
                    'Máy chủ không xác nhận đăng ký.'
                  );
                }

                await load();

                state.page =
                  'tournaments';

                render();

                notice(
                  $('global-message'),
                  'Đã đăng ký tham gia giải thành công. 📝',
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
                  PLAYER_LINK_REQUIRED:
                    'Tài khoản chưa được liên kết với VĐV.',
                  MEMBER_ROLE_REQUIRED:
                    'Tài khoản này không phải thành viên.',
                  CLUB_PLAYER_REQUIRED:
                    'VĐV của tài khoản phải là thành viên CLUB.',
                  PLAYER_INACTIVE:
                    'VĐV hiện không còn hoạt động.',
                  PLAYER_ALREADY_REGISTERED_FOR_EVENT:
                    'Bạn đã có đăng ký đang hoạt động trong nội dung này.',
                  PARTNER_ALREADY_REGISTERED_FOR_EVENT:
                    'Partner này đã có đăng ký đang hoạt động trong nội dung.',
                  PARTNER_CANNOT_BE_SELF:
                    'Bạn không thể chọn chính mình làm partner.',
                  PARTNER_NOT_FOUND:
                    'Không tìm thấy partner đã chọn.',
                  PARTNER_INACTIVE:
                    'Partner hiện không còn hoạt động.',
                  TOURNAMENT_NOT_OPEN_FOR_MEMBER_REGISTRATION:
                    'Giải hiện không mở đăng ký cho thành viên.'
                };

                let text =
                  explain(
                    error
                  );

                Object.entries(
                  friendly
                ).some(
                  ([key, value]) => {
                    if (
                      code.includes(
                        key
                      )
                    ) {
                      text =
                        value;

                      return true;
                    }

                    return false;
                  }
                );

                notice(
                  myRegistrationMessage,
                  text,
                  true
                );
              } finally {
                state.writeBusy =
                  false;

                myRegistrationSubmit.disabled =
                  !state.profile?.player_id;

                myTournament.disabled =
                  false;

                myEvent.disabled =
                  false;

                myPartner.disabled =
                  false;

                myRegistrationSubmit.textContent =
                  'Đăng ký tham gia';
              }
            }
          );

          myRegistrationBody.append(
            myRegistrationDescription,
            myRegistrationMessage,
            myRegistrationForm
          );

          myRegistrationWrapper.append(
            myRegistrationToggle,
            myRegistrationBody
          );

          root.append(
            myRegistrationWrapper
          );
        }
        // TOURNAMENT DETAIL UI V1D
            const tournamentRows =
              rows(
                'tournaments'
              )
                .slice()
                .sort(
                  (a, b) =>
                    String(
                      b.start_date ||
                      ''
                    ).localeCompare(
                      String(
                        a.start_date ||
                        ''
                      )
                    )
                );

            if (
              !tournamentRows.length
            ) {
              root.append(
                el(
                  'p',
                  isAdmin()
                    ? '🏆 Chưa có giải đấu. Mở “Tạo giải đấu” để khởi động giải đầu tiên.'
                    : '🏆 Chưa có giải đấu nào được tạo.',
                  'notice'
                )
              );

              break;
            }

            const tournamentMatches =
              rows(
                'matches'
              );

            const tournamentMatchPlayers =
              rows(
                'match_players'
              );

            const tournamentStatusLabels = {
              DU_KIEN:
                '🗓️ Dự kiến',
              MO_DANG_KY:
                '📝 Mở đăng ký',
              DANG_DIEN_RA:
                '🔥 Đang diễn ra',
              DA_KET_THUC:
                '🏁 Đã kết thúc',
              DA_QUYET_TOAN:
                '✅ Đã quyết toán',
              HUY:
                '⛔ Đã hủy'
            };

            const tournamentStatusClasses = {
              DU_KIEN:
                'planned',
              MO_DANG_KY:
                'registration',
              DANG_DIEN_RA:
                'live',
              DA_KET_THUC:
                'finished',
              DA_QUYET_TOAN:
                'settled',
              HUY:
                'cancelled'
            };

            const tournamentMatchStatusLabels = {
              PENDING:
                'Chờ duyệt',
              APPROVED:
                'Đã duyệt',
              INVALID:
                'Không hợp lệ',
              VOIDED:
                'Đã hủy'
            };

            const tournamentDateText =
              value => {
                if (!value) {
                  return '—';
                }

                const text =
                  String(
                    value
                  ).slice(
                    0,
                    10
                  );

                const parts =
                  text.split(
                    '-'
                  );

                if (
                  parts.length !==
                  3
                ) {
                  return text;
                }

                return (
                  parts[2] +
                  '/' +
                  parts[1] +
                  '/' +
                  parts[0]
                );
              };

            const tournamentList =
              el(
                'section',
                null,
                'tournament-list'
              );

            const tournamentHeading =
              el(
                'div',
                null,
                'tournament-list-heading'
              );

            tournamentHeading.append(
              el(
                'h3',
                '🏆 Các giải đấu'
              ),
              el(
                'p',
                tournamentRows.length +
                  ' giải đấu · Bấm “Xem chi tiết” để mở thông tin và các trận.',
                'muted'
              )
            );

            tournamentList.append(
              tournamentHeading
            );

            closeTournamentCard =
              tournamentId => {
                const entry =
                  tournamentCards.get(
                    tournamentId
                  );

                if (!entry) {
                  return;
                }

                entry.body.hidden =
                  true;

                entry.card.classList.remove(
                  'tournament-card-open'
                );

                entry.toggle.textContent =
                  'Xem chi tiết';
              };

            closeTournamentDetail =
              () => {
                if (!openedTournamentId) {
                  return;
                }

                closeTournamentCard(
                  openedTournamentId
                );

                openedTournamentId =
                  null;
              };

            tournamentRows.forEach(
              tournament => {
                const status =
                  upper(
                    tournament.status
                  );

                const statusLabel =
                  tournamentStatusLabels[
                    status
                  ] ||
                  raw(
                    tournament.status
                  ) ||
                  '—';

                const statusClass =
                  tournamentStatusClasses[
                    status
                  ] ||
                  'planned';

                const matchesForTournament =
                  tournamentMatches
                    .filter(
                      match =>
                        match.tournament_id ===
                        tournament.id
                    )
                    .slice()
                    .sort(
                      (a, b) => {
                        const dateCompare =
                          String(
                            b.played_at ||
                            ''
                          ).localeCompare(
                            String(
                              a.played_at ||
                              ''
                            )
                          );

                        if (
                          dateCompare !==
                          0
                        ) {
                          return dateCompare;
                        }

                        return (
                          Number(
                            b.match_number ||
                            0
                          ) -
                          Number(
                            a.match_number ||
                            0
                          )
                        );
                      }
                    );

                const matchIds =
                  new Set(
                    matchesForTournament.map(
                      match =>
                        match.id
                    )
                  );

                const linksForTournament =
                  tournamentMatchPlayers.filter(
                    link =>
                      matchIds.has(
                        link.match_id
                      )
                  );

                const participantIds =
                  new Set(
                    linksForTournament
                      .map(
                        link =>
                          link.player_id
                      )
                      .filter(
                        Boolean
                      )
                  );

                const statusCounts = {
                  PENDING: 0,
                  APPROVED: 0,
                  INVALID: 0,
                  VOIDED: 0
                };

                matchesForTournament.forEach(
                  match => {
                    const matchStatus =
                      upper(
                        match.status
                      );

                    if (
                      Object.prototype.hasOwnProperty.call(
                        statusCounts,
                        matchStatus
                      )
                    ) {
                      statusCounts[
                        matchStatus
                      ] += 1;
                    }
                  }
                );

                const card =
                  el(
                    'article',
                    null,
                    'tournament-card tournament-card-' +
                      statusClass
                  );

                const cardHeader =
                  el(
                    'div',
                    null,
                    'tournament-card-header'
                  );

                const titleArea =
                  el(
                    'div',
                    null,
                    'tournament-card-title'
                  );

                titleArea.append(
                  el(
                    'h4',
                    raw(
                      tournament.name
                    ) ||
                      'Giải đấu'
                  )
                );

                if (
                  tournament.code
                ) {
                  titleArea.append(
                    el(
                      'span',
                      raw(
                        tournament.code
                      ),
                      'tournament-code'
                    )
                  );
                }

                const statusBadge =
                  el(
                    'span',
                    statusLabel,
                    'tournament-status tournament-status-' +
                      statusClass
                  );

                cardHeader.append(
                  titleArea,
                  statusBadge
                );
                // TOURNAMENT SUMMARY REGISTRATION V1E
                const summaryActiveRegistrations =
                  rows(
                    'tournament_registrations'
                  ).filter(
                    registration =>
                      registration.tournament_id ===
                        tournament.id &&
                      upper(
                        registration.status
                      ) !==
                        'HUY'
                  );

                const summaryRegisteredPlayerIds =
                  new Set();

                summaryActiveRegistrations.forEach(
                  registration => {
                    if (
                      registration.player_id
                    ) {
                      summaryRegisteredPlayerIds.add(
                        registration.player_id
                      );
                    }

                    if (
                      registration.partner_player_id
                    ) {
                      summaryRegisteredPlayerIds.add(
                        registration.partner_player_id
                      );
                    }
                  }
                );


                const summary =
                  el(
                    'div',
                    null,
                    'tournament-summary-grid'
                  );

                const summaryItem =
                  (
                    icon,
                    label,
                    value
                  ) => {
                    const item =
                      el(
                        'div',
                        null,
                        'tournament-summary-item'
                      );

                    item.append(
                      el(
                        'span',
                        icon,
                        'tournament-summary-icon'
                      ),
                      el(
                        'span',
                        label,
                        'tournament-summary-label'
                      ),
                      el(
                        'strong',
                        value,
                        'tournament-summary-value'
                      )
                    );

                    return item;
                  };

                const dateRange =
                  tournamentDateText(
                    tournament.start_date
                  ) +
                  (
                    tournament.end_date &&
                    tournament.end_date !==
                      tournament.start_date
                      ? ' → ' +
                        tournamentDateText(
                          tournament.end_date
                        )
                      : ''
                  );

                summary.append(
                  summaryItem(
                    '📅',
                    'Thời gian',
                    dateRange
                  ),
                  summaryItem(
                    '📍',
                    'Địa điểm',
                    raw(
                      tournament.location
                    ) ||
                      '—'
                  ),
                  summaryItem(
                    '🏓',
                    'Trận đấu',
                    String(
                      matchesForTournament.length
                    )
                  ),
                  summaryItem(
                    '👥',
                    'Đã đăng ký',
                    String(
                      summaryRegisteredPlayerIds.size
                    )
                  ),
                  summaryItem(
                    '🎾',
                    'Đã thi đấu',
                    String(
                      participantIds.size
                    )
                  )
                );

                const toggleRow =
                  el(
                    'div',
                    null,
                    'tournament-card-actions'
                  );

                const detailToggle =
                  button(
                    'Xem chi tiết',
                    () => {
                      const opening =
                        detailBody.hidden;

                      if (
                        openedTournamentId &&
                        openedTournamentId !==
                          tournament.id
                      ) {
                        closeTournamentCard(
                          openedTournamentId
                        );
                      }

                      if (opening) {
                        closeTournamentAdminActions();

                        detailBody.hidden =
                          false;

                        card.classList.add(
                          'tournament-card-open'
                        );

                        detailToggle.textContent =
                          'Thu gọn';

                        openedTournamentId =
                          tournament.id;
                      } else {
                        closeTournamentCard(
                          tournament.id
                        );

                        openedTournamentId =
                          null;
                      }
                    },
                    'tournament-detail-toggle'
                  );

                detailToggle.type =
                  'button';

                toggleRow.append(
                  detailToggle
                );

                const detailBody =
                  el(
                    'div',
                    null,
                    'tournament-detail-body'
                  );

                detailBody.hidden =
                  true;

                const infoGrid =
                  el(
                    'div',
                    null,
                    'tournament-detail-info'
                  );

                const detailItem =
                  (
                    label,
                    value
                  ) => {
                    const item =
                      el(
                        'div',
                        null,
                        'tournament-detail-item'
                      );

                    item.append(
                      el(
                        'span',
                        label,
                        'muted'
                      ),
                      el(
                        'strong',
                        value
                      )
                    );

                    return item;
                  };

                infoGrid.append(
                  detailItem(
                    'Loại sự kiện',
                    raw(
                      tournament.event_category
                    ) ||
                      '—'
                  ),
                  detailItem(
                    'Thể thức',
                    raw(
                      tournament.format
                    ) ||
                      '—'
                  ),
                  detailItem(
                    'Phí đăng ký',
                    Number(
                      tournament.registration_fee ||
                      0
                    ).toLocaleString(
                      'vi-VN'
                    ) +
                      'đ'
                  ),
                  detailItem(
                    'Trạng thái',
                    statusLabel
                  )
                );

                if (
                  tournament.notes
                ) {
                  infoGrid.append(
                    detailItem(
                      'Ghi chú',
                      raw(
                        tournament.notes
                      )
                    )
                  );
                }

                const matchStats =
                  el(
                    'div',
                    null,
                    'tournament-match-stats'
                  );

                matchStats.append(
                  el(
                    'span',
                    '✅ Đã duyệt: ' +
                      statusCounts.APPROVED,
                    'tournament-match-stat'
                  ),
                  el(
                    'span',
                    '⏳ Chờ duyệt: ' +
                      statusCounts.PENDING,
                    'tournament-match-stat'
                  ),
                  el(
                    'span',
                    '⚠️ Không hợp lệ: ' +
                      statusCounts.INVALID,
                    'tournament-match-stat'
                  ),
                  el(
                    'span',
                    '🚫 Đã hủy: ' +
                      statusCounts.VOIDED,
                    'tournament-match-stat'
                  )
                );
                // TOURNAMENT REGISTRATION LIST V1G
                const registrationsForTournament =
                  rows(
                    'tournament_registrations'
                  )
                    .filter(
                      registration =>
                        registration.tournament_id ===
                        tournament.id
                    )
                    .slice()
                    .sort(
                      (a, b) =>
                        String(
                          a.created_at ||
                          ''
                        ).localeCompare(
                          String(
                            b.created_at ||
                            ''
                          )
                        )
                    );

                const activeRegistrations =
                  registrationsForTournament.filter(
                    registration =>
                      upper(
                        registration.status
                      ) !==
                      'HUY'
                  );

                const registeredPlayerIds =
                  new Set();

                activeRegistrations.forEach(
                  registration => {
                    if (
                      registration.player_id
                    ) {
                      registeredPlayerIds.add(
                        registration.player_id
                      );
                    }

                    if (
                      registration.partner_player_id
                    ) {
                      registeredPlayerIds.add(
                        registration.partner_player_id
                      );
                    }
                  }
                );

                const registrationSection =
                  el(
                    'section',
                    null,
                    'tournament-registration-list'
                  );

                const registrationListBody =
                  el(
                    'div',
                    null,
                    'tournament-registration-list-body'
                  );

                registrationListBody.hidden =
                  true;

                const registrationListToggle =
                  button(
                    '👥 Đăng ký: ' +
                      activeRegistrations.length +
                      ' cặp / ' +
                      registeredPlayerIds.size +
                      ' VĐV',
                    () => {
                      const opening =
                        registrationListBody.hidden;

                      registrationListBody.hidden =
                        !opening;

                      registrationListToggle.textContent =
                        opening
                          ? '− Thu gọn danh sách đăng ký'
                          : '👥 Đăng ký: ' +
                            activeRegistrations.length +
                            ' cặp / ' +
                            registeredPlayerIds.size +
                            ' VĐV';
                    },
                    'tournament-detail-toggle'
                  );

                registrationListToggle.type =
                  'button';

                registrationSection.append(
                  registrationListToggle,
                  registrationListBody
                );

                if (
                  !registrationsForTournament.length
                ) {
                  registrationListBody.append(
                    el(
                      'p',
                      'Chưa có VĐV đăng ký giải này.',
                      'notice'
                    )
                  );
                } else {
                  const registrationStatusLabels = {
                    DANG_KY:
                      'Đã đăng ký',
                    DA_XAC_NHAN:
                      'Đã xác nhận',
                    HUY:
                      'Đã hủy'
                  };

                  registrationsForTournament.forEach(
                    registration => {
                      const registrationStatus =
                        upper(
                          registration.status
                        );

                      const registrationRow =
                        el(
                          'div',
                          null,
                          'tournament-match-row'
                        );

                      const registrationTop =
                        el(
                          'div',
                          null,
                          'tournament-match-top'
                        );

                      registrationTop.append(
                        el(
                          'strong',
                          raw(
                            registration.event_name
                          ) ||
                            'Nội dung thi đấu'
                        ),
                        el(
                          'span',
                          registrationStatusLabels[
                            registrationStatus
                          ] ||
                            raw(
                              registration.status
                            ) ||
                            '—',
                          'tournament-match-status'
                        )
                      );

                      const registrationPlayersRow =
                        el(
                          'div',
                          null,
                          'tournament-match-teams'
                        );

                      const mainPlayerName =
                        playerName(
                          registration.player_id
                        );

                      const partnerName =
                        registration.partner_player_id
                          ? playerName(
                              registration.partner_player_id
                            )
                          : 'Chưa có partner';

                      registrationPlayersRow.append(
                        el(
                          'span',
                          mainPlayerName
                        ),
                        el(
                          'strong',
                          '+',
                          'tournament-match-score'
                        ),
                        el(
                          'span',
                          partnerName
                        )
                      );

                      const registrationMeta =
                        el(
                          'div',
                          null,
                          'muted mt-2'
                        );

                      // TOURNAMENT PAYMENT SUMMARY V1I.4
                      const registrationPayments =
                        rows(
                          'tournament_payments'
                        ).filter(
                          payment =>
                            payment.registration_id ===
                              registration.id
                        );

                      const registrationFeeDue =
                        Number(
                          registration.fee_due ||
                          0
                        );

                      const registrationPaid =
                        registrationPayments.reduce(
                          (
                            total,
                            payment
                          ) =>
                            total +
                            Number(
                              payment.amount ||
                              0
                            ),
                          0
                        );

                      const registrationRemaining =
                        Math.max(
                          registrationFeeDue -
                            registrationPaid,
                          0
                        );

                      const registrationPaidInFull =
                        registrationFeeDue > 0 &&
                        registrationRemaining <= 0;

                      registrationMeta.textContent =
                        '';

                      const paymentSummary =
                        el(
                          'div',
                          null,
                          'tournament-payment-summary'
                        );

                      const paymentSummaryLine =
                        (
                          label,
                          amount,
                          className
                        ) => {
                          const line =
                            el(
                              'div',
                              null,
                              'tournament-payment-summary-line' +
                                (
                                  className
                                    ? ' ' +
                                      className
                                    : ''
                                )
                            );

                          line.append(
                            el(
                              'span',
                              label
                            ),
                            el(
                              'strong',
                              Number(
                                amount ||
                                0
                              ).toLocaleString(
                                'vi-VN'
                              ) +
                                'đ'
                            )
                          );

                          return line;
                        };

                                            // TOURNAMENT CANCELLED PAYMENT UI V1I.5
                      if (
                        registrationStatus ===
                        'HUY'
                      ) {
                        paymentSummary.append(
                          paymentSummaryLine(
                            'Phí đăng ký lịch sử',
                            registrationFeeDue
                          ),
                          paymentSummaryLine(
                            'Đã thu',
                            registrationPaid,
                            registrationPaid > 0
                              ? 'is-paid'
                              : ''
                          ),
                          el(
                            'div',
                            '🚫 Đăng ký đã hủy — không còn phải thu',
                            'tournament-payment-cancelled-note'
                          )
                        );
                      } else {
                        paymentSummary.append(
                          paymentSummaryLine(
                            'Phải thu',
                            registrationFeeDue
                          ),
                          paymentSummaryLine(
                            'Đã thu',
                            registrationPaid,
                            registrationPaid > 0
                              ? 'is-paid'
                              : ''
                          ),
                          paymentSummaryLine(
                            'Còn thiếu',
                            registrationRemaining,
                            registrationPaidInFull
                              ? 'is-complete'
                              : 'is-remaining'
                          )
                        );

                        if (
                          registrationPaidInFull
                        ) {
                          paymentSummary.append(
                            el(
                              'div',
                              '✓ Đã thu đủ',
                              'tournament-payment-paid-badge'
                            )
                          );
                        }
                      }

                      registrationMeta.append(
                        paymentSummary
                      );
                      // TOURNAMENT REGISTRATION ACTIONS V1H.1
                      const registrationActions =
                        el(
                          'div',
                          null,
                          'tournament-card-actions'
                        );

                      const changeRegistrationStatus =
                        async (
                          newStatus,
                          reason
                        ) => {
                          if (
                            state.writeBusy
                          ) {
                            return;
                          }

                          state.writeBusy =
                            true;

                          const actionButtons =
                            Array.from(
                              registrationActions.querySelectorAll(
                                'button'
                              )
                            );

                          actionButtons.forEach(
                            actionButton => {
                              actionButton.disabled =
                                true;
                            }
                          );

                          notice(
                            $('global-message'),
                            'Đang cập nhật đăng ký...',
                            false
                          );

                          try {
                            const {
                              data,
                              error
                            } =
                              await client.rpc(
                                'change_tournament_registration_status',
                                {
                                  p_registration_id:
                                    registration.id,
                                  p_new_status:
                                    newStatus,
                                  p_reason:
                                    reason
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
                                'Máy chủ không xác nhận thay đổi trạng thái đăng ký.'
                              );
                            }

                            await load();

                            state.page =
                              'tournaments';

                            render();

                            notice(
                              $('global-message'),
                              newStatus ===
                                'DA_XAC_NHAN'
                                ? 'Đã xác nhận đăng ký thành công. ✓'
                                : 'Đã hủy đăng ký thành công.',
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
                              PROFILE_NOT_FOUND:
                                'Không tìm thấy hồ sơ người dùng.',
                              PROFILE_INACTIVE:
                                'Tài khoản hiện không hoạt động.',
                              ADMIN_REQUIRED:
                                'Chỉ quản trị viên được thay đổi đăng ký.',
                              REGISTRATION_NOT_FOUND:
                                'Không tìm thấy đăng ký này.',
                              REGISTRATION_ALREADY_CANCELLED:
                                'Đăng ký này đã bị hủy.',
                              REGISTRATION_STATUS_UNCHANGED:
                                'Trạng thái đăng ký không thay đổi.',
                              INVALID_REGISTRATION_STATUS_TRANSITION:
                                'Không thể chuyển sang trạng thái này.',
                              INVALID_CURRENT_REGISTRATION_STATUS:
                                'Trạng thái đăng ký hiện tại không hợp lệ.',
                              TOURNAMENT_REGISTRATION_CLOSED:
                                'Giải đã đóng quản lý đăng ký.',
                              REGISTRATION_HAS_PAYMENT:
                                'Đăng ký đã có khoản thanh toán nên chưa thể hủy trực tiếp.'
                            };

                            let message =
                              explain(
                                error
                              );

                            Object.entries(
                              friendly
                            ).some(
                              ([
                                key,
                                value
                              ]) => {
                                if (
                                  code.includes(
                                    key
                                  )
                                ) {
                                  message =
                                    value;
                                  return true;
                                }

                                return false;
                              }
                            );

                            notice(
                              $('global-message'),
                              message,
                              true
                            );
                          } finally {
                            state.writeBusy =
                              false;

                            actionButtons.forEach(
                              actionButton => {
                                actionButton.disabled =
                                  false;
                              }
                            );
                          }
                        };

                      if (
                        registrationStatus ===
                        'DANG_KY'
                      ) {
                        const confirmButton =
                          button(
                            '✓ Xác nhận',
                            async () => {
                              const accepted =
                                confirm(
                                  'Xác nhận đăng ký cho ' +
                                    mainPlayerName +
                                    (
                                      registration.partner_player_id
                                        ? ' / ' +
                                          partnerName
                                        : ''
                                    ) +
                                    '?'
                                );

                              if (
                                !accepted
                              ) {
                                return;
                              }

                              await changeRegistrationStatus(
                                'DA_XAC_NHAN',
                                'Xác nhận đăng ký tham gia giải'
                              );
                            },
                            'success'
                          );

                        confirmButton.type =
                          'button';

                        registrationActions.append(
                          confirmButton
                        );
                      }

                      if (
                        registrationStatus ===
                          'DANG_KY' ||
                        registrationStatus ===
                          'DA_XAC_NHAN'
                      ) {
                        const cancelButton =
                          button(
                            'Hủy đăng ký',
                            async () => {
                              const reason =
                                prompt(
                                  'Lý do hủy đăng ký:'
                                );

                              if (
                                reason ===
                                null
                              ) {
                                return;
                              }

                              const cleanReason =
                                String(
                                  reason
                                ).trim();

                              if (
                                !cleanReason
                              ) {
                                alert(
                                  'Vui lòng nhập lý do hủy đăng ký.'
                                );
                                return;
                              }

                              const accepted =
                                confirm(
                                  'Hủy đăng ký của ' +
                                    mainPlayerName +
                                    (
                                      registration.partner_player_id
                                        ? ' / ' +
                                          partnerName
                                        : ''
                                    ) +
                                    '?'
                                );

                              if (
                                !accepted
                              ) {
                                return;
                              }

                              await changeRegistrationStatus(
                                'HUY',
                                cleanReason
                              );
                            },
                            'danger'
                          );

                        cancelButton.type =
                          'button';

                        registrationActions.append(
                          cancelButton
                        );
                      }
                      // TOURNAMENT PAYMENT ACTION V1I.6
                      const paymentActionArea =
                        el(
                          'div',
                          null,
                          'tournament-payment-action-area'
                        );

                      if (
                        canCollectTournamentFee() &&
                        registrationStatus !==
                          'HUY' &&
                        registrationRemaining > 0 &&
                        registrationFeeDue > 0
                      ) {
                        const paymentToggle =
                          button(
                            '💰 Thu phí',
                            () => {
                              const opening =
                                paymentForm.hidden;

                              paymentForm.hidden =
                                !opening;

                              paymentToggle.textContent =
                                opening
                                  ? 'Thu gọn'
                                  : '💰 Thu phí';

                              if (opening) {
                                amountInput.focus();
                              }
                            },
                            'success'
                          );

                        paymentToggle.type =
                          'button';

                        const paymentForm =
                          el(
                            'div',
                            null,
                            'tournament-payment-form'
                          );

                        paymentForm.hidden =
                          true;

                        const amountLabel =
                          el(
                            'label',
                            'Số tiền thu',
                            'field'
                          );

                        const amountInput =
                          document.createElement(
                            'input'
                          );

                        amountInput.type =
                          'number';

                        amountInput.min =
                          '1';

                        amountInput.step =
                          '1000';

                        amountInput.value =
                          String(
                            registrationRemaining
                          );

                        amountInput.max =
                          String(
                            registrationRemaining
                          );

                        amountInput.inputMode =
                          'numeric';

                        amountLabel.append(
                          amountInput
                        );

                        const noteLabel =
                          el(
                            'label',
                            'Ghi chú',
                            'field'
                          );

                        const noteInput =
                          document.createElement(
                            'input'
                          );

                        noteInput.type =
                          'text';

                        noteInput.placeholder =
                          'Ví dụ: Thu tiền mặt';

                        noteLabel.append(
                          noteInput
                        );

                        const paymentHint =
                          el(
                            'div',
                            'Còn thiếu: ' +
                              Number(
                                registrationRemaining
                              ).toLocaleString(
                                'vi-VN'
                              ) +
                              'đ',
                            'muted'
                          );

                        const paymentSubmit =
                          button(
                            '✓ Xác nhận thu',
                            async () => {
                              if (
                                state.writeBusy
                              ) {
                                return;
                              }

                              const amount =
                                Number(
                                  amountInput.value
                                );

                              if (
                                !Number.isFinite(
                                  amount
                                ) ||
                                amount <= 0
                              ) {
                                notice(
                                  $('global-message'),
                                  'Số tiền thu phải lớn hơn 0.',
                                  true
                                );
                                return;
                              }

                              if (
                                amount >
                                registrationRemaining
                              ) {
                                notice(
                                  $('global-message'),
                                  'Số tiền thu không được vượt quá số còn thiếu.',
                                  true
                                );
                                return;
                              }

                              const accepted =
                                confirm(
                                  'Xác nhận thu ' +
                                    amount.toLocaleString(
                                      'vi-VN'
                                    ) +
                                    'đ cho ' +
                                    mainPlayerName +
                                    '?'
                                );

                              if (
                                !accepted
                              ) {
                                return;
                              }

                              state.writeBusy =
                                true;

                              paymentToggle.disabled =
                                true;

                              paymentSubmit.disabled =
                                true;

                              amountInput.disabled =
                                true;

                              noteInput.disabled =
                                true;

                              notice(
                                $('global-message'),
                                'Đang ghi nhận khoản thu...',
                                false
                              );

                              try {
                                const {
                                  data,
                                  error
                                } =
                                  await client.rpc(
                                    'create_tournament_payment',
                                    {
                                      p_registration_id:
                                        registration.id,
                                      p_amount:
                                        amount,
                                      p_paid_at:
                                        new Date().toISOString(),
                                      p_note:
                                        String(
                                          noteInput.value ||
                                          ''
                                        ).trim() ||
                                        null
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
                                    'Máy chủ không xác nhận khoản thu.'
                                  );
                                }

                                await load();

                                state.page =
                                  'tournaments';

                                render();

                                notice(
                                  $('global-message'),
                                  data.paid_in_full
                                    ? 'Đã thu đủ phí đăng ký. ✓'
                                    : 'Đã ghi nhận khoản thu ' +
                                        Number(
                                          data.amount ||
                                          amount
                                        ).toLocaleString(
                                          'vi-VN'
                                        ) +
                                        'đ. Còn thiếu ' +
                                        Number(
                                          data.remaining_after ||
                                          0
                                        ).toLocaleString(
                                          'vi-VN'
                                        ) +
                                        'đ.',
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
                                  PROFILE_NOT_FOUND:
                                    'Không tìm thấy hồ sơ người dùng.',
                                  PROFILE_INACTIVE:
                                    'Tài khoản hiện không hoạt động.',
                                  TREASURER_PERMISSION_REQUIRED:
                                    'Tài khoản này không có quyền thu phí đăng ký giải.',
                                  REGISTRATION_NOT_FOUND:
                                    'Không tìm thấy đăng ký này.',
                                  REGISTRATION_CANCELLED:
                                    'Đăng ký đã bị hủy nên không thể thu phí.',
                                  REGISTRATION_NOT_PAYABLE:
                                    'Đăng ký hiện không thể thu phí.',
                                  TOURNAMENT_NOT_FOUND:
                                    'Không tìm thấy giải đấu.',
                                  TOURNAMENT_CANCELLED:
                                    'Giải đấu đã bị hủy.',
                                  TOURNAMENT_ALREADY_SETTLED:
                                    'Giải đấu đã quyết toán nên không thể ghi thêm khoản thu.',
                                  PAYMENT_AMOUNT_REQUIRED:
                                    'Vui lòng nhập số tiền thu.',
                                  PAYMENT_AMOUNT_MUST_BE_POSITIVE:
                                    'Số tiền thu phải lớn hơn 0.',
                                  PAID_AT_REQUIRED:
                                    'Thiếu thời điểm thanh toán.',
                                  REGISTRATION_HAS_NO_FEE_DUE:
                                    'Đăng ký này không có phí phải thu.',
                                  REGISTRATION_ALREADY_PAID_IN_FULL:
                                    'Đăng ký này đã thu đủ phí.',
                                  PAYMENT_EXCEEDS_REMAINING_BALANCE:
                                    'Số tiền thu vượt quá số còn thiếu.'
                                };

                                let message =
                                  explain(
                                    error
                                  );

                                Object.entries(
                                  friendly
                                ).some(
                                  ([
                                    key,
                                    value
                                  ]) => {
                                    if (
                                      code.includes(
                                        key
                                      )
                                    ) {
                                      message =
                                        value;
                                      return true;
                                    }

                                    return false;
                                  }
                                );

                                notice(
                                  $('global-message'),
                                  message,
                                  true
                                );
                              } finally {
                                state.writeBusy =
                                  false;

                                paymentToggle.disabled =
                                  false;

                                paymentSubmit.disabled =
                                  false;

                                amountInput.disabled =
                                  false;

                                noteInput.disabled =
                                  false;
                              }
                            },
                            'success'
                          );

                        paymentSubmit.type =
                          'button';

                        const paymentCancel =
                          button(
                            'Đóng',
                            () => {
                              paymentForm.hidden =
                                true;

                              paymentToggle.textContent =
                                '💰 Thu phí';
                            }
                          );

                        paymentCancel.type =
                          'button';

                        const paymentButtons =
                          el(
                            'div',
                            null,
                            'tournament-card-actions'
                          );

                        paymentButtons.append(
                          paymentSubmit,
                          paymentCancel
                        );

                        paymentForm.append(
                          amountLabel,
                          noteLabel,
                          paymentHint,
                          paymentButtons
                        );

                        paymentActionArea.append(
                          paymentToggle,
                          paymentForm
                        );
                      }


                      registrationRow.append(
                        registrationTop,
                        registrationPlayersRow,
                        registrationMeta,
                        registrationActions,
                        paymentActionArea
                      );

                      registrationListBody.append(
                        registrationRow
                      );
                    }
                  );
                }


                const matchesSection =
                  el(
                    'section',
                    null,
                    'tournament-matches'
                  );

                matchesSection.append(
                  el(
                    'h5',
                    'Các trận thuộc giải'
                  )
                );

                if (
                  !matchesForTournament.length
                ) {
                  matchesSection.append(
                    el(
                      'p',
                      'Chưa có trận nào được gắn vào giải này.',
                      'notice'
                    )
                  );
                } else {
                  matchesForTournament.forEach(
                    match => {
                      const matchRow =
                        el(
                          'div',
                          null,
                          'tournament-match-row'
                        );

                      const matchLinks =
                        linksForTournament.filter(
                          link =>
                            link.match_id ===
                            match.id
                        );

                      const teamA =
                        matchLinks
                          .filter(
                            link =>
                              upper(
                                link.team
                              ) ===
                              'A'
                          )
                          .map(
                            link =>
                              playerName(
                                link.player_id
                              )
                          )
                          .join(
                            ' / '
                          ) ||
                        'Đội A';

                      const teamB =
                        matchLinks
                          .filter(
                            link =>
                              upper(
                                link.team
                              ) ===
                              'B'
                          )
                          .map(
                            link =>
                              playerName(
                                link.player_id
                              )
                          )
                          .join(
                            ' / '
                          ) ||
                        'Đội B';

                      const matchStatus =
                        upper(
                          match.status
                        );

                      const score =
                        String(
                          match.team_a_score ??
                          0
                        ) +
                        ' - ' +
                        String(
                          match.team_b_score ??
                          0
                        );

                      const matchTop =
                        el(
                          'div',
                          null,
                          'tournament-match-top'
                        );

                      matchTop.append(
                        el(
                          'strong',
                          matchCode(
                            match
                          )
                        ),
                        el(
                          'span',
                          tournamentMatchStatusLabels[
                            matchStatus
                          ] ||
                            raw(
                              match.status
                            ),
                          'tournament-match-status'
                        )
                      );

                      const teams =
                        el(
                          'div',
                          null,
                          'tournament-match-teams'
                        );

                      teams.append(
                        el(
                          'span',
                          teamA
                        ),
                        el(
                          'strong',
                          score,
                          'tournament-match-score'
                        ),
                        el(
                          'span',
                          teamB
                        )
                      );

                      matchRow.append(
                        matchTop,
                        teams
                      );

                      matchesSection.append(
                        matchRow
                      );
                    }
                  );
                }

                detailBody.append(
                  infoGrid,
                  matchStats,
                  registrationSection,
                  matchesSection
                );

                card.append(
                  cardHeader,
                  summary,
                  toggleRow,
                  detailBody
                );

                tournamentCards.set(
                  tournament.id,
                  {
                    card,
                    body:
                      detailBody,
                    toggle:
                      detailToggle
                  }
                );

                tournamentList.append(
                  card
                );
              }
            );

            root.append(
              tournamentList
            );
            break;
          }

          case 'admin':
            admin();
            break;
        }
      }

      function explain(e) {
        if (
          e?.name ===
          'AbortError'
        ) {
          return 'Yêu cầu đã hết thời gian hoặc bị hủy. Hãy thử lại.';
        }

        if (
          e?.code ===
            '42501' ||
          e?.status === 403
        ) {
          return 'Tài khoản chưa có quyền thực hiện thao tác này.';
        }

        if (
          e?.status ===
          401
        ) {
          return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
        }

        if (
          e?.code ===
            '42P01' ||
          e?.code ===
            'PGRST205'
        ) {
          return 'Chưa tìm thấy bảng dữ liệu trên máy chủ.';
        }

        return (
          'Không thực hiện được yêu cầu. Kiểm tra kết nối hoặc liên hệ quản trị viên' +
          (
            e?.code
              ? ' (mã ' +
                String(
                  e.code
                ).slice(
                  0,
                  40
                ) +
                ').'
              : '.'
          )
        );
      }

      async function query(
        q,
        signal
      ) {
        const local =
          new AbortController();

        const cancel = () =>
          local.abort();

        if (signal?.aborted) {
          local.abort();
        } else {
          signal?.addEventListener(
            'abort',
            cancel,
            {
              once: true
            }
          );
        }

        const timer =
          setTimeout(
            cancel,
            20000
          );

        try {
          const result =
            await q.abortSignal(
              local.signal
            );

          if (
            local.signal
              .aborted
          ) {
            throw new DOMException(
              'Aborted',
              'AbortError'
            );
          }

          if (result.error) {
            throw result.error;
          }

          return result;
        } finally {
          clearTimeout(
            timer
          );

          signal?.removeEventListener(
            'abort',
            cancel
          );
        }
      }

      async function readTable(
        t,
        signal
      ) {
        if (
          !tables.includes(
            t
          )
        ) {
          throw new Error(
            'Nguồn dữ liệu không được phép.'
          );
        }

        if (
          t === 'matches' &&
          !isAdmin()
        ) {
          const result =
            await query(
              client.rpc(
                'get_member_matches'
              ),
              signal
            );

          return {
            data: [...(result.data || [])],
            partial: false
          };
        }

        if (
          t === 'match_players' &&
          !isAdmin()
        ) {
          const result =
            await query(
              client.rpc(
                'get_member_match_players'
              ),
              signal
            );

          return {
            data: [...(result.data || [])],
            partial: false
          };
        }

        if (
          t === 'rating_events' &&
          !isAdmin()
        ) {
          const result =
            await query(
              client.rpc(
                'get_member_rating_events'
              ),
              signal
            );

          return {
            data: [...(result.data || [])],
            partial: false
          };
        }

        if (
          t === 'fund_contributions' &&
          !isAdmin()
        ) {
          const result =
            await query(
              client.rpc(
                'get_my_fund_contributions'
              ),
              signal
            );

          return {
            data: [...(result.data || [])],
            partial: false
          };
        }

        if (
          t === 'fund_payments' &&
          !isAdmin()
        ) {
          const result =
            await query(
              client.rpc(
                'get_my_fund_payments'
              ),
              signal
            );

          return {
            data: [...(result.data || [])],
            partial: false
          };
        }

        // MP01 MEMBER FUND LOAD V1
        if (
          t === 'fund_transactions' &&
          !isAdmin()
        ) {
          const [
            obligations,
            history,
            summary
          ] =
            await Promise.all([
              query(
                client.rpc(
                  'get_my_fund_obligations'
                ),
                signal
              ),
              query(
                client.rpc(
                  'get_my_fund_payment_history'
                ),
                signal
              ),
              query(
                client.rpc(
                  'get_club_fund_summary'
                ),
                signal
              )
            ]);

          state.memberFundObligations =
            [...(obligations.data || [])];

          state.memberFundPaymentHistory =
            [...(history.data || [])];

          state.memberFundOverview =
            summary.data || null;

          // MEMBER no longer needs raw fund ledger rows.
          return {
            data: [],
            partial: false
          };
        }

        if (
          t === 'players' &&
          !isAdmin()
        ) {
          const result =
            await query(
              client.rpc(
                'get_player_directory'
              ),
              signal
            );

          // IAM04-B: directory rows may omit private contact fields.
          const directory = [...(result.data || [])];
          const ownPlayerId = state.profile?.player_id;
          if (upper(state.profile?.role) === 'MEMBER' && ownPlayerId) {
            const own = await query(
              client.from('players')
                .select('id,full_name,phone,date_of_birth')
                .eq('id', ownPlayerId)
                .maybeSingle(),
              signal
            );
            if (own.data && String(own.data.id) === String(ownPlayerId)) {
              const index = directory.findIndex(item => String(item.id) === String(ownPlayerId));
              if (index >= 0) {
                directory[index] = { ...directory[index], ...own.data };
              } else {
                directory.push(own.data);
              }
            }
          }
          return { data: directory, partial: false };
        }

        const first =
          await query(
            client
              .from(t)
              .select('*')
              .limit(1),
            signal
          );

        if (
          !first.data
            ?.length
        ) {
          return {
            data: [],
            partial: false
          };
        }

        const sample =
          first.data[0];

        const keys =
          'id' in sample
            ? ['id']
            : Object.keys(
                sample
              )
                .filter(
                  k =>
                    sample[k] ===
                      null ||
                    [
                      'string',
                      'number',
                      'boolean'
                    ].includes(
                      typeof sample[
                        k
                      ]
                    )
                )
                .sort();

        if (!keys.length) {
          throw new Error(
            'Không có cột sắp xếp.'
          );
        }

        const data = [];
        let expected = null;

        while (
          data.length <
          10000
        ) {
          let q =
            client
              .from(t)
              .select(
                '*',
                {
                  count:
                    'exact'
                }
              );

          for (
            const k of keys
          ) {
            q =
              q.order(
                k,
                {
                  ascending:
                    true,
                  nullsFirst:
                    true
                }
              );
          }

          const result =
            await query(
              q.range(
                data.length,
                data.length +
                  499
              ),
              signal
            );

          if (
            expected ===
            null
          ) {
            expected =
              result.count;
          } else if (
            expected !==
            result.count
          ) {
            throw new Error(
              'Dữ liệu đang thay đổi.'
            );
          }

          const batch =
            result.data ||
            [];

          data.push(
            ...batch
          );

          if (
            !batch.length ||
            (
              data.length >=
                result.count &&
              result.count !==
                null
            )
          ) {
            break;
          }
        }

        return {
          data,
          partial:
            expected ===
            null
              ? data.length >=
                10000
              : data.length <
                expected
        };
      }

      async function load() {
        if (
          !state.session
        ) {
          return;
        }

        const gen =
          ++state.generation;

        state.controller?.abort();

        state.controller =
          new AbortController();

        const signal =
          state.controller.signal;

        state.busy = true;
        state.profile = null;
        state.data = {};
        state.errors = {};
        state.partial = {};
        state.memberFundOverview = null;
        state.memberFundObligations = [];
        state.memberFundPaymentHistory = [];

        $('user-name').textContent =
          state.session.user
            .email ||
          'Tài khoản';

        $('user-role').textContent =
          '';

        $('refresh').disabled =
          true;

        notice(
          $('global-message'),
          ''
        );

        $('sync-status').textContent =
          'Đang kết nối…';

        render();

        try {
          const result =
            await query(
              client
                .from(
                  'profiles'
                )
                .select(
                  'id, full_name, role, is_active, can_collect_tournament_fee, player_id, must_change_password'
                )
                .eq(
                  'id',
                  state.session
                    .user.id
                )
                .maybeSingle(),
              signal
            );

          if (
            gen !==
            state.generation
          ) {
            return;
          }

          if (
            !result.data
          ) {
            throw new Error(
              'PROFILE_MISSING'
            );
          }

          state.profile =
            result.data;

          $('user-name').textContent =
            result.data
              .full_name ||
            state.session.user
              .email ||
            'Thành viên';

          $('user-role').textContent =
            badge(
              result.data.role
            ).textContent;

          if (
            result.data
              .is_active !==
            true
          ) {
            return;
          }

          if (
            result.data
              .must_change_password ===
            true
          ) {
            return;
          }

          let next = 0;

          await Promise.all(
            Array.from(
              {
                length: 4
              },
              async () => {
                while (
                  next <
                  tables.length
                ) {
                  const t =
                    tables[
                      next++
                    ];

                  if (
                    gen !==
                    state.generation
                  ) {
                    return;
                  }

                  try {
                    const result =
                      await readTable(
                        t,
                        signal
                      );

                    if (
                      gen ===
                      state.generation
                    ) {
                      state.data[
                        t
                      ] =
                        result.data;

                      state.partial[
                        t
                      ] =
                        result.partial;
                    }
                  } catch (e) {
                    if (
                      gen ===
                      state.generation
                    ) {
                      state.errors[
                        t
                      ] =
                        explain(e);
                    }
                  }
                }
              }
            )
          );
        } catch (e) {
          if (
            gen ===
            state.generation
          ) {
            notice(
              $('global-message'),
              e.message ===
                'PROFILE_MISSING'
                ? 'Đăng nhập thành công nhưng chưa có hồ sơ được cấp quyền. Liên hệ quản trị viên.'
                : 'Không đọc được hồ sơ của bạn. ' +
                  explain(e),
              true
            );
          }
        } finally {
          if (
            gen ===
            state.generation
          ) {
            state.busy =
              false;

            $('refresh').disabled =
              false;

            state.updated =
              new Date();

            const failed =
              Object.keys(
                state.errors
              ).length;

            $('sync-status').textContent =
              state.profile
                ?.is_active ===
              true
                ? (
                    failed
                      ? 'Tải chưa đầy đủ • ' +
                        failed +
                        ' nguồn gặp lỗi • '
                      : 'Đã tải xong • '
                  ) +
                  date(
                    state.updated
                  )
                : 'Chưa tải dữ liệu câu lạc bộ';

            render();
          }
        }
      }

      function acceptSession(
        session
      ) {
        const previous =
          state.session?.user
            .id;

        state.session =
          session;

        if (!session) {
          state.generation++;

          state.controller?.abort();

          state.data = {};
          state.errors = {};
          state.partial = {};
          state.profile = null;
          state.busy = false;
          state.writeBusy = false;
          state.page =
            'overview';

          $('content')
            .replaceChildren();

          $('user-name').textContent =
            '';

          $('user-role').textContent =
            '';

          $('app').hidden =
            true;

          $('login').hidden =
            false;

          $('boot').hidden =
            true;

          $('password').value =
            '';

          return;
        }

        $('boot').hidden =
          true;

        $('login').hidden =
          true;

        $('app').hidden =
          false;

        if (
          previous !==
          session.user.id
        ) {
          void load();
        }
      }
      const navRoot =
        $('nav');

      const primaryMobilePages =
        new Set([
          'overview',
          'matches',
          'players',
          'ranking',
          'fund'
        ]);

      const secondaryMobilePages =
        new Set([
          'contribution',
          'tournaments',
          'admin'
        ]);

      for (
        const [
          id,
          icon,
          label
        ] of modules
      ) {
        const n = button(
          '',
          () =>
            navigate(id),
          'nav-item'
        );

        n.dataset.page =
          id;

        if (
          primaryMobilePages.has(
            id
          )
        ) {
          n.dataset.mobilePrimary =
            'true';
        }

        if (
          secondaryMobilePages.has(
            id
          )
        ) {
          n.dataset.mobileSecondary =
            'true';
        }

        const symbol =
          el(
            'span',
            icon,
            'nav-icon'
          );

        symbol.setAttribute(
          'aria-hidden',
          'true'
        );

        const visibleLabel =
          id === 'admin' &&
          !isAdmin()
            ? 'Tài khoản'
            : label;

        n.append(
          symbol,
          el(
            'span',
            visibleLabel
          )
        );

        navRoot.append(n);
      }

      const moreWrapper =
        el(
          'div',
          null,
          'nav-more'
        );

      const moreButton =
        button(
          '',
          () => {
            const isOpen =
              moreWrapper.classList
                .toggle(
                  'nav-more-open'
                );

            moreButton.setAttribute(
              'aria-expanded',
              isOpen
                ? 'true'
                : 'false'
            );
          },
          'nav-item nav-more-button'
        );

      moreButton.type =
        'button';

      moreButton.setAttribute(
        'aria-expanded',
        'false'
      );

      moreButton.setAttribute(
        'aria-haspopup',
        'menu'
      );

      const moreIcon =
        el(
          'span',
          '•••',
          'nav-icon'
        );

      moreIcon.setAttribute(
        'aria-hidden',
        'true'
      );

      moreButton.append(
        moreIcon,
        el(
          'span',
          'Thêm'
        )
      );

      const moreMenu =
        el(
          'div',
          null,
          'nav-more-menu'
        );

      moreMenu.setAttribute(
        'role',
        'menu'
      );

      [
        [
          'contribution',
          '♡',
          'Cống hiến'
        ],
        [
          'tournaments',
          '⚑',
          'Giải đấu'
        ],
        [
          'admin',
          '⚙',
          isAdmin()
            ? 'Quản trị'
            : 'Tài khoản'
        ]
      ].forEach(
        ([
          id,
          icon,
          label
        ]) => {
          const item =
            button(
              '',
              () => {
                moreWrapper.classList
                  .remove(
                    'nav-more-open'
                  );

                moreButton.setAttribute(
                  'aria-expanded',
                  'false'
                );

                navigate(id);
              },
              'nav-more-item'
            );

          item.type =
            'button';

          item.dataset.page =
            id;

          item.setAttribute(
            'role',
            'menuitem'
          );

          item.append(
            el(
              'span',
              icon,
              'nav-more-item-icon'
            ),
            el(
              'span',
              label
            )
          );

          moreMenu.append(
            item
          );
        }
      );

      moreWrapper.append(
        moreButton,
        moreMenu
      );

      navRoot.append(
        moreWrapper
      );

      $('refresh')
        .addEventListener(
          'click',
          () =>
            void load()
        );

      $('recovery-password-form').addEventListener('submit', async event => {
        event.preventDefault();
        const submit = $('recovery-password-submit');
        if (!client || submit.disabled || state.writeBusy) return;
        const password = $('recovery-password').value;
        const confirm = $('recovery-password-confirm').value;
        const message = $('recovery-password-message');
        if (password.length < 8) {
          notice(message, 'Mật khẩu mới cần ít nhất 8 ký tự.', true);
          return;
        }
        if (password !== confirm) {
          notice(message, 'Mật khẩu xác nhận không khớp.', true);
          return;
        }
        if (!$('recovery-password-form').reportValidity()) return;
        state.writeBusy = true;
        submit.disabled = true;
        submit.textContent = 'Đang cập nhật…';
        notice(message, '');
        try {
          const { data: sessionData, error: sessionError } = await client.auth.getSession();
          if (sessionError || !sessionData?.session) throw new Error('RECOVERY_SESSION_MISSING');
          const { data, error } = await client.auth.updateUser({ password });
          if (error) throw error;
          if (!data?.user || data.user.id !== sessionData.session.user.id) throw new Error('USER_CONFIRMATION_MISSING');

          const {
            data: completeData,
            error: completeError
          } = await client.rpc(
            'complete_my_password_change'
          );

          if (completeError) {
            throw completeError;
          }

          if (
            completeData?.success !== true
          ) {
            throw new Error(
              'PASSWORD_CHANGE_FLAG_NOT_CLEARED'
            );
          }

          $('recovery-password').value = '';
          $('recovery-password-confirm').value = '';
          notice(message, 'Đã cập nhật mật khẩu. Đang mở lại ứng dụng…', false, true);
          // Remove recovery flags/tokens and reinitialize normal auth routing.
          window.location.replace(window.location.pathname);
        } catch (error) {
          const text = error?.code === 'weak_password'
            ? 'Mật khẩu chưa đáp ứng yêu cầu bảo mật. Hãy chọn mật khẩu dài và khó đoán hơn.'
            : error?.code === 'same_password'
              ? 'Mật khẩu mới phải khác mật khẩu hiện tại.'
              : error?.status === 429
                ? 'Đã vượt giới hạn yêu cầu. Vui lòng chờ rồi thử lại.'
                : 'Không thể cập nhật mật khẩu. Kiểm tra kết nối; nếu liên kết hết hạn, hãy yêu cầu liên kết mới.';
          notice(message, text, true);
        } finally {
          state.writeBusy = false;
          submit.disabled = false;
          submit.textContent = 'Cập nhật mật khẩu';
        }
      });
      $('forgot-password-open')
        .addEventListener(
          'click',
          () => {
            $('forgot-password-panel').hidden =
              false;

            $('auth-actions').hidden =
              true;

            $('login-form').hidden =
              true;

            $('signup-panel').hidden =
              true;

            notice(
              $('forgot-password-message'),
              ''
            );
          }
        );

      $('forgot-password-cancel')
        .addEventListener(
          'click',
          () => {
            $('forgot-password-panel').hidden =
              true;

            $('auth-actions').hidden =
              false;

            $('login-form').hidden =
              false;

            $('forgot-password-form').reset();

            notice(
              $('forgot-password-message'),
              ''
            );
          }
        );

      $('forgot-password-form')
        .addEventListener(
          'submit',
          async e => {
            e.preventDefault();

            if (!client) {
              return;
            }

            const b =
              $('forgot-password-submit');

            const email =
              $('forgot-password-email')
                .value
                .trim();

            notice(
              $('forgot-password-message'),
              ''
            );

            b.disabled =
              true;

            b.textContent =
              'Đang gửi…';

            try {
              const {
                error
              } =
                await client.auth
                  .resetPasswordForEmail(
                    email,
                    {
                      redirectTo:
                        new URL(
                          '?recovery=1',
                          window.location.href
                        ).href
                    }
                  );

              if (error) {
                throw error;
              }

              notice(
                $('forgot-password-message'),
                'Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra email của bạn.',
                false,
                true
              );
            } catch (e) {
              notice(
                $('forgot-password-message'),
                e.code ===
                  'over_email_send_rate_limit'
                  ? 'Hệ thống đang giới hạn gửi email. Vui lòng thử lại sau.'
                  : 'Không thể gửi liên kết đặt lại mật khẩu. Hãy kiểm tra email và thử lại.',
                true
              );
            } finally {
              b.disabled =
                false;

              b.textContent =
                'Gửi liên kết đặt lại mật khẩu';
            }
          }
        );
      let signupRatingConfig =
        null;

      const loadSignupRatingConfig =
        async () => {
          const {
            data,
            error
          } =
            await client.rpc(
              'get_signup_rating_config'
            );

          if (error) {
            throw error;
          }

          const initialRating =
            Number(
              data?.initial_rating
            );

          const minRating =
            Number(
              data?.min_rating
            );

          const maxRating =
            Number(
              data?.max_rating
            );

          if (
            !Number.isFinite(initialRating) ||
            !Number.isFinite(minRating) ||
            !Number.isFinite(maxRating) ||
            minRating >= maxRating ||
            initialRating < minRating ||
            initialRating > maxRating
          ) {
            throw new Error(
              'Cấu hình Rating đăng ký không hợp lệ.'
            );
          }

          signupRatingConfig = {
            initialRating,
            minRating,
            maxRating
          };

          const input =
            $('signup-initial-rating');

          input.min =
            String(minRating);

          input.max =
            String(maxRating);

          input.value =
            initialRating.toFixed(3);

          return signupRatingConfig;
        };

      $('signup-open')
        .addEventListener(
          'click',
          async () => {
            $('signup-panel').hidden =
              false;

            $('auth-actions').hidden =
              true;

            $('login-form').hidden =
              true;

            notice(
              $('signup-message'),
              ''
            );

            try {
              await loadSignupRatingConfig();

            } catch (error) {
              signupRatingConfig =
                null;

              $('signup-submit').disabled =
                true;

              notice(
                $('signup-message'),
                'Không tải được cấu hình Rating đăng ký. ' +
                  explain(error),
                true
              );

              return;
            }

            $('signup-submit').disabled =
              false;
          }
        );

      $('signup-cancel')
        .addEventListener(
          'click',
          () => {
            $('signup-panel').hidden =
              true;

            $('auth-actions').hidden =
              false;

            $('login-form').hidden =
              false;

            $('signup-form').reset();

            $('signup-initial-rating').value =
              signupRatingConfig
                ? signupRatingConfig
                    .initialRating
                    .toFixed(3)
                : '';

            notice(
              $('signup-message'),
              ''
            );
          }
        );

      $('signup-form')
        .addEventListener(
          'submit',
          async e => {
            e.preventDefault();

            if (!client) {
              return;
            }

            const b =
              $('signup-submit');

            const fullName =
              $('signup-full-name')
                .value
                .trim();

            const loginName =
              $('signup-login-name')
                .value
                .trim()
                .toLowerCase();

            const email =
              $('signup-email')
                .value
                .trim();

            const phone =
              $('signup-phone')
                .value
                .trim();

            const dateOfBirth =
              $('signup-date-of-birth')
                .value;

            const rating =
              Number(
                $('signup-initial-rating')
                  .value
              );

            const password =
              $('signup-password')
                .value;

            const passwordConfirm =
              $('signup-password-confirm')
                .value;

            notice(
              $('signup-message'),
              ''
            );

            if (
              loginName.length < 3 ||
              loginName.length > 32 ||
              !/^[a-z0-9._-]+$/.test(
                loginName
              )
            ) {
              notice(
                $('signup-message'),
                'Nickname phải dài 3–32 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.',
                true
              );

              return;
            }

            if (!signupRatingConfig) {
              notice(
                $('signup-message'),
                'Chưa tải được cấu hình Rating đăng ký.',
                true
              );

              return;
            }

            if (
              !Number.isFinite(rating) ||
              rating <
                signupRatingConfig
                  .minRating ||
              rating >
                signupRatingConfig
                  .maxRating
            ) {
              notice(
                $('signup-message'),
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

            if (
              password !==
              passwordConfirm
            ) {
              notice(
                $('signup-message'),
                'Mật khẩu xác nhận không khớp.',
                true
              );

              return;
            }

            b.disabled =
              true;

            b.textContent =
              'Đang tạo tài khoản…';

            try {
              const {
                data,
                error
              } =
                await client.auth
                  .signUp({
                    email,
                    password,
                    options: {
                      data: {
                        full_name:
                          fullName,
                        login_name:
                          loginName,
                        phone:
                          phone || null,
                        date_of_birth:
                          dateOfBirth || null,
                        initial_rating:
                          rating.toFixed(3)
                      }
                    }
                  });

              if (error) {
                throw error;
              }

              if (data.session) {
                acceptSession(
                  data.session
                );

                return;
              }

              $('signup-form').reset();

              $('signup-initial-rating').value =
                signupRatingConfig
                  ? signupRatingConfig
                      .initialRating
                      .toFixed(3)
                  : '';

              notice(
                $('signup-message'),
                'Đăng ký thành công. Hãy kiểm tra email để xác nhận tài khoản trước khi đăng nhập.',
                false,
                true
              );
            } catch (e) {
              console.error(
                'SIGNUP_ERROR',
                {
                  code: e?.code || null,
                  status: e?.status || null,
                  message: e?.message || null
                }
              );

              const signupErrorCode =
                String(
                  e?.code ||
                  ''
                );

              const signupErrorMessage =
                String(
                  e?.message ||
                  ''
                );

              notice(
                $('signup-message'),
                signupErrorMessage.includes(
                  'LOGIN_NAME_ALREADY_EXISTS'
                )
                  ? 'Nickname này đã được sử dụng. Hãy chọn nickname khác.'
                  : signupErrorMessage.includes(
                      'INVALID_LOGIN_NAME'
                    )
                    ? 'Nickname không hợp lệ.'
                    : signupErrorCode ===
                  'user_already_exists'
                  ? 'Email này đã được đăng ký.'
                  : signupErrorCode ===
                      'over_email_send_rate_limit'
                    ? 'Hệ thống đang giới hạn gửi email. Vui lòng thử lại sau.'
                    : signupErrorCode ===
                        'email_address_invalid'
                      ? 'Địa chỉ email không hợp lệ.'
                      : 'Không thể tạo tài khoản.' +
                        (
                          signupErrorCode
                            ? ' Mã lỗi: ' +
                              signupErrorCode +
                              '.'
                            : ''
                        ) +
                        (
                          signupErrorMessage
                            ? ' Chi tiết: ' +
                              signupErrorMessage.slice(
                                0,
                                180
                              ) +
                              '.'
                            : ''
                        ),
                true
              );
            } finally {
              $('signup-password').value =
                '';

              $('signup-password-confirm').value =
                '';

              b.disabled =
                false;

              b.textContent =
                'Tạo tài khoản thành viên';
            }
          }
        );
      $('login-form')
        .addEventListener(
          'submit',
          async e => {
            e.preventDefault();

            if (!client) {
              return;
            }

            const b =
              $('login-button');

            b.disabled =
              true;

            b.textContent =
              'Đang đăng nhập…';

            notice(
              $('login-message'),
              ''
            );

            try {
              const loginName =
                $('login-name')
                  .value
                  .trim()
                  .toLowerCase();

              const password =
                $('password')
                  .value;

              const {
                data,
                error
              } =
                await client.functions.invoke(
                  'login-by-nickname',
                  {
                    body: {
                      login_name:
                        loginName,
                      password
                    }
                  }
                );

              if (error) {
                throw error;
              }

              if (
                data?.ok !== true ||
                !data?.session
                  ?.access_token ||
                !data?.session
                  ?.refresh_token
              ) {
                throw new Error(
                  'INVALID_LOGIN'
                );
              }

              const {
                data: sessionData,
                error: sessionError
              } =
                await client.auth
                  .setSession({
                    access_token:
                      data.session
                        .access_token,
                    refresh_token:
                      data.session
                        .refresh_token
                  });

              if (sessionError) {
                throw sessionError;
              }

              if (
                !sessionData?.session
              ) {
                throw new Error(
                  'SESSION_NOT_CREATED'
                );
              }

              acceptSession(
                sessionData.session
              );
            } catch (e) {
              notice(
                $('login-message'),
                e.code ===
                  'invalid_credentials'
                  ? 'Nickname hoặc mật khẩu không đúng.'
                  : e.code ===
                      'email_not_confirmed'
                    ? 'Email chưa được xác nhận. Liên hệ quản trị viên.'
                    : 'Không thể đăng nhập. Kiểm tra kết nối và thông tin tài khoản rồi thử lại.',
                true
              );
            } finally {
              $('password').value =
                '';

              b.disabled =
                false;

              b.textContent =
                'Đăng nhập';
            }
          }
        );

      $('logout')
        .addEventListener(
          'click',
          async () => {
            const b =
              $('logout');

            b.disabled =
              true;

            try {
              const {
                error
              } =
                await client.auth
                  .signOut(
                    {
                      scope:
                        'local'
                    }
                  );

              if (error) {
                throw error;
              }

              acceptSession(
                null
              );

              notice(
                $('login-message'),
                'Bạn đã đăng xuất.'
              );
            } catch (e) {
              notice(
                $('global-message'),
                'Đăng xuất chưa thành công. Hãy kiểm tra kết nối và thử lại.',
                true
              );
            } finally {
              b.disabled =
                false;
            }
          }
        );

      window.addEventListener(
        'offline',
        () =>
          notice(
            state.session
              ? $('global-message')
              : $('login-message'),
            'Bạn đang ngoại tuyến. Dữ liệu trên màn hình có thể chưa được cập nhật.',
            true
          )
      );

      window.addEventListener(
        'online',
        () =>
          notice(
            state.session
              ? $('global-message')
              : $('login-message'),
            'Đã có kết nối trở lại. ' +
              (
                state.session
                  ? 'Chọn Làm mới để cập nhật dữ liệu.'
                  : 'Bạn có thể đăng nhập.'
              )
          )
      );

      async function boot() {
        try {
          const config =
            window.APP_CONFIG ||
            window.CONFIG ||
            {};
          const appName =
            String(
              config.APP_NAME ||
              'PICK'
            ).trim() ||
            'PICK';

          const clubName =
            String(
              config.CLUB_NAME ||
              appName
            ).trim() ||
            appName;

          const clubTagline =
            String(
              config.CLUB_TAGLINE ||
              'Cùng chơi • Cùng tiến bộ'
            ).trim();

          const clubLogo =
            String(
              config.CLUB_LOGO ||
              ''
            ).trim();

          document.title =
            clubName +
            ' • Pickleball Club';

          document
            .querySelectorAll(
              '.brand'
            )
            .forEach(
              brand => {
                brand.replaceChildren();

                if (clubLogo) {
                  const logo =
                    document.createElement(
                      'img'
                    );

                  logo.src =
                    clubLogo;

                  logo.alt =
                    clubName;

                  logo.className =
                    'club-brand-logo';

                  brand.append(
                    logo
                  );
                }

                const name =
                  document.createElement(
                    'span'
                  );

                name.className =
                  'club-brand-name';

                name.textContent =
                  clubName;

                brand.append(
                  name
                );
              }
            );

          const sidebarKicker =
            document.querySelector(
              '.sidebar-kicker'
            );

          if (sidebarKicker) {
            sidebarKicker.textContent =
              clubTagline;
          }

          const mobileBrandTagline =
            document.querySelector(
              '.login-mobile-brand p'
            );

          if (mobileBrandTagline) {
            mobileBrandTagline.textContent =
              clubTagline;
          }

          const storyKicker =
            document.querySelector(
              '.login-story-kicker'
            );

          if (storyKicker) {
            storyKicker.textContent =
              clubName.toUpperCase();
          }

          const url =
            config.SUPABASE_URL ||
            (
              typeof SUPABASE_URL !==
              'undefined'
                ? SUPABASE_URL
                : window.SUPABASE_URL
            );

          const key =
            config.SUPABASE_ANON_KEY ||
            (
              typeof SUPABASE_ANON_KEY !==
              'undefined'
                ? SUPABASE_ANON_KEY
                : window.SUPABASE_ANON_KEY
            );

          if (
            !url ||
            !key
          ) {
            throw new Error(
              'Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong config.js.'
            );
          }

          if (
            new URL(
              url
            ).protocol !==
            'https:'
          ) {
            throw new Error(
              'SUPABASE_URL phải sử dụng HTTPS.'
            );
          }

          if (
            !window.supabase
              ?.createClient
          ) {
            throw new Error(
              'Không tải được thư viện đăng nhập. Kiểm tra mạng rồi tải lại trang.'
            );
          }

          if (
            String(
              key
            ).startsWith(
              'sb_secret_'
            )
          ) {
            throw new Error(
              'config.js chỉ được chứa khóa anon hoặc publishable dành cho trình duyệt.'
            );
          }

          try {
            const payload =
              JSON.parse(
                atob(
                  String(
                    key
                  )
                    .split(
                      '.'
                    )[1]
                    .replace(
                      /-/g,
                      '+'
                    )
                    .replace(
                      /_/g,
                      '/'
                    )
                )
              );

            if (
              payload.role ===
              'service_role'
            ) {
              throw new Error(
                'SECRET_KEY'
              );
            }
          } catch (e) {
            if (
              e.message ===
              'SECRET_KEY'
            ) {
              throw new Error(
                'Không sử dụng service_role trong config.js.'
              );
            }
          }

          client =
            window.supabase
              .createClient(
                url,
                key,
                {
                  auth: {
                    persistSession:
                      true,
                    autoRefreshToken:
                      true,
                    detectSessionInUrl: true
                  },
                  global: {
                    fetch: async (
                      input,
                      init = {}
                    ) => {
                      const deadline =
                        AbortSignal.timeout(
                          25000
                        );

                      return fetch(
                        input,
                        {
                          ...init,
                          signal:
                            init.signal
                              ? AbortSignal.any(
                                  [
                                    init.signal,
                                    deadline
                                  ]
                                )
                              : deadline
                        }
                      );
                    }
                  }
                }
              );

          const recoveryRequested =
            new URLSearchParams(
              window.location.search
            ).get('recovery') === '1' ||
            new URLSearchParams(
              window.location.hash
                .replace(/^#/, '')
            ).get('type') === 'recovery';

          const showRecoveryPassword =
            () => {
              $('boot').hidden =
                true;

              $('login').hidden =
                false;

              $('app').hidden =
                true;

              $('login-form').hidden =
                true;

              $('auth-actions').hidden =
                true;

              $('signup-panel').hidden =
                true;

              $('forgot-password-panel').hidden =
                true;

              $('recovery-password-panel').hidden =
                false;

              notice(
                $('recovery-password-message'),
                'Liên kết khôi phục đã được xác nhận. Hãy đặt mật khẩu mới.',
                false,
                true
              );
            };

          const {
            data
          } =
            client.auth
              .onAuthStateChange(
                (
                  event,
                  session
                ) => {
                  if (
                    recoveryRequested ||
                    event ===
                      'PASSWORD_RECOVERY'
                  ) {
                    setTimeout(
                      showRecoveryPassword,
                      0
                    );

                    return;
                  }

                  const seq =
                    ++authSequence;

                  setTimeout(
                    () => {
                      if (
                        seq ===
                        authSequence
                      ) {
                        acceptSession(
                          session
                        );
                      }
                    },
                    0
                  );
                }
              );

          subscription =
            data.subscription;

          const seq =
            authSequence;

          const {
            data:
              sessionData,
            error
          } =
            await client.auth
              .getSession();

          if (error) {
            throw new Error(
              'Không khôi phục được phiên đăng nhập. Hãy tải lại trang.'
            );
          }

          if (
            recoveryRequested
          ) {
            if (
              sessionData.session
            ) {
              showRecoveryPassword();
            } else {
              notice(
                $('login-message'),
                'Liên kết khôi phục không còn phiên hợp lệ. Hãy yêu cầu một liên kết mới.',
                true
              );
            }
          } else if (
            seq ===
            authSequence
          ) {
            acceptSession(
              sessionData.session
            );
          }
        } catch (e) {
          $('boot').hidden =
            true;

          $('login').hidden =
            false;

          $('login-button').disabled =
            true;

          notice(
            $('login-message'),
            e.message ||
              'Không khởi động được ứng dụng.',
            true
          );
        }
      }

      window.addEventListener(
        'pagehide',
        () => {
          state.controller?.abort();
        }
      );

      window.addEventListener(
        'pageshow',
        e => {
          if (
            e.persisted &&
            state.session
          ) {
            void load();
          }
        }
      );

      void boot();
    })();














