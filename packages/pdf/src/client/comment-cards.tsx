import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { cn } from "./cn";
import { type HighlightColor, swatchColorClass } from "./palette";

/** Card width in CSS px — also the gutter width reserved on the viewport. */
const COMMENT_CARD_WIDTH_PX = 200;
/** Horizontal gap between the page edge and the rail. */
const COMMENT_CARD_GAP_PX = 8;
const CARD_GAP_PX = 8;
/** text-xs leading-relaxed ≈ 12px × 1.625. */
const CARD_LINE_HEIGHT_PX = 20;
/** Conservative chars per line at w-50 with padding (CJK-heavy notes). */
const CARD_CHARS_PER_LINE = 13;
/** Padding + color-dot row + comment margins. */
const CARD_BASE_HEIGHT_PX = 54;
/** View-mode clamp for the note body. */
const VIEW_COMMENT_LINES = 3;

const COMMENT_CARD_SURFACE_CLASS =
	"group pointer-events-auto absolute select-none rounded-lg border border-white/55 bg-background/88 shadow-[0_10px_28px_rgba(15,23,42,0.16),0_2px_8px_rgba(15,23,42,0.1)] ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 transition-[box-shadow,background-color,transform] duration-150 ease-out hover:z-[7] hover:shadow-[0_16px_36px_rgba(15,23,42,0.2),0_4px_12px_rgba(15,23,42,0.12)] hover:!h-auto supports-backdrop-blur:bg-background/70 dark:border-white/10 dark:shadow-[0_12px_32px_rgba(0,0,0,0.45),0_2px_10px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_18px_40px_rgba(0,0,0,0.55),0_4px_14px_rgba(0,0,0,0.42)] dark:ring-white/10";

type PdfT = PropsLocale<"agentero.pdf">["t"];

type CommentRect = { x: number; y: number; w: number; h: number };

export type CommentMark = {
	id: string;
	kind: string;
	note: string;
	rects: CommentRect[];
	space: "norm" | "pt";
	/** Vault-relative PNG for a visual region mark. */
	asset?: string;
};

type CommentCardsProps = {
	marks: readonly CommentMark[];
	/** Rendered page height in CSS px. */
	pageHeight: number;
	/** PDF page size at scale 1, used to normalize point-space rects. */
	pageSize: { width: number; height: number };
	t: PdfT;
};

function clampedLines(text: string, max: number): number {
	let lines = 0;
	for (const raw of text.split("\n")) {
		lines += Math.max(1, Math.ceil(raw.length / CARD_CHARS_PER_LINE));
		if (lines >= max) return max;
	}
	return Math.max(1, lines);
}

function estimateHeight(note: string): number {
	return CARD_BASE_HEIGHT_PX + clampedLines(note, VIEW_COMMENT_LINES) * CARD_LINE_HEIGHT_PX;
}

function anchorY(mark: CommentMark, pageSize: { width: number; height: number }): number {
	let top = Number.POSITIVE_INFINITY;
	for (const rect of mark.rects) {
		const y = mark.space === "pt" ? rect.y / pageSize.height : rect.y;
		if (y < top) top = y;
	}
	return Number.isFinite(top) ? top : 0;
}

function swatchForKind(kind: string): HighlightColor {
	if (kind === "ask") return "green";
	if (kind === "translate") return "blue";
	if (kind === "visual") return "purple";
	return "yellow";
}

/**
 * One static card per current-page mark that has a note or a crop, pinned to
 * the page's right edge. Chrome only: the in-place editor, crop tool, and
 * action bar stay out.
 */
export function CommentCards({ marks, pageHeight, pageSize, t }: CommentCardsProps) {
	if (pageHeight <= 0 || pageSize.height <= 0) return null;
	const sorted = marks
		.filter((mark) => (mark.note.trim() !== "" || mark.asset !== undefined) && mark.rects.length > 0)
		.map((mark) => ({ mark, anchor: anchorY(mark, pageSize) }))
		.sort((a, b) => a.anchor - b.anchor || a.mark.id.localeCompare(b.mark.id));
	if (sorted.length === 0) return null;

	const laid = sorted.map((item) => ({
		id: item.mark.id,
		kind: item.mark.kind,
		note: item.mark.note,
		asset: item.mark.asset,
		heightPx: estimateHeight(item.mark.note) + (item.mark.asset === undefined ? 0 : 92),
		topPx: item.anchor * pageHeight,
	}));
	for (let i = 0; i < laid.length; i += 1) {
		const prev = laid[i - 1];
		const card = laid[i];
		if (card === undefined) continue;
		card.topPx = Math.max(card.topPx, prev ? prev.topPx + prev.heightPx + CARD_GAP_PX : 0);
	}
	for (let i = laid.length - 1; i >= 0; i -= 1) {
		const card = laid[i];
		const next = laid[i + 1];
		if (card === undefined) continue;
		const maxTop = next
			? next.topPx - CARD_GAP_PX - card.heightPx
			: pageHeight - card.heightPx;
		card.topPx = Math.max(0, Math.min(card.topPx, maxTop));
	}

	return (
		<>
			{laid.map((card) => (
				<div
					key={card.id}
					data-pdf-chrome
					className={COMMENT_CARD_SURFACE_CLASS}
					style={{
						left: `calc(100% + ${COMMENT_CARD_GAP_PX}px)`,
						top: card.topPx,
						width: COMMENT_CARD_WIDTH_PX,
						height: card.heightPx,
						minHeight: card.heightPx,
					}}
					aria-label={t("comment")}
				>
					<div className="h-full overflow-hidden rounded-[inherit] px-2.5 py-2 group-hover:overflow-visible">
						<div className="max-h-[70vh] overflow-y-auto">
							<span
								className={cn(
									"block size-2 rounded-full",
									swatchColorClass(swatchForKind(card.kind)),
								)}
								aria-hidden
							/>
							{card.asset === undefined ? null : (
								<img
									src={card.asset}
									alt=""
									loading="lazy"
									className="mt-1 max-h-20 w-full rounded border border-border/50 object-cover object-top"
								/>
							)}
							<div
								className={cn(
									"mt-1 max-h-[3.75rem] overflow-hidden break-words text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 group-hover:max-h-none group-hover:overflow-x-auto",
								)}
							>
								{card.note}
							</div>
						</div>
					</div>
				</div>
			))}
		</>
	);
}
