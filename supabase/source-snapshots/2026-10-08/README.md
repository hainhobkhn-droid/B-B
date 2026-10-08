# Production source evidence — captured 2026-10-08

Read-only evidence capture; FINAL-D permits repository baseline locking only. Project bflwaqlvnesuqoyikxar; repo HEAD 9c7c1f7f367c2c55ba7726663a73cb28c1b02d39.
Catalog timestamp: 2026-10-08T01:45:58.464571+00:00. Rating snapshot: 2026-10-08T01:48:07.558423+00:00.

These files are exact read-only evidence, not migrations, a bootstrap schema, or instructions to replay/deploy. No business records, credential values, JWTs, raw audit payloads or contact data were exported. The Rating JSON contains aggregate counts/hashes and configuration only. Definitions may contain historical comments; effective predicates and catalog ACL win.

production-catalog.json contains all 111 non-extension public functions, exact pg_get_functiondef strings/MD5, owner/ACL/search_path, table columns/constraints/policies/grants and user trigger attachments. Every MD5 was recomputed from the exported UTF-8 string: PASS 111/111. The JSON preserves CR characters inside definition strings. Do not normalize them before raw-hash comparison. Audit also has normalized MD5 1f2511bef9a66067151653952d973a4a.

Both SQL files contain only catalog/aggregate SELECTs inside READ ONLY transactions ending ROLLBACK. They do not invoke business mutation RPCs. Exact source capture is YES for every inventory entry below; migration-chain reconstruction is NOT VERIFIED. An archived definition closes missing-source evidence, not an operational deployment mismatch.

## Edge source parity

| Edge | Download SHA-256 | Runtime source convergence |
|---|---|---|
| admin-confirm-user | `554cb1f2474e0951daf681b48ac1fd1e74e5b981a4fa0afc8f5eed7f58d9737e` | PREPARED exact missing source; not committed/deployed |
| admin-create-member | `b309b8ecf0ac8ad04a90bba3a06a520f26ec474cc5547680db4d9f3f1f5abfd4` | YES, normalized text parity |
| admin-hard-delete-member | `ef7cf8afaf853d462722ddf6bc5f78ffde54e3695a15b0a748d4bbb60e469a93` | NO: runtime repo/deployed definitions differ; exact archive preserved |
| change-my-password | `f463287c5e227c4b75c63d69ad6050da2e99bd378fd83da7c4bbe970af82f131` | YES, normalized text parity |
| login-by-nickname | `c4ad99c786e953fc7bd7efbfec13484b5ab04320a12fa374e63ba3cce2d6dde5` | YES, normalized text parity |

admin-confirm-user was missing and is copied byte-for-byte to supabase/functions/admin-confirm-user/index.ts without deployment. Its JWT validation uses auth.getUser; authority checks role ADMIN and is_active only. admin-create-member has the same limited actor check. Neither checks membership_status or must_change_password; no audited exemption was found. This is a security contract review gap, not a claim that an exploit was performed. Do not add a gate or redeploy implicitly.

admin-hard-delete-member production is older/different than repository ACC05 implementation: no cleanup success assertion, no complete_member_hard_delete_auth call, weaker recovery response and different Auth 404 handling. Preserve both; do not replace reviewed repo code with older deployed code. Separate exact-contract review and approved convergence deployment required before declaring Account deletion fully converged. No real Account deletion was tested.

## Function convergence inventory

