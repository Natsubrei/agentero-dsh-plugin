// Ported from motif (Copyright (c) 2026 poco-ai, MIT). See MOTIF-LICENSE.txt.
const LATIN_SENTENCE_PUNCT = new Set([".", "!", "?"]);
/** CJK stops are unambiguous, so they end a sentence without a following space. */
const CJK_SENTENCE_PUNCT = new Set(["。", "！", "？"]);

function isCloser(ch: string): boolean {
	return (
		ch === '"' ||
		ch === "'" ||
		ch === ")" ||
		ch === "]" ||
		ch === "”" ||
		ch === "’" ||
		ch === "）" ||
		ch === "」"
	);
}

/** `et al.` / `Fig.` / `e.g.` / `i.e.` / `0.5` — the period is not a sentence end. */
function isProtectedPeriod(text: string, index: number): boolean {
	if (text[index] !== ".") return false;
	const before = text.slice(0, index);
	if (/(?:^|[\s([(])fig$/i.test(before)) return true;
	if (/(?:^|[\s([(])et\s+al$/i.test(before)) return true;
	if (/(?:^|[\s([(])e\.g$/i.test(before)) return true;
	if (/(?:^|[\s([(])i\.e$/i.test(before)) return true;
	const prev = before.at(-1);
	const next = text[index + 1];
	return Boolean(prev && next && /\d/.test(prev) && /\d/.test(next));
}

/**
 * Split prose into sentence quotes. Whitespace is collapsed; hyphens stay.
 * A string with no sentence end is returned as one quote.
 */
export function splitLayoutSentences(raw: string): string[] {
	const text = raw.replace(/\s+/g, " ").trim();
	if (!text) return [];
	const cuts: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (!ch) continue;
		const cjk = CJK_SENTENCE_PUNCT.has(ch);
		if (!cjk && !LATIN_SENTENCE_PUNCT.has(ch)) continue;
		if (!cjk && isProtectedPeriod(text, i)) continue;
		let end = i + 1;
		while (end < text.length && isCloser(text[end] ?? "")) end += 1;
		if (!cjk) {
			const next = text[end];
			if (next !== undefined && !/\s/.test(next)) continue;
		}
		cuts.push(end);
	}
	if (cuts.length === 0) return [text];
	const out: string[] = [];
	let start = 0;
	for (const cut of cuts) {
		const slice = text.slice(start, cut).trim();
		if (slice) out.push(slice);
		start = cut;
		while (start < text.length && /\s/.test(text[start] ?? "")) start += 1;
	}
	const tail = text.slice(start).trim();
	if (tail) out.push(tail);
	return out.length > 0 ? out : [text];
}

