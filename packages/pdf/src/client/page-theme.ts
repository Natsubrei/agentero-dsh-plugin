/**
 * PDF page paper tones and dark-mode raster styling.
 *
 * Page content has no color-scheme API, so paper colour is applied at the DOM
 * layer over the pdf.js canvas.
 *
 * Light tones are a multiply-blended tint over the rasters rather than a CSS
 * filter: white paper × tint lands exactly on the target colour, black text
 * stays black, and illustrations only shift slightly. A filter cannot hit an
 * arbitrary paper colour without also desaturating figures. Dark mode still
 * inverts, since no tint can brighten text that is already black.
 */

export type PdfPaperTone = "white" | "sepia" | "green" | "dark";

/** Picker order: light tones first, dark last. */
export const PDF_PAPER_TONES: PdfPaperTone[] = [
	"white",
	"sepia",
	"green",
	"dark",
];

/** Multiply tint over page rasters; null paints no overlay. */
export const PDF_PAPER_TINT: Record<PdfPaperTone, string | null> = {
	white: null,
	sepia: "#faf9de",
	green: "#e3edcd",
	dark: null,
};

/** Page shell background, so loading/zoom gaps match the finished paper. */
export const PDF_PAPER_SHELL_CLASS: Record<PdfPaperTone, string> = {
	white: "bg-white ring-black/5",
	sepia: "bg-[#faf9de] ring-black/5",
	green: "bg-[#e3edcd] ring-black/5",
	dark: "bg-zinc-800 ring-white/10",
};

/** Opaque overlays painted as paper. */
export const PDF_PAPER_BLOCK_CLASS: Record<PdfPaperTone, string> = {
	white: "bg-white",
	sepia: "bg-[#faf9de]",
	green: "bg-[#e3edcd]",
	dark: "bg-white",
};

/** Swatch fill for the paper-tone picker. */
export const PDF_PAPER_SWATCH_CLASS: Record<PdfPaperTone, string> = {
	white: "bg-white",
	sepia: "bg-[#faf9de]",
	green: "bg-[#e3edcd]",
	dark: "bg-zinc-800",
};

export function isPdfPaperTone(value: unknown): value is PdfPaperTone {
	return (
		typeof value === "string" && PDF_PAPER_TONES.includes(value as PdfPaperTone)
	);
}

/**
 * Dark-mode page raster styling.
 *
 * Soft partial invert (not 100%) + slight brightness/contrast so pure white
 * paper does not become pure black and text is not pure white. Hue-rotate
 * keeps figure colors roughly correct.
 */
export const PDF_PAGE_RASTER_DARK_CLASS =
	"[filter:invert(0.84)_hue-rotate(180deg)_brightness(1.0)_contrast(0.9)]";

/**
 * Dark-mode annotation overlay styling.
 *
 * Highlight annotations keep their stored bright palette colors; in dark mode
 * they sit on top of inverted dark-gray paper and can look glaring. A gentle
 * brightness + saturation reduction keeps them readable without overwhelming
 * the page.
 */
export const PDF_ANNOTATION_DARK_CLASS =
	"[filter:brightness(0.88)_saturate(0.85)]";
