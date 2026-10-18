/**
 * @file withBusy.ts
 * @purpose Disable a primary action button and show a busy label while an async
 *   action runs (single-flight guard against double-submit).
 * @usedBy Create / Save / Archive confirm paths
 */

/**
 * Run `action` while `button` is disabled and labelled with `busyText`.
 * Concurrent calls on the same button are ignored while busy.
 */
export async function withBusy(
	button: HTMLButtonElement,
	busyText: string,
	action: () => void | Promise<void>,
): Promise<void> {
	if (button.dataset.peBusy === "1") {
		return;
	}
	const previous = button.textContent ?? "";
	button.dataset.peBusy = "1";
	button.disabled = true;
	button.setText(busyText);
	button.setAttr("aria-busy", "true");
	try {
		await action();
	} finally {
		delete button.dataset.peBusy;
		button.disabled = false;
		button.setText(previous);
		button.removeAttribute("aria-busy");
	}
}
