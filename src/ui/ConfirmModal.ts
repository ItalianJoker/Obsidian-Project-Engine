/**
 * Confirm dialog for destructive actions (English copy).
 */

import { Modal, type App } from "obsidian";

/**
 * Props for {@link ConfirmModal}.
 */
export interface ConfirmModalOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	dangerous?: boolean;
	onConfirm: () => void | Promise<void>;
}

/**
 * Simple confirm / cancel modal.
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly options: ConfirmModalOptions,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
	}

	override onOpen(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		contentEl.createEl("h2", { text: options.title });
		contentEl.createEl("p", { text: options.message, cls: "pe-modal-lead" });
		const actions = contentEl.createDiv({ cls: "pe-actions" });
		const cancel = actions.createEl("button", {
			text: options.cancelLabel ?? "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
		const confirm = actions.createEl("button", {
			text: options.confirmLabel ?? "Confirm",
			cls: `${options.dangerous ? "pe-danger" : "pe-primary"} pe-touch-target`,
			attr: { type: "button" },
		});
		confirm.addEventListener("click", () => {
			void (async () => {
				await options.onConfirm();
				this.close();
			})();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
