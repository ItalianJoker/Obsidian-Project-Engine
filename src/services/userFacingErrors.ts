/**
 * @file userFacingErrors.ts
 * @purpose Map known technical Error.message strings to English Notices.
 * @usedBy Archive / create / save catch paths
 */

/**
 * Turn a thrown value into a short English Notice body.
 * Known archive/path collisions get friendly copy; unknowns stay as message text.
 */
export function userFacingErrorMessage(
	error: unknown,
	fallback = "Something went wrong",
): string {
	const raw = error instanceof Error ? error.message : String(error);
	const trimmed = raw.trim();
	if (!trimmed) {
		return fallback;
	}

	if (/^Archive destination already exists:/i.test(trimmed)) {
		return "Could not archive: a folder or note with that name already exists in the archive. Rename or remove the conflict, then try again.";
	}
	if (/^Unarchive destination already exists:/i.test(trimmed)) {
		return "Could not unarchive: a folder or note with that name already exists under Projects. Rename or remove the conflict, then try again.";
	}
	if (/already exists/i.test(trimmed) && /archive/i.test(trimmed)) {
		return "Could not complete archive: destination already exists. Rename or remove the conflict, then try again.";
	}
	if (/Project ID .+ is already in use/i.test(trimmed)) {
		return trimmed;
	}
	if (/Folder not found|File not found|Path not found/i.test(trimmed)) {
		return "Could not find that folder or note in the vault. Refresh and try again.";
	}

	return trimmed;
}
