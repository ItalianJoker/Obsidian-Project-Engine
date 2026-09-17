/**
 * Create Graph-ready project document notes from the Overview Documents tree.
 *
 * New notes follow the Entity-as-a-Note dual-link pattern used by tasks and
 * registers: a quoted YAML `project` wikilink plus a body `## Links` section
 * so Obsidian Graph View clusters the note with its project even when YAML
 * property indexing is limited.
 */

import { TFile, TFolder, type App, type Vault } from "obsidian";
import { toWikiLink } from "../models/types";
import { buildGraphLinksSection, buildMarkdownNote } from "./frontmatter";
import { containingProjectFolder } from "./projectPaths";
import {
	joinVaultPath,
	noteExists,
	sanitiseNoteBasename,
	writeNoteAtomic,
} from "./vaultIo";

/** Frontmatter `pe_type` for free-form notes created under a project folder. */
export const PROJECT_DOCUMENT_PE_TYPE = "project-document";

/**
 * Inputs for {@link createProjectDocumentNote}.
 */
export interface CreateProjectDocumentArgs {
	/** Obsidian app (metadata / vault). */
	app: App;
	/** Project note file (the `pe_type: project` note). */
	projectFile: TFile;
	/** Display title (also used as the note basename after sanitisation). */
	title: string;
	/**
	 * Vault-relative folder that will contain the note (must sit under the
	 * project folder). Example: `Projects/PRJ-001 - Demo/Documents`.
	 */
	folderPath: string;
}

/**
 * Result of a successful create.
 */
export interface CreateProjectDocumentResult {
	file: TFile;
	/** Canonical wikilink written into YAML + Links (`[[project basename]]`). */
	projectWikiLink: string;
}

/**
 * Build Markdown for a project document note (Graph-linked to the project).
 *
 * @param title - Human title / H1.
 * @param projectBasename - Project note basename (no `.md`).
 */
export function buildProjectDocumentMarkdown(
	title: string,
	projectBasename: string,
): string {
	const projectWikiLink = toWikiLink(projectBasename);
	const frontmatter: Record<string, unknown> = {
		pe_type: PROJECT_DOCUMENT_PE_TYPE,
		name: title,
		project: projectWikiLink,
	};
	const body = [`# ${title}`, "", buildGraphLinksSection([{ label: "Project", wikiLink: projectWikiLink }])].join(
		"\n",
	);
	return buildMarkdownNote(frontmatter, body);
}

/**
 * Create a new Markdown note under a project subfolder with Graph links.
 *
 * File-based only: one `.md` file, no sidecars. Refuses to overwrite an
 * existing note at the resolved path.
 *
 * @throws When the title is empty, the folder is outside the project, or a
 * note already occupies the target path.
 */
export async function createProjectDocumentNote(
	args: CreateProjectDocumentArgs,
): Promise<CreateProjectDocumentResult> {
	const title = args.title.trim();
	if (!title) {
		throw new Error("Note title is required");
	}

	const projectFolder = containingProjectFolder(args.projectFile.path);
	if (!projectFolder) {
		throw new Error("Project note is not inside a project folder");
	}

	const folderPath = args.folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (folderPath !== projectFolder && !folderPath.startsWith(`${projectFolder}/`)) {
		throw new Error("Notes must be created inside the project folder");
	}

	const basename = sanitiseNoteBasename(title) || "Untitled";
	const path = joinVaultPath(folderPath, `${basename}.md`);
	if (noteExists(args.app.vault, path)) {
		throw new Error(`A note already exists at “${path}”`);
	}

	const content = buildProjectDocumentMarkdown(title, args.projectFile.basename);
	const file = await writeNoteAtomic(args.app.vault, path, content);
	return {
		file,
		projectWikiLink: toWikiLink(args.projectFile.basename),
	};
}

/**
 * List subfolders under a project that are valid create-note targets.
 *
 * Excludes the configured Tasks folder at the project root (tasks have their
 * own UI). Always includes the Documents scaffold folder even when empty /
 * not yet created on disk.
 *
 * @returns Sorted vault-relative folder paths (project root first, then A→Z).
 */
export function listProjectDocumentFolders(
	vault: Vault,
	projectFolderPath: string,
	options: {
		documentsFolderName: string;
		excludeRootFolderName: string;
	},
): string[] {
	const root = projectFolderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!root) {
		return [];
	}

	const documentsName =
		sanitiseNoteBasename(options.documentsFolderName.trim()) || "Documents";
	const excludeName = options.excludeRootFolderName.trim() || "Tasks";
	const documentsPath = joinVaultPath(root, documentsName);

	const paths = new Set<string>([root, documentsPath]);
	const abstract = vault.getAbstractFileByPath(root);
	if (abstract instanceof TFolder) {
		collectFolders(abstract, excludeName, true, paths);
	}

	return [...paths].sort((a, b) => {
		if (a === root) return -1;
		if (b === root) return 1;
		if (a === documentsPath) return -1;
		if (b === documentsPath) return 1;
		return a.localeCompare(b, undefined, { sensitivity: "base" });
	});
}

/**
 * Recursively collect folder paths under `folder`.
 */
function collectFolders(
	folder: TFolder,
	excludeRootFolderName: string,
	atProjectRoot: boolean,
	out: Set<string>,
): void {
	for (const child of folder.children) {
		if (!(child instanceof TFolder)) continue;
		if (atProjectRoot && child.name === excludeRootFolderName) continue;
		out.add(child.path.replace(/\\/g, "/"));
		collectFolders(child, excludeRootFolderName, false, out);
	}
}

/**
 * Default target folder for “New note”: Documents when available, else project root.
 */
export function defaultDocumentCreateFolder(
	projectFolderPath: string,
	documentsFolderName: string,
): string {
	const root = projectFolderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	const name = sanitiseNoteBasename(documentsFolderName.trim()) || "Documents";
	return joinVaultPath(root, name);
}
