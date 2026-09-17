/**
 * Project folder naming and path helpers (§9 containment).
 *
 * Layout (defaults):
 * - `Projects/` — projects root
 * - `Projects/{ID} - {Name}/` — one folder per project
 * - `Projects/Entities/…` — catalogue notes under the same root
 * - Inside each project: Tasks /, Initiation /, Documents /, Registers / (PRINCE2)
 *
 * Folder rename on ID/name edit is not automatic in v1; document that behaviour
 * in README. Creation always uses {@link projectFolderBasename}.
 */

import type { ProjectsEngineSettings } from "../models/types";
import { joinVaultPath, sanitiseNoteBasename } from "./vaultIo";

/**
 * Sanitize one segment of a project folder / note name while preserving
 * readable spaces and the `{ID} - {Name}` pattern.
 *
 * Strips filesystem-illegal characters (`\ / : * ? " < > | #`) and collapses
 * whitespace; does **not** replace spaces with hyphens.
 */
export function sanitiseProjectPathSegment(value: string): string {
	return value
		.replace(/[\\/:*?"<>|#]/g, "-")
		.replace(/\s+/g, " ")
		.replace(/-+/g, "-")
		.replace(/\s*-\s*/g, " - ")
		.trim();
}

/**
 * Folder basename: `{ProjectID} - {ProjectName}` after segment sanitisation.
 *
 * @remarks {@link sanitiseProjectPathSegment} normalises every `-` to ` - `,
 * so ids like `PRJ-2026-001` become `PRJ - 2026 - 001` in the folder name.
 * That behaviour is intentional for v1 filesystem safety — do not “fix” without
 * a migration for existing vault folders.
 *
 * @example
 * `projectFolderBasename("PRJ-2026-001", "Cloud Migration")`
 * → `"PRJ - 2026 - 001 - Cloud Migration"`
 */
export function projectFolderBasename(projectId: string, projectName: string): string {
	const id = sanitiseProjectPathSegment(projectId) || "PROJECT";
	const name = sanitiseProjectPathSegment(projectName) || "Untitled";
	return `${id} - ${name}`;
}

/**
 * Vault-relative path to the project folder under the projects root.
 */
export function projectFolderPath(
	projectsRoot: string,
	projectId: string,
	projectName: string,
): string {
	return joinVaultPath(projectsRoot, projectFolderBasename(projectId, projectName));
}

/**
 * Vault path for the project note inside its folder
 * (`…/{ID} - {Name}/{ID} - {Name}.md`).
 */
export function projectNotePath(
	projectsRoot: string,
	projectId: string,
	projectName: string,
): string {
	const folder = projectFolderPath(projectsRoot, projectId, projectName);
	const basename = projectFolderBasename(projectId, projectName);
	return joinVaultPath(folder, `${basename}.md`);
}

/**
 * Resolve the Tasks folder for a project (inside the project folder).
 */
export function projectTasksFolder(
	projectFolder: string,
	settings: Pick<ProjectsEngineSettings, "scaffoldTasksFolder">,
): string {
	const name = sanitiseNoteBasename(settings.scaffoldTasksFolder || "Tasks") || "Tasks";
	return joinVaultPath(projectFolder, name);
}

/**
 * Parent folder of a project note — the containment root for tasks / docs.
 */
export function containingProjectFolder(projectFilePath: string): string {
	const normalised = projectFilePath.replace(/\\/g, "/");
	const index = normalised.lastIndexOf("/");
	return index <= 0 ? "" : normalised.slice(0, index);
}
