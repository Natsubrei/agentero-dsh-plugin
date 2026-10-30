import { Palette } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { Button } from "./button";
import { PDF_CHROME_CHIP } from "./pdf-chrome-surface";
import { cn } from "./cn";
import {
	PDF_PAPER_SWATCH_CLASS,
	PDF_PAPER_TONES,
	type PdfPaperTone,
} from "./page-theme";
import {
	formatPdfZoomPercentage,
	PDF_ZOOM_MAX,
	PDF_ZOOM_MIN,
} from "./zoom";

type PdfT = PropsLocale<"agentero.pdf">["t"];

const TONE_LABEL = {
	white: "paperToneWhite",
	dark: "paperToneDark",
} as const;

type PdfBottomBarProps = {
	/** Hidden until the document reports its page count. */
	totalPages: number;
	/** Editable page number (raw digits while typing). */
	pageField: string;
	onPageFieldChange: (value: string) => void;
	/** True while the field owns focus, so scrolling does not clobber typing. */
	pageFocusedRef: { current: boolean };
	onCommitPageField: () => void;
	pdfTone: PdfPaperTone;
	onSetPdfTone: (tone: PdfPaperTone) => void;
	/** Current zoom scale (1 = 100% of the fit-to-width scale). */
	zoomLevel: number;
	/** Apply a zoom scale from the slider. */
	onZoomChange: (zoom: number) => void;
	t: PdfT;
};

/** Bottom bar: page field + zoom slider + PDF paper tone. */
export const PdfBottomBar = memo(function PdfBottomBar({
	totalPages,
	pageField,
	onPageFieldChange,
	pageFocusedRef,
	onCommitPageField,
	pdfTone,
	onSetPdfTone,
	zoomLevel,
	onZoomChange,
	t,
}: PdfBottomBarProps) {
	const [tonePickerOpen, setTonePickerOpen] = useState(false);

	if (totalPages <= 0) return null;

	const pageDigits = Math.max(2, String(totalPages).length, pageField.length);
	const zoomPercent = Math.round(zoomLevel * 100);
	const zoomMinPercent = Math.round(PDF_ZOOM_MIN * 100);
	const zoomMaxPercent = Math.round(PDF_ZOOM_MAX * 100);

	const pageFieldNode = (
		<div className="flex min-w-0 shrink items-center">
			<input
				type="text"
				inputMode="numeric"
				className="min-w-6 rounded bg-transparent px-0.5 text-center font-medium text-foreground text-sm tabular-nums outline-none focus:bg-muted"
				style={{ width: `${pageDigits + 1}ch` }}
				aria-label={t("goToPage")}
				value={pageField}
				onFocus={(e) => {
					pageFocusedRef.current = true;
					e.currentTarget.select();
				}}
				onChange={(e) =>
					onPageFieldChange(e.target.value.replace(/[^0-9]/g, ""))
				}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onCommitPageField();
						e.currentTarget.blur();
					}
				}}
				onBlur={() => {
					pageFocusedRef.current = false;
					onCommitPageField();
				}}
			/>
			<span className="shrink-0 px-0.5 text-muted-foreground text-sm tabular-nums">
				/ {totalPages}
			</span>
		</div>
	);

	const tone = (
		<PdfPaperToneButton
			pdfTone={pdfTone}
			onSetPdfTone={onSetPdfTone}
			side="top"
			size="icon-xs"
			open={tonePickerOpen}
			onOpenChange={setTonePickerOpen}
			t={t}
		/>
	);

	const chrome = (
		<div
			data-pdf-chrome
			className={cn(
				"pointer-events-auto flex max-w-full select-none items-center gap-0.5 rounded-lg p-0.5",
				PDF_CHROME_CHIP,
			)}
		>
			{pageFieldNode}
			<span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
			<div className="flex shrink-0 items-center gap-1.5 px-1">
				<input
					type="range"
					min={zoomMinPercent}
					max={zoomMaxPercent}
					step={1}
					value={zoomPercent}
					aria-label={t("zoom")}
					aria-valuemin={zoomMinPercent}
					aria-valuemax={zoomMaxPercent}
					aria-valuenow={zoomPercent}
					aria-valuetext={`${formatPdfZoomPercentage(zoomLevel)}%`}
					className="pdf-zoom-slider"
					onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
				/>
				<span
					aria-hidden
					className="min-w-[3.25ch] text-right text-muted-foreground text-xs tabular-nums"
				>
					{formatPdfZoomPercentage(zoomLevel)}%
				</span>
			</div>
			<span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
			{tone}
		</div>
	);

	return (
		<div className="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-[calc(100%-1rem)] -translate-x-1/2">
			{chrome}
		</div>
	);
});

function PdfPaperToneButton({
	pdfTone,
	onSetPdfTone,
	side = "bottom",
	size = "icon-sm",
	open,
	onOpenChange,
	t,
}: {
	pdfTone: PdfPaperTone;
	onSetPdfTone: (tone: PdfPaperTone) => void;
	side?: "top" | "bottom";
	size?: "icon-xs" | "icon-sm";
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	t: PdfT;
}) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const pickerOpen = open ?? uncontrolledOpen;
	const setPickerOpen = onOpenChange ?? setUncontrolledOpen;

	useEffect(() => {
		if (!pickerOpen) return undefined;
		const closeOnOutside = (event: PointerEvent): void => {
			const root = rootRef.current;
			if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
				setPickerOpen(false);
			}
		};
		const closeOnEscape = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setPickerOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [pickerOpen, setPickerOpen]);

	return (
		<div ref={rootRef} className="relative shrink-0">
			<Button
				type="button"
				size={size}
				variant="ghost"
				className="shrink-0 text-muted-foreground"
				aria-label={t("paperTone")}
				aria-haspopup="dialog"
				aria-expanded={pickerOpen}
				title={t("paperTone")}
				onClick={() => setPickerOpen(!pickerOpen)}
			>
				<Palette className="size-3.5" />
			</Button>
			{pickerOpen ? (
				<div
					role="dialog"
					aria-label={t("paperTone")}
					className={cn(
						"absolute right-0 z-30 flex w-auto flex-row items-center gap-1.5 rounded-lg p-1.5",
						side === "top" ? "bottom-full mb-1" : "top-full mt-1",
						PDF_CHROME_CHIP,
					)}
				>
					{PDF_PAPER_TONES.map((paperTone) => {
						const label = t(TONE_LABEL[paperTone]);
						return (
							<button
								key={paperTone}
								type="button"
								aria-label={label}
								aria-pressed={pdfTone === paperTone}
								title={label}
								className={cn(
									"size-5 shrink-0 rounded-full border-0 p-0 ring-1 ring-black/15 transition-transform duration-100 hover:scale-105 active:scale-95 dark:ring-white/25",
									pdfTone === paperTone &&
										"ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover",
								)}
								onClick={() => {
									onSetPdfTone(paperTone);
									setPickerOpen(false);
								}}
							>
								<span
									aria-hidden
									className={cn(
										"block size-full rounded-full",
										PDF_PAPER_SWATCH_CLASS[paperTone],
									)}
								/>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
