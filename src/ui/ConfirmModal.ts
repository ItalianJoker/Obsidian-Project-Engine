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
	/** Label shown on Confirm while `onConfirm` is in flight. */
	busyLabel?: string;
	cancelLabel?: string;
	dangerous?: boolean;
	onConfirm: () => void | Promise<void>;
	/** Called when the user cancels or dismisses without confirming. */
	onCancel?: () => void;
}

/**
 * Simple confirm / cancel modal with single-flight Confirm.
 */
export class ConfirmModal extends Modal {
	private settled = false;

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
		cancel.addEventListener("click", () => this.dismiss());
		const confirm = actions.createEl("button", {
			text: options.confirmLabel ?? "Confirm",
			cls: `${options.dangerous ? "pe-danger" : "pe-primary"} pe-touch-target`,
			attr: { type: "button" },
		});
		confirm.addEventListener("click", () => {
			if (this.settled) {
				return;
			}
			this.settled = true;
			confirm.disabled = true;
			cancel.disabled = true;
			confirm.setText(options.busyLabel ?? "Working…");
			confirm.setAttr("aria-busy", "true");
			void (async () => {
				try {
					await options.onConfirm();
				} finally {
					this.close();
				}
			})();
		});
	}

	override onClose(): void {
		if (!this.settled) {
			this.settled = true;
			this.options.onCancel?.();
		}
		this.contentEl.empty();
	}

	/** Cancel button path — closes and triggers {@link ConfirmModalOptions.onCancel}. */
	private dismiss(): void {
		if (this.settled) {
			return;
		}
		this.close();
	}
}
