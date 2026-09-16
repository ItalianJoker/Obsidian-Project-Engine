/**
 * Expandable documents tree for the project Overview home.
 *
 * Renders folders with chevron toggle and files as plain left-aligned labels
 * (icon + text — not full-width pill buttons). Clicking a file opens the note
 * in Obsidian. Expand/collapse state is owned by the caller so vault-driven
 * refreshes do not reset the open branches.
 *
 * Spacing and chevron affordances mirror the task table tree chrome.
 */

import { setIcon, TFile, type App } from "obsidian";
import type { ProjectDocumentNode } from "../services/projectDocuments";

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
}

/**
 * Mount the documents tree into `container` (empties it first).
 */
export function renderProjectDocumentsTree(props: ProjectDocumentsTreeProps): void {
	const { container, nodes } = props;
	container.empty();
	container.addClass("pe-docs-tree");

	const heading = container.createEl("h3", {
		text: "Documents",
		cls: "pe-section-title",
	});
	heading.setAttr("id", "pe-docs-tree-heading");

	if (nodes.length === 0) {
		container.createEl("p", {
			cls: "pe-help pe-docs-tree-empty",
			text: "No documents yet. Add notes under Documents, Initiation, or other folders in this project.",
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
		void openVaultFile(props.app, node.path);
	};
	label.addEventListener("click", open);
	label.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			open(event);
		}
	});
}

/**
 * Open a vault file in the current leaf (Obsidian native navigation).
 */
async function openVaultFile(app: App, path: string): Promise<void> {
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFile)) {
		return;
	}
	await app.workspace.getLeaf(false).openFile(abstract);
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
