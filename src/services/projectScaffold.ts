/**
 * Auto-scaffold project subfolders on create (§9 / §10).
 *
 * Always creates purposeful folders (Tasks, Initiation, Documents).
 * PRINCE2 additionally gets lean Markdown templates under Initiation/ and
 * Registers/ (Business Case, registers, Work Package starter, Project Brief,
 * PID, Stage Boundaries guide). Semplificato stays folder-only — no PRINCE2
 * template dump.
 */

import type { TFile, Vault } from "obsidian";
import type { GovernanceModel, ProjectsEngineSettings } from "../models/types";
import { toWikiLink } from "../models/types";
import { ensurePrince2DocumentStructure } from "./prince2Templates";
import { containingProjectFolder, projectTasksFolder } from "./projectPaths";
import { ensureFolder, joinVaultPath } from "./vaultIo";

/**
 * Scaffold the standard tree under an existing project note’s parent folder.
 *
 * @returns Vault paths of folders ensured and any purposeful notes created.
 */
export async function scaffoldProjectTree(args: {
	vault: Vault;
	projectFile: TFile;
	projectId: string;
	projectName: string;
	governance: GovernanceModel;
	settings: ProjectsEngineSettings;
}): Promise<{ folders: string[]; notes: string[] }> {
	const projectFolder = containingProjectFolder(args.projectFile.path);
	if (!projectFolder) {
		throw new Error("Project note must live inside a project folder");
	}

	const folders: string[] = [];
	const notes: string[] = [];
	const s = args.settings;

	const tasksName = s.scaffoldTasksFolder.trim() || "Tasks";
	const initiationName = s.scaffoldInitiationFolder.trim() || "Initiation";
	const documentsName = s.scaffoldDocumentsFolder.trim() || "Documents";
	const registersName = s.scaffoldRegistersFolder.trim() || "Registers";

	// Folders for every governance model — no spam stub notes for Semplificato.
	for (const name of [tasksName, initiationName, documentsName]) {
		const path = joinVaultPath(projectFolder, name);
		await ensureFolder(args.vault, path);
		folders.push(path);
	}

	if (args.governance === "PRINCE2") {
		const registersFolder = joinVaultPath(projectFolder, registersName);
		await ensureFolder(args.vault, registersFolder);
		folders.push(registersFolder);
		const projectLink = toWikiLink(args.projectFile.basename);
		const created = await ensurePrince2DocumentStructure({
			vault: args.vault,
			projectFolder,
			projectLink,
			projectName: args.projectName,
			initiationFolderName: initiationName,
			registersFolderName: registersName,
		});
		for (const file of created) {
			notes.push(file.path);
		}
	}

	return { folders, notes };
}

/**
 * Resolve where a new task note should be written for a project.
 */
export function resolveProjectTasksFolder(
	projectFile: TFile,
	settings: ProjectsEngineSettings,
): string {
	const projectFolder = containingProjectFolder(projectFile.path);
	if (projectFolder) {
		return projectTasksFolder(projectFolder, settings);
	}
	return settings.tasksFolder;
}
