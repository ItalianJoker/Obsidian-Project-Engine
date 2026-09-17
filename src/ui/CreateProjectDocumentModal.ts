/**
 * Modal: create a Graph-linked Markdown note inside a project subfolder.
 *
 * English UI. Caller supplies folder choices (Documents, Initiation, …) and
 * receives the created {@link TFile} via {@link CreateProjectDocumentModalOptions.onCreated}.
 */

import { Modal, Notice, TFile, type App } from "obsidian";
import {
	createProjectDocumentNote,
	defaultDocumentCreateFolder,
} from "../services/projectDocumentNote";

/**
 * Options for {@link CreateProjectDocumentModal}.
 */
export interface CreateProjectDocumentModalOptions {
	/** Project note that the new document will wikilink. */
	projectFile: TFile;
	/** Vault-relative project containment folder. */
	projectFolderPath: string;
	/** Candidate folders (Documents, Initiation, Registers, …). */
	folderChoices: string[];
	/** Preferred Documents folder basename from Settings. */
	documentsFolderName: string;
	/** Optional pre-selected folder (e.g. right-click on a tree folder). */
	initialFolderPath?: string;
	/** Invoked after a successful create (tree refresh / open note). */
	onCreated: (file: TFile) => void | Promise<void>;
}

/**
 * Touch-friendly create-note form: title + destination folder.
 */
export class CreateProjectDocumentModal extends Modal {
	private titleInput!: HTMLInputElement;
	private folderSelect!: HTMLSelectElement;
	private errorEl!: HTMLElement;

	constructor(
		app: App,
		private readonly options: CreateProjectDocumentModalOptions,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-create-doc-modal");
	}

	override onOpen(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");

		contentEl.createEl("h2", { text: "New project note" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: "Creates a Markdown note linked to this project (YAML + Links) so Graph View clusters it.",
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		const titleField = contentEl.createDiv({ cls: "pe-field" });
		titleField.createEl("label", {
			text: "Title *",
			cls: "pe-label",
			attr: { for: "pe-create-doc-title" },
		});
		this.titleInput = titleField.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				id: "pe-create-doc-title",
				type: "text",
				spellcheck: "true",
				placeholder: "Kickoff brief",
				autocomplete: "off",
			},
		});

		const folderField = contentEl.createDiv({ cls: "pe-field" });
		folderField.createEl("label", {
			text: "Folder",
			cls: "pe-label",
			attr: { for: "pe-create-doc-folder" },
		});
		this.folderSelect = folderField.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { id: "pe-create-doc-folder" },
		});

		const defaultFolder =
			options.initialFolderPath?.replace(/\\/g, "/").replace(/\/+$/, "") ||
			defaultDocumentCreateFolder(options.projectFolderPath, options.documentsFolderName);

		const choices =
			options.folderChoices.length > 0
				? options.folderChoices
				: [defaultFolder, options.projectFolderPath];

		for (const path of uniquePaths(choices)) {
			const option = this.folderSelect.createEl("option", {
				text: folderLabel(path, options.projectFolderPath),
				attr: { value: path },
			});
			if (path === defaultFolder) {
				option.selected = true;
			}
		}
		if (!choices.includes(defaultFolder)) {
			const option = this.folderSelect.createEl("option", {
				text: folderLabel(defaultFolder, options.projectFolderPath),
				attr: { value: defaultFolder },
			});
			option.selected = true;
		}

		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());

		const create = actions.createEl("button", {
			text: "Create note",
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
	 * Validate and write the note via {@link createProjectDocumentNote}.
	 */
	private async submit(): Promise<void> {
		const title = this.titleInput.value.trim();
		if (!title) {
			this.showError("Enter a note title.");
			this.titleInput.focus();
			return;
		}

		const folderPath = this.folderSelect.value;
		try {
			const result = await createProjectDocumentNote({
				app: this.app,
				projectFile: this.options.projectFile,
				title,
				folderPath,
			});
			new Notice(`Created note “${result.file.basename}”`);
			await this.options.onCreated(result.file);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.showError(message);
			new Notice(`Could not create note: ${message}`);
		}
	}

	private showError(message: string): void {
		this.errorEl.empty();
		this.errorEl.createEl("p", { text: message });
		this.errorEl.show();
	}
}

/**
 * Relative label under the project folder for the folder `<select>`.
 */
function folderLabel(folderPath: string, projectFolderPath: string): string {
	const root = projectFolderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	const path = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (path === root) {
		return "Project root";
	}
	if (path.startsWith(`${root}/`)) {
		return path.slice(root.length + 1);
	}
	return path;
}

function uniquePaths(paths: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of paths) {
		const path = raw.replace(/\\/g, "/").replace(/\/+$/, "");
		if (!path || seen.has(path)) continue;
		seen.add(path);
		out.push(path);
	}
	return out;
}
