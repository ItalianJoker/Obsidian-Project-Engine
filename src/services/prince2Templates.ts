/**
 * Lean PRINCE2 Markdown templates scaffolded under a project folder.
 *
 * Called only when governance is `PRINCE2` (project create or Ensure).
 * Semplificato projects never receive these notes.
 *
 * Layout (Settings folder names may differ):
 * ```
 * Projects/{ID} - {Name}/
 *   Initiation/
 *     Project Brief.md
 *     Project Initiation Documentation.md
 *     Stage Boundaries.md
 *   Registers/
 *     Business Case.md
 *     Risk Register.md
 *     Issue & Change Log.md
 *     Quality Register.md
 *     Work Packages.md
 *     Work Package Template.md
 * ```
 *
 * All notes are Entity-as-a-Note style: YAML `project` wikilink + body
 * `## Links`. Writes use {@link writeNoteAtomic} (`vault.process`). Idempotent:
 * existing paths are left untouched.
 */

import type { TFile, Vault } from "obsidian";
import type { Prince2RegisterKind, WikiLink } from "../models/types";
import { buildGraphLinksSection, buildMarkdownNote } from "./frontmatter";
import {
	buildOperationalRegisterIndexMarkdown,
	isOperationalRegisterKind,
} from "./registerIo";
import {
	ensureFolder,
	joinVaultPath,
	sanitiseNoteBasename,
	writeNoteAtomic,
} from "./vaultIo";

/** Frontmatter `pe_type` for Initiation / stage-guidance templates. */
export const PRINCE2_DOCUMENT_PE_TYPE = "prince2-document";

/**
 * Formal PRINCE2 register / document kinds with display titles.
 */
export const PRINCE2_REGISTERS: { kind: Prince2RegisterKind; title: string }[] = [
	{ kind: "business-case", title: "Business Case" },
	{ kind: "risk-register", title: "Risk Register" },
	{ kind: "issue-change-log", title: "Issue & Change Log" },
	{ kind: "quality-register", title: "Quality Register" },
	{ kind: "work-package", title: "Work Packages" },
];

/**
 * One lean Initiation (or Registers companion) template definition.
 */
export interface Prince2TemplateDef {
	/** Subfolder under the project (Settings basename). */
	folderKey: "initiation" | "registers";
	/** Note title / filename stem. */
	title: string;
	/** YAML `document_kind` discriminator. */
	documentKind: string;
	/** Build Markdown for this template. */
	build: (projectLink: WikiLink, projectName: string) => string;
}

/**
 * Initiation + Work Package starter templates (Registers indexes come from
 * {@link ensurePrince2Registers}).
 */
export const PRINCE2_EXTRA_TEMPLATES: Prince2TemplateDef[] = [
	{
		folderKey: "initiation",
		title: "Project Brief",
		documentKind: "project-brief",
		build: buildProjectBriefMarkdown,
	},
	{
		folderKey: "initiation",
		title: "Project Initiation Documentation",
		documentKind: "pid",
		build: buildPidMarkdown,
	},
	{
		folderKey: "initiation",
		title: "Stage Boundaries",
		documentKind: "stage-boundaries-guide",
		build: buildStageBoundariesGuideMarkdown,
	},
	{
		folderKey: "registers",
		title: "Work Package Template",
		documentKind: "work-package-template",
		build: buildWorkPackageTemplateMarkdown,
	},
];

/**
 * Options for {@link ensurePrince2DocumentStructure}.
 */
export interface EnsurePrince2DocsArgs {
	vault: Vault;
	/** Vault-relative project containment folder. */
	projectFolder: string;
	projectLink: WikiLink;
	projectName: string;
	/** Settings: Initiation folder basename (default `Initiation`). */
	initiationFolderName?: string;
	/** Settings: Registers folder basename (default `Registers`). */
	registersFolderName?: string;
}

/**
 * Create the formal register notes for a PRINCE2 project (idempotent).
 *
 * @param registersFolderName - Subfolder under the project folder (default `Registers`).
 */
export async function ensurePrince2Registers(
	vault: Vault,
	projectFolder: string,
	projectLink: WikiLink,
	projectName: string,
	registersFolderName = "Registers",
): Promise<TFile[]> {
	const registersFolder = joinVaultPath(
		projectFolder,
		registersFolderName.trim() || "Registers",
	);
	await ensureFolder(vault, registersFolder);
	const created: TFile[] = [];
	for (const register of PRINCE2_REGISTERS) {
		const path = joinVaultPath(registersFolder, `${register.title}.md`);
		const existing = vault.getAbstractFileByPath(path);
		if (existing) {
			continue;
		}
		const markdown = buildRegisterMarkdown(
			register.kind,
			register.title,
			projectLink,
			projectName,
		);
		created.push(await writeNoteAtomic(vault, path, markdown));
	}
	return created;
}

