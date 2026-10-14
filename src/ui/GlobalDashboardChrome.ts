/**
 * @file GlobalDashboardChrome.ts
 * @purpose Shared chrome for Global Dashboard — mirrors project Task section graphics.
 * @dependencies ViewSwitcher
 * @usedBy GlobalDashboardView
 *
 * Structure matches project Task chrome: identity row + view switchers + add task,
 * then Search / All / Filter (same `.pe-chrome` padding as Workspace). Modes:
 * Table | Board | Eisenhower (no Gantt / home).
 */

import { setIcon } from "obsidian";
import { mountHideCompletedChip } from "./taskFilterChips";
import { ViewSwitcher } from "./ViewSwitcher";

/** Task surfaces hosted on the Global Dashboard. */
export type GlobalDashboardMode = "table" | "kanban" | "eisenhower";

/**
 * Props for {@link renderGlobalDashboardChrome}.
 */
export interface GlobalDashboardChromeProps {
	container: HTMLElement;
	mode: GlobalDashboardMode;
	searchText: string;
	filterAll: boolean;
	onModeChange: (mode: GlobalDashboardMode) => void;
	onSearchChange: (text: string) => void;
	onAddTask: () => void;
	onAllClick?: () => void;
	onFilterClick?: () => void;
	onBackToProjects?: () => void;
	/** Show “Hide completed” on Table mode. */
	showHideCompleted?: boolean;
	hideCompleted?: boolean;
	onHideCompletedToggle?: () => void;
}

const SWITCHER_OPTIONS: Array<{
	id: GlobalDashboardMode;
	icon: string;
	label: string;
}> = [
	{ id: "table", icon: "table", label: "Table" },
	{ id: "kanban", icon: "columns", label: "Board" },
	{ id: "eisenhower", icon: "layout-grid", label: "Eisenhower" },
];

/**
 * Render Global Dashboard header chrome into `container` (emptied first).
 */
export function renderGlobalDashboardChrome(props: GlobalDashboardChromeProps): void {
	const {
		container,
		mode,
		searchText,
		filterAll,
		onModeChange,
		onSearchChange,
		onAddTask,
		onAllClick,
		onFilterClick,
		onBackToProjects,
		showHideCompleted = false,
		hideCompleted = false,
		onHideCompletedToggle,
	} = props;

	container.empty();
	container.addClass("pe-chrome");
	container.addClass("pe-global-chrome");

	const top = container.createDiv({ cls: "pe-chrome-top" });
	const identity = top.createDiv({ cls: "pe-chrome-identity" });
	const glyph = identity.createDiv({ cls: "pe-chrome-glyph pe-touch-target" });
	try {
		setIcon(glyph, "layout-list");
	} catch {
		glyph.setText("◇");
	}
	identity.createEl("h1", { text: "Global Dashboard", cls: "pe-chrome-title" });
	identity.createSpan({ text: "All projects", cls: "pe-chrome-badge" });

	const actions = top.createDiv({ cls: "pe-chrome-actions" });
	new ViewSwitcher<GlobalDashboardMode>(actions, {
		options: SWITCHER_OPTIONS,
		active: mode,
		onChange: onModeChange,
	});

	const add = actions.createEl("button", {
		text: "+ add task",
		cls: "pe-primary pe-chrome-add pe-touch-target",
		attr: { type: "button" },
	});
	add.addEventListener("click", onAddTask);

	if (onBackToProjects) {
		const back = actions.createEl("button", {
			text: "Projects",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		back.addEventListener("click", onBackToProjects);
	}

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

	if (showHideCompleted) {
		mountHideCompletedChip(chips, {
			active: hideCompleted,
			onToggle: () => onHideCompletedToggle?.(),
		});
	}
}