| Production signature | Raw definition MD5 | Exact repo evidence after preparation | Migration replay/source status |
|---|---|---|---|
| `_approve_match_internal(uuid,text,uuid,uuid)` | `f453af5f5da1bbf3618be571a8b25ffb` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `_generate_match_fund_internal(uuid,uuid)` | `d74c7f4676980f28eeba014ed414c500` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `_get_active_rating_version()` | `d2f0aeada41cdf2ec0746324ba266957` | YES, exact archive | No migration definition reference; exact archive only |
| `_rebuild_ratings_internal(text,uuid)` | `b3b434e407c1828bbb6dbf2907148104` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `_record_fund_payment_internal(uuid,numeric,timestamp with time zone,text,uuid)` | `928b9d68987577e00fba95eb057fbb65` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `_review_member_signup(uuid,text,text)` | `8c56de511e2bae4c40e6710971f5553b` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_approve_member_signup(uuid)` | `7667a5c4659ac8740084eeff5c28c227` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_create_fund_rule_version(text,numeric,numeric,numeric,date)` | `212c3cf422382143c00d177cca7b650d` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_create_rating_settings_version(text,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,numeric)` | `8d496aaa788bc561ef0f249c65dfec89` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_hard_delete_member_public(uuid,uuid,text)` | `95058b6ccc7a2032bad98d7cfcba55a4` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_reject_member_signup(uuid,text)` | `5e3742b9eaa6760b76df253c696af1c8` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_set_member_account_active(uuid,boolean,text)` | `e23ee1bc0901d5e3570225527428015c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_set_member_nickname(uuid,text)` | `728a62e86821a0aa93152dad07dc657c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_update_member_permissions(uuid,jsonb,text)` | `af4f00a2a01c1abab59f52ccd7d0e8cd` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `admin_update_rating_match_weight(text,numeric,text)` | `0d4e189749113e53de50e13c8e46dc65` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `approve_match(uuid,text)` | `1b82cfdae7076aa6812b971fab3527da` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `approve_match_active(uuid)` | `ce955e39a2d955c5210e6057b2ed7f23` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `cancel_fund_obligation_campaign(uuid,text)` | `6e41dec9b2680d1aad65737b12c0ff49` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `change_tournament_registration_status(uuid,text,text)` | `0ccbd5968740d52be1b50e1373787288` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `change_tournament_status(uuid,text,text)` | `f455e748853fcdc4d531bf95d0bb7fc1` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `claim_my_nickname(text)` | `5a1644e6301072ee417489320ac89f25` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `complete_forced_password_change_internal(uuid)` | `6864ebfd9879d3b04fa6b460847d9695` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `complete_member_hard_delete_auth(uuid,uuid)` | `29fde510226878423e0460eb9af4c393` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `complete_my_password_change()` | `b07598a00d5b521a615088d04cde3701` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `confirm_match_by_opponent(uuid)` | `d626801e276882c505716cbdc16dc721` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `correct_rating_adjustment(uuid,text,text)` | `8c738f269f2a8b7a9f8411b8043a606d` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `correct_rating_adjustment_active(uuid,text)` | `6121a66c5b4b9933f6e7e7e498d5bf82` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_fund_obligation_campaign(text,text,numeric,date,date,text)` | `8c662527e2ac1a26706aca652de1e187` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_my_pending_match(timestamp with time zone,text,text,integer,integer,uuid,uuid,uuid,uuid,text)` | `fce82b6b06638e94c404d9c396e2de0c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_my_tournament_registration(uuid,text,uuid)` | `8f618179e382fe9100a1ab711e0b271c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_pending_match(timestamp with time zone,integer,text,text,integer,integer,uuid,uuid,text)` | `c113662b26a24893a0ecfe7439921c90` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_player(text,text,text,text,numeric,date,date,text)` | `ff778303c014e14b936a4e490b191552` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_replacement_match(uuid)` | `ecdd85b9916439f9cc5d9c6c131969a9` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_tournament(text,text,date,date,text,text,text,numeric,text)` | `d306f734960b5db2b026aad7a5f62719` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_tournament_expense(uuid,numeric,text,text,date)` | `8945da38a85a66ca9d6cc1b188847c92` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_tournament_payment(uuid,numeric,timestamp with time zone,text)` | `cc4f21e336095847687e0ffabe3eff87` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `create_tournament_registration(uuid,uuid,text,uuid,numeric)` | `412989b8331232c066e96b647a653e4c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `current_user_business_access_active()` | `d5a196e9bfb9522d559e3422c6669c01` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `current_user_is_admin()` | `41f535721fb75ebe5cd6545a27b0a811` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `current_user_membership_active()` | `48dd3dcbd4c25b221cd5ebcfd108467c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `current_user_player_id()` | `28f796e7c5161148c7055d34c060ffd6` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `delete_player_if_unreferenced(uuid,text)` | `8ae96dd2ab678361f952f613ce3b6f08` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `generate_match_fund(uuid)` | `69fcd4a294552ee61d7254979b5e153e` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_admin_member_deletion_preview(uuid)` | `a62dfb122b755e4006765fb28f702316` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_admin_member_lifecycle(integer,integer)` | `8fd56dae6f373715e199a802c546516f` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_admin_member_permissions(integer,integer)` | `f9bc7141bfeeb2b96d4de40490a34735` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_admin_member_promotion_candidates()` | `5934464fd6aec9946cc14a2e17d9a850` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_admin_member_promotion_preview(uuid,uuid)` | `5a29e1abaa36bb4a567bbc3fbed7c4e9` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_admin_pending_member_signups(integer,integer)` | `d78cbf38eefc35ac3aaec970c773758f` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_audit_events(integer,integer,timestamp with time zone,timestamp with time zone,uuid,text,text)` | `9dd6c825591f6c018fa94ee94796a86c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_club_fund_summary()` | `14597410fbbeec2f4235ed6930f170d4` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_forced_password_change_readiness_internal(uuid)` | `997a480b25d9bb225b346b49988a5a10` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_fund_collection_balances()` | `3ba2703698ce1518a6529cfaa769b9a0` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_fund_management_contributions()` | `1297c00e6567b91c00dae62efed24622` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_fund_management_payments()` | `60c36e0dae114409b4c03f08b941783a` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_fund_management_transactions()` | `e6cd91322012a5c02f9274ee305f0480` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_guest_member_promotion_candidates()` | `39500c85c2aa0a25c5949f8f2e9aa1f2` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_match_management_matches()` | `5235bbb1e106c676a004ea18815d84dd` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_match_management_players()` | `e04dfd8c51ac947eb4bceab8605debf4` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_fund_overview()` | `321da8bc02c641766a9d859b11895dbb` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_fund_transactions()` | `a754cbb8de43356c6ce6d5e2d2383d64` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_hard_delete_snapshot(uuid)` | `4c1e72f70849ce17b6e1c3ab087bee72` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_management_players()` | `e1522854262e69e03f7da5bb2edf9b6b` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_match_players()` | `b16b1df96bc2ea2a33b4684d690d318e` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_matches()` | `ad12a9fda28a276bfbe8566961f6cfdc` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_member_rating_events()` | `f972e7f7e1117466237d80b6c64abacd` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_my_fund_contributions()` | `c3111d0aee5f253753ee583c3b27db90` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_my_fund_obligations()` | `18acff61c07cceed17574caeaf4f3923` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_my_fund_payment_history()` | `8dbe274305c3a9b72e2472c3110e3716` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_my_fund_payments()` | `350a018ac4c284a9a12f24bb6a4c2e98` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_my_pending_match_confirmations()` | `26ba9e9dc74f7fdb14a37288ba748940` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_player_directory()` | `25c4d53b8b5567bf274794bdee3b6bce` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_player_lifecycle_preview(uuid)` | `312f938305fb2cd7ca4a05f0f4f023a4` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_signup_rating_config()` | `3d06e52e4d4fc7dea2978c91ba9b3f8e` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_tournament_finance_summary(uuid)` | `dd2f39771774fc042e45039d38014944` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_tournament_management_payments()` | `36bc1aabe16d9744e44001f3edd3a705` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `get_tournament_management_registrations()` | `c01297add26247cec2f1cf02e506ac36` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `guard_forced_password_completion()` | `103fe83ac78849db6a7ff87b2a302865` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `guard_match_mutation()` | `b4694754f08ba49a3a3bb9e333dfc546` | YES, exact archive | No migration definition reference; exact archive only |
| `guard_match_player_mutation()` | `488f7ca34f136b4e5dca51c6d59c264d` | YES, exact archive | No migration definition reference; exact archive only |
| `guard_tournament_registration_players()` | `f197669d555a0b3dba0af1c1be42f247` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `handle_new_member_signup()` | `ec23869986bb9764eb764a0941185dab` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `player_has_approved_rated_history(uuid)` | `ba2533f4dc7d8787bf3c19d2bcde89e1` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `player_reference_snapshot(uuid)` | `cf5e742ea3036181725aeecf0cda702b` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `prevent_rating_adjustment_mutation()` | `95bca49977bb5010e8897cb6c4fdcfea` | YES, exact archive | No migration definition reference; exact archive only |
| `promote_guest_player_to_member(uuid,uuid)` | `b6f24a4c4504e87c4c7af82ebe26c6bd` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `rebuild_ratings(text)` | `e60edb61d580178a09035f76e0542214` | YES, exact archive | No migration definition reference; exact archive only |
| `rebuild_ratings_active()` | `2bffd38448262aa35456e582a55e0bc1` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `record_fund_expense(numeric,text,timestamp with time zone)` | `3a63de3f5f4f420ddc1afbd50cc6103d` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `record_fund_payment(uuid,numeric,timestamp with time zone,text)` | `666844f3e02db6c8deb1d2ccdef3da22` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `record_member_fund_payment(uuid,numeric,timestamp with time zone,text)` | `e3c59989caea341767c9889db1facb43` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `record_rating_adjustment(uuid,uuid,numeric,text,timestamp with time zone,text)` | `8e46d18334aab4af27f8cc1264178460` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `record_rating_adjustment_active(uuid,uuid,numeric,text,timestamp with time zone)` | `511cead28025ae378827a9e18c4ce5c5` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `refund_fund_payment(uuid,numeric,text,timestamp with time zone)` | `34cff84f5de80b1995d92a3881eb31e8` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `refund_tournament_payment(uuid,numeric,text,timestamp with time zone)` | `7f18034fefe49f87131a8ccff6c28e1e` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `reject_match_by_opponent(uuid,text)` | `6ecfe7ee3c854606a6a7aaf5212a045a` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `reject_pending_match(uuid,text)` | `0849faa648c823290acd807dfe846ba9` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `resubmit_my_rejected_match(uuid)` | `e1b9d948c3e3b210cc29581ceced063a` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `reverse_tournament_expense(uuid,text,timestamp with time zone)` | `75f18da5005a9165b73438581d9a90c6` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `set_pending_match_players(uuid,uuid,uuid,uuid,uuid)` | `f6700019bd675f2cd5da69a4ee0c78a9` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `set_player_initial_rating_before_history(uuid,numeric,text)` | `4f8a480037ef04a8e0b223739bce5652` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `set_player_lifecycle_status(uuid,text,text)` | `3d4c99cee77a9fea190f8392e0efafcb` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `set_profile_player_link(uuid,uuid)` | `0bfe4d6b8760c6d624589629ed569fa8` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `settle_tournament(uuid,text)` | `b65c68ffee131490f92d44d5dce11abf` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `update_my_member_profile(text,text,date)` | `40114a63e53ef121edea8b04e8b092ff` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `update_my_rejected_pending_match(uuid,timestamp with time zone,text,text,integer,integer,uuid,uuid,uuid,uuid,text)` | `0287d725e000161602ca29ec629370a7` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `update_pending_match(uuid,timestamp with time zone,integer,text,text,integer,integer,uuid,uuid,text)` | `5bd556435a163b8fedf65a386ecfe70f` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `update_player(uuid,text,text,text,text,text,date,date,text)` | `c4ef35bdfb01923dde0f9bb4a849a84c` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `update_tournament(uuid,text,text,date,date,text,text,text,numeric,text)` | `cf50640f75e0180682025993c38b4294` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `void_match(uuid,text,text)` | `420db6c9edb1859056eb618292734f0e` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |
| `void_match_active(uuid,text)` | `9e12c1d60c6749c8b40d62a8c460bef3` | YES, exact archive | Historical migration mentions; replay parity NOT VERIFIED |

manifest.json supplies exact migration file/version/checksums and Edge checksums. A migration mention is not a complete function definition or a deployment ledger entry. Production ledger is absent. Nothing in this directory should be run as a migration.

## FINAL-D source-lock review

Fresh production catalog2026-10-08T02:07:23.555506+00:00 matches all111 archived definition hashes; no unexpected Rating/WP-C9 hash drift. Fresh admin-confirm-user download matches repo/archive byte-for-byte. Credential/sensitive scan PASS. Source-only commit is not an Edge or database deployment. The original capture timestamps/checksums above are preserved; updated data observations are recorded separately in FINAL-D documents. Archive evidence converges source visibility, not the unresolved operational admin-hard-delete-member drift or Edge gate/exemption decision. Those residuals remain unchanged.
