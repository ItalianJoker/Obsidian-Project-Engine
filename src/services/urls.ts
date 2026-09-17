/**
 * URL validation for project links and Microsoft Teams deep links.
 * Uses the browser `URL` parser — never Node's `url` module.
 */

/**
 * True for `http:` / `https:` URLs with a host.
 *
 * @param value - Raw user input (trimmed before parse). Empty / non-URL → false.
 * @returns Whether the browser `URL` parser accepts it as http(s) with a hostname.
 */
export function isValidHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value.trim());
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
	} catch {
		return false;
	}
}

/**
 * True for a Microsoft Teams channel URL or `msteams://` deep link.
 *
 * Accepted forms:
 * - `https://teams.microsoft.com/l/channel/...`
 * - `https://teams.live.com/...`
 * - tenant subdomains (`*.teams.microsoft.com`)
 * - `msteams://...` protocol handler used by the desktop/mobile apps
 */
export function isValidTeamsChannelUrl(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}
	if (trimmed.toLowerCase().startsWith("msteams:")) {
		return trimmed.length > "msteams:".length + 2;
	}
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			return false;
		}
		const host = parsed.hostname.toLowerCase();
		return (
			host === "teams.microsoft.com" ||
			host.endsWith(".teams.microsoft.com") ||
			host === "teams.live.com" ||
			host.endsWith(".teams.live.com")
		);
	} catch {
		return false;
	}
}

/**
 * Open a URL in a new browsing context. Works on desktop and mobile without
 * Electron/`openWithDefaultApp`.
 */
export function openExternalUrl(url: string): void {
	window.open(url, "_blank", "noopener,noreferrer");
}
