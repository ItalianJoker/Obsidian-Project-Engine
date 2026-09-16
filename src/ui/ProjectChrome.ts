/**
 * Shared project chrome matching Luca’s dotpm screenshots:
 * icon + name + “This project” badge | view switchers | + add task | gear
 * Search tasks… | All / Filter
 *
 * Pattern adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * ProjectView (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */

import { ExtraButtonComponent, setIcon } from "obsidian";
import type { WorkspaceViewMode } from "../views/ProjectWorkspaceView";
import { ViewSwitcher } from "./ViewSwitcher";
import type { ProjectRow } from "../views/projectRows";
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from "../models/types";

/**
 * Props for {@link renderProjectChrome}.
 */
export interface ProjectChromeProps {
	/** Mount point emptied and refilled by the renderer. */
	container: HTMLElement;
	project: ProjectRow;
	/** Active delivery mode for the view switcher highlight. */
	mode: WorkspaceViewMode;
	/** Free-text search value. */
	searchText: string;
	/** When true, “All” is active; otherwise “Filter” looks active. */
	filterAll: boolean;
	onModeChange: (mode: WorkspaceViewMode) => void;
	onSearchChange: (text: string) => void;
	onAddTask: () => void;
	onOpenSettings: () => void;
	/**
	 * Copy an `obsidian://projects-engine?...` deep link for this project
	 * (opens Overview / Dashboard leaf, not the raw Markdown editor).
	 */
	onCopyObsidianUrl?: () => void;
	/** Optional: toggle filter panel / clear filters. */
	onFilterClick?: () => void;
	onAllClick?: () => void;
	/** Extra mount for mode-specific toolbars (Gantt zoom, etc.). */
	extraToolbar?: (parent: HTMLElement) => void;
}

/**
 * Render the screenshot-aligned project header + search row into `container`.
 */
export function renderProjectChrome(props: ProjectChromeProps): void {
	const {
		container,
		project,
		mode,
		searchText,
		filterAll,
		onModeChange,
		onSearchChange,
		onAddTask,
		onOpenSettings,
		onCopyObsidianUrl,
		onFilterClick,
		onAllClick,
		extraToolbar,
	} = props;

	container.empty();
	container.addClass("pe-chrome");

	const top = container.createDiv({ cls: "pe-chrome-top" });
	const identity = top.createDiv({ cls: "pe-chrome-identity" });

	const glyph = identity.createDiv({ cls: "pe-chrome-glyph pe-touch-target" });
	const iconId = project.icon || DEFAULT_PROJECT_ICON;
	const color = project.color || DEFAULT_PROJECT_COLOR;
	glyph.style.setProperty("--pe-project-color", color);
	try {
		setIcon(glyph, iconId);
	} catch {
		glyph.setText("◇");
	}

	identity.createEl("h1", { text: project.name, cls: "pe-chrome-title" });
	identity.createSpan({ text: "This project", cls: "pe-chrome-badge" });

	const actions = top.createDiv({ cls: "pe-chrome-actions" });
	new ViewSwitcher<WorkspaceViewMode>(actions, {
		options: [
			{ id: "table", icon: "table", label: "Table" },
			{ id: "gantt", icon: "git-fork", label: "Gantt" },
			{ id: "kanban", icon: "layout-dashboard", label: "Board" },
		],
		active: mode,
		onChange: onModeChange,
	});

	const add = actions.createEl("button", {
		text: "+ add task",
		cls: "pe-primary pe-chrome-add pe-touch-target",
		attr: { type: "button" },
	});
	add.addEventListener("click", onAddTask);

	if (onCopyObsidianUrl) {
		new ExtraButtonComponent(actions)
			.setIcon("link")
			.setTooltip("Copy Obsidian URL")
			.onClick(onCopyObsidianUrl);
		actions.querySelector(".clickable-icon:last-child")?.addClass("pe-touch-target");
	}

	new ExtraButtonComponent(actions)
		.setIcon("settings")
		.setTooltip("Project settings")
		.onClick(onOpenSettings);
	actions.querySelector(".clickable-icon:last-child")?.addClass("pe-touch-target");

	const searchRow = container.createDiv({ cls: "pe-chrome-search-row" });
	const search = searchRow.createEl("input", {
		cls: "pe-chrome-search pe-touch-target",
		attr: {
			type: "search",
			placeholder: "Search tasks…",
			"aria-label": "Search tasks",
		},
	});
	search.value = searchText;
	search.addEventListener("input", () => onSearchChange(search.value));

	const chips = searchRow.createDiv({ cls: "pe-chrome-filter-chips" });
	const allBtn = chips.createEl("button", {
		text: "All",
		cls: `pe-filter-chip pe-touch-target${filterAll ? " is-active" : ""}`,
		attr: { type: "button", "aria-pressed": String(filterAll) },
	});
	allBtn.addEventListener("click", () => onAllClick?.());
	const filterBtn = chips.createEl("button", {
		text: "Filter",
		cls: `pe-filter-chip pe-touch-target${filterAll ? "" : " is-active"}`,
		attr: { type: "button", "aria-pressed": String(!filterAll) },
	});
	filterBtn.addEventListener("click", () => onFilterClick?.());

	if (extraToolbar) {
		const extra = container.createDiv({ cls: "pe-chrome-extra" });
		extraToolbar(extra);
	}
}
