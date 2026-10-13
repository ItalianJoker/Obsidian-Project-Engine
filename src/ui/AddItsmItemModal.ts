/**
 * @file AddItsmItemModal.ts
 * @purpose Create one Ticket / Change / Problem association from Project Dashboard.
 * @dependencies projectFlags, projectIo
 * @usedBy ProjectOverviewView (ITSM → Add ITSM Item)
 *
 * Same modal chrome as New note: fields + Cancel / primary action footer.
 * Persists via {@link patchProjectFrontmatter} (`vault.process`).
 */

import { Modal, Notice, type App, type TFile } from "obsidian";
import type { ItsmItem, ItsmItemType } from "../models/types";
import {
	nextItsmId,
	parseItsmItems,
	serialiseItsmItems,
} from "../services/projectFlags";
import { patchProjectFrontmatter } from "../services/projectIo";

const ITSM_TYPES: ItsmItemType[] = ["Ticket", "Change", "Problem"];

/**
 * Options for {@link AddItsmItemModal}.
 */
export interface AddItsmItemModalOptions {
	/** Project note that owns `itsm_items`. */
	projectFile: TFile;
	/** Existing associations (for next local id allocation). */
	existingItems: readonly ItsmItem[];
	/** Invoked after a successful write (refresh ITSM section). */
	onCreated: (item: ItsmItem) => void | Promise<void>;
}

/**
 * Touch-friendly form: Type, ID, Title, Short description.
 */
export class AddItsmItemModal extends Modal {
	private typeSelect!: HTMLSelectElement;
	private idInput!: HTMLInputElement;
	private titleInput!: HTMLInputElement;
	private descriptionInput!: HTMLInputElement;
	private errorEl!: HTMLElement;
	private submitting = false;

	constructor(
		app: App,
		private readonly options: AddItsmItemModalOptions,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-add-itsm-modal");
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");

		contentEl.createEl("h2", { text: "Add ITSM Item" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: "Link a Ticket, Change, or Problem to this project. The ID badge on the Dashboard copies to the clipboard.",
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		const typeField = contentEl.createDiv({ cls: "pe-field" });
		typeField.createEl("label", {
			text: "Type *",
			cls: "pe-label",
			attr: { for: "pe-add-itsm-type" },
		});
		this.typeSelect = typeField.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { id: "pe-add-itsm-type", "aria-label": "ITSM type" },
		});
		for (const type of ITSM_TYPES) {
			this.typeSelect.createEl("option", { text: type, attr: { value: type } });
		}
		this.typeSelect.value = "Ticket";

		const idField = contentEl.createDiv({ cls: "pe-field" });
		idField.createEl("label", {
			text: "ID",
			cls: "pe-label",
			attr: { for: "pe-add-itsm-id" },
		});
		this.idInput = idField.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				id: "pe-add-itsm-id",
				type: "text",
				placeholder: nextItsmId(this.options.existingItems),
				spellcheck: "false",
				autocomplete: "off",
			},
		});

		const titleField = contentEl.createDiv({ cls: "pe-field" });
		titleField.createEl("label", {
			text: "Title *",
			cls: "pe-label",
			attr: { for: "pe-add-itsm-title" },
		});
		this.titleInput = titleField.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				id: "pe-add-itsm-title",
				type: "text",
				placeholder: "Short title",
				spellcheck: "true",
				autocomplete: "off",
			},
		});

		const descField = contentEl.createDiv({ cls: "pe-field" });
		descField.createEl("label", {
			text: "Short description",
			cls: "pe-label",
			attr: { for: "pe-add-itsm-description" },
		});
		this.descriptionInput = descField.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				id: "pe-add-itsm-description",
				type: "text",
				placeholder: "Optional summary",
				spellcheck: "true",
				autocomplete: "off",
			},
		});

		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());

		const create = actions.createEl("button", {
			text: "Add item",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		create.addEventListener("click", () => {
			void this.submit();
		});

		this.titleInput.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
		});

		window.setTimeout(() => this.titleInput.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Validate and append the item to YAML `itsm_items` via vault.process.
	 */
	private async submit(): Promise<void> {
		if (this.submitting) {
			return;
		}
		const title = this.titleInput.value.trim();
		const idRaw = this.idInput.value.trim();
		const description = this.descriptionInput.value.trim();
		const type = this.typeSelect.value as ItsmItemType;

		if (!title && !idRaw) {
			this.showError("Enter a title or ID.");
			this.titleInput.focus();
			return;
		}
		if (!ITSM_TYPES.includes(type)) {
			this.showError("Select a valid type.");
			return;
		}

		const item: ItsmItem = {
			id: idRaw || nextItsmId(this.options.existingItems),
			type,
			title: title || idRaw,
			description,
		};

		this.submitting = true;
		this.errorEl.hide();
		try {
			await patchProjectFrontmatter(this.app.vault, this.options.projectFile, (data) => {
				const existing = parseItsmItems(data.itsm_items);
				existing.push(item);
				data.itsm_items = serialiseItsmItems(existing);
			});
			new Notice(`Added ${item.type} “${item.id}”`);
			await this.options.onCreated(item);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.showError(`Could not save ITSM item: ${message}`);
		} finally {
			this.submitting = false;
		}
	}

	private showError(message: string): void {
		this.errorEl.setText(message);
		this.errorEl.show();
	}
}
