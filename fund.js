(function () {
  'use strict';

  window.PickFund = {
    create(context) {
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
      } = context;

      function fund() {

        const root = $('content');

        sources(
          root,
          [
            'fund_contributions',
            'fund_payments',
            'fund_transactions',
            'fund_rules',
            'players'
          ]
        );
        // FUND PROGRESSIVE DISCLOSURE V1A
        const fundCollapse =
          (
            title,
            renderContent,
            openByDefault = false
          ) => {
            const wrapper =
              el(
                'div',
                null,
                'mt-4'
              );

            const body =
              el(
                'div',
                null,
                'mt-3'
              );

            body.hidden =
              !openByDefault;

            const toggle =
              button(
                openByDefault
                  ? `▼ Thu gọn ${title}`
                  : `▶ ${title}`,
                () => {
                  body.hidden =
                    !body.hidden;

                  toggle.textContent =
                    body.hidden
                      ? `▶ ${title}`
                      : `▼ Thu gọn ${title}`;
                },
                'border rounded-lg px-3 py-2 text-sm font-semibold w-full text-left'
              );

            toggle.type =
              'button';

            renderContent(
              body
            );

            wrapper.append(
              toggle,
              body
            );

            root.append(
              wrapper
            );

            return wrapper;
          };
    // FUND SUMMARY DEBT BY PLAYER V1B

    const validContribution =
      contribution => {
        const status =
          upper(
            contribution.status ||
            ''
          );

        return ![
          'DIEU_CHINH',
          'VOIDED',
          'INVALID',
          'CANCELLED',
          'CANCELED'
        ].includes(status);
      };

    const contributionAmount =
      contribution =>
        num(
          pick(
            contribution,
            'amount_due',
            'amount'
          )
        ) || 0;

    const paymentAmount =
      payment =>
        num(
          pick(
            payment,
            'amount'
          )
        ) || 0;
    // FUND UX POLISH V1C
    const fundReasonLabel =
      value => {
        const code =
          upper(
            value ||
            ''
          );

        const labels = {
          HOA: 'Hòa',
          DRAW: 'Hòa',
          THUA: 'Thua',
          LOSS: 'Thua',
          THANG: 'Thắng',
          WIN: 'Thắng',
          CLUB_RATED: 'Trận CLB',
          MATCH_LOSS: 'Thua trận',
          MATCH_DRAW: 'Hòa trận',
          MATCH_WIN: 'Thắng trận'
        };

        return labels[code] ||
          value ||
          '—';
      };

    const fundDebtStatus =
      (
        outstanding,
        credit
      ) => {
        if (credit > 0) {
          return 'Nộp dư';
        }

        if (outstanding > 0) {
          return 'Còn nợ';
        }

        return 'Đã đủ';
      };


    const activeContributions =
      rows('fund_contributions')
        .filter(
          validContribution
        );

    const activeContributionIds =
      new Set(
        activeContributions
          .map(
            contribution =>
              raw(
                contribution.id
              )
          )
          .filter(Boolean)
      );

    const memberFundOverview =
      !isAdmin()
        ? state.memberFundOverview
        : null;

    const totalDue =
      memberFundOverview
        ? num(
            memberFundOverview.total_due
          ) || 0
        : activeContributions
            .reduce(
              (sum, contribution) =>
                sum +
                contributionAmount(
                  contribution
                ),
              0
            );

    const totalPaid =
      memberFundOverview
        ? num(
            memberFundOverview.total_paid
          ) || 0
        : rows('fund_payments')
            .filter(
              payment =>
                activeContributionIds.has(
                  raw(
                    payment.contribution_id
                  )
                )
            )
            .reduce(
              (sum, payment) =>
                sum +
                paymentAmount(
                  payment
                ),
              0
            );

    const totalOutstanding =
      memberFundOverview
        ? num(
            memberFundOverview.total_outstanding
          ) || 0
        : Math.max(
            totalDue - totalPaid,
            0
          );

    const totalCredit =
      memberFundOverview
        ? num(
            memberFundOverview.total_credit
          ) || 0
        : Math.max(
            totalPaid - totalDue,
            0
          );
    // FUND OVERVIEW CASH BALANCE V2
    const fundCashInTypes =
      new Set([
        'THU_QUY_THUA_TRAN',
        'THU_QUY_HOA',
        'UNG_HO',
        'TAI_TRO',
        'THU_KHAC',
        'CHUYEN_VAO_QUY'
      ]);

    const fundCashOutTypes =
      new Set([
        'CHI_TIEU',
        'HOAN_TIEN'
      ]);

    const fundTransactionRows =
      rows('fund_transactions');

    const fundKnownCash =
      memberFundOverview
        ? {
            totalIn:
              num(
                memberFundOverview.total_in
              ) || 0,
            totalOut:
              num(
                memberFundOverview.total_out
              ) || 0,
            adjustmentCount:
              num(
                memberFundOverview.adjustment_count
              ) || 0,
            adjustmentAmount:
              num(
                memberFundOverview.adjustment_amount
              ) || 0
          }
        : fundTransactionRows.reduce(
            (
              result,
              transaction
            ) => {
              const type =
                upper(
                  transaction.transaction_type ||
                  ''
                );

              const amount =
                num(
                  transaction.amount
                ) || 0;

              if (
                fundCashInTypes.has(
                  type
                )
              ) {
                result.totalIn += amount;
              } else if (
                fundCashOutTypes.has(
                  type
                )
              ) {
                result.totalOut += amount;
              } else if (
                type === 'DIEU_CHINH'
              ) {
                result.adjustmentCount += 1;
                result.adjustmentAmount += amount;
              }

              return result;
            },
            {
              totalIn: 0,
              totalOut: 0,
              adjustmentCount: 0,
              adjustmentAmount: 0
            }
          );

    const fundKnownBalance =
      memberFundOverview
        ? num(
            memberFundOverview.balance
          ) || 0
        : fundKnownCash.totalIn -
          fundKnownCash.totalOut;


    grid(
      root,
      [
        [
          'Số dư quỹ',
          ready(
            'fund_transactions'
          )
            ? money(
                fundKnownBalance
              )
            : '—',
          fundKnownCash.adjustmentCount > 0
            ? 'Chưa bao gồm giao dịch Điều chỉnh'
            : 'Theo sổ giao dịch quỹ'
        ],
        [
          'Tổng thu',
          ready(
            'fund_transactions'
          )
            ? money(
                fundKnownCash.totalIn
              )
            : '—',
          'Tiền thực nhận vào quỹ'
        ],
        [
          'Tổng chi',
          ready(
            'fund_transactions'
          )
            ? money(
                fundKnownCash.totalOut
              )
            : '—',
          'Chi tiêu và hoàn tiền'
        ]
      ]
    );

    grid(
      root,
      [
        [
          'Tổng nghĩa vụ',
          ready(
            'fund_contributions'
          )
            ? money(totalDue)
            : '—',
          'Tổng khoản phải đóng hợp lệ'
        ],
        [
          'Đã thanh toán',
          ready(
            'fund_payments'
          )
            ? money(totalPaid)
            : '—',
          'Theo sổ thanh toán'
        ],
        [
          'Còn phải thu',
          ready(
            'fund_contributions'
          ) &&
          ready(
            'fund_payments'
          )
            ? money(
                totalOutstanding
              )
            : '—',
          'Nghĩa vụ trừ thanh toán'
        ],
        [
          'Nộp dư',
          ready(
            'fund_contributions'
          ) &&
          ready(
            'fund_payments'
          )
            ? money(
                totalCredit
              )
            : '—',
          totalCredit > 0
            ? 'Có số tiền thanh toán vượt nghĩa vụ'
            : 'Không có'
        ]
      ]
    );

    root.append(
      el(
        'p',
        'Số dư quỹ được tính từ Sổ giao dịch: các khoản thu làm tăng quỹ, Chi tiêu và Hoàn tiền làm giảm quỹ. Công nợ VĐV được tính riêng từ nghĩa vụ đóng quỹ và sổ thanh toán.',
        'notice'
      )
    );

    // FUND ADMIN OBLIGATION VISIBILITY V1
    if (isAdmin()) {
      const recentFundObligations =
        activeContributions
          .slice()
          .sort(
            (a, b) =>
              new Date(
                b.created_at || 0
              ).getTime() -
              new Date(
                a.created_at || 0
              ).getTime()
          )
          .slice(
            0,
            50
          );

      root.append(
        el(
          'p',
          recentFundObligations.length
            ? `Đã ghi nhận ${recentFundObligations.length} nghĩa vụ quỹ gần nhất. Các nghĩa vụ mới sinh sau khi duyệt trận sẽ xuất hiện tại đây.`
            : 'Chưa có nghĩa vụ quỹ nào được ghi nhận.',
          'notice'
        )
      );

      table(
        root,
        'Nghĩa vụ quỹ đã ghi nhận',
        recentFundObligations
          .map(
            contribution => {
              const match =
                rows('matches')
                  .find(
                    item =>
                      raw(item.id) ===
                      raw(
                        contribution.match_id
                      )
                  );

              return {
                ...contribution,
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
                        contribution.match_id
                          ? '#' +
                            String(
                              contribution.match_id
                            ).slice(
                              0,
                              8
                            )
                          : '—'
                      )
              };
            }
          ),
        [
          [
            'VĐV',
            r =>
              playerName(
                r.player_id
              )
          ],
          moneyCol(
            'Số tiền',
            'amount_due',
            'amount'
          ),
          [
            'Loại',
            r =>
              fundReasonLabel(
                pick(
                  r,
                  'reason',
                  'contribution_type',
                  'type'
                )
              )
          ],
          statusCol,
          [
            'Trận liên quan',
            r =>
              r.match_reference ||
              '—'
          ],
          dateCol(
            'Ghi nhận',
            'created_at'
          )
        ],
        {
          status: true,
          unavailable:
            !!state.errors
              .fund_contributions ||
            !!state.errors
              .matches
        }
      );
    }

    if (
      fundKnownCash.adjustmentCount > 0
    ) {
      root.append(
        el(
          'p',
          `Cảnh báo: Có ${fundKnownCash.adjustmentCount} giao dịch Điều chỉnh, tổng ${money(fundKnownCash.adjustmentAmount)}. Các giao dịch này chưa được tính vào số dư vì chưa xác định chiều tăng/giảm.`,
          'notice'
        )
      );
    }

        // MEMBER PERSONAL FUND V1
        if (!isAdmin()) {
          fundCollapse(
            'Quỹ của tôi',
            sectionRoot => {
              const playerId =
                raw(
                  state.profile?.player_id
                );

              if (!playerId) {
                sectionRoot.append(
                  el(
                    'p',
                    'Tài khoản chưa được liên kết với VĐV.',
                    'notice error'
                  )
                );

                return;
              }

              const myContributions =
                activeContributions
                  .filter(
                    contribution =>
                      raw(
                        contribution.player_id
                      ) ===
                      playerId
                  );

              const myPayments =
                rows('fund_payments')
                  .filter(
                    payment =>
                      raw(
                        payment.player_id
                      ) ===
                      playerId
                  );

              const paidByContribution =
                new Map();

              myPayments.forEach(
                payment => {
                  const contributionId =
                    raw(
                      payment.contribution_id
                    );

                  if (!contributionId) {
                    return;
                  }

                  paidByContribution.set(
                    contributionId,
                    (
                      paidByContribution.get(
                        contributionId
                      ) || 0
                    ) +
                    (
                      Number(
                        payment.amount
                      ) || 0
                    )
                  );
                }
              );

              const myTotalDue =
                myContributions.reduce(
                  (sum, contribution) =>
                    sum +
                    (
                      Number(
                        contribution.amount_due
                      ) || 0
                    ),
                  0
                );

              const myTotalPaid =
                myPayments
                  .filter(
                    payment =>
                      activeContributionIds.has(
                        raw(
                          payment.contribution_id
                        )
                      )
                  )
                  .reduce(
                    (sum, payment) =>
                      sum +
                      (
                        Number(
                          payment.amount
                        ) || 0
                      ),
                    0
                  );

              const myOutstanding =
                myContributions.reduce(
                  (sum, contribution) => {
                    const due =
                      Number(
                        contribution.amount_due
                      ) || 0;

                    const paid =
                      paidByContribution.get(
                        raw(
                          contribution.id
                        )
                      ) || 0;

                    return (
                      sum +
                      Math.max(
                        due - paid,
                        0
                      )
                    );
                  },
                  0
                );

              grid(
                sectionRoot,
                [
                  [
                    'Nghĩa vụ của tôi',
                    money(
                      myTotalDue
                    ),
                    'Các khoản đóng quỹ còn hiệu lực'
                  ],
                  [
                    'Đã đóng',
                    money(
                      myTotalPaid
                    ),
                    'Theo lịch sử thanh toán của tôi'
                  ],
                  [
                    'Còn phải đóng',
                    money(
                      myOutstanding
                    ),
                    myOutstanding > 0
                      ? 'Còn nghĩa vụ chưa hoàn tất'
                      : 'Đã hoàn tất nghĩa vụ hiện tại'
                  ]
                ]
              );

              const obligationsTitle =
                el(
                  'h3',
                  'Các khoản nghĩa vụ',
                  'font-semibold mt-5 mb-3'
                );

              sectionRoot.append(
                obligationsTitle
              );

              if (
                !myContributions.length
              ) {
                sectionRoot.append(
                  el(
                    'p',
                    'Hiện không có nghĩa vụ quỹ nào.',
                    'text-sm opacity-70'
                  )
                );
              } else {
                const obligationList =
                  el(
                    'div',
                    null,
                    'space-y-2'
                  );

                myContributions
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(
                        b.created_at || 0
                      ).getTime() -
                      new Date(
                        a.created_at || 0
                      ).getTime()
                  )
                  .forEach(
                    contribution => {
                      const due =
                        Number(
                          contribution.amount_due
                        ) || 0;

                      const paid =
                        paidByContribution.get(
                          raw(
                            contribution.id
                          )
                        ) || 0;

                      const remaining =
                        Math.max(
                          due - paid,
                          0
                        );

                      const reason =
                        raw(
                          contribution.reason
                        ) || 'QUỸ';

                      const status =
                        upper(
                          contribution.status
                        );

                      obligationList.append(
                        el(
                          'div',
                          `${reason} • Nghĩa vụ ${money(
                            due
                          )} • Đã đóng ${money(
                            paid
                          )} • Còn ${money(
                            remaining
                          )} • ${status}`,
                          'rounded-xl border p-3 text-sm'
                        )
                      );
                    }
                  );

                sectionRoot.append(
                  obligationList
                );
              }

              sectionRoot.append(
                el(
                  'h3',
                  'Lịch sử đóng quỹ',
                  'font-semibold mt-5 mb-3'
                )
              );

              if (!myPayments.length) {
                sectionRoot.append(
                  el(
                    'p',
                    'Chưa có giao dịch đóng quỹ.',
                    'text-sm opacity-70'
                  )
                );
              } else {
                const paymentList =
                  el(
                    'div',
                    null,
                    'space-y-2'
                  );

                myPayments
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(
                        b.paid_at ||
                        b.created_at ||
                        0
                      ).getTime() -
                      new Date(
                        a.paid_at ||
                        a.created_at ||
                        0
                      ).getTime()
                  )
                  .forEach(
                    payment => {
                      const paidAt =
                        payment.paid_at
                          ? new Date(
                              payment.paid_at
                            )
                          : null;

                      const paidText =
                        paidAt &&
                        Number.isFinite(
                          paidAt.getTime()
                        )
                          ? paidAt.toLocaleString(
                              'vi-VN'
                            )
                          : 'Không rõ thời gian';

                      const note =
                        raw(
                          payment.note
                        );

                      paymentList.append(
                        el(
                          'div',
                          `${money(
                            Number(
                              payment.amount
                            ) || 0
                          )} • ${paidText}${
                            note
                              ? ` • ${note}`
                              : ''
                          }`,
                          'rounded-xl border p-3 text-sm'
                        )
                      );
                    }
                  );

                sectionRoot.append(
                  paymentList
                );
              }
            }
          );
        }
        // FUND COLLECTION UI V1
    if (isAdmin()) {
      fundCollapse(
        'Thao tác quỹ',
        sectionRoot => {
          // FUND ACTIONS TREE V1
          const collectionDetails =
            document.createElement(
              'details'
            );

          collectionDetails.className =
            'fund-action fund-action-income';

          const collectionSummary =
            document.createElement(
              'summary'
            );

          collectionSummary.className =
            'fund-action-summary';

          collectionSummary.textContent =
            'Thu quỹ';

          const collectionContent =
            el(
              'div',
              null,
              'px-4 pb-4'
            );

          const wrapper =
            el(
              'div',
              null,
              'rounded-xl border p-4'
            );

          wrapper.append(
            el(
              'h3',
              'Thu công nợ VĐV',
              'font-semibold mb-1'
            ),
            el(
              'p',
              'Ghi nhận tiền thực nhận từ nghĩa vụ Quỹ phát sinh theo trận đấu.',
              'text-sm opacity-70 mb-4'
            )
          );

          const message =
            el(
              'div'
            );

          message.hidden =
            true;

          const playerLabel =
            el(
              'label',
              'VĐV',
              'block text-sm font-semibold mb-1'
            );

          const playerSelect =
            document.createElement(
              'select'
            );

          playerSelect.className =
            'w-full border rounded-lg px-3 py-2 mb-3';

          const contributionLabel =
            el(
              'label',
              'Khoản phải đóng',
              'block text-sm font-semibold mb-1'
            );

          const contributionSelect =
            document.createElement(
              'select'
            );

          contributionSelect.className =
            'w-full border rounded-lg px-3 py-2 mb-3';

          const summary =
            el(
              'div',
              null,
              'grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4'
            );

          const amountLabel =
            el(
              'label',
              'Số tiền nhận',
              'block text-sm font-semibold mb-1'
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

          amountInput.className =
            'w-full border rounded-lg px-3 py-2 mb-3';

          const paidAtLabel =
            el(
              'label',
              'Ngày giờ nhận',
              'block text-sm font-semibold mb-1'
            );

          const paidAtInput =
            document.createElement(
              'input'
            );

          paidAtInput.type =
            'datetime-local';

          paidAtInput.className =
            'w-full border rounded-lg px-3 py-2 mb-3';

          const noteLabel =
            el(
              'label',
              'Ghi chú',
              'block text-sm font-semibold mb-1'
            );

          const noteInput =
            document.createElement(
              'input'
            );

          noteInput.type =
            'text';

          noteInput.placeholder =
            'Ví dụ: Thu tiền mặt tại sân';

          noteInput.className =
            'w-full border rounded-lg px-3 py-2 mb-4';

          const now =
            new Date();

          const localNow =
            new Date(
              now.getTime() -
              now.getTimezoneOffset() *
              60000
            );

          paidAtInput.value =
            localNow
              .toISOString()
              .slice(
                0,
                16
              );

          const paymentByContribution =
            new Map();

          rows(
            'fund_payments'
          ).forEach(
            payment => {
              const id =
                payment
                  .contribution_id;

              if (!id) {
                return;
              }

              paymentByContribution.set(
                id,
                (
                  paymentByContribution
                    .get(id) || 0
                ) +
                (
                  num(
                    payment.amount
                  ) || 0
                )
              );
            }
          );

          const collectibleContributions =
            activeContributions
              .filter(
                contribution => {
                  const reason =
                    upper(
                      pick(
                        contribution,
                        'reason',
                        'contribution_type',
                        'type'
                      )
                    );

                  if (
                    reason !== 'THUA' &&
                    reason !== 'HOA'
                  ) {
                    return false;
                  }

                  const due =
                    contributionAmount(
                      contribution
                    );

                  const paid =
                    paymentByContribution
                      .get(
                        contribution.id
                      ) || 0;

                  return (
                    due > 0 &&
                    paid < due
                  );
                }
              );

          const playerIds =
            Array.from(
              new Set(
                collectibleContributions
                  .map(
                    contribution =>
                      contribution
                        .player_id
                  )
                  .filter(Boolean)
              )
            )
              .sort(
                (a, b) =>
                  playerName(a)
                    .localeCompare(
                      playerName(b),
                      'vi'
                    )
              );

          playerSelect.append(
            new Option(
              '— Chọn VĐV —',
              ''
            )
          );

          playerIds.forEach(
            playerId => {
              playerSelect.append(
                new Option(
                  playerName(
                    playerId
                  ),
                  playerId
                )
              );
            }
          );

          const selectedContribution =
            () =>
              collectibleContributions
                .find(
                  contribution =>
                    contribution.id ===
                    contributionSelect.value
                ) ||
              null;

          const drawSummary =
            () => {
              summary.replaceChildren();

              const contribution =
                selectedContribution();

              if (!contribution) {
                summary.append(
                  el(
                    'div',
                    'Chọn một khoản phải đóng để xem số tiền còn lại.',
                    'text-sm opacity-70 sm:col-span-3'
                  )
                );

                amountInput.value =
                  '';

                amountInput.max =
                  '';

                return;
              }

              const due =
                contributionAmount(
                  contribution
                );

              const paid =
                paymentByContribution
                  .get(
                    contribution.id
                  ) || 0;

              const remaining =
                Math.max(
                  0,
                  due - paid
                );

              const stat =
                (
                  label,
                  value
                ) =>
                  el(
                    'div',
                    null,
                    'rounded-lg border p-3'
                  );

              const dueBox =
                stat();

              dueBox.append(
                el(
                  'div',
                  'Phải đóng',
                  'text-xs opacity-70'
                ),
                el(
                  'div',
                  money(due),
                  'font-semibold mt-1'
                )
              );

              const paidBox =
                stat();

              paidBox.append(
                el(
                  'div',
                  'Đã nộp',
                  'text-xs opacity-70'
                ),
                el(
                  'div',
                  money(paid),
                  'font-semibold mt-1'
                )
              );

              const remainBox =
                stat();

              remainBox.append(
                el(
                  'div',
                  'Còn lại',
                  'text-xs opacity-70'
                ),
                el(
                  'div',
                  money(remaining),
                  'font-semibold mt-1'
                )
              );

              summary.append(
                dueBox,
                paidBox,
                remainBox
              );

              amountInput.max =
                String(
                  remaining
                );

              amountInput.value =
                String(
                  remaining
                );
            };

          const fillContributions =
            () => {
              contributionSelect
                .replaceChildren();

              contributionSelect.append(
                new Option(
                  '— Chọn khoản phải đóng —',
                  ''
                )
              );

              const playerId =
                playerSelect.value;

              if (!playerId) {
                drawSummary();
                return;
              }

              collectibleContributions
                .filter(
                  contribution =>
                    contribution.player_id ===
                    playerId
                )
                .sort(
                  (a, b) => {
                    const ma =
                      rows(
                        'matches'
                      ).find(
                        item =>
                          item.id ===
                          a.match_id
                      );

                    const mb =
                      rows(
                        'matches'
                      ).find(
                        item =>
                          item.id ===
                          b.match_id
                      );

                    return (
                      new Date(
                        mb?.played_at || 0
                      ).getTime() -
                      new Date(
                        ma?.played_at || 0
                      ).getTime()
                    );
                  }
                )
                .forEach(
                  contribution => {
                    const due =
                      contributionAmount(
                        contribution
                      );

                    const paid =
                      paymentByContribution
                        .get(
                          contribution.id
                        ) || 0;

                    const remaining =
                      Math.max(
                        0,
                        due - paid
                      );

                    const match =
                      rows(
                        'matches'
                      ).find(
                        item =>
                          item.id ===
                          contribution
                            .match_id
                      );

                    const reason =
                      fundReasonLabel(
                        pick(
                          contribution,
                          'reason',
                          'contribution_type',
                          'type'
                        )
                      );

                    const label =
                      (
                        match
                          ? matchCode(
                              match
                            )
                          : String(
                              contribution.id
                            ).slice(
                              0,
                              8
                            )
                      ) +
                      ' • ' +
                      reason +
                      ' • Còn ' +
                      money(
                        remaining
                      );

                    contributionSelect
                      .append(
                        new Option(
                          label,
                          contribution.id
                        )
                      );
                  }
                );

              drawSummary();
            };

          playerSelect
            .addEventListener(
              'change',
              fillContributions
            );

          contributionSelect
            .addEventListener(
              'change',
              drawSummary
            );

          const submit =
            button(
              'Ghi nhận thanh toán',
              async () => {
                notice(
                  message,
                  ''
                );

                const contribution =
                  selectedContribution();

                if (!contribution) {
                  notice(
                    message,
                    'Vui lòng chọn khoản phải đóng.',
                    true
                  );

                  return;
                }

                const amount =
                  num(
                    amountInput.value
                  );

                const due =
                  contributionAmount(
                    contribution
                  );

                const paidBefore =
                  paymentByContribution
                    .get(
                      contribution.id
                    ) || 0;

                const remainingBefore =
                  Math.max(
                    0,
                    due -
                    paidBefore
                  );

                if (
                  amount === null ||
                  amount <= 0
                ) {
                  notice(
                    message,
                    'Số tiền nhận phải lớn hơn 0.',
                    true
                  );

                  return;
                }

                if (
                  amount >
                  remainingBefore
                ) {
                  notice(
                    message,
                    'Số tiền nhận không được vượt quá công nợ còn lại ' +
                    money(
                      remainingBefore
                    ) +
                    '.',
                    true
                  );

                  return;
                }

                if (
                  !paidAtInput.value
                ) {
                  notice(
                    message,
                    'Vui lòng chọn ngày giờ nhận tiền.',
                    true
                  );

                  return;
                }

                const paidDate =
                  new Date(
                    paidAtInput.value
                  );

                if (
                  Number.isNaN(
                    paidDate.getTime()
                  )
                ) {
                  notice(
                    message,
                    'Ngày giờ nhận tiền không hợp lệ.',
                    true
                  );

                  return;
                }

                submit.disabled =
                  true;

                submit.textContent =
                  'Đang ghi nhận…';

                try {
                  const {
                    data,
                    error
                  } =
                    await client.rpc(
                      'record_fund_payment',
                      {
                        p_contribution_id:
                          contribution.id,

                        p_amount:
                          amount,

                        p_paid_at:
                          paidDate
                            .toISOString(),

                        p_note:
                          noteInput.value
                            .trim() ||
                          null
                      }
                    );

                  if (error) {
                    throw error;
                  }

                  const remainingAfter =
                    num(
                      data?.remaining
                    );

                  const status =
                    upper(
                      data?.status
                    );

                  const statusText =
                    status ===
                    'DA_DONG'
                      ? 'Đã đóng'
                      : status ===
                        'DONG_MOT_PHAN'
                        ? 'Đóng một phần'
                        : (
                            data?.status ||
                            'Đã ghi nhận'
                          );

                  await load();

                  state.page =
                    'fund';

                  render();

                  notice(
                    $('global-message'),
                    'Đã ghi nhận ' +
                    money(amount) +
                    ' • Còn lại ' +
                    money(
                      remainingAfter || 0
                    ) +
                    ' • ' +
                    statusText +
                    '.',
                    false,
                    true
                  );
                }
                catch (error) {
                  notice(
                    message,
                    error?.message ||
                      'Không thể ghi nhận thanh toán.',
                    true
                  );
                }
                finally {
                  submit.disabled =
                    false;

                  submit.textContent =
                    'Ghi nhận thanh toán';
                }
              },
              'btn primary'
            );

          submit.type =
            'button';

          wrapper.append(
            playerLabel,
            playerSelect,
            contributionLabel,
            contributionSelect,
            summary,
            amountLabel,
            amountInput,
            paidAtLabel,
            paidAtInput,
            noteLabel,
            noteInput,
            submit,
            message
          );

          
          // FUND EXPENSE UI V1
          const expenseDetails =
            document.createElement(
              'details'
            );

          expenseDetails.className =
            'fund-action fund-action-expense';

          const expenseSummary =
            document.createElement(
              'summary'
            );

          expenseSummary.className =
            'fund-action-summary';

          expenseSummary.textContent =
            'Chi quỹ';

          const expenseContent =
            el(
              'div',
              null,
              'px-4 pb-4'
            );

          const expenseMessage =
            el(
              'div',
              null,
              'mb-3'
            );

          expenseMessage.hidden =
            true;

          const cashInTypes =
            new Set(
              [
                'THU_QUY_THUA_TRAN',
                'THU_QUY_HOA',
                'UNG_HO',
                'TAI_TRO',
                'THU_KHAC',
                'CHUYEN_VAO_QUY'
              ]
            );

          const cashOutTypes =
            new Set(
              [
                'CHI_TIEU',
                'HOAN_TIEN'
              ]
            );

          const calculateExpenseBalance =
            () =>
              rows(
                'fund_transactions'
              ).reduce(
                (
                  balance,
                  transaction
                ) => {
                  const type =
                    upper(
                      transaction
                        .transaction_type
                    );

                  const amount =
                    num(
                      transaction.amount
                    ) || 0;

                  if (
                    cashInTypes.has(
                      type
                    )
                  ) {
                    return (
                      balance +
                      amount
                    );
                  }

                  if (
                    cashOutTypes.has(
                      type
                    )
                  ) {
                    return (
                      balance -
                      amount
                    );
                  }

                  return balance;
                },
                0
              );

          const balanceBox =
            el(
              'div',
              null,
              'rounded-lg border p-3 mb-4'
            );

          const renderExpenseBalance =
            () => {
              const balance =
                calculateExpenseBalance();

              balanceBox
                .replaceChildren(
                  el(
                    'div',
                    'Số dư khả dụng',
                    'text-xs opacity-70'
                  ),
                  el(
                    'div',
                    money(
                      balance
                    ),
                    'font-semibold text-lg mt-1'
                  ),
                  el(
                    'div',
                    'Không bao gồm giao dịch Điều chỉnh chưa xác định chiều.',
                    'text-xs opacity-60 mt-1'
                  )
                );

              return balance;
            };

          renderExpenseBalance();

          const expenseAmountLabel =
            el(
              'label',
              'Số tiền chi',
              'block text-sm font-semibold mb-1'
            );

          const expenseAmountInput =
            document.createElement(
              'input'
            );

          expenseAmountInput.type =
            'number';

          expenseAmountInput.min =
            '1';

          expenseAmountInput.step =
            '1000';

          expenseAmountInput.placeholder =
            'Ví dụ: 10000';

          expenseAmountInput.className =
            'w-full border rounded-lg px-3 py-2 mb-3';

          const expenseDateLabel =
            el(
              'label',
              'Ngày giờ chi',
              'block text-sm font-semibold mb-1'
            );

          const expenseDateInput =
            document.createElement(
              'input'
            );

          expenseDateInput.type =
            'datetime-local';

          expenseDateInput.className =
            'w-full border rounded-lg px-3 py-2 mb-3';

          const expenseNow =
            new Date();

          const expenseLocalNow =
            new Date(
              expenseNow.getTime() -
              expenseNow.getTimezoneOffset() *
              60000
            );

          expenseDateInput.value =
            expenseLocalNow
              .toISOString()
              .slice(
                0,
                16
              );

          const expenseDescriptionLabel =
            el(
              'label',
              'Nội dung chi',
              'block text-sm font-semibold mb-1'
            );

          const expenseDescriptionInput =
            document.createElement(
              'textarea'
            );

          expenseDescriptionInput.rows =
            3;

          expenseDescriptionInput.placeholder =
            'Ví dụ: Mua bóng phục vụ sinh hoạt CLB';

          expenseDescriptionInput.className =
            'w-full border rounded-lg px-3 py-2 mb-4';

          const expenseSubmit =
            button(
              'Ghi nhận khoản chi',
              async () => {
                notice(
                  expenseMessage,
                  ''
                );

                const amount =
                  num(
                    expenseAmountInput
                      .value
                  );

                const description =
                  expenseDescriptionInput
                    .value
                    .trim();

                const currentBalance =
                  renderExpenseBalance();

                if (
                  amount === null ||
                  amount <= 0
                ) {
                  notice(
                    expenseMessage,
                    'Số tiền chi phải lớn hơn 0.',
                    true
                  );

                  return;
                }

                if (
                  amount >
                  currentBalance
                ) {
                  notice(
                    expenseMessage,
                    'Số tiền chi vượt số dư khả dụng ' +
                      money(
                        currentBalance
                      ) +
                      '.',
                    true
                  );

                  return;
                }

                if (!description) {
                  notice(
                    expenseMessage,
                    'Vui lòng nhập nội dung chi.',
                    true
                  );

                  return;
                }

                if (
                  !expenseDateInput
                    .value
                ) {
                  notice(
                    expenseMessage,
                    'Vui lòng chọn ngày giờ chi.',
                    true
                  );

                  return;
                }

                const transactionDate =
                  new Date(
                    expenseDateInput
                      .value
                  );

                if (
                  Number.isNaN(
                    transactionDate
                      .getTime()
                  )
                ) {
                  notice(
                    expenseMessage,
                    'Ngày giờ chi không hợp lệ.',
                    true
                  );

                  return;
                }

                expenseSubmit.disabled =
                  true;

                expenseSubmit.textContent =
                  'Đang ghi nhận…';

                try {
                  const {
                    data,
                    error
                  } =
                    await client.rpc(
                      'record_fund_expense',
                      {
                        p_amount:
                          amount,

                        p_description:
                          description,

                        p_transaction_date:
                          transactionDate
                            .toISOString()
                      }
                    );

                  if (error) {
                    throw error;
                  }

                  const balanceAfter =
                    num(
                      data
                        ?.balance_after
                    );

                  await load();

                  state.page =
                    'fund';

                  render();

                  notice(
                    $('global-message'),
                    'Đã ghi nhận chi ' +
                      money(
                        amount
                      ) +
                      ' • Số dư còn ' +
                      money(
                        balanceAfter || 0
                      ) +
                      '.',
                    false,
                    true
                  );
                }
                catch (error) {
                  notice(
                    expenseMessage,
                    error?.message ||
                      'Không thể ghi nhận khoản chi.',
                    true
                  );
                }
                finally {
                  expenseSubmit.disabled =
                    false;

                  expenseSubmit.textContent =
                    'Ghi nhận khoản chi';
                }
              },
              'btn primary'
            );

          expenseSubmit.type =
            'button';

          expenseContent.append(
            el(
              'p',
              'Ghi nhận tiền thực chi từ quỹ CLB. Dữ liệu được lưu vào sổ giao dịch dưới loại Chi tiêu.',
              'text-sm opacity-70 mb-4'
            ),
            balanceBox,
            expenseAmountLabel,
            expenseAmountInput,
            expenseDateLabel,
            expenseDateInput,
            expenseDescriptionLabel,
            expenseDescriptionInput,
            expenseSubmit,
            expenseMessage
          );

          expenseDetails.append(
            expenseSummary,
            expenseContent
          );
collectionContent.append(
            wrapper
          );

          collectionDetails.append(
            collectionSummary,
            collectionContent
          );

          const closeOtherFundAction =
            (
              opened,
              other
            ) => {
              if (
                opened.open
              ) {
                other.open =
                  false;
              }
            };

          collectionDetails.addEventListener(
            'toggle',
            () => {
              closeOtherFundAction(
                collectionDetails,
                expenseDetails
              );
            }
          );

          expenseDetails.addEventListener(
            'toggle',
            () => {
              closeOtherFundAction(
                expenseDetails,
                collectionDetails
              );
            }
          );

          sectionRoot.append(
            collectionDetails,
            expenseDetails
          );

          fillContributions();
        },
        true
      );
    }

    // FUND DEBT REPORT V1
    fundCollapse(
      'Báo cáo công nợ',
      sectionRoot => {
        const wrapper =
          el(
            'div',
            null,
            'rounded-xl border p-4'
          );

        wrapper.append(
          el(
            'h3',
            'Báo cáo công nợ VĐV',
            'font-semibold mb-1'
          ),
          el(
            'p',
            'Lọc nghĩa vụ theo ngày thi đấu. Số đã nộp được tính theo toàn bộ thanh toán của chính các nghĩa vụ trong kỳ.',
            'text-sm opacity-70 mb-4'
          )
        );

        const controls =
          el(
            'div',
            null,
            'grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4'
          );

        const field =
          (
            labelText,
            control
          ) => {
            const box =
              el(
                'div'
              );

            box.append(
              el(
                'label',
                labelText,
                'block text-sm font-semibold mb-1'
              ),
              control
            );

            return box;
          };

        const fromInput =
          document.createElement(
            'input'
          );

        fromInput.type =
          'date';

        fromInput.className =
          'w-full border rounded-lg px-3 py-2';

        const toInput =
          document.createElement(
            'input'
          );

        toInput.type =
          'date';

        toInput.className =
          'w-full border rounded-lg px-3 py-2';

        const onlyDebtInput =
          document.createElement(
            'input'
          );

        onlyDebtInput.type =
          'checkbox';

        onlyDebtInput.checked =
          true;

        onlyDebtInput.className =
          'h-4 w-4';

        const onlyDebtWrap =
          el(
            'label',
            null,
            'flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer'
          );

        onlyDebtWrap.append(
          onlyDebtInput,
          el(
            'span',
            'Chỉ còn nợ',
            'text-sm font-medium'
          )
        );

        const reportMessage =
          el(
            'div',
            null,
            'mb-3'
          );

        reportMessage.hidden =
          true;

        const resultRoot =
          el(
            'div'
          );

        const vnDateKey =
          value => {
            if (!value) {
              return '';
            }

            const date =
              new Date(
                value
              );

            if (
              Number.isNaN(
                date.getTime()
              )
            ) {
              return '';
            }

            const parts =
              new Intl.DateTimeFormat(
                'en-CA',
                {
                  timeZone:
                    'Asia/Ho_Chi_Minh',

                  year:
                    'numeric',

                  month:
                    '2-digit',

                  day:
                    '2-digit'
                }
              )
                .formatToParts(
                  date
                );

            const map = {};

            parts.forEach(
              part => {
                map[
                  part.type
                ] =
                  part.value;
              }
            );

            return (
              map.year +
              '-' +
              map.month +
              '-' +
              map.day
            );
          };

        const displayDate =
          value => {
            if (!value) {
              return '—';
            }

            const parts =
              String(
                value
              ).split(
                '-'
              );

            if (
              parts.length !== 3
            ) {
              return value;
            }

            return (
              parts[2] +
              '/' +
              parts[1] +
              '/' +
              parts[0]
            );
          };

        const allMatchDates =
          rows(
            'matches'
          )
            .filter(
              match =>
                upper(
                  match.status
                ) ===
                'APPROVED'
            )
            .map(
              match =>
                vnDateKey(
                  match.played_at
                )
            )
            .filter(Boolean)
            .sort();

        if (
          allMatchDates.length
        ) {
          fromInput.value =
            allMatchDates[0];

          toInput.value =
            allMatchDates[
              allMatchDates.length - 1
            ];
        }
        else {
          const today =
            vnDateKey(
              new Date()
            );

          fromInput.value =
            today;

          toInput.value =
            today;
        }

        const paymentTotals =
          new Map();

        rows(
          'fund_payments'
        ).forEach(
          payment => {
            const contributionId =
              payment
                .contribution_id;

            if (!contributionId) {
              return;
            }

            paymentTotals.set(
              contributionId,
              (
                paymentTotals.get(
                  contributionId
                ) || 0
              ) +
              (
                num(
                  payment.amount
                ) || 0
              )
            );
          },
          true
        );

        const getReportData =
          () => {
            const from =
              fromInput.value;

            const to =
              toInput.value;

            if (
              !from ||
              !to
            ) {
              return {
                error:
                  'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.'
              };
            }

            if (
              from > to
            ) {
              return {
                error:
                  'Từ ngày không được lớn hơn Đến ngày.'
              };
            }

            const matchMap =
              new Map(
                rows(
                  'matches'
                ).map(
                  match => [
                    match.id,
                    match
                  ]
                )
              );

            const playerMap =
              new Map();

            rows(
              'fund_contributions'
            ).forEach(
              contribution => {
                const match =
                  matchMap.get(
                    contribution
                      .match_id
                  );

                if (!match) {
                  return;
                }

                if (
                  upper(
                    match.status
                  ) !==
                  'APPROVED'
                ) {
                  return;
                }

                const playedDate =
                  vnDateKey(
                    match.played_at
                  );

                if (
                  !playedDate ||
                  playedDate < from ||
                  playedDate > to
                ) {
                  return;
                }

                const status =
                  upper(
                    pick(
                      contribution,
                      'status',
                      'contribution_status'
                    )
                  );

                if (
                  status ===
                    'MIEN' ||
                  status ===
                    'DIEU_CHINH'
                ) {
                  return;
                }

                const reason =
                  upper(
                    pick(
                      contribution,
                      'reason',
                      'contribution_type',
                      'type'
                    )
                  );

                if (
                  reason !== 'THUA' &&
                  reason !== 'HOA'
                ) {
                  return;
                }

                const due =
                  num(
                    contribution
                      .amount_due
                  ) || 0;

                if (
                  due <= 0
                ) {
                  return;
                }

                const paid =
                  paymentTotals.get(
                    contribution.id
                  ) || 0;

                const remaining =
                  Math.max(
                    0,
                    due - paid
                  );

                const playerId =
                  contribution
                    .player_id;

                if (!playerId) {
                  return;
                }

                if (
                  !playerMap.has(
                    playerId
                  )
                ) {
                  playerMap.set(
                    playerId,
                    {
                      playerId,
                      name:
                        playerName(
                          playerId
                        ),

                      due:
                        0,

                      paid:
                        0,

                      remaining:
                        0,

                      openCount:
                        0,

                      contributionCount:
                        0,

                      items:
                        []
                    }
                  );
                }

                const player =
                  playerMap.get(
                    playerId
                  );

                player.due +=
                  due;

                player.paid +=
                  paid;

                player.remaining +=
                  remaining;

                player.contributionCount +=
                  1;

                if (
                  remaining > 0
                ) {
                  player.openCount +=
                    1;
                }

                player.items.push(
                  {
                    contribution,
                    match,
                    due,
                    paid,
                    remaining,
                    reason
                  }
                );
              }
            );

            let players =
              Array.from(
                playerMap.values()
              );

            if (
              onlyDebtInput.checked
            ) {
              players =
                players.filter(
                  player =>
                    player.remaining >
                    0
                );
            }

            players.sort(
              (a, b) => {
                if (
                  b.remaining !==
                  a.remaining
                ) {
                  return (
                    b.remaining -
                    a.remaining
                  );
                }

                return a.name
                  .localeCompare(
                    b.name,
                    'vi'
                  );
              }
            );

            return {
              from,
              to,
              players
            };
          };

        const makeStat =
          (
            label,
            value,
            subtext
          ) => {
            const box =
              el(
                'div',
                null,
                'rounded-lg border p-3'
              );

            box.append(
              el(
                'div',
                label,
                'text-xs opacity-70'
              ),
              el(
                'div',
                value,
                'font-semibold mt-1'
              )
            );

            if (subtext) {
              box.append(
                el(
                  'div',
                  subtext,
                  'text-xs opacity-60 mt-1'
                )
              );
            }

            return box;
          };

        const renderReport =
          () => {
            resultRoot
              .replaceChildren();

            notice(
              reportMessage,
              ''
            );

            const report =
              getReportData();

            if (
              report.error
            ) {
              notice(
                reportMessage,
                report.error,
                true
              );

              return;
            }

            const players =
              report.players;

            const totalDue =
              players.reduce(
                (
                  sum,
                  player
                ) =>
                  sum +
                  player.due,
                0
              );

            const totalPaid =
              players.reduce(
                (
                  sum,
                  player
                ) =>
                  sum +
                  player.paid,
                0
              );

            const totalRemaining =
              players.reduce(
                (
                  sum,
                  player
                ) =>
                  sum +
                  player.remaining,
                0
              );

            const totalOpen =
              players.reduce(
                (
                  sum,
                  player
                ) =>
                  sum +
                  player.openCount,
                0
              );

            const summary =
              el(
                'div',
                null,
                'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4'
              );

            summary.append(
              makeStat(
                'VĐV',
                String(
                  players.length
                ),
                onlyDebtInput.checked
                  ? 'Còn nợ trong kỳ'
                  : 'Có nghĩa vụ trong kỳ'
              ),
              makeStat(
                'Nghĩa vụ',
                money(
                  totalDue
                ),
                'Theo các khoản trong báo cáo'
              ),
              makeStat(
                'Đã nộp',
                money(
                  totalPaid
                ),
                'Cho các nghĩa vụ trong kỳ'
              ),
              makeStat(
                'Còn phải thu',
                money(
                  totalRemaining
                ),
                totalOpen +
                  ' khoản chưa hoàn tất'
              )
            );

            resultRoot.append(
              summary
            );

            if (
              players.length === 0
            ) {
              resultRoot.append(
                el(
                  'div',
                  'Không có công nợ phù hợp trong kỳ đã chọn.',
                  'rounded-lg border p-4 text-sm opacity-70'
                )
              );

              return;
            }

            const reportTable =
              document.createElement(
                'div'
              );

            reportTable.className =
              'overflow-x-auto mb-4';

            const tableEl =
              document.createElement(
                'table'
              );

            tableEl.className =
              'w-full text-sm border-collapse';

            const thead =
              document.createElement(
                'thead'
              );

            const headRow =
              document.createElement(
                'tr'
              );

            [
              'VĐV',
              'Nghĩa vụ',
              'Đã nộp',
              'Còn nợ',
              'Khoản nợ'
            ].forEach(
              labelText => {
                const th =
                  document.createElement(
                    'th'
                  );

                th.className =
                  'text-left border-b px-3 py-2 whitespace-nowrap';

                th.textContent =
                  labelText;

                headRow.append(
                  th
                );
              }
            );

            thead.append(
              headRow
            );

            const tbody =
              document.createElement(
                'tbody'
              );

            players.forEach(
              player => {
                const tr =
                  document.createElement(
                    'tr'
                  );

                [
                  player.name,
                  money(
                    player.due
                  ),
                  money(
                    player.paid
                  ),
                  money(
                    player.remaining
                  ),
                  String(
                    player.openCount
                  )
                ].forEach(
                  (
                    value,
                    index
                  ) => {
                    const td =
                      document.createElement(
                        'td'
                      );

                    td.className =
                      'border-b px-3 py-2 align-top whitespace-nowrap';

                    if (
                      index === 0 ||
                      index === 3
                    ) {
                      td.classList.add(
                        'font-semibold'
                      );
                    }

                    td.textContent =
                      value;

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

            reportTable.append(
              tableEl
            );

            resultRoot.append(
              reportTable
            );

            const detailTitle =
              el(
                'div',
                'Chi tiết theo VĐV',
                'font-semibold mb-2'
              );

            resultRoot.append(
              detailTitle
            );

            players.forEach(
              player => {
                const detailBox =
                  el(
                    'div',
                    null,
                    'border rounded-lg mb-2 overflow-hidden'
                  );

                const detailButton =
                  document.createElement(
                    'button'
                  );

                detailButton.type =
                  'button';

                detailButton.className =
                  'w-full flex items-center justify-between gap-3 px-3 py-3 text-left';

                const detailLabel =
                  el(
                    'span',
                    player.name +
                      ' • Còn nợ ' +
                      money(
                        player.remaining
                      ),
                    'font-medium'
                  );

                const detailAction =
                  el(
                    'span',
                    '▶ Chi tiết',
                    'text-sm opacity-70 whitespace-nowrap'
                  );

                detailButton.append(
                  detailLabel,
                  detailAction
                );

                const detailContent =
                  el(
                    'div',
                    null,
                    'px-3 pb-3'
                  );

                detailContent.hidden =
                  true;

                player.items
                  .sort(
                    (a, b) =>
                      new Date(
                        b.match
                          .played_at
                      ).getTime() -
                      new Date(
                        a.match
                          .played_at
                      ).getTime()
                  )
                  .forEach(
                    item => {
                      const row =
                        el(
                          'div',
                          null,
                          'border-t py-2 text-sm'
                        );

                      const reasonText =
                        item.reason ===
                        'HOA'
                          ? 'Hòa'
                          : 'Thua';

                      row.append(
                        el(
                          'div',
                          matchCode(
                            item.match
                          ) +
                            ' • ' +
                            reasonText,
                          'font-medium'
                        ),
                        el(
                          'div',
                          'Phải đóng ' +
                            money(
                              item.due
                            ) +
                            ' • Đã nộp ' +
                            money(
                              item.paid
                            ) +
                            ' • Còn ' +
                            money(
                              item.remaining
                            ),
                          'opacity-70 mt-1'
                        )
                      );

                      detailContent.append(
                        row
                      );
                    }
                  );

                detailButton
                  .addEventListener(
                    'click',
                    () => {
                      detailContent.hidden =
                        !detailContent.hidden;

                      detailAction.textContent =
                        detailContent.hidden
                          ? '▶ Chi tiết'
                          : '▼ Thu gọn';
                    }
                  );

                detailBox.append(
                  detailButton,
                  detailContent
                );

                resultRoot.append(
                  detailBox
                );
              }
            );

            const copyButton =
              button(
                'Sao chép thông báo',
                async () => {
                  const current =
                    getReportData();

                  if (
                    current.error
                  ) {
                    notice(
                      reportMessage,
                      current.error,
                      true
                    );

                    return;
                  }

                  if (
                    current.players
                      .length === 0
                  ) {
                    notice(
                      reportMessage,
                      'Không có dữ liệu để sao chép.',
                      true
                    );

                    return;
                  }

                  const debtPlayers =
                    current.players
                      .filter(
                        player =>
                          player.remaining >
                          0
                      );

                  if (
                    debtPlayers.length === 0
                  ) {
                    notice(
                      reportMessage,
                      'Không có VĐV còn nợ trong kỳ.',
                      true
                    );

                    return;
                  }

                  const totalDebt =
                    debtPlayers.reduce(
                      (
                        sum,
                        player
                      ) =>
                        sum +
                        player.remaining,
                      0
                    );

                  const lines = [
                    'THÔNG BÁO CÔNG NỢ QUỸ CLB',
                    'Kỳ: ' +
                      displayDate(
                        current.from
                      ) +
                      ' - ' +
                      displayDate(
                        current.to
                      ),
                    ''
                  ];

                  debtPlayers.forEach(
                    (
                      player,
                      index
                    ) => {
                      lines.push(
                        (
                          index + 1
                        ) +
                          '. ' +
                          player.name +
                          ': ' +
                          money(
                            player.remaining
                          )
                      );
                    }
                  );

                  lines.push(
                    '',
                    'Tổng còn phải thu: ' +
                      money(
                        totalDebt
                      )
                  );

                  const text =
                    lines.join(
                      '\n'
                    );

                  try {
                    await navigator
                      .clipboard
                      .writeText(
                        text
                      );

                    notice(
                      reportMessage,
                      'Đã sao chép thông báo công nợ.',
                      false,
                      true
                    );
                  }
                  catch (error) {
                    const textArea =
                      document.createElement(
                        'textarea'
                      );

                    textArea.value =
                      text;

                    textArea.style.position =
                      'fixed';

                    textArea.style.opacity =
                      '0';

                    document.body.append(
                      textArea
                    );

                    textArea.select();

                    const copied =
                      document.execCommand(
                        'copy'
                      );

                    textArea.remove();

                    notice(
                      reportMessage,
                      copied
                        ? 'Đã sao chép thông báo công nợ.'
                        : 'Không thể sao chép tự động.',
                      !copied,
                      copied
                    );
                  }
                },
                'btn'
              );

            copyButton.type =
              'button';

            const copyWrap =
              el(
                'div',
                null,
                'mt-4 flex justify-end'
              );

            copyWrap.append(
              copyButton
            );

            resultRoot.append(
              copyWrap
            );
          };

        const viewButton =
          button(
            'Xem báo cáo',
            renderReport,
            'btn primary'
          );

        viewButton.type =
          'button';

        controls.append(
          field(
            'Từ ngày',
            fromInput
          ),
          field(
            'Đến ngày',
            toInput
          ),
          field(
            'Bộ lọc',
            onlyDebtWrap
          ),
          viewButton
        );

        wrapper.append(
          controls,
          reportMessage,
          resultRoot
        );

        sectionRoot.append(
          wrapper
        );
      }
    );
fundCollapse(
      'Công nợ theo VĐV',
      sectionRoot => {
        const debtControls =
          el(
            'div',
            null,
            'mb-3'
          );

        debtControls.append(
          el(
            'div',
            'Chọn VĐV',
            'text-sm font-semibold mb-2'
          )
        );

        const debtSelect =
          el(
            'select',
            null,
            'field'
          );

        debtSelect.append(
          new Option(
            '— Chọn VĐV —',
            ''
          )
        );

        const relevantPlayerIds =
          new Set();

        activeContributions
          .forEach(
            contribution => {
              if (
                contribution.player_id
              ) {
                relevantPlayerIds.add(
                  contribution.player_id
                );
              }
            }
          );

        rows('fund_payments')
          .forEach(
            payment => {
              const contribution =
                activeContributions
                  .find(
                    item =>
                      item.id ===
                      payment.contribution_id
                  );

              const playerId =
                payment.player_id ||
                contribution?.player_id;

              if (playerId) {
                relevantPlayerIds.add(
                  playerId
                );
              }
            }
          );

        rows('players')
          .filter(
            player =>
              relevantPlayerIds.has(
                player.id
              )
          )
          .slice()
          .sort(
            (a, b) => {
              const aInactive =
                upper(a.status) ===
                'INACTIVE';

              const bInactive =
                upper(b.status) ===
                'INACTIVE';

              if (
                aInactive !==
                bInactive
              ) {
                return aInactive
                  ? 1
                  : -1;
              }

              return playerName(
                a.id
              ).localeCompare(
                playerName(
                  b.id
                ),
                'vi'
              );
            }
          )
          .forEach(
            player => {
              const suffix =
                upper(
                  player.status
                ) ===
                'INACTIVE'
                  ? ' • Ngừng hoạt động'
                  : '';

              debtSelect.append(
                new Option(
                  playerName(
                    player.id
                  ) +
                    suffix,
                  player.id
                )
              );
            }
          );

        debtControls.append(
          debtSelect
        );

        const debtContent =
          el('div');

        const renderDebt =
          () => {
            debtContent.innerHTML =
              '';

            const playerId =
              debtSelect.value;

            if (!playerId) {
              debtContent.append(
                el(
                  'p',
                  'Chọn một VĐV để xem công nợ và lịch sử đóng quỹ.',
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

            const playerContributions =
              activeContributions
                .filter(
                  contribution =>
                    contribution.player_id ===
                    playerId
                )
                .slice()
                .sort(
                  (a, b) =>
                    new Date(
                      b.created_at || 0
                    ).getTime() -
                    new Date(
                      a.created_at || 0
                    ).getTime()
                );

            const playerContributionIds =
              new Set(
                playerContributions
                  .map(
                    contribution =>
                      contribution.id
                  )
              );

            const playerPayments =
              rows('fund_payments')
                .filter(
                  payment =>
                    payment.player_id ===
                      playerId ||
                    playerContributionIds.has(
                      payment.contribution_id
                    )
                )
                .slice()
                .sort(
                  (a, b) =>
                    new Date(
                      b.paid_at ||
                      b.created_at ||
                      0
                    ).getTime() -
                    new Date(
                      a.paid_at ||
                      a.created_at ||
                      0
                    ).getTime()
                );

            const playerDue =
              playerContributions
                .reduce(
                  (sum, contribution) =>
                    sum +
                    contributionAmount(
                      contribution
                    ),
                  0
                );

            const playerPaid =
              playerPayments
                .reduce(
                  (sum, payment) =>
                    sum +
                    paymentAmount(
                      payment
                    ),
                  0
                );

            const playerOutstanding =
              Math.max(
                playerDue -
                  playerPaid,
                0
              );

            const playerCredit =
              Math.max(
                playerPaid -
                  playerDue,
                0
              );

            debtContent.append(
              el(
                'div',
                selectedPlayer
                  ? playerName(
                      selectedPlayer.id
                    )
                  : 'VĐV',
                'font-semibold mb-2'
              )
            );

            grid(
              debtContent,
              [
                [
                  'Nghĩa vụ',
                  money(
                    playerDue
                  ),
                  `${playerContributions.length} khoản`
                ],
                [
                  'Đã nộp',
                  money(
                    playerPaid
                  ),
                  `${playerPayments.length} lần thanh toán`
                ],
                [
                  'Còn nợ',
                  money(
                    playerOutstanding
                  ),
                  playerOutstanding > 0
                    ? 'Chưa hoàn tất nghĩa vụ'
                    : 'Đã hoàn tất'
                ],
                [
                  'Nộp dư',
                  money(
                    playerCredit
                  ),
                  playerCredit > 0
                    ? 'Thanh toán vượt nghĩa vụ'
                    : 'Không có'
                ]
              ]
            );
            const debtStatus =
              fundDebtStatus(
                playerOutstanding,
                playerCredit
              );

            debtContent.append(
              el(
                'div',
                `Trạng thái: ${debtStatus}`,
                'mt-3 text-sm font-semibold'
              )
            );

            const obligationDetail =
              el(
                'div',
                null,
                'mt-3'
              );

            const obligationBody =
              el(
                'div',
                null,
                'mt-2'
              );

            obligationBody.hidden =
              true;

            const obligationToggle =
              button(
                '▶ Chi tiết nghĩa vụ',
                () => {
                  obligationBody.hidden =
                    !obligationBody.hidden;

                  obligationToggle.textContent =
                    obligationBody.hidden
                      ? '▶ Chi tiết nghĩa vụ'
                      : '▼ Thu gọn chi tiết nghĩa vụ';
                },
                'border rounded-lg px-3 py-2 text-sm w-full text-left'
              );

            obligationToggle.type =
              'button';

            table(
              obligationBody,
              'Các khoản phải đóng',
              playerContributions
                .map(
                  contribution => {
                    const match =
                      rows('matches')
                        .find(
                          item =>
                            item.id ===
                            contribution.match_id
                        );

                    return {
                      ...contribution,
                      match_reference:
                        match
                          ? (
                              'Trận ' +
                              matchCode(
                                match
                              ) +
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
                              contribution.match_id
                                ? '#' +
                                  String(
                                    contribution.match_id
                                  ).slice(
                                    0,
                                    8
                                  )
                                : '—'
                            )
                    };
                  }
                ),
              [
                moneyCol(
                  'Số tiền',
                  'amount_due',
                  'amount'
                ),
                [
                  'Loại',
                  r =>
                    fundReasonLabel(
                      pick(
                        r,
                        'reason',
                        'contribution_type',
                        'type'
                      )
                    )
                ],
                statusCol,
                dateCol(
                  'Ghi nhận',
                  'created_at'
                ),
                [
                  'Trận liên quan',
                  r =>
                    r.match_reference ||
                    '—'
                ]
              ],
              {
                status: true,
                unavailable:
                  !!state.errors
                    .fund_contributions ||
                  !!state.errors
                    .matches
              }
            );

            obligationDetail.append(
              obligationToggle,
              obligationBody
            );

            const paymentDetail =
              el(
                'div',
                null,
                'mt-3'
              );

            const paymentBody =
              el(
                'div',
                null,
                'mt-2'
              );

            paymentBody.hidden =
              true;

            const paymentToggle =
              button(
                '▶ Lịch sử thanh toán',
                () => {
                  paymentBody.hidden =
                    !paymentBody.hidden;

                  paymentToggle.textContent =
                    paymentBody.hidden
                      ? '▶ Lịch sử thanh toán'
                      : '▼ Thu gọn lịch sử thanh toán';
                },
                'border rounded-lg px-3 py-2 text-sm w-full text-left'
              );

            paymentToggle.type =
              'button';

            if (!playerPayments.length) {
              paymentBody.append(
                el(
                  'p',
                  'Chưa có thanh toán.',
                  'muted py-4'
                )
              );
            } else {
              table(
                paymentBody,
                'Các lần thanh toán',
                playerPayments,
                [
                  moneyCol(
                    'Số tiền',
                    'amount'
                  ),
                  dateCol(
                    'Ngày thanh toán',
                    'paid_at',
                    'created_at'
                  ),
                  col(
                    'Ghi chú',
                    'note',
                    'notes'
                  ),
                  col(
                    'Khoản liên quan',
                    'contribution_id'
                  )
                ],
                {
                  unavailable:
                    !!state.errors
                      .fund_payments
                }
              );
            }

            paymentDetail.append(
              paymentToggle,
              paymentBody
            );

            debtContent.append(
              obligationDetail,
              paymentDetail
            );
          };

        debtSelect.addEventListener(
          'change',
          renderDebt
        );

        renderDebt();

        sectionRoot.append(
          debtControls,
          debtContent
        );
      }
    );
        fundCollapse(
          'Thanh toán',
          sectionRoot => {

        table(
            sectionRoot,
          'Thanh toán',
          recent(
            rows(
              'fund_payments'
            ),
            'paid_at'
          ),
          [
            [
              'VĐV',
              r =>
                playerName(
                  r.player_id ||
                    rows(
                      'fund_contributions'
                    ).find(
                      c =>
                        c.id ===
                        r.contribution_id
                    )?.player_id
                )
            ],
            moneyCol(
              'Số tiền',
              'amount'
            ),
            dateCol(
              'Ngày thanh toán',
              'paid_at'
            ),
            col(
              'Ghi chú',
              'note',
              'notes'
            ),
            col(
              'Khoản liên quan',
              'contribution_id'
            )
          ],
          {
            unavailable:
              !!state.errors
                .fund_payments
          }
        );
          }
        );
        fundCollapse(
          'Sổ giao dịch',
          sectionRoot => {

        table(
            sectionRoot,
          'Sổ giao dịch',
          recent(
            rows(
              'fund_transactions'
            ).map(transaction => {
              const match =
                rows(
                  'matches'
                ).find(
                  item =>
                    item.id ===
                    transaction.match_id
                );

              return {
                ...transaction,
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
                        transaction.match_id
                          ? '#' +
                            String(
                              transaction.match_id
                            ).slice(
                              0,
                              8
                            )
                          : '—'
                      )
              };
            }),
            'transaction_date'
          ),
          [
            dateCol(
              'Thời gian',
              'transaction_date',
              'occurred_at',
              'created_at'
            ),
            col(
              'Loại giao dịch',
              'transaction_type',
              'type',
              'entry_type'
            ),
            moneyCol(
              'Số tiền',
              'amount'
            ),
            col(
              'Diễn giải',
              'description',
              'note',
              'notes',
              'reason'
            ),
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
                    : '—'
                )
            ]
          ],
          {
            unavailable:
              !!state.errors
                .fund_transactions ||
              !!state.errors
                .matches
          }
        );
          }
        );
        fundCollapse(
          'Quy định quỹ',
          sectionRoot => {
            settings(
              sectionRoot,
              'fund_rules'
            );
          }
        );
      
      }

      return {
        fund
      };
    }
  };
})();







