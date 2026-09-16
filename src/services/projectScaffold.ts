/**
 * Auto-scaffold project subfolders on create (§9 / §10).
 *
 * Creates purposeful empty folders only (Tasks, Initiation, Documents).
 * Does **not** write empty stub notes. PRINCE2 gets lean register templates
 * under Registers/ when governance requires them.
 */

import type { TFile, Vault } from "obsidian";
import type { GovernanceModel, ProjectsEngineSettings } from "../models/types";
import { toWikiLink } from "../models/types";
import { ensurePrince2Registers } from "./governance";
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

	// Folders only — no spam stub notes (§10).
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
		const created = await ensurePrince2Registers(
			args.vault,
			projectFolder,
			projectLink,
			args.projectName,
			registersName,
		);
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
