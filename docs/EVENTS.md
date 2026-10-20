# Event contract v1

Books are replayed in order. `index` starts at 0. The book ID starts at 1.
The frontend must not calculate awards, choose outcomes or infer missing events.
All `amount`, `win`, `rawWin`, `totalWin`, `winWithoutMult`, and `payoutMultiplier` values are integer hundredths of the total bet. RGS money is a different unit (1e-6 of currency).

`reveal.board[reel][row]` contains 5 reels with 5 padded symbols each: row 0 top padding, rows 1–3 visible, row 4 bottom padding. ALL event positions (including grave updates, scatter triggers, line wins) use these padded coordinates. Canonical payline data uses visible rows 0–2; add 1 when rendering event positions. `paddingPositions` preserves the upstream SDK's reel stop data; do not treat it as an award.

| Event | Payload | Handling |
|---|---|---|
| reveal | board, gameType, anticipation, paddingPositions | Animate and reveal authoritative symbols |
| graveMultiplierUpdate | positions[], multipliers[] | Equal-length arrays, replace values at visible cells; persist until round ends |
| winInfo | totalWin, wins[] | Highlight the given positions and display credited `win`; `rawWin` is uncapped detail |
| setWin | amount, winLevel | Show current-spin award |
| setTotalWin | amount | Replace round total, do not add it |
| freeSpinTrigger | totalFs, positions | Enter bonus and clear the initial grave map |
| updateFreeSpin | amount, total | One-based FS ordinal and current total including retriggers |
| freeSpinRetrigger | totalFs, positions | Replace total FS; +5 already included |
| freeSpinEnd | amount, winLevel | Display total credited FS award |
| wincap | amount | End at 500000 units; suppress remaining FS |
| finalWin | amount | Authoritative total, equals book payoutMultiplier |

Order per spin: reveal → optional grave update → optional winInfo/setWin → setTotalWin → optional wincap. Base trigger follows the base award. Each FS begins with updateFreeSpin. Retrigger follows the credited award, only if cap has not been reached. freeSpinEnd precedes finalWin.

All long animations must be skippable without dropping events. Resume reconstructs the grave map by replaying preceding updates before continuing. Never rely on a persisted browser-only map for financial settlement. RGS chooses and settles the round; `/bet/event` can checkpoint event progress.

Fixtures in `tests/fixtures.json.gz` (also regenerated under `tests/fixtures/{base,bonus}`) are QA books, not a weighted demo distribution and not production bet IDs. Local simulation IDs in `reports/control-rounds.json` must be replaced with real RGS bet IDs during staging acceptance.
