/**
 * Pointer- and HTML5-based drag-and-drop helpers for the task Board (Kanban).
 *
 * Desktop prefers HTML5 DnD. Touch / small screens use a pointer-capture drag
 * from a dedicated handle (≥ 44×44px). Status selects remain as an accessible
 * fallback when DnD is awkward (narrow viewports).
 *
 * Persistence is the caller's job (typically {@link PersistStatusCommand} via
 * `vault.process`). Column ids are Settings-driven strings (`taskStatuses`).
 */


const DRAG_MIME = "application/x-projects-engine-task";

/**
 * Payload carried while dragging a Kanban card.
 */
export interface KanbanDragPayload {
	taskId: string;
	fromStatus: string;
}

/**
 * Options for wiring a card + column pair.
 */
export interface KanbanDnDOptions {
	/** Task id encoded into the drag payload. */
	taskId: string;
	/** Current column status. */
	fromStatus: string;
	/** Called when the card is dropped onto a different column. */
	onDrop: (taskId: string, toStatus: string) => void;
	/**
	 * When true, HTML5 DnD is enabled on the card body.
	 * Disable on very small screens if preferred — pointer handle still works.
	 */
	enableHtml5: boolean;
}

/**
 * Make `card` draggable and `column` a drop target for board status moves.
 *
 * @param card - Kanban card element.
 * @param column - Column element that owns `data-status`.
 * @param handle - Optional drag handle (recommended for touch).
 * @param options - Ids and drop callback.
 */
export function wireKanbanCardDnD(
	card: HTMLElement,
	column: HTMLElement,
	handle: HTMLElement | null,
	options: KanbanDnDOptions,
): void {
	const status = column.dataset.status as string | undefined;
	if (!status) {
		return;
	}

	card.dataset.taskId = options.taskId;
	card.dataset.fromStatus = options.fromStatus;

	if (options.enableHtml5) {
		card.draggable = true;
		card.addEventListener("dragstart", (event) => {
			const payload: KanbanDragPayload = {
				taskId: options.taskId,
				fromStatus: options.fromStatus,
			};
			event.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
			event.dataTransfer?.setData("text/plain", options.taskId);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
			}
			card.addClass("is-dragging");
		});
		card.addEventListener("dragend", () => {
			card.removeClass("is-dragging");
			clearColumnHighlights(column.parentElement);
		});
	}

	// Pointer-based drag (touch + mouse) from the handle, or the card if no handle.
	const grip = handle ?? card;
	let active = false;
	let ghost: HTMLElement | null = null;
	let startX = 0;
	let startY = 0;
	let pointerId: number | null = null;

	const onPointerDown = (event: PointerEvent): void => {
		// Ignore primary button only; leave right-click / stylus eraser alone.
		if (event.button !== 0) {
			return;
		}
		// Don't start a drag from nested buttons (Edit / status fallback).
		const target = event.target;
		if (target instanceof HTMLElement && target.closest("button")) {
			return;
		}
		active = true;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		grip.setPointerCapture(event.pointerId);
		card.addClass("is-dragging");
	};

	const onPointerMove = (event: PointerEvent): void => {
		if (!active || pointerId !== event.pointerId) {
			return;
		}
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (!ghost && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
			ghost = card.cloneNode(true) as HTMLElement;
			ghost.addClass("pe-kanban-ghost");
			ghost.style.width = `${card.offsetWidth}px`;
			document.body.appendChild(ghost);
		}
		if (ghost) {
			ghost.style.transform = `translate(${event.clientX - 20}px, ${event.clientY - 20}px)`;
		}
		highlightColumnUnder(event.clientX, event.clientY, column.parentElement);
	};

	const onPointerUp = (event: PointerEvent): void => {
		if (!active || pointerId !== event.pointerId) {
			return;
		}
		active = false;
		pointerId = null;
		card.removeClass("is-dragging");
		ghost?.remove();
		ghost = null;
		clearColumnHighlights(column.parentElement);

		const el = document.elementFromPoint(event.clientX, event.clientY);
		const targetColumn = el instanceof HTMLElement ? el.closest(".pe-kanban-column") : null;
		const toStatus = targetColumn instanceof HTMLElement
			? (targetColumn.dataset.status as string | undefined)
			: undefined;
		if (toStatus && toStatus !== options.fromStatus) {
			options.onDrop(options.taskId, toStatus);
		}
		try {
			grip.releasePointerCapture(event.pointerId);
		} catch {
			// Pointer may already be released on some mobile WebViews.
		}
	};

	grip.addEventListener("pointerdown", onPointerDown);
	grip.addEventListener("pointermove", onPointerMove);
	grip.addEventListener("pointerup", onPointerUp);
	grip.addEventListener("pointercancel", onPointerUp);
}

/**
 * Register HTML5 drop handlers on a Kanban column.
 */
export function wireKanbanColumnDrop(
	column: HTMLElement,
	status: string,
	onDrop: (taskId: string, toStatus: string) => void,
): void {
	column.dataset.status = status;

	column.addEventListener("dragover", (event) => {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
		column.addClass("is-drop-target");
	});
	column.addEventListener("dragleave", () => {
		column.removeClass("is-drop-target");
	});
	column.addEventListener("drop", (event) => {
		event.preventDefault();
		column.removeClass("is-drop-target");
		const raw =
			event.dataTransfer?.getData(DRAG_MIME) ||
			event.dataTransfer?.getData("text/plain") ||
			"";
		let taskId = raw;
		let fromStatus: string | null = null;
		try {
			const parsed = JSON.parse(raw) as KanbanDragPayload;
			if (parsed?.taskId) {
				taskId = parsed.taskId;
				fromStatus = parsed.fromStatus;
			}
		} catch {
			// Plain text fallback: task id only.
		}
		if (!taskId) {
			return;
		}
		if (fromStatus && fromStatus === status) {
			return;
		}
		onDrop(taskId, status);
	});
}

function highlightColumnUnder(x: number, y: number, board: Element | null): void {
	if (!board) return;
	clearColumnHighlights(board);
	const el = document.elementFromPoint(x, y);
	const column = el instanceof HTMLElement ? el.closest(".pe-kanban-column") : null;
	if (column instanceof HTMLElement) {
		column.addClass("is-drop-target");
	}
}

function clearColumnHighlights(board: Element | null): void {
	if (!board) return;
	board.querySelectorAll(".pe-kanban-column.is-drop-target").forEach((el) => {
		el.removeClass("is-drop-target");
	});
}
