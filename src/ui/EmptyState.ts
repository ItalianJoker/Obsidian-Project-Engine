/**
 * Fluent empty / missing-state panel used on Dashboard and Workspace.
 *
 * Pattern adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * `packages/ui/src/primitives/EmptyState.ts`
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */

import { ButtonComponent } from "obsidian";

/**
 * Centered placeholder with optional icon, title, body, and CTA.
 */
export class EmptyState {
	public readonly el: HTMLElement;
	private iconEl?: HTMLElement;
	private titleEl?: HTMLElement;
	private bodyEl?: HTMLElement;
	private actionEl?: HTMLElement;

	constructor(parentEl: HTMLElement) {
		this.el = parentEl.createDiv({ cls: "pe-empty-state pe-empty-panel" });
	}

	/**
	 * Optional large glyph / emoji (decorative; keep short).
	 */
	public setIcon(text: string): this {
		this.iconEl ??= this.el.createDiv({ cls: "pe-empty-icon" });
		this.iconEl.setText(text);
		return this;
	}

	public setTitle(text: string): this {
		this.titleEl ??= this.el.createEl("h3");
		this.titleEl.setText(text);
		return this;
	}

	public setBody(text: string): this {
		this.bodyEl ??= this.el.createEl("p", { cls: "pe-help" });
		this.bodyEl.setText(text);
		return this;
	}

	/**
	 * Primary CTA button under the body copy.
	 */
	public setAction(label: string, onClick: () => void): this {
		if (!this.actionEl) {
			this.actionEl = this.el.createDiv({ cls: "pe-empty-action" });
		}
		this.actionEl.empty();
		new ButtonComponent(this.actionEl)
			.setButtonText(label)
			.setCta()
			.onClick(onClick);
		const button = this.actionEl.querySelector("button");
		button?.addClass("pe-touch-target");
		return this;
	}
}
