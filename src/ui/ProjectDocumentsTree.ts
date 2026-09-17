/**
 * Expandable documents tree for the project Overview home.
 *
 * Renders folders with chevron toggle and files as plain left-aligned labels
 * (icon + text — not full-width pill buttons). Clicking a file opens the note
 * in Obsidian. Expand/collapse state is owned by the caller so vault-driven
 * refreshes do not reset the open branches.
 *
 * v1.0.2: “+ New note” creates a Graph-linked Markdown file in a chosen
 * project subfolder; right-click on notes (and folders) uses Obsidian’s Menu
 * API for Open / new leaf / reveal / rename / delete / copy path & URL.
 *
 * Spacing and chevron affordances mirror the task table tree chrome.
 */

import { Menu, Notice, Platform, setIcon, TFile, TFolder, type App } from "obsidian";
import type { ProjectDocumentNode } from "../services/projectDocuments";
import { parentFolder, sanitiseNoteBasename } from "../services/vaultIo";
import { ConfirmModal } from "./ConfirmModal";
import { TextPromptModal } from "./TextPromptModal";

/**
 * Props for {@link renderProjectDocumentsTree}.
 */
export interface ProjectDocumentsTreeProps {
	app: App;
	container: HTMLElement;
	nodes: ProjectDocumentNode[];
	/**
	 * Paths of folders currently collapsed. Missing paths are treated as
	 * expanded (first paint shows the scaffold folders open).
	 */
	collapsedPaths: Set<string>;
	/** Invoked after a chevron toggle so the host can re-render. */
	onToggleFolder: (folderPath: string) => void;
	/**
	 * Open the create-note modal. When `folderPath` is set (folder context
	 * menu), pre-select that destination.
	 */
	onCreateNote?: (folderPath?: string) => void;
}

/**
 * Mount the documents tree into `container` (empties it first).
 */
export function renderProjectDocumentsTree(props: ProjectDocumentsTreeProps): void {
	const { container, nodes } = props;
	container.empty();
	container.addClass("pe-docs-tree");

	const header = container.createDiv({ cls: "pe-docs-tree-header" });
	header.createEl("h3", {
		text: "Documents",
		cls: "pe-section-title",
		attr: { id: "pe-docs-tree-heading" },
	});

	if (props.onCreateNote) {
		const addBtn = header.createEl("button", {
			cls: "pe-docs-tree-add pe-touch-target",
			attr: {
				type: "button",
				"aria-label": "New note in this project",
				title: "New note",
			},
		});
		setIcon(addBtn, "file-plus");
		addBtn.createSpan({ text: "New note", cls: "pe-docs-tree-add-label" });
		addBtn.addEventListener("click", (event) => {
			event.preventDefault();
			props.onCreateNote?.();
		});
	}

	if (nodes.length === 0) {
		container.createEl("p", {
			cls: "pe-help pe-docs-tree-empty",
			text: "No documents yet. Use New note, or add files under Documents, Initiation, or other folders in this project.",
		});
		return;
	}

	const list = container.createDiv({
		cls: "pe-docs-tree-list",
		attr: { role: "tree", "aria-labelledby": "pe-docs-tree-heading" },
	});

	for (const node of nodes) {
		renderNode(list, node, 0, props);
	}
}

/**
 * Render one folder or file row (and nested children when expanded).
 */
function renderNode(
	parent: HTMLElement,
	node: ProjectDocumentNode,
	depth: number,
	props: ProjectDocumentsTreeProps,
): void {
	if (node.kind === "folder") {
		renderFolder(parent, node, depth, props);
		return;
	}
	renderFile(parent, node, depth, props);
}

