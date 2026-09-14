/**
 * Debounce helper for the in-memory indexer and graph recalculation.
 *
 * Rapid vault events (Obsidian Sync, iCloud, bulk renames) must not rebuild
 * entity maps on every `modify` callback — that saturates the UI thread on
 * mobile. Trailing-edge debounce coalesces bursts into a single rebuild.
 */

/**
 * Debounced function with a `cancel()` hook for plugin `onunload`.
 */
export type Debounced<T extends (...args: never[]) => void> = T & {
	cancel: () => void;
};

/**
 * Return a trailing-edge debounced wrapper around `fn`.
 *
 * Uses `globalThis.setTimeout` (Web API). Do not substitute Node `timers`.
 *
 * @param fn - Zero-or-more-arg callback. Called with the latest arguments.
 * @param waitMs - Quiet period before `fn` runs. Settings default is 250ms.
 */
export function debounce<T extends (...args: never[]) => void>(
	fn: T,
	waitMs: number,
): Debounced<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const wrapped = ((...args: Parameters<T>) => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			fn(...args);
		}, waitMs);
	}) as Debounced<T>;

	wrapped.cancel = () => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	return wrapped;
}
