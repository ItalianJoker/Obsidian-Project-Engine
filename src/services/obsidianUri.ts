/**
 * Obsidian URI helpers for deep-linking into Projects Engine views.
 *
 * Registers as action `projects-engine`, so URLs look like:
 * `obsidian://projects-engine?vault=MyVault&id=PRJ-2026-001&view=overview`
 *
 * Opening the URL must land on the plugin Overview (or Workspace) leaf —
 * never only the raw project Markdown note in the editor.
 */

import { Notice, type App, type ObsidianProtocolData } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { findProjectRow, loadProjectRows, type ProjectRow } from "../views/projectRows";
import type { WorkspaceViewMode } from "../views/ProjectWorkspaceView";

/** Protocol action string → `obsidian://projects-engine?...`. */
export const PROJECTS_ENGINE_URI_ACTION = "projects-engine";

/** Target plugin surface opened by a deep link. */
export type ProjectDeepLinkView = "overview" | "workspace";

/**
 * Query parameters accepted by the {@link PROJECTS_ENGINE_URI_ACTION} handler.
 *
 * Obsidian also understands a top-level `vault` query param (handled by the
 * app before the plugin callback) so the correct vault opens first.
 */
export interface ProjectDeepLinkParams {
	/** Frontmatter `id` of the project note (preferred stable identifier). */
	id?: string;
	/**
	 * Vault-relative path to the project Markdown note
	 * (example: `Projects/PRJ-2026-001 - Cloud Migration/PRJ-2026-001 - Cloud Migration.md`).
	 */
	path?: string;
	/** Plugin surface to open. Defaults to `overview`. */
	view?: ProjectDeepLinkView;
	/**
	 * Optional Workspace SubView when `view=workspace`
	 * (`table` | `gantt` | `kanban`).
	 */
	mode?: WorkspaceViewMode;
}

/**
 * Build a shareable Obsidian URI that opens the given project in a plugin view.
 *
 * @param vaultName - Current vault display name (`app.vault.getName()`).
 * @param project - Project row to deep-link.
 * @param opts - Target view / workspace mode.
 * @returns Fully encoded `obsidian://projects-engine?...` string.
 *
 * @example
 * ```ts
 * buildProjectObsidianUri("Work", project, { view: "overview" });
 * // → obsidian://projects-engine?vault=Work&id=PRJ-2026-001&path=Projects%2F...&view=overview
 * ```
 */
export function buildProjectObsidianUri(
	vaultName: string,
	project: Pick<ProjectRow, "id" | "file">,
	opts?: { view?: ProjectDeepLinkView; mode?: WorkspaceViewMode },
): string {
	const view: ProjectDeepLinkView = opts?.view ?? "overview";
	const params = new URLSearchParams();
	if (vaultName) {
		params.set("vault", vaultName);
	}
	if (project.id) {
		params.set("id", project.id);
	}
	params.set("path", project.file.path);
	params.set("view", view);
	if (view === "workspace" && opts?.mode) {
		params.set("mode", opts.mode);
	}
	return `obsidian://${PROJECTS_ENGINE_URI_ACTION}?${params.toString()}`;
}

/**
 * Parse protocol handler payload into normalised deep-link params.
 *
 * Accepts both the documented keys (`id`, `path`, `view`, `mode`) and a few
 * aliases (`project`, `file`, `surface`) for forgiveness when hand-writing URLs.
 */
export function parseProjectDeepLinkParams(
	raw: ObsidianProtocolData,
): ProjectDeepLinkParams {
	const id = firstString(raw, ["id", "project", "projectId", "project_id"]);
	const path = firstString(raw, ["path", "file", "filepath", "filePath"]);
	const viewRaw = firstString(raw, ["view", "surface"])?.toLowerCase();
	const modeRaw = firstString(raw, ["mode"])?.toLowerCase();

	const view: ProjectDeepLinkView | undefined =
		viewRaw === "workspace" || viewRaw === "ws"
			? "workspace"
			: viewRaw === "overview" || viewRaw === "dashboard" || viewRaw === "home"
				? "overview"
				: undefined;

	const mode: WorkspaceViewMode | undefined =
		modeRaw === "table" || modeRaw === "gantt" || modeRaw === "kanban"
			? modeRaw
			: undefined;

	return { id, path, view, mode };
}

/**
 * Resolve a project row from deep-link params.
 *
 * Preference order: exact vault path → project id. Returns `null` when neither
 * matches a `pe_type: project` note in the vault.
 */
export function resolveProjectFromDeepLink(
	app: App,
	params: ProjectDeepLinkParams,
): ProjectRow | null {
	const rows = loadProjectRows(app);
	if (params.path) {
		const byPath = findProjectRow(rows, normaliseVaultPath(params.path));
		if (byPath) {
			return byPath;
		}
	}
	if (params.id) {
		const byId = findProjectRow(rows, params.id);
		if (byId) {
			return byId;
		}
	}
	return null;
}

/**
 * Open the Overview or Workspace leaf for the project identified by `raw`.
 *
 * Shows a Notice and returns without opening a Markdown editor when the
 * project cannot be resolved — callers must not fall back to `openFile`.
 */
export async function handleProjectDeepLink(
	plugin: ProjectsEnginePlugin,
	raw: ObsidianProtocolData,
): Promise<void> {
	const params = parseProjectDeepLinkParams(raw);
	if (!params.id && !params.path) {
		new Notice("Projects Engine: deep link needs id= or path=");
		return;
	}

	const project = resolveProjectFromDeepLink(plugin.app, params);
	if (!project) {
		const hint = params.id ?? params.path ?? "";
		new Notice(`Projects Engine: project not found (${hint})`);
		return;
	}

	const view = params.view ?? "overview";
	if (view === "workspace") {
		await plugin.router.openWorkspace(project.file.path, undefined, params.mode);
		return;
	}
	await plugin.router.openOverview(project.file.path);
}

/**
 * Copy a project Overview Obsidian URI to the system clipboard and notify.
 *
 * Prefers `navigator.clipboard`; falls back to a temporary textarea +
 * `document.execCommand("copy")` on older WebViews (mobile).
 */
export async function copyProjectObsidianUri(
	app: App,
	project: Pick<ProjectRow, "id" | "file">,
	opts?: { view?: ProjectDeepLinkView; mode?: WorkspaceViewMode },
): Promise<void> {
	const url = buildProjectObsidianUri(app.vault.getName(), project, {
		view: opts?.view ?? "overview",
		mode: opts?.mode,
	});
	try {
		await writeClipboardText(url);
		new Notice("Obsidian URL copied");
	} catch {
		new Notice("Could not copy Obsidian URL");
	}
}

/**
 * Write text to the clipboard using the Clipboard API or a textarea fallback.
 */
async function writeClipboardText(text: string): Promise<void> {
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}
	const ta = document.createElement("textarea");
	ta.value = text;
	ta.setAttribute("readonly", "");
	ta.style.position = "fixed";
	ta.style.left = "-9999px";
	document.body.appendChild(ta);
	ta.select();
	const ok = document.execCommand("copy");
	ta.remove();
	if (!ok) {
		throw new Error("execCommand copy failed");
	}
}

/**
 * Read the first non-empty string among candidate keys on protocol data.
 */
function firstString(
	raw: ObsidianProtocolData,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const value = raw[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return undefined;
}

/**
 * Normalise vault-relative paths that may arrive URL-decoded with leading slashes.
 */
function normaliseVaultPath(path: string): string {
	return path.replace(/^\/+/, "").replace(/\\/g, "/");
}
