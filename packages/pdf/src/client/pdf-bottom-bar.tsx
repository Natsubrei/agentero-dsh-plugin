import { NotebookPen, Palette } from "lucide-react";
import { memo, useState } from "react";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { Button } from "./button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "./popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";
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
	/** Whether the paper notes column is shown. */
	notesOpen: boolean;
	/** True when the notes plugin is loaded and rendered a slot. */
	notesAvailable: boolean;
	onToggleNotes: () => void;
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
	notesOpen,
	notesAvailable,
	onToggleNotes,
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

	const notesButton = notesAvailable ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					size="icon-xs"
					variant="ghost"
					className={cn(
						"shrink-0 text-muted-foreground",
						notesOpen && "bg-muted text-foreground",
					)}
					aria-label={notesOpen ? t("hideNotes") : t("showNotes")}
					aria-pressed={notesOpen}
					onClick={onToggleNotes}
				>
					<NotebookPen className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">
				{notesOpen ? t("hideNotes") : t("showNotes")}
			</TooltipContent>
		</Tooltip>
	) : null;

	const chrome = (
		<TooltipProvider delayDuration={200}>
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
				{notesButton}
				{notesAvailable ? (
					<span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
				) : null}
				{tone}
			</div>
		</TooltipProvider>
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
	const pickerOpen = open ?? uncontrolledOpen;
	const setPickerOpen = onOpenChange ?? setUncontrolledOpen;

	return (
		<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							type="button"
							size={size}
							variant="ghost"
							className="shrink-0 text-muted-foreground"
							aria-label={t("paperTone")}
							title={t("paperTone")}
						>
							<Palette className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side={side}>{t("paperTone")}</TooltipContent>
			</Tooltip>
			<PopoverContent
				side={side}
				align="end"
				className="w-auto flex-row items-center gap-1.5 p-1.5"
			>
				{PDF_PAPER_TONES.map((paperTone) => {
					const label = t(TONE_LABEL[paperTone]);
					return (
						<Tooltip key={paperTone}>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={label}
									aria-pressed={pdfTone === paperTone}
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
							</TooltipTrigger>
							<TooltipContent side="top">{label}</TooltipContent>
						</Tooltip>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
