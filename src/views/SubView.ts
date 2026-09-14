/**
 * Contract for Table / Gantt / Kanban panes hosted inside {@link ProjectWorkspaceView}.
 *
 * Adapted from the SubView pattern in [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */

/**
 * A disposable content pane that can re-render in place.
 */
export interface SubView {
	/** Full (re)draw into the host content element. */
	render(): void;
	/**
	 * Prefer in-place refresh to keep scroll/selection.
	 * Falls back to {@link render} when unimplemented.
	 */
	refresh?(): void;
	/** Release listeners / DOM owned by the subview. */
	destroy?(): void;
}
