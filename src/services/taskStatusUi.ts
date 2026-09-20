/**
 * Shared English copy for task status UI (complete confirm, etc.).
 */

/**
 * Confirmation body when flagging a task completed via checkbox / select.
 *
 * @param taskName — display title (or id fallback)
 * @param completedLabel — Settings label for the completed column (Done / Completato / …)
 */
export function markCompletedConfirmMessage(
	taskName: string,
	completedLabel: string,
): string {
	return `Mark “${taskName}” as completed?\n\nStatus will be set to ${completedLabel}.`;
}
