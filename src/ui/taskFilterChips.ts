/**
 * @file taskFilterChips.ts
 * @purpose Shared filter-chip controls for task table toolbars.
 * @usedBy ProjectChrome, GlobalDashboardChrome, ProjectOverviewView
 */

/**
 * Mount a compact “Hide completed” chip next to All / Filter.
 *
 * When active, table surfaces hide tasks whose status is the locked Done id
 * (`done`, plus legacy completed aliases via {@link isCompletedTaskStatus}).
 *
 * @param parent — Chip row (typically `.pe-chrome-filter-chips`).
 * @param options — Active state and toggle handler.
 */
export function mountHideCompletedChip(
	parent: HTMLElement,
	options: {
		active: boolean;
		onToggle: () => void;
	},
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		text: "Hide completed",
		cls: `pe-filter-chip pe-touch-target${options.active ? " is-active" : ""}`,
		attr: {
			type: "button",
			"aria-pressed": String(options.active),
			title: "Hide tasks with Done status",
			"aria-label": "Hide completed",
		},
	});
	btn.addEventListener("click", () => options.onToggle());
	return btn;
}
