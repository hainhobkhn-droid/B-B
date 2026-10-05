# WP-C7 — Shared Notice / Accessibility — 2026-10-05

## 1. Scope and baseline

Preparation only. HEAD/origin/main: 4896e6e999f41d245dbc8682c0dfb70f8e734ce1. WP-C5 CLOSED / VERIFIED PRODUCTION; WP-C6 DEPLOYED / PARTIALLY VERIFIED. No stage/commit/push/deploy, production business-data mutation, backend/RLS/capability change, search/filter/pagination work or WP-C8/WP-C9.

Read: AGENTS.md, authoritative docs/PICK-UI-SYSTEM-V2.md, project state, V2 reconciliation, WP-C4/C5/C6 reports and current app/account/players/matches/fund/CSS/index sources. Older project-state asset tags are historical; current HEAD and deployment reports take precedence. Backup: C:\Users\hainh\.codex\.chatgpt-projects\g-p-6a9ef55bf47881919ff2a6045b843a72\wp-c7-backup-20261005.

## 2. V2 contract

VERIFIED CURRENT: V2 §25 requires intentional loading and duplicate-submit prevention; §27 shared notice/error treatment, actionable error text and preserved context; §28 clear success, narrow reload and stale-response protection; §35 extend existing shared patterns. Navy/Ivory/Lime, semantic tones and hierarchy remain unchanged.

UNSPECIFIED BY V2: exact aria-live strategy, announcement scheduling and focus restoration algorithm. Native controls, implicit live roles and conservative programmatic focus are implementation choices, not invented V2 rules. This package does not claim WCAG certification.

## 3. Inventory and classification

326 notice call sites: app 80, Account 73, Players 52, Matches 82, Fund 39. Appendix includes the shared function declaration in app's 81 lexical locations. Counts are source locations, not dynamic announcement counts or proof every branch was executed.

| Pattern | Classification | Decision |
|---|---|---|
| Shared notice() passed through module ctx | SHARED CANDIDATE | Extend existing helper; do not create module copies |
| Fixed global-message alert, module alert/status notice nodes | DUPLICATED / INCONSISTENT; MISSING LIVE SEMANTICS in other callers | One persistent polite/critical announcer pair owns delivery |
| Auth login/signup/forgot/recovery message nodes | SHARED CANDIDATE | Same helper overrides legacy per-node alert when delivering |
| boot and sync-status | LOCAL BUSINESS-SPECIFIC | Retain status role; remove redundant sync aria-live |
| Player status/rating/lifecycle/promotion preview live nodes | LOCAL BUSINESS-SPECIFIC | Retain meaningful selected-data announcements; notice target has aria-live off to avoid nested duplicate delivery |
| Account fundCurrent / lifecycle summaries | LOCAL BUSINESS-SPECIFIC | Keep read-model status semantics and wording |
| Account resultNotice recovery text | LOCAL BUSINESS-SPECIFIC | Keep recovery summary; adjacent notice supplies next-step announcement |
| Initial static error/empty paragraphs and badges | LOCAL BUSINESS-SPECIFIC | Readable content, no blanket alert on initial render |
| Native disabled + local writeBusy/saving guards | LOCAL BUSINESS-SPECIFIC | Preserve all guards, eligibility and finally re-enable behavior; no aria-disabled substitute |
| Shared render replacing focused content | ACCESSIBILITY REGRESSION RISK | Restore stable ID if usable, otherwise page heading; no focus theft |
| Accordion closing while its body has focus | ACCESSIBILITY REGRESSION RISK | Return focus to its native toggle before hiding body |
| Shared field:focus outline reset | VERIFIED KEYBOARD REGRESSION | More-specific focus-visible override restores solid 3px Navy outline |
| sr-only labels and table captions | KEEP EXISTING | Reuse existing visually-hidden CSS; no hidden notice set to display:none |

All identified disabled/busy and focus source locations are listed below. No frontend authorization is added to the shared helper.

## 4. Final notice API

Existing notice(node, text, isError, isSuccess) calls remain compatible. Optional object in third argument: { tone: 'info' | 'success' | 'error', announce: false, critical: true }. Module owns text/business meaning; helper owns tone class and semantic delivery.

