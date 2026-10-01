(function () {
  'use strict';

  window.PickFund = {
    create(context) {
      const {
        $,
        state,
        client,
        isAdmin,
        canManageFund,
        canCollectFund,
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

        const root = el('div', null, 'fund-ui');
        $('content').append(root);

        sources(
          root,
          [
            'fund_contributions',
            'fund_payments',
            'fund_transactions',
            'fund_rules',
            'fund_obligation_campaigns',
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
                  toggle.ariaExpanded = String(!body.hidden);

                  toggle.textContent =
                    body.hidden
                      ? `▶ ${title}`
                      : `▼ Thu gọn ${title}`;
                },
                'btn w-full text-left'
              );

            toggle.type =
              'button';
            toggle.ariaExpanded = String(openByDefault);

            renderContent(
              body
            );
            // A notice may set hidden=false; the section still owns its disclosure state.
            body.hidden = !openByDefault;

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

    // FUND03E NET PAYMENT: rebuild once per render from the loaded snapshot.
    const grossPaymentByContribution = new Map();
    const refundByContribution = new Map();
    const paymentById = new Map();
    const transactionById = new Map();
    const paymentRows = rows('fund_payments') || [];
    const transactionRows = rows('fund_transactions') || [];
    const paymentCashInTypes = new Set([
      'THU_QUY_THUA_TRAN', 'THU_QUY_HOA', 'THU_KHAC'
    ]);
    const positiveAmount = value => {
      const amount = num(value);
      return Number.isFinite(amount) && amount > 0 ? amount : 0;
    };
    for (const payment of paymentRows) {
      if (!payment?.contribution_id) continue;
      if (payment.id) paymentById.set(payment.id, payment);
      const id = payment.contribution_id;
      grossPaymentByContribution.set(id,
        (grossPaymentByContribution.get(id) || 0) + positiveAmount(payment.amount));
    }
    for (const transaction of transactionRows) {
      if (transaction?.id) transactionById.set(transaction.id, transaction);
    }
    for (const refund of transactionRows) {
      if (refund?.transaction_type !== 'HOAN_TIEN' || !refund.reversal_of_transaction_id) continue;
      const original = transactionById.get(refund.reversal_of_transaction_id);
      if (!original?.payment_id || !paymentCashInTypes.has(original.transaction_type)) continue;
      const payment = paymentById.get(original.payment_id);
      if (!payment?.contribution_id) continue;
      // Never infer debt ownership from player_id or a refund's direct payment_id.
      const id = payment.contribution_id;
      refundByContribution.set(id,
        (refundByContribution.get(id) || 0) + positiveAmount(refund.amount));
    }
    // FUND03E: prefer backend NET balance read model for collection/debt.
    const collectionBalanceByContribution = new Map(
      (Array.isArray(state.fundCollectionBalances)
        ? state.fundCollectionBalances
        : [])
        .filter(balance => balance?.contribution_id)
        .map(balance => [
          balance.contribution_id,
          balance
        ])
    );

    const validCollectionBalance = balance => balance &&
      ['amount_due', 'gross_paid', 'refunded', 'net_paid', 'amount_remaining'].every(key =>
        balance[key] !== null && balance[key] !== undefined &&
        Number.isFinite(Number(balance[key])) && Number(balance[key]) >= 0);

    const collectionBalance =
      contribution =>
        collectionBalanceByContribution.get(
          contribution?.id
        ) || null;

    const ledgerNetPaid =
      contribution =>
        Math.max(
          (grossPaymentByContribution.get(
            contribution?.id
          ) || 0) -
          (refundByContribution.get(
            contribution?.id
          ) || 0),
          0
        );

    const netPaid =
      contribution => {
        const balance =
          collectionBalanceDataReady && validCollectionBalance(collectionBalance(contribution))
            ? collectionBalance(contribution) : null;

        if (balance) {
          return Math.max(
            num(balance.net_paid) || 0,
            0
          );
        }

        return ledgerNetPaymentDataReady ? ledgerNetPaid(contribution) : NaN;
      };

    const remainingPayment =
      contribution => {
        const balance =
          collectionBalanceDataReady && validCollectionBalance(collectionBalance(contribution))
            ? collectionBalance(contribution) : null;

        if (balance) {
          return Math.max(
            num(balance.amount_remaining) || 0,
            0
          );
        }

        return Math.max(
          contributionAmount(contribution) -
            netPaid(contribution),
          0
        );
      };

    const paymentCredit =
      contribution =>
        Math.max(
          netPaid(contribution) -
            contributionAmount(contribution),
          0
        );

    const collectionBalanceDataReady =
      !!state.fundCollectionBalancesReady;

    const ledgerNetPaymentDataReady =
      (isAdmin() || canManageFund()) &&
      ready(
        'fund_contributions',
        'fund_payments',
        'fund_transactions'
      );

    const netPaymentDataReady =
      collectionBalanceDataReady ||
      ledgerNetPaymentDataReady;

    const hasNetBalance = contribution =>
      (collectionBalanceDataReady && validCollectionBalance(collectionBalance(contribution))) ||
      ledgerNetPaymentDataReady;

    const fundContributionStatus =
      contribution => {
        if (
          ![
            'CHUA_DONG',
            'DONG_MOT_PHAN',
            'DA_DONG'
          ].includes(
            contribution.status
          )
        ) {
          return contribution.status;
        }

        const balance =
          collectionBalanceDataReady && validCollectionBalance(collectionBalance(contribution))
            ? collectionBalance(contribution) : null;

        if (
          collectionBalanceDataReady &&
          balance?.computed_status
        ) {
          return balance.computed_status;
        }

        if (!hasNetBalance(contribution)) {
          return contribution.status;
        }

        return netPaid(contribution) <= 0
          ? 'CHUA_DONG'
          : remainingPayment(contribution) > 0
            ? 'DONG_MOT_PHAN'
            : 'DA_DONG';
      };
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
          MATCH_WIN: 'Thắng trận',
          QUY_THANG: 'Quỹ CLB tháng',
          PHI_SINH_HOAT: 'Phí sinh hoạt',
          PHI_SU_KIEN: 'Phí sự kiện',
          KHAC: 'Khoản phải đóng khác'
        };

        return labels[code] ||
          value ||
          '—';
      };


    const transactionLabel =
      value => {
        const code =
          upper(
            value || ''
          );

        const labels = {
          THU_QUY_THUA_TRAN:
            'Thu quỹ trận thua',
          THU_QUY_HOA:
            'Thu quỹ trận hòa',
          UNG_HO:
            'Ủng hộ',
          TAI_TRO:
            'Tài trợ',
          THU_KHAC:
            'Thu khác',
          CHUYEN_VAO_QUY:
            'Chuyển vào quỹ',
          CHI_TIEU:
            'Chi tiêu',
          HOAN_TIEN:
            'Hoàn tiền',
          DIEU_CHINH:
            'Điều chỉnh',
          PAYMENT:
            'Thanh toán'
        };

        return labels[code] ||
          value ||
          'Giao dịch quỹ';
      };

    // FUND03B CAMPAIGN HELPERS
    const fundCampaignMap =
      new Map(
        rows(
          'fund_obligation_campaigns'
        )
          .map(
            campaign => [
              raw(
                campaign.id
              ),
              campaign
            ]
          )
      );

    const fundCampaign =
      contribution => {
        if (
          !contribution
            ?.campaign_id
        ) {
          return null;
        }

        return (
          fundCampaignMap.get(
            raw(
              contribution
                .campaign_id
            )
          ) ||
          null
        );
      };

    const fundContributionTitle =
      contribution => {
        const campaign =
          fundCampaign(
            contribution
          );

        if (
          campaign?.title
        ) {
          return campaign.title;
        }

        return fundReasonLabel(
          pick(
            contribution,
            'reason',
            'contribution_type',
            'type'
          )
        );
      };

    const fundContributionDate =
      contribution => {
        const campaign =
          fundCampaign(
            contribution
          );

        const match =
          rows(
            'matches'
          ).find(
            item =>
              item.id ===
              contribution
                ?.match_id
          );

        return (
          contribution
            ?.due_date ||
          campaign
            ?.period_month ||
          match
            ?.played_at ||
          contribution
            ?.created_at ||
          null
        );
      };

    const activeContributions =
      rows('fund_contributions')
        .filter(
          contribution => {
            if (
              !validContribution(
                contribution
              )
            ) {
              return false;
            }

            if (
              contribution
                .campaign_id
            ) {
              const campaign =
                fundCampaign(
                  contribution
                );

              if (
                !campaign ||
                upper(
                  campaign.status
                ) ===
                  'CANCELLED'
              ) {
                return false;
              }
            }

            if (
              contribution
                .match_id
            ) {
              const match =
                rows(
                  'matches'
                ).find(
                  item =>
                    item.id ===
                    contribution.match_id
                );

              if (
                !match ||
                upper(
                  match.status
                ) ===
                  'VOIDED'
              ) {
                return false;
              }
            }

            return true;
          }
        );
    const debtDataComplete = netPaymentDataReady && activeContributions
      .filter(c => upper(c.status) !== 'MIEN' && contributionAmount(c) > 0)
      .every(hasNetBalance);
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
        : activeContributions.reduce((sum, contribution) => sum + netPaid(contribution), 0);

    const totalOutstanding = memberFundOverview
      ? num(memberFundOverview.total_outstanding) || 0
      : activeContributions.reduce((sum, contribution) => sum + remainingPayment(contribution), 0);
    const totalCredit = memberFundOverview
      ? num(memberFundOverview.total_credit) || 0
      : activeContributions.reduce((sum, contribution) => sum + paymentCredit(contribution), 0);
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

    // FUND UI V2 WP2: one compact club summary; calculations remain above.
    root.append(el('h2', 'Quỹ CLB', 'font-semibold text-lg mt-2 mb-1'));
    grid(root, [
      ['Số dư quỹ', ready('fund_transactions') ? money(fundKnownBalance) : '—'],
      ['Tổng phải thu', ready('fund_contributions') ? money(totalDue) : '—'],
      ['Đã thu NET', (memberFundOverview || netPaymentDataReady) ? money(totalPaid) : '—'],
      ['Còn phải thu', (memberFundOverview || netPaymentDataReady) ? money(totalOutstanding) : '—']
    ], 'fund-overview-kpis fund-overview-kpis-all ui-kpi-grid-compact');

    const summaryHelp = el('details', null, 'text-sm muted mb-3');
    summaryHelp.append(
      el('summary', 'Cách đọc số liệu quỹ', 'cursor-pointer'),
      el('p', 'Số dư = thu vào − chi và hoàn tiền theo sổ quỹ. Tổng phải thu là nghĩa vụ hợp lệ; Đã thu NET đã trừ hoàn tiền. Công nợ được tính riêng với số dư tiền mặt.', 'mt-2')
    );
    root.append(summaryHelp);

    // Exceptions only; no additional KPI row or debt queue.
    const fundExceptions = el('div', null, 'space-y-2');
    if (fundKnownCash.adjustmentCount > 0) {
      fundExceptions.append(el('p',
        `${fundKnownCash.adjustmentCount} giao dịch Điều chỉnh (${money(fundKnownCash.adjustmentAmount)}) chưa tính vào số dư: chưa xác định chiều tăng/giảm.`,
        'notice text-sm'));
    }
    if ((memberFundOverview || netPaymentDataReady) && totalCredit > 0) {
      fundExceptions.append(el('p',
        `Có ${money(totalCredit)} nộp dư so với nghĩa vụ. Cần đối soát các khoản liên quan.`,
        'notice text-sm'));
    }
    if (fundExceptions.children.length) root.append(fundExceptions);

        // MP01 MEMBER FUND PORTAL V1
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

              const obligations =
                Array.isArray(
                  state.memberFundObligations
                )
                  ? state.memberFundObligations
                  : [];

              const history =
                Array.isArray(
                  state.memberFundPaymentHistory
                )
                  ? state.memberFundPaymentHistory
                  : [];

              const formatDateTime =
                value => {
                  if (!value) {
                    return 'Không rõ thời gian';
                  }

                  const date =
                    new Date(value);

                  if (
                    !Number.isFinite(
                      date.getTime()
                    )
                  ) {
                    return 'Không rõ thời gian';
                  }

                  return date.toLocaleString(
                    'vi-VN'
                  );
                };

              const obligationStatusLabel =
                item => {
                  if (
                    item.is_collectible === false
                  ) {
                    const status =
                      upper(
                        item.status || ''
                      );

                    if (status === 'MIEN') {
                      return 'Được miễn';
                    }

                    if (
                      status === 'DIEU_CHINH'
                    ) {
                      return 'Đã điều chỉnh';
                    }

                    return 'Không còn thu';
                  }

                  const remaining =
                    num(
                      item.amount_remaining
                    ) || 0;

                  if (remaining > 0) {
                    return 'Còn phải đóng';
                  }

                  return 'Đã hoàn tất';
                };

              sectionRoot.append(
                el(
                  'h3',
                  'Nghĩa vụ quỹ của tôi',
                  'font-semibold mb-3'
                )
              );

              if (!obligations.length) {
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

                obligations
                  .slice()
                  .sort(
                    (a, b) => {
                      const aRemaining =
                        num(
                          a.amount_remaining
                        ) || 0;

                      const bRemaining =
                        num(
                          b.amount_remaining
                        ) || 0;

                      const aOpen =
                        a.is_collectible !== false &&
                        aRemaining > 0
                          ? 1
                          : 0;

                      const bOpen =
                        b.is_collectible !== false &&
                        bRemaining > 0
                          ? 1
                          : 0;

                      if (aOpen !== bOpen) {
                        return bOpen - aOpen;
                      }

                      return (
                        new Date(
                          b.occurred_at || 0
                        ).getTime() -
                        new Date(
                          a.occurred_at || 0
                        ).getTime()
                      );
                    }
                  )
                  .forEach(
                    item => {
                      const due =
                        num(
                          item.amount_due
                        ) || 0;

                      const paid =
                        num(
                          item.amount_paid
                        ) || 0;

                      const remaining =
                        num(
                          item.amount_remaining
                        ) || 0;

                      const statusText =
                        obligationStatusLabel(
                          item
                        );

                      const card =
                        el(
                          'div',
                          null,
                          'rounded-xl border p-3 text-sm'
                        );

                      card.append(
                        el(
                          'div',
                          item.obligation_title ||
                            fundReasonLabel(
                              item.reason
                            ),
                          'font-semibold'
                        ),
                        el(
                          'div',
                          formatDateTime(
                            item.occurred_at
                          ),
                          'text-xs opacity-70 mt-1'
                        ),
                        el(
                          'div',
                          `Nghĩa vụ ${money(due)} • Đã đóng ${money(paid)} • Còn ${money(remaining)}`,
                          'mt-2'
                        ),
                        el(
                          'div',
                          statusText,
                          (
                            remaining > 0 &&
                            item.is_collectible !== false
                          )
                            ? 'mt-1 text-sm font-semibold text-red-600'
                            : 'mt-1 text-sm font-semibold'
                        )
                      );

                      obligationList.append(
                        card
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
                  'Lịch sử thanh toán của tôi',
                  'font-semibold mt-5 mb-3'
                )
              );

              if (!history.length) {
                sectionRoot.append(
                  el(
                    'p',
                    'Chưa có giao dịch quỹ.',
                    'text-sm opacity-70'
                  )
                );
              } else {
                const historyList =
                  el(
                    'div',
                    null,
                    'space-y-2'
                  );

                history
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(
                        b.occurred_at || 0
                      ).getTime() -
                      new Date(
                        a.occurred_at || 0
                      ).getTime()
                  )
                  .forEach(
                    item => {
                      const amount =
                        num(
                          item.amount
                        ) || 0;

                      const delta =
                        item.cash_delta === null ||
                        item.cash_delta === undefined
                          ? null
                          : num(
                              item.cash_delta
                            );

                      const source =
                        upper(
                          item.event_source || ''
                        );

                      let amountText =
                        money(amount);

                      if (
                        delta !== null &&
                        Number.isFinite(delta)
                      ) {
                        if (delta > 0) {
                          amountText =
                            '+' +
                            money(
                              Math.abs(delta)
                            );
                        } else if (delta < 0) {
                          amountText =
                            '−' +
                            money(
                              Math.abs(delta)
                            );
                        } else {
                          amountText =
                            money(0);
                        }
                      }

                      const card =
                        el(
                          'div',
                          null,
                          'rounded-xl border p-3 text-sm'
                        );

                      card.append(
                        el(
                          'div',
                          transactionLabel(
                            item.transaction_type
                          ),
                          'font-semibold'
                        ),
                        el(
                          'div',
                          formatDateTime(
                            item.occurred_at
                          ),
                          'text-xs opacity-70 mt-1'
                        ),
                        el(
                          'div',
                          amountText,
                          'mt-2 font-semibold'
                        )
                      );

                      if (
                        source ===
                        'PAYMENT_WITHOUT_LEDGER'
                      ) {
                        card.append(
                          el(
                            'div',
                            'Thanh toán cũ chưa có bút toán sổ quỹ.',
                            'text-xs opacity-70 mt-1'
                          )
                        );
                      } else if (
                        delta === null
                      ) {
                        card.append(
                          el(
                            'div',
                            'Giao dịch này chưa xác định chiều tăng/giảm số dư.',
                            'text-xs opacity-70 mt-1'
                          )
                        );
                      }

                      historyList.append(
                        card
                      );
                    }
                  );

                sectionRoot.append(
                  historyList
                );
              }
            },
            true
          );
        }

        // FUND COLLECTION UI V1
    if (canManageFund() || canCollectFund()) {
      fundCollapse(
        'Thao tác quỹ',
        sectionRoot => {
          // FUND ACTIONS TREE V1

          // FUND03B CREATE OBLIGATION CAMPAIGN
          const campaignDetails =
            document.createElement(
              'details'
            );

          campaignDetails.className =
            'fund-action fund-action-income';

          const campaignSummary =
            document.createElement(
              'summary'
            );

          campaignSummary.className =
            'fund-action-summary';

          campaignSummary.textContent =
            'Tạo khoản phải đóng';

          const campaignContent =
            el(
              'div',
              null,
              'px-4 pb-4'
            );

          const campaignBox =
            el(
              'div',
              null,
              'rounded-xl border p-4'
            );

          campaignBox.append(
            el(
              'h3',
              'Tạo đợt thu / khoản phải đóng',
              'font-semibold mb-1'
            ),
            el(
              'p',
              'Tạo nghĩa vụ cho các MEMBER đang hoạt động và đã liên kết VĐV CLUB.',
              'text-sm opacity-70 mb-4'
            )
          );

          const campaignMessage =
            el(
              'div'
            );

          campaignMessage.hidden =
            true;

          const makeCampaignField =
            (
              labelText,
              control
            ) => {
              const box =
                el(
                  'div',
                  null,
                  'mb-3'
                );

              control.ariaLabel = labelText;

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

          const campaignCategory =
            document.createElement(
              'select'
            );

          campaignCategory.className =
            'w-full border rounded-lg px-3 py-2';

          [
            [
              'MONTHLY_CLUB_FUND',
              'Quỹ CLB hàng tháng'
            ],
            [
              'ACTIVITY_FEE',
              'Phí sinh hoạt'
            ],
            [
              'EVENT_FEE',
              'Phí sự kiện'
            ],
            [
              'OTHER',
              'Khoản khác'
            ]
          ].forEach(
            ([value, label]) =>
              campaignCategory.append(
                new Option(
                  label,
                  value
                )
              )
          );

          const campaignTitle =
            document.createElement(
              'input'
            );

          campaignTitle.type =
            'text';

          campaignTitle.className =
            'w-full border rounded-lg px-3 py-2';

          campaignTitle.placeholder =
            'Ví dụ: Quỹ CLB tháng 09/2026';

          const campaignMonth =
            document.createElement(
              'input'
            );

          campaignMonth.type =
            'month';

          campaignMonth.className =
            'w-full border rounded-lg px-3 py-2';

          const campaignAmount =
            document.createElement(
              'input'
            );

          campaignAmount.type =
            'number';

          campaignAmount.min =
            '1';

          campaignAmount.step =
            '1000';

          campaignAmount.className =
            'w-full border rounded-lg px-3 py-2';

          const campaignDueDate =
            document.createElement(
              'input'
            );

          campaignDueDate.type =
            'date';

          campaignDueDate.className =
            'w-full border rounded-lg px-3 py-2';

          const campaignNote =
            document.createElement(
              'input'
            );

          campaignNote.type =
            'text';

          campaignNote.className =
            'w-full border rounded-lg px-3 py-2';

          campaignNote.placeholder =
            'Ghi chú nếu có';

          const currentMonth =
            new Date()
              .toISOString()
              .slice(
                0,
                7
              );

          campaignMonth.value =
            currentMonth;

          const syncCampaignTitle =
            () => {
              if (
                campaignCategory
                  .value !==
                  'MONTHLY_CLUB_FUND' ||
                !campaignMonth.value
              ) {
                return;
              }

              const [
                year,
                month
              ] =
                campaignMonth
                  .value
                  .split('-');

              if (
                !campaignTitle
                  .dataset
                  .manual
              ) {
                campaignTitle.value =
                  'Quỹ CLB tháng ' +
                  month +
                  '/' +
                  year;
              }
            };

          campaignTitle
            .addEventListener(
              'input',
              () => {
                campaignTitle
                  .dataset
                  .manual =
                    campaignTitle
                      .value
                      .trim()
                      ? '1'
                      : '';
              }
            );

          campaignMonth
            .addEventListener(
              'change',
              syncCampaignTitle
            );

          campaignCategory
            .addEventListener(
              'change',
              syncCampaignTitle
            );

          syncCampaignTitle();

          const campaignSubmit =
            button(
              'Tạo khoản phải đóng',
              async () => {
                notice(
                  campaignMessage,
                  ''
                );

                const category =
                  campaignCategory
                    .value;

                const title =
                  campaignTitle
                    .value
                    .trim();

                const amount =
                  num(
                    campaignAmount
                      .value
                  );

                const month =
                  campaignMonth
                    .value;

                const dueDate =
                  campaignDueDate
                    .value ||
                  null;

                if (!title) {
                  notice(
                    campaignMessage,
                    'Vui lòng nhập tên khoản phải đóng.',
                    true
                  );

                  return;
                }

                if (
                  amount === null ||
                  amount <= 0
                ) {
                  notice(
                    campaignMessage,
                    'Số tiền phải lớn hơn 0.',
                    true
                  );

                  return;
                }

                if (
                  category ===
                    'MONTHLY_CLUB_FUND' &&
                  !month
                ) {
                  notice(
                    campaignMessage,
                    'Vui lòng chọn kỳ tháng.',
                    true
                  );

                  return;
                }

                if (!canManageFund()) {
                  return;
                }

                campaignSubmit.disabled =
                  true;

                campaignSubmit.textContent =
                  'Đang tạo…';

                try {
                  const {
                    data,
                    error
                  } =
                    await client.rpc(
                      'create_fund_obligation_campaign',
                      {
                        p_category:
                          category,

                        p_title:
                          title,

                        p_amount_due:
                          amount,

                        p_period_month:
                          month
                            ? month +
                              '-01'
                            : null,

                        p_due_date:
                          dueDate,

                        p_note:
                          campaignNote
                            .value
                            .trim() ||
                          null
                      }
                    );

                  if (error) {
                    throw error;
                  }

                  await load();

                  state.page =
                    'fund';

                  render();

                  notice(
                    $('global-message'),
                    'Đã tạo "' +
                      title +
                      '" cho ' +
                      number(
                        data
                          ?.obligation_count ||
                        0
                      ) +
                      ' thành viên.',
                    false,
                    true
                  );
                }
                catch (error) {
                  notice(
                    campaignMessage,
                    error?.message ||
                      'Không thể tạo khoản phải đóng.',
                    true
                  );
                }
                finally {
                  campaignSubmit.disabled =
                    false;

                  campaignSubmit.textContent =
                    'Tạo khoản phải đóng';
                }
              },
              'btn primary'
            );

          campaignSubmit.type =
            'button';

          campaignBox.append(
            makeCampaignField(
              'Danh mục',
              campaignCategory
            ),
            makeCampaignField(
              'Tên khoản phải đóng',
              campaignTitle
            ),
            makeCampaignField(
              'Kỳ tháng',
              campaignMonth
            ),
            makeCampaignField(
              'Số tiền phải đóng',
              campaignAmount
            ),
            makeCampaignField(
              'Hạn đóng',
              campaignDueDate
            ),
            makeCampaignField(
              'Ghi chú',
              campaignNote
            ),
            campaignSubmit,
            campaignMessage
          );

          campaignContent.append(
            campaignBox
          );

          campaignDetails.append(
            campaignSummary,
            campaignContent
          );

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
              'Ghi nhận tiền thực nhận từ các khoản phải đóng của VĐV: Quỹ tháng, phí sinh hoạt, phí sự kiện hoặc nghĩa vụ theo trận.',
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

          const collectibleContributions = netPaymentDataReady
            ? activeContributions.filter(contribution =>
                upper(contribution.status) !== 'MIEN' && hasNetBalance(contribution) && remainingPayment(contribution) > 0)
            : [];
          if (!netPaymentDataReady) {
            notice(message, 'Chưa đủ dữ liệu sổ quỹ để tính công nợ sau hoàn tiền. Vui lòng tải lại hoặc liên hệ ADMIN.', true);
          }

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
                netPaid(contribution);

              const remaining =
                remainingPayment(contribution);

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
                  (a, b) =>
                    new Date(
                      fundContributionDate(
                        b
                      ) || 0
                    ).getTime() -
                    new Date(
                      fundContributionDate(
                        a
                      ) || 0
                    ).getTime()
                )
                .forEach(
                  contribution => {
                    const remaining =
                      remainingPayment(contribution);

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

                    const title =
                      fundContributionTitle(
                        contribution
                      );

                    const label =
                      (
                        match
                          ? (
                              matchCode(
                                match
                              ) +
                              ' • ' +
                              title
                            )
                          : title
                      ) +
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
                if (!netPaymentDataReady) {
                  notice(message, 'Chưa đủ dữ liệu sổ quỹ để tính công nợ sau hoàn tiền.', true);
                  return;
                }
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

                const remainingBefore = remainingPayment(contribution);

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

                if (!canCollectFund()) {
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
          submit.disabled = !netPaymentDataReady;

          [[playerSelect, 'VĐV'], [contributionSelect, 'Khoản phải đóng'],
            [amountInput, 'Số tiền nhận'], [paidAtInput, 'Ngày giờ nhận'], [noteInput, 'Ghi chú']]
            .forEach(([control, label]) => { control.ariaLabel = label; });
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

                if (!canManageFund()) {
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

          [[expenseAmountInput, 'Số tiền chi'], [expenseDateInput, 'Ngày giờ chi'],
            [expenseDescriptionInput, 'Nội dung chi']]
            .forEach(([control, label]) => { control.ariaLabel = label; });
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

          // FUND04: preview only. Allocation decisions always come from the RPC.
          // FUND04 ordering: mirror backend COALESCE(date sources), then instant, UUID.
          const batchBangkokDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
          });
          const batchDateKey = value => {
            if (value == null) return null;
            const instant = new Date(value);
            if (!Number.isFinite(instant.getTime())) return null;
            const parts = batchBangkokDate.formatToParts(instant);
            return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
          };
          const batchMatchById = new Map(rows('matches').map(match => [match.id, match]));
          const batchPrimaryDate = contribution => contribution.due_date ??
            fundCampaign(contribution)?.period_month ??
            batchDateKey(batchMatchById.get(contribution.match_id)?.played_at) ??
            batchDateKey(contribution.created_at);
          const batchCreatedKey = value => {
            if (value == null) return null;
            const milliseconds = Date.parse(value);
            if (!Number.isFinite(milliseconds)) return null;
            // PostgreSQL timestamptz retains microseconds; Date alone truncates them.
            const fraction = String(value).match(/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/i)?.[1] || '';
            return BigInt(milliseconds) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6));
          };
          const batchCompareKey = (a, b) => a === b ? 0 :
            a == null ? 1 : b == null ? -1 : a < b ? -1 : 1;
          const batchCompare = (a, b) =>
            batchCompareKey(batchPrimaryDate(a), batchPrimaryDate(b)) ||
            batchCompareKey(batchCreatedKey(a.created_at), batchCreatedKey(b.created_at)) ||
            batchCompareKey(a.id.toLowerCase(), b.id.toLowerCase());
          // END FUND04 ordering
          const batchDetails = el('div');
          batchDetails.append(el('h3', 'Thu gộp theo VĐV', 'font-semibold mb-2'));
          const batchBody = el('div');
          const batchSelect = el('select', null, 'w-full border rounded-lg px-3 py-2');
          const batchSearch = el('input', null, 'w-full border rounded-lg px-3 py-2');
          batchSearch.placeholder = 'Tìm tên VĐV';
          const batchAmount = el('input', null, 'w-full border rounded-lg px-3 py-2');
          batchAmount.type = 'number'; batchAmount.min = '1'; batchAmount.step = '1';
          const batchDate = el('input', null, 'w-full border rounded-lg px-3 py-2');
          batchDate.type = 'datetime-local';
          const batchNow = new Date();
          batchDate.value = new Date(batchNow.getTime() - batchNow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          const batchNote = el('input', null, 'w-full border rounded-lg px-3 py-2');
          const batchPreview = el('div', null, 'mt-3');
          const batchMessage = el('div');
          const batchResult = el('div', null, 'mt-3');
          let batchBusy = false, batchNeedsReload = false, batchPage = 0;
          const batchOwner = state.session?.user?.id || state.profile?.id;
          const field = (label, control) => {
            const node = el('label', null, 'block text-sm font-semibold mb-3');
            node.append(el('span', label, 'block mb-1'), control); return node;
          };
          const batchCandidates = () => activeContributions.filter(c =>
            c.player_id === batchSelect.value && upper(c.status) !== 'MIEN' && contributionAmount(c) > 0);
          const batchKnown = c => collectionBalanceDataReady &&
            validCollectionBalance(collectionBalance(c)) && collectionBalance(c).player_id === c.player_id;
          const batchOutstanding = () => batchCandidates().filter(batchKnown)
            .reduce((sum, c) => sum + Number(collectionBalance(c).amount_remaining), 0);
          const batchReady = () => !batchNeedsReload && collectionBalanceDataReady && canCollectFund() &&
            !!batchSelect.value && batchCandidates().every(batchKnown) && batchOutstanding() > 0;
          const paged = (container, items, draw, page) => {
            const pageCount = Math.max(1, Math.ceil(items.length / 10));
            const current = Math.min(page, pageCount - 1);
            items.slice(current * 10, current * 10 + 10).forEach(draw);
            if (pageCount > 1) {
              const controls = el('div', null, 'form-actions');
              const prev = button('Trang trước', () => { batchPage = current - 1; updateBatch(false); }, 'btn');
              const next = button('Trang sau', () => { batchPage = current + 1; updateBatch(false); }, 'btn');
              prev.disabled = current === 0; next.disabled = current + 1 >= pageCount;
              controls.append(prev, el('span', `${current + 1}/${pageCount}`), next); container.append(controls);
            }
          };
          const updateBatch = (reset = true) => {
            if (reset) batchPage = 0;
            batchPreview.replaceChildren();
            const candidates = batchCandidates();
            const known = candidates.filter(batchKnown);
            const total = batchOutstanding();
            batchAmount.max = String(total);
            if (reset) batchAmount.value = total > 0 ? String(total) : '';
            batchAmount.disabled = !batchReady() || batchBusy;
            batchSubmit.disabled = !batchReady() || batchBusy;
            if (!collectionBalanceDataReady || candidates.some(c => !batchKnown(c))) {
              notice(batchPreview, 'Chưa đủ dữ liệu số dư để thu gộp. Vui lòng tải lại; không sử dụng số thanh toán gộp chưa trừ hoàn tiền.', true);
              return;
            }
            if (!batchSelect.value) { notice(batchPreview, 'Chọn VĐV để xem nghĩa vụ và số tiền còn phải thu.'); return; }
            batchPreview.append(el('p',
              `Phải đóng ${money(known.reduce((sum, c) => sum + Number(collectionBalance(c).amount_due), 0))} • Đã nộp NET ${money(known.reduce((sum, c) => sum + Number(collectionBalance(c).net_paid), 0))} • Còn lại ${money(total)}`,
              'text-sm font-semibold mb-3'));
            const pending = known.filter(c => Number(collectionBalance(c).amount_remaining) > 0);
            pending.sort(batchCompare);
            if (!pending.length) notice(batchPreview, 'VĐV không còn khoản phải thu.');
            paged(batchPreview, pending, c => batchPreview.append(el('p',
              `${fundContributionTitle(c)} • ${batchPrimaryDate(c) || '—'} • Đã nộp ${money(collectionBalance(c).net_paid)} • Còn ${money(collectionBalance(c).amount_remaining)}`,
              'text-sm border-b py-2')), batchPage);
          };
          const batchSubmit = button('Ghi nhận thu gộp', async () => {
            if (batchBusy || !batchReady()) return;
            const amount = num(batchAmount.value), paidAt = new Date(batchDate.value);
            if (!Number.isFinite(amount) || amount <= 0 || amount > batchOutstanding() || Number.isNaN(paidAt.getTime())) {
              notice(batchMessage, 'Nhập số tiền lớn hơn 0, không vượt công nợ và ngày nhận tiền hợp lệ.', true); return;
            }
            const selectedId = batchSelect.value;
            batchBusy = true; batchSubmit.disabled = true; batchSelect.disabled = true;
            notice(batchMessage, 'Đang ghi nhận…');
            let recorded = false;
            try {
              const { data, error } = await client.rpc('record_member_fund_payment', {
                p_player_id: selectedId, p_amount: amount,
                p_paid_at: paidAt.toISOString(), p_note: batchNote.value.trim() || null
              });
              if (error) throw error;
              if (data?.success !== true || !Array.isArray(data.allocations)) throw new Error('Phản hồi thu gộp không hợp lệ. Tải lại để kiểm tra trước khi thu tiếp.');
              recorded = true;
              if ((state.session?.user?.id || state.profile?.id) !== batchOwner) return;
              state.fundBatchReceipt = { actor: batchOwner, data };
              state.fundBatchPlayer = { actor: batchOwner, id: selectedId };
              await load();
              if ((state.session?.user?.id || state.profile?.id) !== batchOwner) return;
              state.page = 'fund'; render();
              notice($('global-message'), `Đã ghi nhận ${money(data.requested_amount)} cho ${data.allocation_count} khoản.`, false, true);
            } catch (error) {
              notice(batchMessage, recorded ? 'Đã ghi nhận. Chưa tải lại được số dư; không gửi lại, hãy tải lại trang để kiểm tra.' :
                (error?.message || 'Không thể thu gộp. Hãy tải lại số dư trước khi thử lại.'), true);
            } finally {
              // Do not allow a stale snapshot to be submitted again after success or an ambiguous failure.
              batchNeedsReload = true; batchBusy = false; batchSubmit.disabled = true; batchSelect.disabled = true;
              batchSearch.disabled = true; batchAmount.disabled = true;
            }
          }, 'btn primary');
          batchSubmit.type = 'button';
          const fillBatchPlayers = () => {
            const chosen = batchSelect.value;
            batchSelect.replaceChildren(new Option('— Chọn VĐV —', ''));
            const ids = new Set(activeContributions.map(c => c.player_id));
            [...ids].filter(id => playerName(id).toLocaleLowerCase('vi').includes(batchSearch.value.toLocaleLowerCase('vi')))
              .sort((a, b) => playerName(a).localeCompare(playerName(b), 'vi'))
              .forEach(id => batchSelect.append(new Option(playerName(id), id)));
            if ([...batchSelect.options].some(option => option.value === chosen)) batchSelect.value = chosen;
            updateBatch();
          };
          batchSelect.addEventListener('change', () => updateBatch());
          batchSearch.addEventListener('input', fillBatchPlayers);
          batchBody.append(el('p', 'Phân bổ khoản cũ trước; khoản cuối có thể đóng một phần. Số phân bổ chính thức do hệ thống xác nhận khi ghi nhận.', 'text-sm muted mb-3'),
            field('Tìm VĐV', batchSearch), field('VĐV', batchSelect), batchPreview,
            field('Số tiền thực nhận', batchAmount), field('Ngày giờ nhận tiền', batchDate),
            field('Ghi chú', batchNote), batchSubmit, batchMessage, batchResult);
          batchDetails.append(batchBody);
          fillBatchPlayers();
          if (state.fundBatchPlayer?.actor === batchOwner && state.fundBatchPlayer?.id) {
            batchSelect.value = state.fundBatchPlayer.id; updateBatch();
          }
          if (state.fundBatchReceipt?.actor === batchOwner && state.fundBatchReceipt?.data) {
            const receipt = state.fundBatchReceipt.data;
            collectionDetails.open = true;
            batchResult.append(el('p', `Đã thu ${money(receipt.requested_amount)} • ${receipt.allocation_count} khoản • Còn ${money(receipt.total_outstanding_after)}`, 'notice'));
            table(batchResult, 'Phân bổ đã ghi nhận', receipt.allocations,
              [['Khoản', c => String(c.contribution_id).slice(0, 8)],
               ['Đã thu', c => money(c.allocated_amount)], ['Còn lại', c => money(c.remaining)],
               ['Trạng thái', c => c.status]], { status: true });
          }

          // FUND UI V2 WP4: one collection entry; each flow retains its own state/guards.
          const collectionMode = el('select', null, 'field w-full');
          collectionMode.append(new Option('Thu gộp theo VĐV — ưu tiên', 'batch'),
            new Option('Thu từng khoản', 'single'));
          collectionMode.value = 'batch';
          const modeLabel = el('label', null, 'block text-sm mb-3');
          modeLabel.append(el('span', 'Cách thu quỹ', 'block mb-1'), collectionMode);
          let currentCollectionMode = 'batch';
          wrapper.hidden = true;
          batchDetails.hidden = false;
          collectionMode.addEventListener('change', () => {
            if (batchBusy || batchNeedsReload || submit.textContent === 'Đang ghi nhận…') {
              collectionMode.value = currentCollectionMode;
              return;
            }
            currentCollectionMode = collectionMode.value;
            batchDetails.hidden = currentCollectionMode !== 'batch';
            wrapper.hidden = currentCollectionMode !== 'single';
          });
          collectionContent.replaceChildren(modeLabel, batchDetails, wrapper);

          const fundActions = [];
          if (canCollectFund()) fundActions.push(collectionDetails);
          if (canManageFund()) fundActions.push(campaignDetails, expenseDetails);

          fundActions.forEach(
            action => {
              action.addEventListener(
                'toggle',
                () => {
                  if (!action.open) {
                    return;
                  }

                  fundActions
                    .filter(
                      other =>
                        other !==
                        action
                    )
                    .forEach(
                      other => {
                        other.open =
                          false;
                      }
                    );
                }
              );
            }
          );

          if (canCollectFund()) sectionRoot.append(collectionDetails);
          if (canManageFund()) {
            if (canCollectFund()) sectionRoot.append(el('p', 'Quản lý quỹ', 'muted text-sm mt-4 mb-2'));
            sectionRoot.append(campaignDetails, expenseDetails);
          }

          fillContributions();
        },
        true
      );
    }

    let openFundPaymentHistory = () => {};

        // MP01 FUND MANAGEMENT REPORTS V1
    if (canManageFund() || canCollectFund()) {
    // FUND UI V2 WP3: one workspace; report predicates remain unchanged.
    fundCollapse('Công nợ', sectionRoot => {
        if (!debtDataComplete) {
          notice(sectionRoot, 'Chưa đủ dữ liệu sổ quỹ để tính công nợ sau hoàn tiền. Vui lòng tải lại hoặc liên hệ ADMIN.', true);
          return;
        }
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
                  netPaid(contribution);

                const remaining =
                  remainingPayment(contribution);

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

        const mode = el('select', null, 'field');
        mode.append(new Option('Tất cả công nợ', 'all'), new Option('Theo kỳ trận', 'report'));
        mode.value = 'all';
        const search = el('input', null, 'field');
        search.type = 'search'; search.placeholder = 'Tìm VĐV trong danh sách';
        const labeled = (title, control) => {
          const label = el('label', null, 'block text-sm');
          label.append(el('span', title, 'block mb-1'), control); return label;
        };
        const toolbar = el('div', null, 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3');
        toolbar.append(labeled('Tìm VĐV', search), labeled('Phạm vi công nợ', mode));
        const reportControls = el('div', null, 'mb-3');
        reportControls.hidden = true;
        reportControls.append(el('p', 'Theo kỳ trận: chỉ nghĩa vụ THUA/HÒA của trận APPROVED trong khoảng ngày thi đấu. Không bao gồm campaign. Sao chép áp dụng toàn bộ báo cáo theo kỳ, không theo ô tìm tên.', 'muted text-sm mb-2'), controls);
        let debtPage = 0;
        // Same active contribution scope and NET helpers as the former player view.
        const allPlayerDebt = () => {
          const grouped = new Map();
          for (const c of activeContributions) {
            if (!c.player_id) continue;
            if (!grouped.has(c.player_id)) grouped.set(c.player_id, {
              playerId: c.player_id, name: playerName(c.player_id), due: 0, paid: 0,
              remaining: 0, credit: 0, openCount: 0, items: []
            });
            const p = grouped.get(c.player_id);
            const due = contributionAmount(c), paid = netPaid(c), remaining = remainingPayment(c);
            p.due += due; p.paid += paid; p.remaining += remaining; p.credit += paymentCredit(c);
            if (remaining > 0) p.openCount++;
            p.items.push({ contribution: c, due, paid, remaining,
              match: rows('matches').find(m => m.id === c.match_id) });
          }
          return [...grouped.values()].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, 'vi'));
        };
        // Small client-side pager, matching the shared table's 20-row page size.
        const paginated = (host, items, drawItem, initialPage = 0, remember = () => {}) => {
          let page = initialPage;
          const draw = () => {
            host.replaceChildren();
            const pages = Math.max(1, Math.ceil(items.length / 20));
            page = Math.max(0, Math.min(page, pages - 1)); remember(page);
            items.slice(page * 20, page * 20 + 20).forEach(item => host.append(drawItem(item)));
            if (pages > 1) {
              const nav = el('div', null, 'form-actions mt-3');
              const previous = button('Trang trước', () => { page--; draw(); }, 'btn');
              const next = button('Trang sau', () => { page++; draw(); }, 'btn');
              previous.type = next.type = 'button';
              previous.disabled = page === 0; next.disabled = page === pages - 1;
              nav.append(previous, el('span', `${page + 1}/${pages}`), next); host.append(nav);
            }
          };
          draw();
        };
        const playerCard = (player, reportMode) => {
          const card = el('details', null, 'rounded-lg border mb-2');
          card.style.minWidth = '0'; card.style.overflowWrap = 'anywhere';
          const summary = el('summary', null, 'p-3 cursor-pointer text-sm');
          summary.append(el('strong', player.name),
            el('span', ` • Còn nợ ${money(player.remaining)}`, 'font-semibold'),
            el('div', `Phải thu ${money(player.due)} • Đã thu NET ${money(player.paid)} • ${player.openCount} khoản còn nợ`, 'muted mt-1'),
            el('span', 'Xem chi tiết', 'text-sm'));
          const body = el('div', null, 'px-3 pb-3');
          let initialized = false;
          card.addEventListener('toggle', () => {
            if (!card.open || initialized) return;
            initialized = true;
            body.append(el('p', reportMode ? 'Chi tiết trong kỳ trận đang lọc' : 'Toàn bộ nghĩa vụ hợp lệ của VĐV', 'muted text-sm mb-2'));
            if (player.credit > 0) body.append(el('p', `Nộp dư ${money(player.credit)} — cần đối soát.`, 'notice text-sm'));
            const obligationList = el('div');
            const items = player.items.slice().sort((a, b) =>
              new Date(reportMode ? b.match.played_at : b.contribution.created_at || 0).getTime() -
              new Date(reportMode ? a.match.played_at : a.contribution.created_at || 0).getTime());
            paginated(obligationList, items, item => {
              const c = item.contribution;
              const row = el('div', null, 'border-t py-2 text-sm');
              row.style.overflowWrap = 'anywhere';
              const when = reportMode ? vnDateKey(item.match.played_at) : fundContributionDate(c);
              const reference = item.match ? `Trận ${matchCode(item.match)}` :
                c.match_id ? `Trận #${String(c.match_id).slice(0, 8)}` : fundContributionTitle(c);
              const status = fundContributionStatus(c);
              const statusText = ({CHUA_DONG:'Chưa đóng', DONG_MOT_PHAN:'Đóng một phần', DA_DONG:'Đã đóng', MIEN:'Miễn'})[status] || status;
              const statusLine = el('div', null, 'muted mt-1');
              statusLine.append(el('span', statusText, 'badge ' + (status === 'DA_DONG' ? 'good' : ['CHUA_DONG','DONG_MOT_PHAN'].includes(status) ? 'pending' : '')), el('span', ' • ' + reference));
              row.append(el('div', `${fundContributionTitle(c)} • ${String(when || '—').slice(0, 10)}`, 'font-semibold'),
                el('div', `Phải đóng ${money(item.due)} • Đã thu NET ${money(item.paid)} • Còn ${money(item.remaining)}`, 'mt-1'),
                statusLine);
              return row;
            });
            body.append(obligationList);
            if (!reportMode) {
              body.append(button('Xem lịch sử thanh toán', () => {
                openFundPaymentHistory(player.playerId, player.items.map(item => item.contribution.id));
              }, 'btn mt-3'));
            }

          });
          card.append(summary, body); return card;
        };
        const renderDebtWorkspace = (resetPage = false) => {
          if (resetPage) debtPage = 0;
          resultRoot.replaceChildren(); notice(reportMessage, '');
          const reportMode = mode.value === 'report';
          reportControls.hidden = !reportMode;
          let players;
          if (reportMode) {
            const report = getReportData();
            if (report.error) { notice(reportMessage, report.error, true); return; }
            players = report.players;
          } else players = allPlayerDebt();
          const query = search.value.trim().toLocaleLowerCase('vi');
          const filtered = players.filter(p => p.name.toLocaleLowerCase('vi').includes(query));
          if (reportMode || query) resultRoot.append(el('p',
            `Trong phạm vi lọc: ${filtered.length} VĐV • Phải thu ${money(filtered.reduce((s, p) => s + p.due, 0))} • Đã thu NET ${money(filtered.reduce((s, p) => s + p.paid, 0))} • Còn thu ${money(filtered.reduce((s, p) => s + p.remaining, 0))}`,
            'muted text-sm mb-3'));
          if (!filtered.length) resultRoot.append(el('p', 'Không có công nợ phù hợp.', 'muted text-sm'));
          else {
            const list = el('div'); resultRoot.append(list);
            paginated(list, filtered, p => playerCard(p, reportMode), debtPage, page => { debtPage = page; });
          }
        };
        const viewButton = button('Xem báo cáo', () => renderDebtWorkspace(true), 'btn');
        viewButton.type = 'button';
        controls.append(field('Từ ngày', fromInput), field('Đến ngày', toInput), field('Bộ lọc', onlyDebtWrap), viewButton);
        reportControls.append(copyButton);
        mode.addEventListener('change', () => renderDebtWorkspace(true));
        search.addEventListener('input', () => renderDebtWorkspace(true));
        fromInput.addEventListener('change', () => renderDebtWorkspace(true));
        toInput.addEventListener('change', () => renderDebtWorkspace(true));
        onlyDebtInput.addEventListener('change', () => renderDebtWorkspace(true));
        sectionRoot.append(toolbar, reportControls, reportMessage, resultRoot);
        renderDebtWorkspace();
      }
    );
    }

        // WP5: navigation only; payments and cash ledger remain separate datasets.
        const historyWorkspace = el('details', null, 'fund-action mt-4');
        historyWorkspace.append(el('summary', 'Lịch sử & đối soát', 'fund-action-summary'));
        const historyBody = el('div', null, 'p-3');
        const historyLabel = el('label', null, 'block text-sm');
        historyLabel.append(el('span', 'Nội dung đối soát', 'block mb-1'));
        const historyMode = el('select', null, 'field');
        if (canManageFund() || canCollectFund()) historyMode.append(new Option('Thanh toán', 'payments'));
        if (canManageFund()) historyMode.append(new Option('Thu / Chi', 'ledger'));
        historyMode.append(new Option('Quy định', 'rules'));
        historyMode.value = canManageFund() || canCollectFund() ? 'payments' : 'rules';
        historyLabel.append(historyMode);
        const historyView = el('div', null, 'mt-3');
        historyBody.append(historyLabel, historyView);
        historyWorkspace.append(historyBody);
        root.append(historyWorkspace);
        let historyPlayer = null;
        let historyContributionIds = new Set();

        function renderHistoryView() {
          historyView.replaceChildren();
          if (historyMode.value === 'rules') {
            settings(historyView, 'fund_rules');
            return;
          }
          const ledger = historyMode.value === 'ledger';
          // Never read raw ledger in the collector-only history view.
          if (ledger ? !canManageFund() : !(canManageFund() || canCollectFund())) return;
          const dataset = ledger ? 'fund_transactions' : 'fund_payments';
          historyView.append(el('p', ledger
            ? 'Sổ tiền mặt: thu, chi, hoàn tiền và điều chỉnh. Không dùng thay công nợ.'
            : 'Các lần ghi nhận thanh toán gross. Hoàn tiền được đối soát riêng trong Thu / Chi.', 'muted text-sm'));
          if (state.errors[dataset]) {
            historyView.append(el('p', 'Không tải được dữ liệu đối soát. Vui lòng tải lại.', 'notice error'));
            return;
          }
          if (state.partial[dataset]) historyView.append(el('p',
            'Danh sách chưa đầy đủ; chỉ dùng đối soát các bản ghi đã tải. Vui lòng tải lại trước khi kết luận tổng số.', 'notice'));
          let records = rows(dataset).slice();
          if (!ledger && historyPlayer) {
            records = records.filter(p => p.player_id === historyPlayer || historyContributionIds.has(p.contribution_id));
            historyView.append(el('p', 'VĐV: ' + playerName(historyPlayer), 'text-sm'));
            historyView.append(button('Xem tất cả thanh toán', () => {
              historyPlayer = null;
              historyContributionIds = new Set();
              renderHistoryView();
            }, 'btn'));
          }
          const recordDate = r => ledger ? pick(r, 'transaction_date', 'occurred_at', 'created_at') : pick(r, 'paid_at', 'created_at');
          records.sort((a, b) => (Date.parse(recordDate(b)) || 0) - (Date.parse(recordDate(a)) || 0));
          const paymentPlayer = r => r.player_id || rows('fund_contributions').find(c => c.id === r.contribution_id)?.player_id;
          const searchLabel = el('label', null, 'block text-sm mt-3');
          searchLabel.append(el('span', 'Tìm trong lịch sử', 'block mb-1'));
          const search = el('input', null, 'field');
          search.type = 'search';
          search.placeholder = 'Tìm tên, ghi chú hoặc mã tham chiếu';
          searchLabel.append(search);
          const list = el('div', null, 'space-y-2 mt-3');
          const pager = el('div', null, 'pager mt-3');
          historyView.append(searchLabel, list, pager);
          let page = 0;
          function drawHistory() {
            list.replaceChildren();
            pager.replaceChildren();
            const query = search.value.trim().toLocaleLowerCase('vi');
            const filtered = records.filter(r => (Object.values(r).map(raw).join(' ') + ' ' +
              (ledger ? '' : playerName(paymentPlayer(r)))).toLocaleLowerCase('vi').includes(query));
            const pages = Math.max(1, Math.ceil(filtered.length / 20));
            page = Math.min(page, pages - 1);
            if (!filtered.length) list.append(el('p', 'Không có bản ghi phù hợp.', 'muted text-sm'));
            filtered.slice(page * 20, (page + 1) * 20).forEach(r => {
              const card = el('article', null, 'rounded-lg border p-3 text-sm');
              card.style.minWidth = '0';
              card.style.overflowWrap = 'anywhere';
              card.append(el('strong', ledger ? transactionLabel(pick(r, 'transaction_type', 'type', 'entry_type')) : playerName(paymentPlayer(r))));
              card.append(el('div', money(r.amount), 'font-bold mt-1'));
              const when = recordDate(r);
              card.append(el('div', when && Number.isFinite(Date.parse(when))
                ? new Date(when).toLocaleString('vi-VN') : '—', 'muted text-sm'));
              const note = ledger ? pick(r, 'description', 'note', 'notes', 'reason') : pick(r, 'note', 'notes');
              if (note) card.append(el('p', raw(note).length > 100 ? raw(note).slice(0, 100) + '…' : raw(note), 'mt-1'));
              const detail = el('details', null, 'mt-2');
              detail.append(el('summary', 'Tham chiếu', 'cursor-pointer text-sm'));
              if (note && raw(note).length > 100) detail.append(el('p', 'Ghi chú: ' + raw(note), 'mt-1'));
              const refs = ledger
                ? [['Mã giao dịch', 'id'], ['Loại giao dịch', 'transaction_type'], ['Thanh toán', 'payment_id'], ['Nghĩa vụ', 'contribution_id'], ['Hoàn / đảo giao dịch', 'reversal_of_transaction_id'], ['Trạng thái', 'status']]
                : [['Mã thanh toán', 'id'], ['Nghĩa vụ', 'contribution_id'], ['Trạng thái', 'status']];
              refs.forEach(([label, key]) => { if (r[key] != null) detail.append(el('p', label + ': ' + raw(r[key]), 'muted mt-1')); });
              if (ledger && r.match_id) {
                const match = rows('matches').find(m => m.id === r.match_id);
                detail.append(el('p', 'Trận: ' + (match ? matchCode(match) + ' • ' + number(match.team_a_score) + ' – ' + number(match.team_b_score) : raw(r.match_id)), 'muted mt-1'));
              }
              card.append(detail);
              list.append(card);
            });
            const prev = button('Trang trước', () => { page--; drawHistory(); }, 'btn');
            const next = button('Trang sau', () => { page++; drawHistory(); }, 'btn');
            prev.disabled = page === 0;
            next.disabled = page >= pages - 1;
            pager.append(prev, el('span', `${filtered.length} bản ghi • Trang ${page + 1}/${pages}`, 'muted text-sm'), next);
          }
          search.addEventListener('input', () => { page = 0; drawHistory(); });
          drawHistory();
        }
        historyMode.addEventListener('change', renderHistoryView);
        historyWorkspace.addEventListener('toggle', () => {
          if (historyWorkspace.open && !historyView.children.length) renderHistoryView();
        });
        openFundPaymentHistory = (playerId, contributionIds) => {
          historyPlayer = playerId;
          historyContributionIds = new Set(contributionIds);
          historyMode.value = 'payments';
          historyWorkspace.open = true;
          renderHistoryView();
          historyWorkspace.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        };

      
      }

      return {
        fund
      };
    }
  };
})();









/* FUND03B OBLIGATION CAMPAIGN UI V1 */
