// Ported from motif (Copyright (c) 2026 poco-ai, MIT). See MOTIF-LICENSE.txt.
export const TRANSLATE_BATCH_CHARS = 4500;
const TRANSLATE_BATCH_MARKER_RE = /(\[{2}|［{2})\s*(\d+)\s*(\]{2}|］{2})/g;

/** Anything batchable: a single region or a joined paragraph chain. */
type TranslateUnit = { source: string };

/** Projected payload length of a batch (matches {@link buildNumberedPayload}). */
function batchPayloadLength(batch: readonly TranslateUnit[]): number {
	if (batch.length === 0) return 0;
	if (batch.length === 1) return batch[0]?.source.length ?? 0;
	let total = 0;
	batch.forEach((unit, i) => {
		total += `[[${i + 1}]] `.length + unit.source.length;
		if (i > 0) total += 2; // "\n\n"
	});
	return total;
}

/**
 * Group units (already in reading order) into batches whose combined payload
 * stays under {@link TRANSLATE_BATCH_CHARS}. Oversized units are kept
 * alone and split by the transport. Batches may span adjacent pages; results are mapped
 * back per unit, so positions are unaffected.
 */
export function buildTranslateBatches<T extends TranslateUnit>(
	units: readonly T[],
): T[][] {
	const batches: T[][] = [];
	let current: T[] = [];
	for (const unit of units) {
		const candidate = [...current, unit];
		if (
			current.length > 0 &&
			batchPayloadLength(candidate) > TRANSLATE_BATCH_CHARS
		) {
			batches.push(current);
			current = [unit];
		} else {
			current = candidate;
		}
	}
	if (current.length > 0) batches.push(current);
	return batches;
}

/** Join a batch into one numbered payload; a lone unit is sent as-is. */
export function buildNumberedPayload(batch: readonly TranslateUnit[]): string {
	if (batch.length === 1) return batch[0]?.source ?? "";
	return batch.map((unit, i) => `[[${i + 1}]] ${unit.source}`).join("\n\n");
}

/**
 * Split a numbered translation back into `expected` segments by `[[n]]` markers.
 * Returns null when markers are missing/out of order or any segment is empty, so
 * the caller can fall back to translating each sentence individually.
 */
export function parseNumberedTranslation(
	result: string,
	expected: number,
): string[] | null {
	const trimmed = result.trim();
	if (expected <= 1) return trimmed ? [trimmed] : null;
	const markers: { n: number; start: number; end: number }[] = [];
	const re = new RegExp(TRANSLATE_BATCH_MARKER_RE.source, "g");
	let m = re.exec(trimmed);
	while (m !== null) {
		markers.push({
			n: Number(m[2]),
			start: m.index,
			end: m.index + m[0].length,
		});
		m = re.exec(trimmed);
	}
	if (markers.length !== expected || trimmed.slice(0, markers[0]?.start).trim())
		return null;
	const chosen = markers.slice(0, expected);
	for (let i = 0; i < expected; i++) {
		if (chosen[i]?.n !== i + 1) return null;
	}
	const segments: string[] = [];
	for (let i = 0; i < expected; i++) {
		const cur = chosen[i];
		if (!cur) return null;
		const nextStart = i + 1 < expected ? chosen[i + 1]?.start : trimmed.length;
		const seg = trimmed.slice(cur.end, nextStart ?? trimmed.length).trim();
		if (!seg) return null;
		segments.push(seg);
	}
	return segments;
}