function renderFolder(
	parent: HTMLElement,
	node: ProjectDocumentNode,
	depth: number,
	props: ProjectDocumentsTreeProps,
): void {
	const collapsed = props.collapsedPaths.has(node.path);
	const row = parent.createDiv({
		cls: "pe-docs-tree-row pe-docs-tree-folder",
		attr: {
			role: "treeitem",
			"aria-expanded": collapsed ? "false" : "true",
			"data-path": node.path,
		},
	});
	row.style.setProperty("--pe-tree-depth", String(depth));

	const inner = row.createDiv({ cls: "pe-docs-tree-inner" });

	const chevron = inner.createSpan({
		cls: "pe-docs-tree-chevron pe-touch-target",
		attr: {
			role: "button",
			tabindex: "0",
			"aria-label": collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`,
		},
	});
	setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
	const toggle = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		props.onToggleFolder(node.path);
	};
	chevron.addEventListener("click", toggle);
	chevron.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			toggle(event);
		}
	});

	const folderIcon = inner.createSpan({ cls: "pe-docs-tree-icon" });
	setIcon(folderIcon, collapsed ? "folder" : "folder-open");

	const label = inner.createSpan({
		cls: "pe-docs-tree-label",
		text: node.name,
	});
	label.addEventListener("click", toggle);

	const childCount = node.children?.length ?? 0;
	if (childCount > 0) {
		inner.createSpan({
			cls: "pe-docs-tree-meta",
			text: String(childCount),
			attr: { "aria-hidden": "true" },
		});
	}

	row.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		event.stopPropagation();
		openFolderMenu(props, node, event);
	});

	if (!collapsed && node.children && node.children.length > 0) {
		const group = parent.createDiv({
			cls: "pe-docs-tree-children",
			attr: { role: "group" },
		});
		for (const child of node.children) {
			renderNode(group, child, depth + 1, props);
		}
	}
}

/**
 * File row: icon + plain selectable text (no button chrome / wide pill).
 *
 * Using a span (not `<button>`) avoids theme button backgrounds that stretched
 * across the row and centered the name — Luca’s Overview overlap screenshot.
 */
function renderFile(
	parent: HTMLElement,
	node: ProjectDocumentNode,
	depth: number,
	props: ProjectDocumentsTreeProps,
): void {
	const row = parent.createDiv({
		cls: "pe-docs-tree-row pe-docs-tree-file",
		attr: {
			role: "treeitem",
			"data-path": node.path,
		},
	});
	row.style.setProperty("--pe-tree-depth", String(depth));

	const inner = row.createDiv({ cls: "pe-docs-tree-inner" });
	inner.createSpan({ cls: "pe-docs-tree-chevron-spacer" });

	const fileIcon = inner.createSpan({ cls: "pe-docs-tree-icon" });
	setIcon(fileIcon, iconForFile(node.name));

	const displayName = stripMarkdownExtension(node.name);
	const label = inner.createSpan({
		cls: "pe-docs-tree-label pe-docs-tree-file-label",
		text: displayName,
		attr: {
			role: "link",
			tabindex: "0",
			title: node.path,
			"aria-label": `Open ${displayName}`,
		},
	});
	const open = (event: Event): void => {
		event.preventDefault();
		void openVaultFile(props.app, node.path, false);
	};
	label.addEventListener("click", open);
	label.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			open(event);
		}
	});

	row.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		event.stopPropagation();
		openFileMenu(props, node, event);
	});
}

/**
 * Obsidian Menu for a document note (Open, new leaf, reveal, rename, delete, copy).
 */
function openFileMenu(
	props: ProjectDocumentsTreeProps,
	node: ProjectDocumentNode,
	event: MouseEvent,
): void {
	const app = props.app;
	const menu = new Menu();

	menu.addItem((item) => {
		item.setTitle("Open").setIcon("file-text").onClick(() => {
			void openVaultFile(app, node.path, false);
		});
	});
	menu.addItem((item) => {
		item.setTitle("Open in new leaf").setIcon("lucide-panel-left").onClick(() => {
			void openVaultFile(app, node.path, true);
		});
	});
	menu.addItem((item) => {
		item.setTitle("Reveal in navigation").setIcon("folder-open").onClick(() => {
			void revealInNavigation(app, node.path);
		});
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Rename…").setIcon("pencil").onClick(() => {
			promptRename(app, node.path);
		});
	});
	menu.addItem((item) => {
		item.setTitle("Delete…").setIcon("trash-2").onClick(() => {
			confirmDeleteFile(app, node.path);
		});
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Copy path").setIcon("copy").onClick(() => {
			void copyText(node.path, "Path copied");
		});
	});
	menu.addItem((item) => {
		item.setTitle("Copy Obsidian URL").setIcon("link").onClick(() => {
			void copyText(buildNoteObsidianUrl(app, node.path), "Obsidian URL copied");
		});
	});

	menu.showAtMouseEvent(event);
}

/**
 * Folder context menu: create note here, expand/collapse, copy path.
 */
function openFolderMenu(
	props: ProjectDocumentsTreeProps,
	node: ProjectDocumentNode,
	event: MouseEvent,
): void {
	const menu = new Menu();
	const collapsed = props.collapsedPaths.has(node.path);

	if (props.onCreateNote) {
		menu.addItem((item) => {
			item.setTitle("New note here…").setIcon("file-plus").onClick(() => {
				props.onCreateNote?.(node.path);
			});
		});
		menu.addSeparator();
	}

	menu.addItem((item) => {
		item
			.setTitle(collapsed ? "Expand" : "Collapse")
			.setIcon(collapsed ? "chevron-right" : "chevron-down")
			.onClick(() => {
				props.onToggleFolder(node.path);
			});
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Copy path").setIcon("copy").onClick(() => {
			void copyText(node.path, "Path copied");
		});
	});

	menu.showAtMouseEvent(event);
}

/**
 * Open a vault file in the current leaf or a new leaf.
 */
async function openVaultFile(app: App, path: string, newLeaf: boolean): Promise<void> {
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile)) {
		new Notice("File not found");
		return;
	}
	await app.workspace.getLeaf(newLeaf).openFile(abstract);
}

/**
 * Reveal a file in the file explorer after briefly focusing it.
 */
async function revealInNavigation(app: App, path: string): Promise<void> {
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile) && !(abstract instanceof TFolder)) {
		new Notice("Path not found");
		return;
	}
	if (abstract instanceof TFile) {
		await app.workspace.getLeaf(false).openFile(abstract);
	}
	const commands = (app as App & { commands?: { executeCommandById: (id: string) => boolean } })
		.commands;
	const revealed = commands?.executeCommandById("file-explorer:reveal-active-file") ?? false;
	if (!revealed) {
		new Notice("Could not reveal in navigation");
	}
}

/**
 * Prompt for a new basename and rename via Obsidian’s file manager.
 */
function promptRename(app: App, path: string): void {
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile)) {
		new Notice("File not found");
		return;
	}
	const current = stripMarkdownExtension(abstract.name);
	new TextPromptModal(app, {
		title: "Rename note",
		message: "New file name (without path). Extension `.md` is kept automatically.",
		value: current,
		placeholder: current,
		confirmLabel: "Rename",
		onSubmit: async (raw) => {
			const next = sanitiseNoteBasename(raw.trim());
			if (!next) {
				return "Enter a file name.";
			}
			const withExt = next.toLowerCase().endsWith(".md") ? next : `${next}.md`;
			const parent = parentFolder(abstract.path);
			const destination = parent ? `${parent}/${withExt}` : withExt;
			if (destination === abstract.path) {
				return;
			}
			if (app.vault.getAbstractFileByPath(destination)) {
				return `A file already exists at “${destination}”.`;
			}
			try {
				await app.fileManager.renameFile(abstract, destination);
				new Notice(`Renamed to “${withExt}”`);
				return;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		},
	}).open();
}

/**
 * Confirm then trash/delete a vault file.
 */
function confirmDeleteFile(app: App, path: string): void {
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile)) {
		new Notice("File not found");
		return;
	}
	new ConfirmModal(app, {
		title: "Delete note",
		message: `Move “${abstract.basename}” to trash?\n\n${abstract.path}`,
		confirmLabel: "Delete",
		dangerous: true,
		onConfirm: async () => {
			const trashed = await trashOrDelete(app, abstract);
			new Notice(
				trashed
					? `Moved to trash: ${abstract.path}`
					: `Deleted: ${abstract.path}`,
			);
		},
	}).open();
}

/**
 * Prefer system trash when the vault API supports it.
 */
async function trashOrDelete(app: App, file: TFile): Promise<boolean> {
	const vault = app.vault as {
		trash?: (file: TFile, system: boolean) => Promise<void>;
	};
	if (typeof vault.trash === "function") {
		try {
			await vault.trash(file, true);
			return true;
		} catch {
			/* fall through */
		}
	}
	await app.vault.delete(file);
	return false;
}

/**
 * `obsidian://open` deep link for a vault-relative path.
 */
function buildNoteObsidianUrl(app: App, path: string): string {
	const vault = app.vault.getName();
	const file = path.replace(/\\/g, "/");
	return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}

async function copyText(text: string, successNotice: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(successNotice);
	} catch {
		/* Mobile / restricted clipboard — fall back to a temporary textarea. */
		const area = document.createElement("textarea");
		area.value = text;
		area.style.position = "fixed";
		area.style.left = "-9999px";
		document.body.appendChild(area);
		area.select();
		try {
			document.execCommand("copy");
			new Notice(successNotice);
		} catch {
			new Notice(Platform.isMobile ? "Copy failed" : `Copy failed: ${text}`);
		} finally {
			area.remove();
		}
	}
}

/** Prefer file / image / pdf icons for common vault attachments. */
function iconForFile(name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith(".md")) return "file-text";
	if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "image";
	if (lower.endsWith(".pdf")) return "file";
	return "file";
}

/** Show note titles without the `.md` suffix for readability. */
function stripMarkdownExtension(name: string): string {
	return name.replace(/\.md$/i, "");
}
