/**
 * Small English prompt modal for single-line text (rename, etc.).
 */

import { Modal, type App } from "obsidian";

/**
 * Options for {@link TextPromptModal}.
 */
export interface TextPromptModalOptions {
	title: string;
	/** Optional lead paragraph under the heading. */
	message?: string;
	/** Initial input value. */
	value?: string;
	placeholder?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/**
	 * Return an error string to keep the modal open, or `null` / `undefined`
	 * to accept and close.
	 */
	onSubmit: (value: string) => void | string | Promise<void | string>;
}

/**
 * Modal with one text field and Confirm / Cancel.
 */
export class TextPromptModal extends Modal {
	private inputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;

	constructor(
		app: App,
		private readonly options: TextPromptModalOptions,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
	}

	override onOpen(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		contentEl.createEl("h2", { text: options.title });
		if (options.message) {
			contentEl.createEl("p", { text: options.message, cls: "pe-modal-lead" });
		}

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		const field = contentEl.createDiv({ cls: "pe-field" });
		this.inputEl = field.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				type: "text",
				spellcheck: "true",
				placeholder: options.placeholder ?? "",
				autocomplete: "off",
			},
		});
		this.inputEl.value = options.value ?? "";

		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: options.cancelLabel ?? "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());

		const confirm = actions.createEl("button", {
			text: options.confirmLabel ?? "OK",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		confirm.addEventListener("click", () => {
			void this.submit();
		});

		this.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
		});

		window.setTimeout(() => {
			this.inputEl.focus();
			this.inputEl.select();
		}, 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const value = this.inputEl.value;
		try {
			const result = await this.options.onSubmit(value);
			if (typeof result === "string" && result.trim()) {
				this.showError(result.trim());
				return;
			}
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.showError(message);
		}
	}

	private showError(message: string): void {
		this.errorEl.empty();
		this.errorEl.createEl("p", { text: message });
		this.errorEl.show();
	}
}