- Connected changed success/info/validation/business errors: persistent role=status (implicit polite), aria-atomic=true.
- Critical blocking error only when caller explicitly opts in: role=alert (implicit assertive). Boot failure is the selected actual consumer.
- Visible notice target removes legacy role and sets aria-live=off; only one shared delivery channel receives its message.
- No redundant aria-live on the persistent roles.
- Clearing hides the notice without announcing empty text.
- Detached initial render and unchanged same-target message stay silent.
- Repeated relevant retry after clearing is delivered again.
- announce:false allows explicit silent preview content.
- No focus is moved by notice(); no text/role-based authorization or new business errors.

Specialized preview regions remain local. Assistive technology behavior is not asserted from DOM alone.

## 5. Focus, busy and disabled contract

Native disabled remains authoritative for non-interactive controls; existing loading text, writeBusy guards, generation checks and content aria-busy remain unchanged.

Shared render captures focus only inside content. A microtask restores after non-busy render, cancels stale page requests and does not steal focus from another user-selected control. It uses a stable ID only if connected/inside content/enabled/not under hidden; otherwise page-title tabindex=-1. Shared panel h2 tabindex=-1 makes existing Match heading.focus() calls effective without adding headings to Tab order.

Accordion close restoration runs only if its body currently contains focus; unrelated navigation focus is preserved. API, order, exclusive-open and onOpen semantics are unchanged.

Existing field-specific validation focus remains module-local. Auth redirect/password completion paths are unchanged. This is conservative repair of removed-content focus, not a blanket promise to refocus every disabled submit button or force success messages into focus.

## 6. Browser verification

ADMIN existing localhost session, no credentials created/copied:
- Eight pages at Desktop 1280px and Mobile 390px: navigation/layout and page overflow PASS; exactly one persistent polite and one critical announcer. Initial navigation/render left notice announcers empty, avoiding notice spam. No captured console errors.
- Player keyboard Enter opens action; Tab to rating select matches :focus-visible.
- Before patch: select outline style none despite focus-visible. After patch: rgb(25,40,56) solid 3px.
- Player Thu gọn returns focus to action toggle; aria-expanded=false.
- Native required validation focuses create-player-name; helper does not duplicate native invalid feedback.
- Whitespace-only Rating reason triggers existing pre-RPC validation: polite region contains “Lý do là bắt buộc.”, alert remains empty, visible notice role removed/live off, focus stays on reason. No RPC mutation occurs because trimmed reason is empty.
- Mobile 390px validation form screenshot inspected; no business submission.

NOT RUN: actual NVDA/JAWS/VoiceOver speech; delegated/normal MEMBER live browser sessions; successful production writes, auth credential changes or induced production critical failures. Offline regression covers semantics and relevant role/async branches. Mobile viewport switching hides secondary desktop navigation controls and may leave body focused; this is not evidence of a mutation-focus failure.

## 7. Regression and quality gates

New wp-c7-notice-focus-ui-test.cjs executes the real helper snippets with DOM doubles: legacy API, polite validation, critical opt-in, silent initial/preview, duplicate suppression, retry delivery, no notice focus theft, stable-ID/disabled fallback, busy completion/stale page/no-user-focus-theft, and actual accordion close restoration.

All 17 frontend CJS suites PASS, including WP-C2/C3/C4/C5/C6, Account/IAM, Player lifecycle, initial rating, Fund and Match fixtures. Final checks: 22 JS/CJS syntax files PASS, 18 Python AST files PASS, all seven changed/new files UTF-8/no BOM/no U+FFFD/trailing whitespace PASS, git diff --check PASS. Staging is empty. DOM doubles do not replace screen-reader testing.

## 8. Files and asset plan

Changed: app.js, app.css, index.html; cache-expectation assertions in WP-C5/WP-C6 tests. New: WP-C7 test and this report. account.js/players.js/matches.js/fund.js are unchanged and consume updated shared notice automatically.

Only changed app.js/app.css tags advance to wp-c7-notice-focus-20261005-1; four module tags remain WP-C5. No production deployment. Unrelated untracked workstreams are preserved.

## 9. Final gate

PARTIALLY VERIFIED — local implementation, semantic/keyboard browser smoke and regressions PASS; actual assistive-technology and live delegated/normal sessions remain explicit verification gaps. No stage/commit/push/deploy.

## Appendix — Exact source-location inventory

Line numbers refer to the current WP-C7 working tree. Lexical locations include declarations/guards as labeled, not an AST-derived runtime call graph.

### app.js

