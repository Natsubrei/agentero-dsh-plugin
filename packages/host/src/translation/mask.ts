// Ported from motif (Copyright (c) 2026 poco-ai, MIT). See MOTIF-LICENSE.txt.
/**
 * Protect tokens that MT engines mangle (inline math, LaTeX commands, URLs,
 * DOIs, citation markers, cross-references, and Markdown links) by swapping
 * them for opaque placeholders before the request and restoring them afterwards.
 */

import { findPreservedLinkSpans } from "./preserved-links.js";

export type MaskedToken = {
	placeholder: string;
	original: string;
};

export type MaskedText = {
	text: string;
	tokens: MaskedToken[];
};

export type RestoredText = {
	text: string;
	/** Placeholders the engine dropped or rewrote; caller decides retry policy. */
	missing: number;
	/** Duplicated or invented placeholders invalidate structural restoration. */
	invalid?: boolean;
};

/**
 * Mathematical white square brackets: absent from paper prose, and left alone
 * by MT engines far more reliably than ASCII brackets, which collide with
 * citation markers and with the `[[n]]` batch numbering.
 */
function placeholderFor(index: number): string {
	return `⟦${index}⟧`;
}

const MASK_PATTERNS: RegExp[] = [
	/⟪(?:F|\/?S)\d+⟫/gu,
	// Display / inline TeX math (present when the source came from LaTeX).
	/\$\$[^$]{1,400}\$\$/g,
	/\$[^$\n]{1,200}\$/g,
	/\\\((?:[^\\]|\\[^)]){1,200}?\\\)/g,
	// LaTeX commands with or without a braced argument.
	/\\[A-Za-z]+(?:\{[^{}]{0,120}\})?/g,
	// Links and identifiers.
	/https?:\/\/[^\s、，。]+/g,
	/\bdoi:\s*10\.\d{4,9}\/\S+/gi,
	/\b10\.\d{4,9}\/[^\s、，。]+/g,
];

export function maskInlineTokens(text: string): MaskedText {
  // Match the original string once; overlapping patterns must not nest placeholders.
  const spans = findPreservedLinkSpans(text).map(({ start, end, text }) => ({ start, end, text }));
  for (const pattern of [...MASK_PATTERNS, /`[^`\n]+`/g, /⟦\s*\d+\s*⟧/g, /\[\[\d+\]\]/g]) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const tokens: MaskedToken[] = [];
  let cursor = 0;
  let masked = '';
  let index = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    let placeholder = placeholderFor(index++);
    while (text.includes(placeholder)) placeholder = placeholderFor(index++);
    tokens.push({ placeholder, original: span.text });
    masked += text.slice(cursor, span.start) + placeholder;
    cursor = span.end;
  }
  return { text: masked + text.slice(cursor), tokens };
}

export function restoreInlineTokens(
	text: string,
	tokens: readonly MaskedToken[],
): RestoredText {
  const originals = new Map(tokens.map(token => [token.placeholder.slice(1, -1), token.original]));
  const counts = new Map<string, number>();
  let invalid = false;
  // One pass also prevents a literal placeholder in an original formula from being restored twice.
  const out = text.replace(/⟦\s*(\d+)\s*⟧/g, (full, id: string) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const original = originals.get(id);
    if (original === undefined || (counts.get(id) ?? 0) > 1) invalid = true;
    return original ?? full;
  });
  const missing = [...originals.keys()].filter(id => !counts.has(id)).length;
  return { text: out, missing, ...(invalid ? { invalid: true } : {}) };
}
