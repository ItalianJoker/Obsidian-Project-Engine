/**
 * Compatibility re-exports — Portfolio leaf is now the Dashboard.
 * Kept so older docs/imports resolve during the UX rebase.
 */

export {
	DASHBOARD_VIEW_TYPE,
	DASHBOARD_VIEW_TYPE as PORTFOLIO_VIEW_TYPE,
	DashboardView,
	DashboardView as PortfolioView,
	activatePortfolioView,
	findProjectRow,
	loadProjectRows,
	type ProjectRow,
} from "./DashboardView";