- notice (81 locations): 346, 3612, 3625, 3649, 3664, 3694, 5231, 5269, 5286, 5300, 5320, 5396, 5421, 5915, 5956, 5996, 6009, 6026, 6040, 6060, 6141, 6166, 6578, 6629, 6648, 6673, 6736, 6761, 7282, 7323, 7371, 7381, 7391, 7405, 7425, 7497, 7549, 7955, 8024, 8034, 8099, 8159, 9278, 9321, 9388, 9668, 9680, 9720, 9769, 9859, 10701, 10843, 11208, 11212, 11219, 11227, 11238, 11261, 11283, 11308, 11339, 11346, 11442, 11457, 11494, 11553, 11565, 11575, 11593, 11614, 11675, 11703, 11776, 11853, 11907, 11912, 11927, 11939, 12240, 12317, 12341.
- live semantics (11 locations): 360, 933, 3560, 3773, 4978, 5478, 6226, 6822, 7631, 11107, 11161.
- native disabled (79 locations): 391, 1085, 1088, 3642, 3643, 3644, 3703, 3704, 3705, 5332, 5335, 5430, 5433, 6072, 6075, 6078, 6175, 6178, 6181, 6401, 6475, 6507, 6510, 6539, 6542, 6568, 6571, 6594, 6685, 6688, 6691, 6770, 6773, 6776, 7437, 7440, 7443, 7446, 7449, 7558, 7561, 7564, 7567, 7570, 7982, 8046, 8049, 8052, 8055, 8168, 8171, 8174, 8177, 9273, 9399, 9708, 9711, 9714, 9717, 9868, 9871, 9874, 9877, 10698, 10861, 11203, 11217, 11241, 11313, 11355, 11454, 11467, 11623, 11749, 11770, 11868, 11884, 11918, 12338.
- busy guard (30 locations): 64, 3602, 3640, 3701, 5259, 5329, 5427, 5986, 6069, 6172, 6596, 6613, 6682, 6767, 7351, 7434, 7555, 8008, 8043, 8165, 9255, 9261, 9394, 9651, 9705, 9865, 10913, 11203, 11216, 11240.
- focus (4 locations): 313, 393, 4008, 9554.

### account.js

- notice (73 locations): 235, 237, 273, 277, 283, 292, 296, 371, 373, 385, 445, 492, 501, 518, 530, 697, 703, 708, 717, 730, 734, 762, 778, 807, 812, 947, 962, 973, 990, 1002, 1015, 1037, 1040, 1399, 1528, 1547, 1599, 1615, 1660, 1881, 1892, 1915, 1925, 1927, 1958, 1961, 2000, 2067, 2079, 2344, 2358, 2378, 2410, 2498, 2568, 2706, 2731, 2761, 2778, 2826, 3080, 3105, 3166, 3200, 3544, 3569, 3633, 3667, 4015, 4037, 4062, 4144, 4178.
- live semantics (11 locations): 207, 361, 439, 604, 892, 1082, 2282, 2816, 3234, 3374, 3701.
- native disabled (45 locations): 247, 264, 372, 393, 479, 499, 524, 619, 620, 621, 622, 667, 715, 743, 745, 906, 908, 909, 1226, 1227, 1228, 1229, 1231, 1242, 1250, 1628, 1629, 1630, 1890, 1935, 2404, 2580, 2726, 2727, 2786, 2787, 3044, 3097, 3184, 3491, 3561, 3651, 3933, 4054, 4162.
- busy guard (98 locations): 230, 246, 264, 271, 366, 369, 372, 391, 392, 479, 486, 498, 523, 609, 618, 653, 691, 712, 713, 739, 740, 757, 758, 778, 779, 799, 816, 823, 897, 906, 912, 958, 959, 960, 977, 978, 995, 997, 1015, 1016, 1043, 1107, 1108, 1222, 1223, 1226, 1227, 1228, 1320, 1388, 1404, 1405, 1406, 1512, 1513, 1514, 1538, 1539, 1623, 1624, 1648, 1649, 1650, 1657, 1873, 1888, 1889, 1932, 1933, 1971, 1987, 1988, 1994, 2051, 2052, 2089, 2093, 2106, 2116, 2117, 2320, 2399, 2575, 2695, 2725, 2785, 3045, 3055, 3092, 3179, 3492, 3502, 3556, 3646, 3934, 3944, 4049, 4157.
- focus (3 locations): 493, 709, 1534.

### players.js