/**
 * Idempotently create the full PRINCE2 document tree: formal Registers indexes
 * plus lean Initiation stubs and a Work Package starter template.
 *
 * @returns Newly created files only (skipped when already present).
 */
export async function ensurePrince2DocumentStructure(
	args: EnsurePrince2DocsArgs,
): Promise<TFile[]> {
	const initiationName =
		sanitiseNoteBasename(args.initiationFolderName?.trim() || "Initiation") ||
		"Initiation";
	const registersName =
		sanitiseNoteBasename(args.registersFolderName?.trim() || "Registers") ||
		"Registers";

	const initiationFolder = joinVaultPath(args.projectFolder, initiationName);
	const registersFolder = joinVaultPath(args.projectFolder, registersName);
	await ensureFolder(args.vault, initiationFolder);
	await ensureFolder(args.vault, registersFolder);

	const created: TFile[] = [];

	const registerFiles = await ensurePrince2Registers(
		args.vault,
		args.projectFolder,
		args.projectLink,
		args.projectName,
		registersName,
	);
	created.push(...registerFiles);

	for (const template of PRINCE2_EXTRA_TEMPLATES) {
		const folder =
			template.folderKey === "initiation" ? initiationFolder : registersFolder;
		const path = joinVaultPath(folder, `${template.title}.md`);
		const existing = args.vault.getAbstractFileByPath(path);
		if (existing) {
			continue;
		}
		const markdown = template.build(args.projectLink, args.projectName);
		created.push(await writeNoteAtomic(args.vault, path, markdown));
	}

	return created;
}

/**
 * Filenames created by a full PRINCE2 scaffold (for docs / tests).
 * Relative to the project folder using default Settings names.
 */
export function prince2ScaffoldRelativePaths(
	initiationFolderName = "Initiation",
	registersFolderName = "Registers",
): string[] {
	const initiation = sanitiseNoteBasename(initiationFolderName) || "Initiation";
	const registers = sanitiseNoteBasename(registersFolderName) || "Registers";
	return [
		`${registers}/Business Case.md`,
		`${registers}/Risk Register.md`,
		`${registers}/Issue & Change Log.md`,
		`${registers}/Quality Register.md`,
		`${registers}/Work Packages.md`,
		`${registers}/Work Package Template.md`,
		`${initiation}/Project Brief.md`,
		`${initiation}/Project Initiation Documentation.md`,
		`${initiation}/Stage Boundaries.md`,
	];
}

/**
 * Build Markdown for a formal Registers index note (Business Case, Risk, …).
 */
export function buildRegisterMarkdown(
	kind: Prince2RegisterKind,
	title: string,
	projectLink: WikiLink,
	projectName: string,
): string {
	if (isOperationalRegisterKind(kind)) {
		return buildOperationalRegisterIndexMarkdown(kind, title, projectLink, projectName);
	}

	const data: Record<string, unknown> = {
		pe_type: "prince2-register",
		register_kind: kind,
		name: title,
		project: projectLink,
		status: "draft",
		owner: "",
		date: null,
	};

	let body = `# ${title}\n\nProject: ${projectLink} (${projectName})\n\n`;

	switch (kind) {
		case "business-case":
			body += [
				"## Summary",
				"",
				"",
				"## Reasons",
				"",
				"",
				"## Options",
				"",
				"",
				"## Expected benefits",
				"",
				"",
				"## Expected disbenefits",
				"",
				"",
				"## Timescale",
				"",
				"",
				"## Costs",
				"",
				"",
				"## Investment appraisal",
				"",
				"",
				"## Major risks",
				"",
				"",
				buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
			].join("\n");
			break;
		case "work-package":
			body += [
				"## Authorised work packages",
				"",
				"Duplicate [[Work Package Template]] when authorising a package,",
				"or add a row below and link the note.",
				"",
				"| ID | Name | Assignee | Estimate (d) | Stage | Status |",
				"| --- | --- | --- | --- | --- | --- |",
				"|  |  |  |  |  |  |",
				"",
				"## Notes",
				"",
				"",
				buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
			].join("\n");
			break;
		default:
			body += buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]);
			break;
	}

	return buildMarkdownNote(data, body);
}

/**
 * Project Brief — outline why the project is proposed.
 */
