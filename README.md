# World Cup Replay Spoiler Blocker

A userscript that hides score spoilers while watching football replays.

## What It Covers

- CCTV World Cup pages
- Migu Video pages, including the home page, World Cup schedule pages, and replay detail pages
- Hupu international football board: `https://bbs.hupu.com/all-soccer`
- Score text in replay comments and related titles
- Standings and scorer table numbers where they may reveal results

Hidden scores can be revealed temporarily by clicking the masked text or block.

## Supported Pages Only

The userscript is intentionally scoped to CCTV, Migu Video, and Hupu football pages so it does not affect normal browsing on unrelated sites. Hupu uses the generic inline spoiler rules instead of whole-title masking.

You can manage the enabled URL patterns from the Tampermonkey or Violentmonkey dashboard by editing the script's match/include settings.

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Add `worldcup-score-spoiler-blocker.user.js` as a new userscript.
3. Open a supported replay or schedule page.

## Notes

The script runs on all pages but applies site-specific rules only where supported, with a conservative generic fallback for football score text.
