// ==UserScript==
// @name         World Cup Replay Spoiler Blocker
// @namespace    https://local/worldcup-replay-spoiler-blocker
// @version      0.1.3
// @description  Hide football replay score spoilers on CCTV, Migu Video, and Hupu football pages.
// @author       Codex
// @match        *://worldcup.cctv.com/2026/*
// @match        *://cbs.sports.cctv.com/*
// @match        *://www.miguvideo.com/*
// @match        *://bbs.hupu.com/all-soccer*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = Object.freeze({
    mode: "blur-click",
    cctvFullReplayMode: true,
    miguReplayMode: true,
    genericFallback: true,
    resultKeywordMask: true,
    standingsMask: true,
    scanThrottleMs: 180,
    maxTextNodeLength: 600,
    maxTextNodesPerScan: 900,
  });

  const STORAGE_KEYS = Object.freeze({
    globalEnabled: "wcSpoilerBlocker.globalEnabled",
    disabledHosts: "wcSpoilerBlocker.disabledHosts",
  });

  const MASK_CLASS = "wc-spoiler-mask";
  const REVEALED_CLASS = "wc-spoiler-revealed";
  const INLINE_MASK_CLASS = "wc-spoiler-inline-mask";
  const PROCESSED_ATTR = "data-wc-spoiler-processed";
  const MASKED_CELL_ATTR = "data-wc-spoiler-cell";
  const MASKED_BLOCK_ATTR = "data-wc-spoiler-block";
  const STYLE_ID = "wc-spoiler-style";
  const SPOILER_TITLE = "点击显示隐藏的赛果";

  const FOOTBALL_CONTEXT_RE = /世界杯|足球|比赛|赛事|赛程|赛果|比分|进球|点球|半场|全场|主场|客场|胜|负|平|绝平|逆转|大胜|小胜|战胜|淘汰|晋级|出线|队|球队|国足|男足|女足|杯|联赛|欧冠|英超|西甲|德甲|意甲|法甲|中超|阿根廷|法国|德国|巴西|英格兰|西班牙|葡萄牙|荷兰|日本|韩国|墨西哥|南非|美国|瑞士|瑞典|摩洛哥|苏格兰|海地|库拉索|捷克|克罗地亚|乌拉圭|比利时|意大利/i;
  const RESULT_KEYWORD_RE = /(?:大胜|小胜|险胜|完胜|战胜|击败|负于|不敌|绝杀|绝平|逆转|淘汰|晋级|出线|双响|梅开二度|帽子戏法|点球大战|点球取胜|点球告负|破门|救主|首球|建功|横扫|惨败|扳平)/;
  const SCORE_RE = /\b\d{1,2}\s*(?::|：|比|-)\s*\d{1,2}\b/g;
  const PENALTY_RE = /[（(]\s*(?:点球|pen(?:alties)?\.?)?\s*\d{1,2}\s*(?::|：|比|-)\s*\d{1,2}\s*[）)]/gi;
  const DANGEROUS_INLINE_RE = new RegExp(`${SCORE_RE.source}|${PENALTY_RE.source}`, "i");
  const MIGU_FOOTBALL_CONTEXT_RE =
    /(?:\u4e16\u754c\u676f|\u8db3\u7403|\u6bd4\u8d5b|\u8d5b\u7a0b|\u6bd4\u5206|\u8fdb\u7403|\u96c6\u9526|\u56de\u653e|\u5168\u573a|\u5df2\u7ed3\u675f|\u5df4\u897f|\u57c3\u53ca|\u963f\u6839\u5ef7|\u745e\u5178|\u7a81\u5c3c\u65af|\u5fb7\u56fd|\u65e5\u672c|\u8377\u5170|\u7f8e\u56fd|\u97e9\u56fd|\u6377\u514b)/;
  const MIGU_RESULT_KEYWORD_RE =
    /(?:\u5927\u80dc|\u5c0f\u80dc|\u9669\u80dc|\u5b8c\u80dc|\u6218\u80dc|\u51fb\u8d25|\u8d1f\u4e8e|\u4e0d\u654c|\u7edd\u6740|\u7edd\u5e73|\u9006\u8f6c|\u6dd8\u6c70|\u664b\u7ea7|\u51fa\u7ebf|\u53cc\u54cd|\u5e3d\u5b50\u620f\u6cd5|\u70b9\u7403\u5927\u6218|\u70b9\u7403\u53d6\u80dc|\u70b9\u7403\u544a\u8d1f|\u7834\u95e8|\u6551\u4e3b|\u9996\u7403|\u5efa\u529f|\u6a2a\u626b|\u60e8\u8d25|\u626d\u5e73\u6bd4\u5206|\u8fdb\u7403|\u9996\u80dc|\u6218\u5e73|\u544a\u8d1f|\u53d6\u80dc)/g;
  const MIGU_SCORE_RE = /\b\d{1,2}\s*(?::|\uFF1A|\u6BD4|-)\s*\d{1,2}\b/g;
  const MIGU_PAREN_SCORE_RE = /[\uFF08(]\s*(?:\u70B9\u7403\s*)?\d{1,2}\s*(?::|\uFF1A|\u6BD4|-)\s*\d{1,2}\s*[\uFF09)]/g;
  const MIGU_STANDINGS_NUMBER_RE = /^-?\d+(?:\(\d+\))?$|^\d+\s*\/\s*\d+$/;
  const NON_CONTENT_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "SVG",
    "CANVAS",
  ]);

  let scanTimer = 0;
  let observer = null;
  let menuIds = [];
  let scannedTextNodesThisPass = 0;

  installStyle();
  setupWhenReady();
  registerMenus();

  function setupWhenReady() {
    if (document.documentElement) {
      scheduleScan();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  function start() {
    if (!isEnabled()) return;
    scheduleScan();
    ensureObserver();
  }

  function ensureObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((mutations) => {
      if (!isEnabled()) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length) {
          scheduleScan();
          return;
        }
        if (mutation.type === "characterData") {
          scheduleScan();
          return;
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanDocument();
    }, CONFIG.scanThrottleMs);
  }

  function scanDocument() {
    if (!isEnabled() || !document.body) return;

    scannedTextNodesThisPass = 0;
    applyCctvRules();
    applyMiguRules();

    if (CONFIG.genericFallback) {
      maskGenericSpoilers(document.body);
    }
  }

  function applyCctvRules() {
    if (!CONFIG.cctvFullReplayMode) return;

    const host = location.hostname;
    const path = location.pathname;
    const isCctvWorldCup = host === "worldcup.cctv.com" && path.startsWith("/2026/");
    const isCbsSports = host === "cbs.sports.cctv.com";

    if (isCctvWorldCup) {
      maskCctvWorldCupTitles();
      return;
    }

    if (!isCbsSports) return;

    if (/\/worldcup2026_schedule(?:_tabs)?\.html$/i.test(path)) {
      maskScheduleCards();
    }

    if (/\/worldcup2026_match_info\.html$/i.test(path)) {
      maskMatchInfoScores();
    }

    if (CONFIG.standingsMask && /\/worldcup2026_scoreboard\.html$/i.test(path)) {
      maskScoreboardTable();
    }

    if (CONFIG.standingsMask && /\/worldcup2026_top_scorer\.html$/i.test(path)) {
      maskTopScorerTable();
    }
  }

  function applyMiguRules() {
    if (!CONFIG.miguReplayMode || !isMiguVideo()) return;

    maskMiguScheduleScores();
    maskMiguLiveDetailScores();
    maskMiguHighlightTitles();

    if (CONFIG.standingsMask) {
      maskMiguStandingsAndRankingNumbers();
    }

    maskMiguInlineSpoilers(document.body);
  }

  function isMiguVideo() {
    return location.hostname === "www.miguvideo.com" || location.hostname.endsWith(".miguvideo.com");
  }

  function maskCctvWorldCupTitles() {
    const candidates = document.querySelectorAll("a, h1, h2, h3, h4, .title, .tit, .text, .txt");
    candidates.forEach((element) => {
      if (shouldSkipElement(element)) return;
      const text = normalizedText(element.textContent);
      if (!text || text.length > 180) return;
      if (isSpoilerText(text, true)) {
        maskSpoilerTextInElement(element, true);
      }
    });
  }

  function maskScheduleCards() {
    document.querySelectorAll(".schedule-item .scores, .schedule-item .score, .schedule-item .penalties").forEach(maskElementBlock);
    document
      .querySelectorAll(
        ".match-container.end .scores, .match-container.end .score, .match-container.end .penalties, " +
          ".match-container.finished .scores, .match-container.finished .score, .match-container.finished .penalties, " +
          ".match-container.finish .scores, .match-container.finish .score, .match-container.finish .penalties"
      )
      .forEach(maskElementBlock);
    document.querySelectorAll(".match-container").forEach((element) => {
      const text = normalizedText(element.textContent);
      if (/(?:已结束|完场|赛后|集锦\/回放)/.test(text) && DANGEROUS_INLINE_RE.test(text)) {
        DANGEROUS_INLINE_RE.lastIndex = 0;
        maskSpoilerTextInElement(element, false);
      }
    });
  }

  function maskMatchInfoScores() {
    document.querySelectorAll(".match-container .team .score").forEach(maskElementBlock);
  }

  function maskScoreboardTable() {
    document.querySelectorAll(".table-panel tbody tr").forEach((row) => {
      const cells = Array.from(row.children);
      cells.slice(1, 7).forEach(maskTableCell);
    });
  }

  function maskTopScorerTable() {
    document.querySelectorAll(".table-panel tbody tr").forEach((row) => {
      const cells = Array.from(row.children);
      cells.slice(2, 4).forEach(maskTableCell);
    });
  }

  function maskMiguScheduleScores() {
    document.querySelectorAll(".matchLive-nba .confront-match-info .score").forEach((score) => {
      const card = score.closest(".swiper-slide, .table-inner");
      const status = card && card.querySelector(".match-status");
      const statusText = normalizedText(status && status.textContent);
      if (/(?:\u96c6\u9526\/\u56de\u653e|\u76f4\u64ad\u4e2d|\u5df2\u7ed3\u675f)/.test(statusText)) {
        maskElementBlock(score);
      }
    });
  }

  function maskMiguLiveDetailScores() {
    document.querySelectorAll(".webPlay .titleScores .teamScore, .webPlay .teamScore").forEach(maskElementBlock);
  }

  function maskMiguHighlightTitles() {
    document.querySelectorAll(".live-review .introduce, .review-list-item .introduce").forEach((element) => {
      const text = normalizedText(element.textContent);
      if (MIGU_RESULT_KEYWORD_RE.test(text)) {
        MIGU_RESULT_KEYWORD_RE.lastIndex = 0;
        maskElementBlock(element);
      }
    });
  }

  function maskMiguStandingsAndRankingNumbers() {
    document.querySelectorAll(".sport-group").forEach((section) => {
      const sectionText = normalizedText(section.textContent);
      if (!/(?:\u79ef\u5206\u699c|\u7403\u5458\/\u7403\u961f\u699c|\u5c04\u624b\u699c|\u7403\u961f\u699c)/.test(sectionText)) return;

      section.querySelectorAll("td, th, .score, .num, .rank, .cell, span, div").forEach((element) => {
        if (shouldSkipElement(element)) return;
        if (element.children.length > 0) return;
        const text = normalizedText(element.textContent);
        if (MIGU_STANDINGS_NUMBER_RE.test(text)) {
          maskElementBlock(element);
        }
      });
    });
  }

  function maskMiguInlineSpoilers(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.nodeValue.length > CONFIG.maxTextNodeLength) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.parentElement || shouldSkipElement(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!mightContainMiguSpoiler(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    nodes.forEach(maskMiguTextNode);
  }

  function maskMiguTextNode(textNode) {
    const text = textNode.nodeValue;
    const ranges = findMiguSpoilerRanges(text);
    if (!ranges.length) return;

    const fragment = document.createDocumentFragment();
    let offset = 0;
    ranges.forEach((range) => {
      if (range.start > offset) {
        fragment.appendChild(document.createTextNode(text.slice(offset, range.start)));
      }
      fragment.appendChild(createInlineMask(text.slice(range.start, range.end)));
      offset = range.end;
    });
    if (offset < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(offset)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function findMiguSpoilerRanges(text) {
    const ranges = [];
    collectRegexRanges(text, MIGU_SCORE_RE, ranges, (match, start, end) => isLikelyMiguScore(text, match, start, end));
    collectRegexRanges(text, MIGU_PAREN_SCORE_RE, ranges, () => true);

    if (MIGU_RESULT_KEYWORD_RE.test(text) && MIGU_FOOTBALL_CONTEXT_RE.test(text)) {
      MIGU_RESULT_KEYWORD_RE.lastIndex = 0;
      collectRegexRanges(text, MIGU_RESULT_KEYWORD_RE, ranges, () => true);
    }
    MIGU_RESULT_KEYWORD_RE.lastIndex = 0;

    return mergeRanges(ranges);
  }

  function mightContainMiguSpoiler(text) {
    if (MIGU_SCORE_RE.test(text) || MIGU_PAREN_SCORE_RE.test(text)) {
      MIGU_SCORE_RE.lastIndex = 0;
      MIGU_PAREN_SCORE_RE.lastIndex = 0;
      return true;
    }
    MIGU_SCORE_RE.lastIndex = 0;
    MIGU_PAREN_SCORE_RE.lastIndex = 0;

    const hasKeyword = MIGU_RESULT_KEYWORD_RE.test(text);
    MIGU_RESULT_KEYWORD_RE.lastIndex = 0;
    return hasKeyword && MIGU_FOOTBALL_CONTEXT_RE.test(text);
  }

  function isLikelyMiguScore(text, match, start, end) {
    const before = text.slice(Math.max(0, start - 16), start);
    const after = text.slice(end, Math.min(text.length, end + 16));
    const context = `${before}${match}${after}`;
    if (isLikelyMiguScheduleTime(match, context)) return false;
    if (isLikelyTime(text, match, start, end)) return false;
    if (isLikelyDateOrVersion(text, match, start, end)) return false;
    if (/(?:\u5206\u8fa8\u7387|\u753b\u5e45|\u6bd4\u4f8b|ratio|aspect)/i.test(context)) return false;
    return MIGU_FOOTBALL_CONTEXT_RE.test(context) || /[\u4e00-\u9fffA-Za-z]/.test(before + after);
  }

  function isLikelyMiguScheduleTime(match, context) {
    if (!/[:\uFF1A]/.test(match)) return false;
    const parts = match.split(/[:\uFF1A]/).map((value) => value.trim());
    if (parts.length !== 2 || parts[1].length !== 2) return false;

    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (hour > 23 || minute > 59) return false;

    return /(?:\u6708|\u65e5|\u65f6|\u70b9|\u76f4\u64ad\u4e2d|\u672a\u5f00\u59cb|\u96c6\u9526|\u56de\u653e|\u9884\u7ea6)/.test(context);
  }

  function maskGenericSpoilers(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (scannedTextNodesThisPass >= CONFIG.maxTextNodesPerScan) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.nodeValue.length > CONFIG.maxTextNodeLength) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.parentElement || shouldSkipElement(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!mightContainSpoiler(node.nodeValue, false)) {
          return NodeFilter.FILTER_REJECT;
        }
        scannedTextNodesThisPass += 1;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    nodes.forEach((node) => maskTextNode(node, false));
  }

  function maskSpoilerTextInElement(element, cctvTitleMode) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.parentElement || shouldSkipElement(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!mightContainSpoiler(node.nodeValue, cctvTitleMode)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    nodes.forEach((textNode) => maskTextNode(textNode, cctvTitleMode));
  }

  function maskTextNode(textNode, cctvTitleMode) {
    const text = textNode.nodeValue;
    if (!isSpoilerText(text, cctvTitleMode)) return;

    const ranges = findSpoilerRanges(text, cctvTitleMode);
    if (!ranges.length) return;

    const fragment = document.createDocumentFragment();
    let offset = 0;
    ranges.forEach((range) => {
      if (range.start > offset) {
        fragment.appendChild(document.createTextNode(text.slice(offset, range.start)));
      }
      fragment.appendChild(createInlineMask(text.slice(range.start, range.end)));
      offset = range.end;
    });
    if (offset < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(offset)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function findSpoilerRanges(text, cctvTitleMode) {
    const ranges = [];
    collectRegexRanges(text, SCORE_RE, ranges, (match, start, end) => isLikelyScore(text, match, start, end));
    collectRegexRanges(text, PENALTY_RE, ranges, () => true);

    if (CONFIG.resultKeywordMask && RESULT_KEYWORD_RE.test(text) && (cctvTitleMode || FOOTBALL_CONTEXT_RE.test(text))) {
      collectRegexRanges(text, RESULT_KEYWORD_RE, ranges, () => true);
    }

    return mergeRanges(ranges);
  }

  function collectRegexRanges(text, regex, ranges, predicate) {
    const searchable = regex.global ? regex : new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
    searchable.lastIndex = 0;
    let match;
    while ((match = searchable.exec(text))) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      if (predicate(value, start, end)) {
        ranges.push({ start, end });
      }
      if (searchable.lastIndex === match.index) {
        searchable.lastIndex += 1;
      }
    }
  }

  function mergeRanges(ranges) {
    if (!ranges.length) return [];
    ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i += 1) {
      const previous = merged[merged.length - 1];
      const current = ranges[i];
      if (current.start < previous.end) {
        previous.end = Math.max(previous.end, current.end);
      } else {
        merged.push(current);
      }
    }
    return merged;
  }

  function createInlineMask(text) {
    const span = document.createElement("span");
    span.className = `${MASK_CLASS} ${INLINE_MASK_CLASS}`;
    span.textContent = text;
    span.title = SPOILER_TITLE;
    span.setAttribute(PROCESSED_ATTR, "1");
    attachRevealHandler(span);
    return span;
  }

  function maskElementBlock(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.classList.contains(MASK_CLASS) || element.classList.contains(REVEALED_CLASS)) return;
    if (element.getAttribute(MASKED_BLOCK_ATTR) === "1") return;
    element.classList.add(MASK_CLASS);
    element.setAttribute(MASKED_BLOCK_ATTR, "1");
    element.title = element.title || SPOILER_TITLE;
    attachRevealHandler(element);
  }

  function maskTableCell(cell) {
    if (!cell || cell.nodeType !== Node.ELEMENT_NODE) return;
    if (cell.getAttribute(MASKED_CELL_ATTR) === "1") return;
    cell.classList.add(MASK_CLASS);
    cell.setAttribute(MASKED_CELL_ATTR, "1");
    cell.title = cell.title || SPOILER_TITLE;
    attachRevealHandler(cell);
  }

  function attachRevealHandler(element) {
    if (element.__wcSpoilerRevealHandler) return;
    element.__wcSpoilerRevealHandler = true;
    element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.toggle(REVEALED_CLASS);
      },
      true
    );
  }

  function isSpoilerText(text, cctvTitleMode) {
    if (!text) return false;
    if (findSpoilerRanges(text, cctvTitleMode).length) return true;
    if (!CONFIG.resultKeywordMask) return false;
    if (!RESULT_KEYWORD_RE.test(text)) return false;
    if (cctvTitleMode) return true;
    return FOOTBALL_CONTEXT_RE.test(text);
  }

  function mightContainSpoiler(text, cctvTitleMode) {
    if (DANGEROUS_INLINE_RE.test(text)) return true;
    DANGEROUS_INLINE_RE.lastIndex = 0;
    return CONFIG.resultKeywordMask && RESULT_KEYWORD_RE.test(text) && (cctvTitleMode || FOOTBALL_CONTEXT_RE.test(text));
  }

  function isLikelyScore(text, match, start, end) {
    const before = text.slice(Math.max(0, start - 18), start);
    const after = text.slice(end, Math.min(text.length, end + 18));
    const context = `${before}${match}${after}`;
    const compactContext = context.replace(/\s+/g, "");
    const hasFootballContext = FOOTBALL_CONTEXT_RE.test(context) || RESULT_KEYWORD_RE.test(context);

    if (isLikelyTime(text, match, start, end)) return false;
    if (isLikelyDateOrVersion(text, match, start, end)) return false;
    if (isLikelyRatio(context, match, hasFootballContext)) return false;
    if (isClockValue(match) && !hasFootballContext) return false;

    if (hasFootballContext) return true;

    // Hyphen scores such as "2-2" are common in football headlines, but are
    // also the noisiest form, so require nearby letters or CJK team names.
    if (/-/.test(match)) {
      return /[\u4e00-\u9fffA-Za-z]/.test(before + after);
    }

    return true;
  }

  function isClockValue(match) {
    if (!/[:：]/.test(match)) return false;
    const rawParts = match.split(/[:：]/).map((value) => value.trim());
    if (rawParts.length !== 2 || rawParts[1].length !== 2) return false;
    const hour = Number(rawParts[0]);
    const minute = Number(rawParts[1]);
    return hour <= 23 && minute <= 59;
  }

  function isLikelyTime(text, match, start, end) {
    if (!/[:：]/.test(match)) return false;
    const parts = match.split(/[:：]/).map((value) => Number(value.trim()));
    if (parts.length !== 2) return false;
    const hour = parts[0];
    const minute = parts[1];
    if (hour > 23 || minute > 59) return false;

    const before = text.slice(Math.max(0, start - 8), start);
    const after = text.slice(end, Math.min(text.length, end + 8));
    if (/[上下早晚凌今明昨前后]午|点|时|分|开播|开始|直播|AM|PM/i.test(before + after)) return true;
    if (/^\s*(?:-|~|至|—|–)\s*\d{1,2}[:：]\d{2}/.test(after)) return true;
    if (/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(before)) return true;

    return false;
  }

  function isLikelyDateOrVersion(text, match, start, end) {
    const before = text.slice(Math.max(0, start - 8), start);
    const after = text.slice(end, Math.min(text.length, end + 8));
    const around = `${before}${match}${after}`;
    if (/\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}/.test(around)) return true;
    if (/\bv?\d+(?:\.\d+){1,3}\b/.test(around)) return true;
    if (/[A-Za-z]\d+\s*-\s*\d+[A-Za-z]/.test(around)) return true;
    return false;
  }

  function isLikelyRatio(context, match, hasFootballContext) {
    if (/(?:比例|宽高比|画幅|分辨率|ratio|aspect)\s*[:：]?\s*\d+\s*(?::|：)\s*\d+/i.test(context)) {
      return true;
    }
    if (hasFootballContext || !/[:：]/.test(match)) return false;
    const compact = match.replace(/\s+/g, "").replace("：", ":");
    return /^(?:16:9|4:3|21:9|32:9|1:1)$/.test(compact);
  }

  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    if (NON_CONTENT_TAGS.has(element.tagName)) return true;
    if (element.closest(`.${MASK_CLASS}, [${PROCESSED_ATTR}="1"], [contenteditable="true"], [aria-hidden="true"]`)) return true;
    return false;
  }

  function normalizedText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isEnabled() {
    if (!getValue(STORAGE_KEYS.globalEnabled, true)) return false;
    const disabledHosts = getValue(STORAGE_KEYS.disabledHosts, {});
    return !disabledHosts[location.hostname];
  }

  function getValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallback);
      }
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function setValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (_) {
      // Ignore storage failures; the current page can still be protected.
    }
  }

  function registerMenus() {
    if (typeof GM_registerMenuCommand !== "function") return;
    unregisterMenus();

    const globalEnabled = getValue(STORAGE_KEYS.globalEnabled, true);
    const disabledHosts = getValue(STORAGE_KEYS.disabledHosts, {});
    const siteEnabled = !disabledHosts[location.hostname];

    menuIds.push(
      GM_registerMenuCommand(globalEnabled ? "关闭全局防剧透" : "开启全局防剧透", () => {
        setValue(STORAGE_KEYS.globalEnabled, !globalEnabled);
        refreshAfterSettingsChange();
      })
    );

    menuIds.push(
      GM_registerMenuCommand(siteEnabled ? "关闭本网站防剧透" : "开启本网站防剧透", () => {
        const next = getValue(STORAGE_KEYS.disabledHosts, {});
        if (siteEnabled) {
          next[location.hostname] = true;
        } else {
          delete next[location.hostname];
        }
        setValue(STORAGE_KEYS.disabledHosts, next);
        refreshAfterSettingsChange();
      })
    );

    menuIds.push(
      GM_registerMenuCommand("重置显示状态", () => {
        document.querySelectorAll(`.${REVEALED_CLASS}`).forEach((element) => {
          element.classList.remove(REVEALED_CLASS);
        });
      })
    );
  }

  function unregisterMenus() {
    if (typeof GM_unregisterMenuCommand !== "function") {
      menuIds = [];
      return;
    }
    menuIds.forEach((id) => {
      try {
        GM_unregisterMenuCommand(id);
      } catch (_) {
        // Older script managers may not support unregistering menu commands.
      }
    });
    menuIds = [];
  }

  function refreshAfterSettingsChange() {
    registerMenus();
    if (isEnabled()) {
      ensureObserver();
      scheduleScan();
    } else {
      removeAllMasks();
    }
  }

  function removeAllMasks() {
    document.querySelectorAll(`.${MASK_CLASS}`).forEach((element) => {
      element.classList.remove(MASK_CLASS, INLINE_MASK_CLASS, REVEALED_CLASS);
      element.removeAttribute(MASKED_CELL_ATTR);
      element.removeAttribute(MASKED_BLOCK_ATTR);
    });
  }

  function installStyle() {
    const css = `
      .${MASK_CLASS} {
        cursor: pointer !important;
        user-select: none !important;
        transition: filter 120ms ease, background-color 120ms ease, color 120ms ease !important;
      }

      .${MASK_CLASS}:not(.${INLINE_MASK_CLASS}) {
        position: relative !important;
        overflow: hidden !important;
        border-radius: 4px !important;
        color: transparent !important;
        text-shadow: none !important;
        background: rgba(8, 18, 64, 0.92) !important;
      }

      .${MASK_CLASS}:not(.${INLINE_MASK_CLASS}) > * {
        visibility: hidden !important;
      }

      .${MASK_CLASS}:not(.${INLINE_MASK_CLASS})::after {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        z-index: 2147483646 !important;
        border-radius: inherit !important;
        background: rgba(8, 18, 64, 0.96) !important;
        pointer-events: none !important;
      }

      .${INLINE_MASK_CLASS} {
        display: inline !important;
        filter: blur(7px) !important;
        border-radius: 3px !important;
        padding: 0 0.12em !important;
        background: rgba(16, 24, 39, 0.16) !important;
      }

      .${MASK_CLASS}.${REVEALED_CLASS} {
        filter: none !important;
        color: inherit !important;
        user-select: text !important;
        background: transparent !important;
      }

      .${MASK_CLASS}.${REVEALED_CLASS}:not(.${INLINE_MASK_CLASS}) > * {
        visibility: visible !important;
      }

      .${MASK_CLASS}.${REVEALED_CLASS}:not(.${INLINE_MASK_CLASS})::after {
        display: none !important;
      }
    `;

    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
})();