export function buildProjectBriefMarkdown(
	projectLink: WikiLink,
	projectName: string,
): string {
	const data: Record<string, unknown> = {
		pe_type: PRINCE2_DOCUMENT_PE_TYPE,
		document_kind: "project-brief",
		name: "Project Brief",
		project: projectLink,
		status: "draft",
		owner: "",
		date: null,
	};
	const body = [
		"# Project Brief",
		"",
		`Project: ${projectLink} (${projectName})`,
		"",
		"## Project definition",
		"",
		"",
		"## Objectives",
		"",
		"",
		"## Scope",
		"",
		"",
		"## Constraints & assumptions",
		"",
		"",
		"## Stakeholders",
		"",
		"",
		"## Outline business case",
		"",
		`See also ${wikilink("Business Case")}.`,
		"",
		buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
	].join("\n");
	return buildMarkdownNote(data, body);
}

/**
 * Project Initiation Documentation (PID) — lean initiation pack outline.
 */
export function buildPidMarkdown(projectLink: WikiLink, projectName: string): string {
	const data: Record<string, unknown> = {
		pe_type: PRINCE2_DOCUMENT_PE_TYPE,
		document_kind: "pid",
		name: "Project Initiation Documentation",
		project: projectLink,
		status: "draft",
		owner: "",
		date: null,
	};
	const body = [
		"# Project Initiation Documentation",
		"",
		`Project: ${projectLink} (${projectName})`,
		"",
		"Lean PID outline. Expand sections as the project is authorised.",
		"",
		"## Project approach",
		"",
		"",
		"## Project management team structure",
		"",
		"",
		"## Quality management approach",
		"",
		`Register: ${wikilink("Quality Register")}.`,
		"",
		"## Risk management approach",
		"",
		`Register: ${wikilink("Risk Register")}.`,
		"",
		"## Change control approach",
		"",
		`Log: ${wikilink("Issue & Change Log")}.`,
		"",
		"## Communication management approach",
		"",
		"",
		"## Project plan (stages)",
		"",
		`Use Dashboard → **Add stage** for management stages. Guidance: ${wikilink("Stage Boundaries")}.`,
		"",
		"## Project controls",
		"",
		"",
		buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
	].join("\n");
	return buildMarkdownNote(data, body);
}

/**
 * Stage Boundaries guide — explains PE stage milestones; does **not** create
 * boundary task notes (those come from Dashboard → Add stage).
 */
export function buildStageBoundariesGuideMarkdown(
	projectLink: WikiLink,
	projectName: string,
): string {
	const data: Record<string, unknown> = {
		pe_type: PRINCE2_DOCUMENT_PE_TYPE,
		document_kind: "stage-boundaries-guide",
		name: "Stage Boundaries",
		project: projectLink,
		status: "active",
		owner: "",
		date: null,
	};
	const body = [
		"# Stage Boundaries",
		"",
		`Project: ${projectLink} (${projectName})`,
		"",
		"Management stages are created from the project Dashboard (**Add stage**).",
		"Each stage writes a zero-duration boundary milestone task",
		"(`is_stage_boundary: true`) that formally blocks later stages in the scheduler.",
		"",
		"## How to use",
		"",
		"1. Open the project Dashboard (Overview).",
		"2. Under **Governance**, choose **Add stage** and name the stage.",
		"3. Close the boundary task when the stage is authorised to end.",
		"",
		"## Stage log",
		"",
		"| Sequence | Stage | Boundary task | Status |",
		"| --- | --- | --- | --- |",
		"|  |  |  |  |",
		"",
		"_Fill this table as stages are added, or rely on project frontmatter `stages`._",
		"",
		buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
	].join("\n");
	return buildMarkdownNote(data, body);
}

/**
 * Single Work Package starter — copy or duplicate when authorising work.
 *
 * @remarks YAML `pe_type: work-package` so Graph / future WP views can find it.
 */
export function buildWorkPackageTemplateMarkdown(
	projectLink: WikiLink,
	projectName: string,
): string {
	const data: Record<string, unknown> = {
		pe_type: "work-package",
		document_kind: "work-package-template",
		id: "WP-TEMPLATE",
		name: "Work Package Template",
		project: projectLink,
		status: "planned",
		owner: "",
		assignee: "",
		stage_id: "",
		estimate_days: null,
		date: null,
	};
	const body = [
		"# Work Package Template",
		"",
		`Project: ${projectLink} (${projectName})`,
		"",
		"Duplicate this note (or create from it) when a work package is authorised.",
		`Track the portfolio of packages in ${wikilink("Work Packages")}.`,
		"",
		"## Description",
		"",
		"",
		"## Products / deliverables",
		"",
		"",
		"## Constraints",
		"",
		"",
		"## Interfaces",
		"",
		"",
		"## Acceptance criteria",
		"",
		"",
		buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
	].join("\n");
	return buildMarkdownNote(data, body);
}

function wikilink(noteTitle: string): string {
	return `[[${noteTitle}]]`;
}