- notice (52 locations): 366, 402, 411, 434, 492, 506, 526, 852, 973, 994, 1003, 1016, 1075, 1089, 1109, 1225, 1312, 1321, 1324, 1333, 1338, 1349, 1354, 1362, 1390, 1401, 1407, 1814, 1843, 1884, 1893, 1906, 1938, 1980, 2001, 2014, 2850, 2865, 2902, 2911, 2975, 3463, 3487, 3493, 3529, 3539, 3543, 3559, 3576, 3578, 3596, 3616.
- live semantics (10 locations): 95, 582, 712, 1156, 1189, 1444, 1499, 2797, 3419, 3421.
- native disabled (25 locations): 451, 452, 535, 538, 1027, 1028, 1118, 1121, 1300, 1301, 1302, 1303, 1304, 1763, 1764, 1765, 1768, 1788, 2861, 2862, 2907, 2908, 3450, 3451, 3568.
- busy guard (44 locations): 396, 449, 532, 988, 1025, 1115, 1232, 1299, 1305, 1319, 1359, 1360, 1386, 1387, 1409, 1410, 1587, 1760, 1761, 1781, 1800, 1872, 1873, 1935, 1936, 1976, 2006, 2007, 2021, 2022, 2834, 2860, 2918, 3435, 3449, 3452, 3460, 3461, 3495, 3568, 3570, 3590, 3621, 3622.
- focus (6 locations): 1334, 1343, 1350, 1355, 1898, 2856.

### matches.js

- notice (82 locations): 1188, 1263, 1279, 1308, 1325, 1347, 1361, 1461, 1475, 1516, 1989, 2066, 2082, 2111, 2128, 2145, 2160, 2187, 2201, 2292, 2356, 2766, 2911, 2937, 2964, 2978, 2992, 3019, 3082, 3096, 3121, 4097, 4269, 4300, 4328, 4348, 4375, 4405, 4422, 4501, 4515, 4541, 4790, 4806, 4816, 4859, 4873, 4896, 5286, 5307, 5333, 5346, 5358, 5419, 5433, 5459, 5825, 5846, 5872, 5891, 5966, 5985, 6009, 6414, 6434, 6481, 6495, 6520, 7725, 7803, 7827, 7887, 7986, 8421, 8485, 8505, 8525, 8554, 8635, 8650, 8692, 8745.
- live semantics (8 locations): 404, 1579, 2512, 3429, 4627, 5009, 5588, 6183.
- native disabled (62 locations): 1372, 1373, 1525, 1528, 1851, 2213, 2216, 2219, 2222, 2225, 2365, 2368, 2371, 2374, 2377, 3031, 3034, 3037, 3040, 3043, 3046, 3049, 3130, 3133, 3136, 3139, 3142, 3145, 3148, 4434, 4437, 4440, 4551, 4554, 4557, 4835, 4836, 4837, 4904, 4905, 4906, 5389, 5392, 5395, 5469, 5472, 5475, 5918, 5921, 6019, 6022, 6457, 6460, 6529, 6532, 7006, 7839, 7896, 7943, 7995, 8566, 8659.
- busy guard (33 locations): 1257, 1370, 1522, 2060, 2210, 2362, 2905, 3028, 3127, 4294, 4431, 4548, 4784, 4833, 4902, 5301, 5386, 5466, 5840, 5915, 6016, 6408, 6454, 6526, 7816, 7836, 7893, 7926, 7940, 7992, 8480, 8563, 8656.
- focus (4 locations): 2398, 5352, 5364, 8012.

### fund.js

- notice (39 locations): 1329, 1359, 1372, 1386, 1450, 1466, 1690, 1972, 1975, 1984, 2004, 2017, 2033, 2052, 2129, 2145, 2406, 2429, 2442, 2456, 2469, 2490, 2546, 2562, 2699, 2702, 2708, 2717, 2721, 2737, 2739, 2820, 3315, 3328, 3348, 3420, 3455, 3570, 3576.
- live semantics (0 locations): none.
- native disabled (16 locations): 1399, 1474, 2065, 2153, 2165, 2503, 2570, 2684, 2696, 2697, 2720, 2743, 2744, 3517, 3730, 3731.
- busy guard (0 locations): none.
- focus (0 locations): none.

### index.html

- notice (0 locations): none.
- live semantics (9 locations): 31, 32, 41, 136, 245, 433, 498, 650, 657.
- native disabled (0 locations): none.
- busy guard (0 locations): none.
- focus (0 locations): none.
