/**
 * Segmented icon switcher for project chrome modes.
 *
 * Used for **Dashboard | Table | Gantt | Board | Eisenhower**. Dashboard is the
 * project home (Overview); the other modes are task-only Workspace SubViews.
 *
 * UX pattern adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * `packages/ui/src/primitives/ViewSwitcher.ts`
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 * Class names use the `pe-` prefix; branding is Projects Engine, not dotpm.
 */

import { ExtraButtonComponent } from "obsidian";

/**
 * One switcher option.
 *
 * @typeParam T - Stable mode id string union.
 */
export interface ViewSwitcherOption<T extends string> {
	/** Mode id stored in settings / view state. */
	id: T;
	/** Lucide icon name for {@link ExtraButtonComponent.setIcon}. */
	icon: string;
	/** Tooltip / accessible label. */
	label: string;
}

/**
 * Props for {@link ViewSwitcher}.
 */
export interface ViewSwitcherProps<T extends string> {
	options: ViewSwitcherOption<T>[];
	active: T;
	onChange: (id: T) => void;
}

/**
 * Pill-track of icon buttons; the active option gets `pe-view-btn--active`.
 */
export class ViewSwitcher<T extends string> {
	/** Root element (`.pe-view-switcher`). */
	public readonly el: HTMLElement;

	constructor(parentEl: HTMLElement, props: ViewSwitcherProps<T>) {
		this.el = parentEl.createDiv({ cls: "pe-view-switcher" });
		for (const opt of props.options) {
			const btn = new ExtraButtonComponent(this.el)
				.setIcon(opt.icon)
				.setTooltip(opt.label);
			btn.extraSettingsEl.addClass("pe-view-btn");
			btn.extraSettingsEl.addClass("pe-touch-target");
			if (opt.id === props.active) {
				btn.extraSettingsEl.addClass("pe-view-btn--active");
			}
			btn.onClick(() => {
				this.el.querySelectorAll(".pe-view-btn").forEach((node) => {
					node.removeClass("pe-view-btn--active");
				});
				btn.extraSettingsEl.addClass("pe-view-btn--active");
				props.onChange(opt.id);
			});
		}
	}
}
