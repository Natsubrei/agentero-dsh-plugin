/**
 * PDF page paper tones and dark-mode raster styling.
 *
 * Page content has no color-scheme API, so paper colour is applied at the DOM
 * layer over the pdf.js canvas.
 *
 * Only two paper tones exist: solid white and solid black. Black paper is a
 * full invert so white raster areas land exactly on #000 and black text lands
 * on #fff; hue-rotate keeps figure colors roughly correct. Partial inverts were
 * dropped because they left the paper at an ambiguous grey.
 */

export type PdfPaperTone = "white" | "dark";

/** Picker order: light first, black last. */
export const PDF_PAPER_TONES: PdfPaperTone[] = ["white", "dark"];

/** Page shell background, so loading/zoom gaps match the finished paper. */
export const PDF_PAPER_SHELL_CLASS: Record<PdfPaperTone, string> = {
	white: "bg-white ring-black/5",
	dark: "bg-black ring-white/10",
};

/** Swatch fill for the paper-tone picker. */
export const PDF_PAPER_SWATCH_CLASS: Record<PdfPaperTone, string> = {
	white: "bg-white",
	dark: "bg-black",
};

export function isPdfPaperTone(value: unknown): value is PdfPaperTone {
	return (
		typeof value === "string" && PDF_PAPER_TONES.includes(value as PdfPaperTone)
	);
}

/**
 * Dark-mode page raster styling.
 *
 * Full invert: white paper becomes #000 and black ink becomes #fff, so the
 * page reads as a solid black sheet instead of a grey wash. Hue-rotate keeps
 * figure colors roughly correct.
 */
export const PDF_PAGE_RASTER_DARK_CLASS =
	"[filter:invert(1)_hue-rotate(180deg)]";

/**
 * Dark-mode annotation overlay styling.
 *
 * Highlight annotations keep their stored bright palette colors; in dark mode
 * they sit on top of inverted black paper and can look glaring. A gentle
 * brightness + saturation reduction keeps them readable without overwhelming
 * the page.
 */
export const PDF_ANNOTATION_DARK_CLASS =
	"[filter:brightness(0.88)_saturate(0.85)]";
