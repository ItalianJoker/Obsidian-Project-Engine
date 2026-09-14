/**
 * Debounced in-memory entity index.
 *
 * Rebuilds from `metadataCache` (no extra file I/O) so autocomplete in the
 * creation modal stays cheap on mobile. Vault events are coalesced through
 * {@link debounce}.
 */

import { TFile, type App } from "obsidian";
import { debounce, type Debounced } from "./debounce";
import type {
	Customer,
	CustomFieldMap,
	EntityType,
	ProjectsEngineSettings,
	ProjectType,
	Stakeholder,
	TeamMember,
	Technology,
	WikiLink,
} from "../models/types";
import { toWikiLink } from "../models/types";

/**
 * Lightweight projection used by fuzzy autocomplete.
 */
export interface IndexedEntity {
	type: EntityType;
	name: string;
	file: TFile;
	wikiLink: WikiLink;
}

/**
 * Vault-wide entity catalogue. Call {@link EntityIndexer.scheduleRebuild} from
 * vault event handlers; call {@link EntityIndexer.cancel} from `onunload`.
 */
export class EntityIndexer {
	private customers: Customer[] = [];
	private teamMembers: TeamMember[] = [];
	private projectTypes: ProjectType[] = [];
	private technologies: Technology[] = [];
	private stakeholders: Stakeholder[] = [];
	private projectIds = new Set<string>();
	private readonly rebuildDebounced: Debounced<() => void>;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => ProjectsEngineSettings,
		debounceMs: number,
	) {
		this.rebuildDebounced = debounce(() => {
			this.rebuild();
		}, debounceMs);
	}

	/** Queue a rebuild; coalesces bursts of Sync / iCloud events. */
	public scheduleRebuild(): void {
		this.rebuildDebounced();
	}

	/** Immediate rebuild (used after creating a note in the current modal). */
	public rebuild(): void {
		this.customers = [];
		this.teamMembers = [];
		this.projectTypes = [];
		this.technologies = [];
		this.stakeholders = [];
		this.projectIds = new Set();

		const settings = this.getSettings();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const peType = typeof frontmatter?.pe_type === "string" ? frontmatter.pe_type : "";
			const inferred = peType || inferTypeFromFolder(file.path, settings);
			const customFields = readCustomFields(frontmatter);

			if (inferred === "project") {
				const id = typeof frontmatter?.id === "string" ? frontmatter.id : "";
				if (id) {
					this.projectIds.add(id);
				}
				continue;
			}

			if (inferred === "customer") {
				this.customers.push({
					name: file.basename,
					filePath: file.path,
					wikiLink: toWikiLink(file.basename),
					stakeholders: readWikiLinkList(frontmatter, "stakeholders"),
					customFields,
				});
			} else if (inferred === "team-member") {
				this.teamMembers.push({
					name: file.basename,
					filePath: file.path,
					wikiLink: toWikiLink(file.basename),
					email: typeof frontmatter?.email === "string" ? frontmatter.email : undefined,
					defaultRole:
						typeof frontmatter?.default_role === "string" ? frontmatter.default_role : undefined,
					customFields,
				});
			} else if (inferred === "project-type") {
				this.projectTypes.push({
					name: file.basename,
					filePath: file.path,
					wikiLink: toWikiLink(file.basename),
					description:
						typeof frontmatter?.description === "string" ? frontmatter.description : undefined,
					customFields,
				});
			} else if (inferred === "technology") {
				this.technologies.push({
					name: file.basename,
					filePath: file.path,
					wikiLink: toWikiLink(file.basename),
					description:
						typeof frontmatter?.description === "string" ? frontmatter.description : undefined,
					customFields,
				});
			} else if (inferred === "stakeholder") {
				this.stakeholders.push({
					name: file.basename,
					filePath: file.path,
					wikiLink: toWikiLink(file.basename),
					customer: readOptionalWikiLink(frontmatter, "customer"),
					projects: readWikiLinkList(frontmatter, "projects"),
					role: typeof frontmatter?.role === "string" ? frontmatter.role : undefined,
					customFields,
				});
			}
		}
	}

	public getCustomers(): readonly Customer[] {
		return this.customers;
	}

	public getTeamMembers(): readonly TeamMember[] {
		return this.teamMembers;
	}

	public getProjectTypes(): readonly ProjectType[] {
		return this.projectTypes;
	}

	public getTechnologies(): readonly Technology[] {
		return this.technologies;
	}

	public getStakeholders(): readonly Stakeholder[] {
		return this.stakeholders;
	}

	public hasProjectId(id: string): boolean {
		return this.projectIds.has(id);
	}

	public list(type: EntityType): IndexedEntity[] {
		const toIndexed = (typeInner: EntityType, name: string, filePath: string): IndexedEntity | null => {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return null;
			}
			return { type: typeInner, name, file, wikiLink: toWikiLink(name) };
		};

		const rows: IndexedEntity[] = [];
		const pushAll = (typeInner: EntityType, items: { name: string; filePath: string }[]): void => {
			for (const item of items) {
				const indexed = toIndexed(typeInner, item.name, item.filePath);
				if (indexed) {
					rows.push(indexed);
				}
			}
		};

		if (type === "customer") pushAll("customer", this.customers);
		if (type === "team-member") pushAll("team-member", this.teamMembers);
		if (type === "project-type") pushAll("project-type", this.projectTypes);
		if (type === "technology") pushAll("technology", this.technologies);
		if (type === "stakeholder") pushAll("stakeholder", this.stakeholders);
		return rows;
	}

	public cancel(): void {
		this.rebuildDebounced.cancel();
	}
}

/**
 * Fallback when a note has no `pe_type` but lives in a configured entity folder.
 */
function inferTypeFromFolder(path: string, settings: ProjectsEngineSettings): EntityType | "" {
	const normalised = path.replace(/\\/g, "/");
	if (folderContains(normalised, settings.customersFolder)) return "customer";
	if (folderContains(normalised, settings.teamMembersFolder)) return "team-member";
	if (folderContains(normalised, settings.projectTypesFolder)) return "project-type";
	if (folderContains(normalised, settings.technologiesFolder)) return "technology";
	if (folderContains(normalised, settings.stakeholdersFolder)) return "stakeholder";
	if (folderContains(normalised, settings.projectsFolder)) return "project";
	return "";
}

function folderContains(filePath: string, folder: string): boolean {
	const prefix = folder.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!prefix) {
		return false;
	}
	return filePath.startsWith(prefix + "/");
}

function readWikiLinkList(
	frontmatter: Record<string, unknown> | undefined,
	key: string,
): WikiLink[] {
	const raw = frontmatter?.[key];
	if (typeof raw === "string" && raw.trim()) {
		return [toWikiLink(raw)];
	}
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw
		.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
		.map((item) => toWikiLink(item));
}

function readOptionalWikiLink(
	frontmatter: Record<string, unknown> | undefined,
	key: string,
): WikiLink | undefined {
	const raw = frontmatter?.[key];
	return typeof raw === "string" && raw.trim() ? toWikiLink(raw) : undefined;
}

function readCustomFields(frontmatter: Record<string, unknown> | undefined): CustomFieldMap {
	const raw = frontmatter?.custom_fields;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return {};
	}
	const result: CustomFieldMap = {};
	for (const [key, value] of Object.entries(raw)) {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean" ||
			value === null ||
			(Array.isArray(value) && value.every((item) => typeof item === "string"))
		) {
			result[key] = value as CustomFieldMap[string];
		}
	}
	return result;
}
