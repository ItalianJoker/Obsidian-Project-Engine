/**
 * Governance helpers for Semplificato linear flow and PRINCE2 stages.
 *
 * PRINCE2 end-of-stage milestones are written as task notes with
 * `is_stage_boundary: true` so {@link Scheduler} treats them as formal blocks.
 * Formal document / register templates live in `prince2Templates`.
 */

import type { TFile, Vault } from "obsidian";
import type {
	GovernanceModel,
	IsoDate,
	Prince2Stage,
	SemplificatoStatus,
	TaskId,
	WikiLink,
} from "../models/types";
import { toWikiLink } from "../models/types";
import { buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import {
	ensurePrince2DocumentStructure,
	ensurePrince2Registers,
	PRINCE2_REGISTERS,
} from "./prince2Templates";
import {
	blankTaskDraft,
	buildTaskMarkdown,
	nextTaskId,
	taskNotePath,
	uniqueTaskPath,
} from "./taskIo";
import { ensureFolder, joinVaultPath, processNote, sanitiseNoteBasename, writeNoteAtomic } from "./vaultIo";

/** Re-export register helpers for existing Overview / scaffold call sites. */
export { ensurePrince2Registers, PRINCE2_REGISTERS };

/** Ordered Semplificato statuses for the lean board. */
export const SEMPLIFICATO_STATUSES: SemplificatoStatus[] = [
	"backlog",
	"in-progress",
	"review",
	"done",
];

/** Human labels for Semplificato columns. */
export const SEMPLIFICATO_LABELS: Record<SemplificatoStatus, string> = {
	backlog: "Backlog",
	"in-progress": "In Progress",
	review: "Review",
	done: "Done",
};

/**
 * English UI label for a governance model.
 * Stored YAML value stays `Semplificato` / `PRINCE2`; only the chrome is localised.
 */
export function governanceDisplayLabel(model: GovernanceModel): string {
	return model === "Semplificato" ? "Simplified" : model;
}

/**
 * Create a management stage note plus an end-of-stage boundary milestone task.
 *
 * @returns The stage note, boundary task file, and boundary task id.
 */
export async function createPrince2Stage(args: {
	vault: Vault;
	projectFile: TFile;
	projectId: string;
	projectLink: WikiLink;
	stageName: string;
	sequence: number;
	tasksFolder: string;
	existingTaskIds: Iterable<TaskId>;
	startDate?: IsoDate;
	endDate?: IsoDate;
	hoursPerManday: number;
}): Promise<{ stageFile: TFile; boundaryFile: TFile; boundaryTaskId: TaskId; stage: Prince2Stage }> {
	const stageId = `STG-${args.sequence}`;
	const boundaryTaskId = nextTaskId(args.projectId, args.existingTaskIds);
	const preferredPath = taskNotePath(
		args.tasksFolder,
		boundaryTaskId,
		`${args.stageName} Boundary`,
	);
	const boundaryPath = uniqueTaskPath(args.vault, preferredPath);

	const draft = blankTaskDraft({
		id: boundaryTaskId,
		projectId: args.projectId,
		projectLink: args.projectLink,
		parentId: null,
		filePath: boundaryPath,
		stageId,
		stageSequence: args.sequence,
	});
	draft.title = `${args.stageName} — Stage Boundary`;
	draft.durationDays = 0;
	draft.isMilestone = true;
	draft.isStageBoundary = true;
	draft.status = "backlog";
	draft.startDate = args.endDate ?? args.startDate ?? null;
	draft.endDate = draft.startDate;
	draft.notes = "PRINCE2 end-of-stage milestone. Blocks scheduling of later stages.";

	const boundaryFile = await writeNoteAtomic(
		args.vault,
		boundaryPath,
		buildTaskMarkdown(draft, args.hoursPerManday),
	);

	const stage: Prince2Stage = {
		id: stageId,
		name: args.stageName.trim(),
		project: args.projectLink,
		sequence: args.sequence,
		startDate: args.startDate,
		endDate: args.endDate,
		boundaryTaskId,
		workPackageIds: [],
		status: "planned",
	};

	const stageFolder = joinVaultPath(
		args.projectFile.parent?.path ?? "",
		"PRINCE2",
		"Stages",
	);
	await ensureFolder(args.vault, stageFolder);
	const stagePath = joinVaultPath(
		stageFolder,
		`${sanitiseNoteBasename(`${stageId} ${stage.name}`)}.md`,
	);
	const stageMarkdown = buildMarkdownNote(
		{
			pe_type: "prince2-stage",
			id: stage.id,
			name: stage.name,
			project: stage.project,
			sequence: stage.sequence,
			start_date: stage.startDate ?? null,
			end_date: stage.endDate ?? null,
			boundary_task_id: stage.boundaryTaskId,
			work_package_ids: stage.workPackageIds,
			status: stage.status,
		},
		[
			`# ${stage.name}`,
			"",
			`Project: ${stage.project}`,
			`Boundary milestone: \`${boundaryTaskId}\``,
			"",
			"Work in later stages cannot start until this boundary task finishes.",
			"",
		].join("\n"),
	);
	const stageFile = await writeNoteAtomic(args.vault, stagePath, stageMarkdown);

	await appendStageToProject(args.vault, args.projectFile, stage);
	return { stageFile, boundaryFile, boundaryTaskId, stage };
}

/**
 * Append a stage summary onto the project note frontmatter `stages` list.
 */
async function appendStageToProject(
	vault: Vault,
	projectFile: TFile,
	stage: Prince2Stage,
): Promise<void> {
	await processNote(vault, projectFile, (current) => {
		const { data, body } = splitFrontmatter(current);
		const stages = Array.isArray(data.stages) ? [...data.stages] : [];
		stages.push({
			id: stage.id,
			name: stage.name,
			sequence: stage.sequence,
			boundary_task_id: stage.boundaryTaskId,
			status: stage.status,
			start_date: stage.startDate ?? null,
			end_date: stage.endDate ?? null,
		});
		data.stages = stages;
		data.updated = new Date().toISOString();
		return buildMarkdownNote(data, body);
	});
}

/**
 * Scaffold governance artifacts right after project creation when needed.
 */
export async function scaffoldGovernance(args: {
	vault: Vault;
	governance: GovernanceModel;
	projectFile: TFile;
	projectId: string;
	projectName: string;
	initiationFolderName?: string;
	registersFolderName?: string;
}): Promise<void> {
	if (args.governance !== "PRINCE2") {
		return;
	}
	const folder = args.projectFile.parent?.path ?? "";
	await ensurePrince2DocumentStructure({
		vault: args.vault,
		projectFolder: folder,
		projectLink: toWikiLink(args.projectFile.basename),
		projectName: args.projectName,
		initiationFolderName: args.initiationFolderName,
		registersFolderName: args.registersFolderName,
	});
}

/**
 * Parse stages from project frontmatter.
 */
export function readProjectStages(frontmatter: Record<string, unknown> | undefined): Prince2Stage[] {
	const raw = frontmatter?.stages;
	if (!Array.isArray(raw)) {
		return [];
	}
	const stages: Prince2Stage[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			continue;
		}
		const row = item as Record<string, unknown>;
		const id = typeof row.id === "string" ? row.id : "";
		const name = typeof row.name === "string" ? row.name : id;
		const sequence = typeof row.sequence === "number" ? row.sequence : Number(row.sequence);
		if (!id || !Number.isFinite(sequence)) {
			continue;
		}
		stages.push({
			id,
			name,
			project: typeof row.project === "string" ? toWikiLink(row.project) : "",
			sequence,
			startDate: typeof row.start_date === "string" ? row.start_date : undefined,
			endDate: typeof row.end_date === "string" ? row.end_date : undefined,
			boundaryTaskId:
				typeof row.boundary_task_id === "string" ? row.boundary_task_id : undefined,
			workPackageIds: Array.isArray(row.work_package_ids)
				? row.work_package_ids.filter((x): x is string => typeof x === "string")
				: [],
			status: (typeof row.status === "string" ? row.status : "planned") as Prince2Stage["status"],
		});
	}
	return stages.sort((a, b) => a.sequence - b.sequence);
}
