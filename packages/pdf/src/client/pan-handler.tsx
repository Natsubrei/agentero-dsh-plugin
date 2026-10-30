import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { type RefObject, useEffect, useRef } from "react";
import { bindPanDragGesture } from "./pan-drag";

/**
 * Space must still activate these rather than arm the hand tool — the roles
 * that natively respond to Space.
 */
const INTERACTIVE_SELECTOR = [
	"button",
	"a",
	"summary",
	"select",
	"[role='button']",
	"[role='tab']",
	"[role='menuitem']",
	"[role='menuitemcheckbox']",
	"[role='menuitemradio']",
	"[role='option']",
	"[role='radio']",
	"[role='checkbox']",
	"[role='switch']",
	"[role='treeitem']",
].join(", ");

function isInteractiveTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
	);
}

/** True when a copy/paste target is a real editable field, not page text. */
function isEditableClipboardTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const editable = target.closest(
		"input, textarea, select, [role='textbox'], [contenteditable]",
	);
	return (
		editable instanceof HTMLElement &&
		editable.getAttribute("contenteditable") !== "false"
	);
}

type PanDragHandlerProps = {
	/** PDF host; Space is claimed with the same ownership rule as `⌘F`. */
	hostRef: RefObject<HTMLDivElement | null>;
};

/**
 * Momentary hand tool: middle-button drag always pans, and holding Space arms
 * the left button to behave exactly the same.
 *
 * Space is a bare key with no modifier, so claiming it needs an ownership rule:
 * the hovered viewer wins (focus usually sits on a tab or a neighbouring panel
 * while reading), otherwise the viewer when focus is inside its host or still
 * neutral on `body` after a page click. Editable and button-like targets always
 * keep their native behavior. The pointer gesture is not gated on ownership at
 * all — a drag starts on whatever viewport the pointer is actually on.
 *
 * Must render inside the plugin `<Viewport>` (ViewportElementContext).
 */
export function PanDragHandler({ hostRef }: PanDragHandlerProps): null {
	const viewportRef = useViewportElement();
	const armedRef = useRef(false);

	useEffect(() => {
		const viewport = viewportRef?.current;
		if (!viewport) return;

		// EmbedPDF writes an inline cursor on the viewport, so the hand tool has to
		// take over `style.cursor` directly; the value it had is put back when the
		// gesture releases it, keeping the plugin's own cursor states intact.
		let priorCursor: string | null = null;
		let panning = false;

		const applyCursor = () => {
			if (!armedRef.current && !panning) {
				if (priorCursor !== null) {
					viewport.style.cursor = priorCursor;
					priorCursor = null;
				}
				return;
			}
			if (priorCursor === null) priorCursor = viewport.style.cursor;
			viewport.style.cursor = panning ? "grabbing" : "grab";
		};

		const setArmed = (armed: boolean) => {
			if (armedRef.current === armed) return;
			armedRef.current = armed;
			applyCursor();
		};

		const binding = bindPanDragGesture({
			target: viewport,
			isLeftDragArmed: () => armedRef.current,
			// Armed, the left button is a hand tool exactly like the middle button and
			// pans from anywhere — including over in-page citation links, whose click
			// the held Space has already suspended. Only editors keep their own
			// pointer behavior.
			isExcludedTarget: isEditableClipboardTarget,
			onStateChange: (state) => {
				panning = state === "panning";
				applyCursor();
			},
		});

		const disarm = () => {
			setArmed(false);
			binding.cancel();
		};

		// Pointer capture is best-effort (WebKit drops it after a default-prevented
		// pointerdown), so a release outside the viewport never reaches the binding's
		// own listeners. This net keeps the drag from sticking with `grabbing` on;
		// cancel() is a no-op when nothing is in flight.
		const endDragAnywhere = () => binding.cancel();
		document.addEventListener("pointerup", endDragAnywhere, true);
		document.addEventListener("pointercancel", endDragAnywhere, true);

		/** Whether this viewer owns a bare Space keydown. */
		const ownsSpaceKey = (target: EventTarget | null): boolean => {
			const host = hostRef.current;
			if (!host) return false;
			if (isEditableClipboardTarget(target)) return false;
			if (isInteractiveTarget(target)) return false;
			// The viewer under the pointer owns Space: focus normally sits on a tab or
			// a neighbouring panel while the user reads, and only one viewer can be
			// hovered.
			if (host.matches(":hover")) return true;
			// Not hovered, so fall back to focus.
			// Clicking a page never moves focus off `body`, so a neutral focus still
			// belongs to the viewer the user last clicked even after the pointer leaves.
			const focused = document.activeElement;
			return (
				!focused ||
				focused === document.body ||
				focused === document.documentElement ||
				host.contains(focused)
			);
		};

		const isSpaceKey = (event: KeyboardEvent) =>
			event.key === " " || event.code === "Space";

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || armedRef.current || !isSpaceKey(event)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (!ownsSpaceKey(event.target)) return;
			// Stop the viewport's native Space page-scroll while panning is armed.
			event.preventDefault();
			setArmed(true);
		};

		const onKeyUp = (event: KeyboardEvent) => {
			if (isSpaceKey(event)) setArmed(false);
		};

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", disarm);
		document.addEventListener("visibilitychange", disarm);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", disarm);
			document.removeEventListener("visibilitychange", disarm);
			document.removeEventListener("pointerup", endDragAnywhere, true);
			document.removeEventListener("pointercancel", endDragAnywhere, true);
			binding.dispose();
			armedRef.current = false;
			panning = false;
			applyCursor();
		};
	}, [viewportRef, hostRef]);

	return null;
}
