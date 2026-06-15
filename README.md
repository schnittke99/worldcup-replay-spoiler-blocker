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

The userscript's scanning is intentionally scoped to CCTV, Migu Video, and Hupu football pages so it does not affect normal browsing on unrelated sites. Hupu uses the generic inline spoiler rules instead of whole-title masking.

The script loads on all pages so the userscript menu is available everywhere, but it only scans built-in supported pages by default. Use the userscript menu to add or remove extra pages/sites for the generic inline spoiler rules:

- `通用规则：添加当前网页`
- `通用规则：添加当前网站`
- `通用规则：移除当前匹配项`
- `通用规则：查看适配网址`
- `通用规则：编辑适配网址`

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Add `worldcup-score-spoiler-blocker.user.js` as a new userscript.
3. Open a supported replay or schedule page.

## Notes

The script runs on all pages but applies site-specific rules only where supported, with a conservative generic fallback for football score text.
