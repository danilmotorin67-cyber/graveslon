# Provenance and verification — 2026-10-20

- User-provided 30-page PDF: «Методичка первый слот „Кладбище“ для Stake Engine». Source of product scope and ordered stage gates. Not republished into this public repository.
- Official Math SDK: https://github.com/StakeEngine/math-sdk, commit in `sdk.lock.json`.
- Template reviewed: `games/0_0_lines/{game_config,gamestate,game_override,game_executables}.py`.
- SDK implementation reviewed: `src/calculations/board.py`, `src/calculations/lines.py`, `src/state/state.py`, `src/events/events.py`, `src/state/books.py`.
- Current official documentation linked by SDK README: https://engineio.github.io/math-sdk/
- Publication format: https://engineio.github.io/math-sdk/rgs_docs/data_format/
- SDK setup: https://engineio.github.io/math-sdk/math_docs/general_overview/
- Web SDK for the subsequent frontend stage: https://github.com/StakeEngine/web-sdk

The PDF's `stakeengine.github.io` documentation links returned 404; the official repository now links to `engineio.github.io`.
Publication format (index, uint64 CSV values, zstd JSONL and payout units) was verified against official documentation and SDK sources.
The public approval-guidelines page did not expose its detailed content to the fetcher. Numeric platform-wide limits mentioned by unofficial sources in the PDF remain unverified; the game's own targets are explicitly configured, not presented as universal platform rules.

A web search for the exact working title did not identify a matching slot. The name does appear as a music title. Neither this search nor the game prototype constitutes trademark clearance.
