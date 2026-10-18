/**
 * @file searchCaret.ts
 * @purpose Preserve chrome search focus and caret across remounts.
 * @usedBy ProjectChrome, GlobalDashboardChrome, ProjectOverviewView
 */

/** Snapshot of an active `.pe-chrome-search` caret inside a container. */
export interface SearchCaretState {
	start: number;
	end: number;
}

/**
 * Capture selection on the focused chrome search input inside `container`.
 * Returns `null` when the search field is not focused.
 */
export function captureSearchCaret(container: HTMLElement): SearchCaretState | null {
	const active = container.ownerDocument.activeElement;
	if (!(active instanceof HTMLInputElement)) {
		return null;
	}
	if (!active.classList.contains("pe-chrome-search")) {
		return null;
	}
	if (!container.contains(active)) {
		return null;
	}
	return {
		start: active.selectionStart ?? active.value.length,
		end: active.selectionEnd ?? active.value.length,
	};
}

/**
 * Restore focus and selection onto a newly mounted chrome search input.
 */
export function restoreSearchCaret(
	input: HTMLInputElement,
	state: SearchCaretState | null,
): void {
	if (!state) {
		return;
	}
	input.focus();
	try {
		const max = input.value.length;
		input.setSelectionRange(
			Math.min(state.start, max),
			Math.min(state.end, max),
		);
	} catch {
		/* some input types reject setSelectionRange */
	}
}
