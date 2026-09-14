/**
 * Project ID pattern interpolation.
 *
 * Pattern tokens (all UTC, matching scheduler date math):
 * - `YYYY` four-digit year
 * - `YY` two-digit year
 * - `MM` month
 * - `DD` day
 * - a run of `#` characters → zero-padded counter (`###` + 7 → `007`)
 *
 * Example: `PRJ-YYYY-###` on 2026-09-14 with counter 1 → `PRJ-2026-001`.
 */

/**
 * Interpolate `pattern` with the given counter and clock.
 */
export function formatProjectId(pattern: string, counter: number, now: Date = new Date()): string {
	const year = now.getUTCFullYear().toString().padStart(4, "0");
	const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
	const day = now.getUTCDate().toString().padStart(2, "0");

	let result = pattern
		.replace(/YYYY/g, year)
		.replace(/YY/g, year.slice(-2))
		.replace(/MM/g, month)
		.replace(/DD/g, day);

	const hashes = /#+/.exec(result);
	if (hashes) {
		const width = hashes[0].length;
		const padded = Math.max(0, Math.floor(counter)).toString().padStart(width, "0");
		result = result.replace(/#+/, padded);
	}

	return result;
}

/**
 * Advance the counter until `isTaken` returns false, capping at `maxAttempts`
 * to avoid an infinite loop on a misconfigured vault.
 */
export function nextAvailableProjectId(
	pattern: string,
	startCounter: number,
	isTaken: (id: string) => boolean,
	now: Date = new Date(),
	maxAttempts = 1000,
): { id: string; nextCounter: number } {
	let counter = startCounter;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const id = formatProjectId(pattern, counter, now);
		if (!isTaken(id)) {
			return { id, nextCounter: counter + 1 };
		}
		counter += 1;
	}
	throw new Error("Unable to allocate a unique project id; check the ID pattern and vault contents");
}
