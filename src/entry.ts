// Pure text logic for the Daily Log plugin. No Obsidian imports, so it can be unit tested.

export interface EntryHeader {
	/** 0-based line index of the header line */
	line: number;
	/** YYYY-MM-DD */
	date: string;
}

export interface InsertOptions {
	/** Today's date as YYYY-MM-DD */
	today: string;
	/** Full header line to insert, e.g. "# 2026-11-18 Wednesday 09:13" */
	header: string;
	/** Text placed between "#" and the date in carry tags, e.g. "" → #2026-11-17, "carried/" → #carried/2026-11-17 */
	tagPrefix?: string;
}

export interface InsertResult {
	text: string;
	/** false when an entry for today already existed */
	changed: boolean;
	/** 0-based line where the cursor should go (end of the new entry, or today's existing header) */
	cursorLine: number;
	/** Number of tasks carried over */
	carried: number;
}

// "# 2026-11-06 Friday 09:13", "2026-11-06 Friday 09:13", "## 2026-11-06", "2026-11-06 09:13"
// Also "# 2026-11-17 09:54 Tuesday" (weekday and time in either order)
const HEADER_RE = /^(?:#{1,6}\s+)?(\d{4}-\d{2}-\d{2})(?:\s+(?:[^\s\d]\S*|\d{1,2}:\d{2}))*\s*$/;
// "- foo", "* [ ] foo", "1. foo", and bare "[ ] foo" (checkbox without a bullet)
const LIST_RE = /^(\s*)(?:(?:[-*+]|\d+[.)])\s+(?:\[(.)\]\s*)?|\[(.)\]\s+)(.*)$/;

const splitLines = (text: string) => text.split(/\r?\n/);
const indentWidth = (ws: string) => ws.replace(/\t/g, "    ").length;

export function findEntries(text: string): EntryHeader[] {
	const out: EntryHeader[] = [];
	splitLines(text).forEach((l, i) => {
		const m = HEADER_RE.exec(l);
		if (m) out.push({ line: i, date: m[1] });
	});
	return out;
}

export function addCarryTag(line: string, date: string, tagPrefix = ""): string {
	const tag = `#${tagPrefix}${date}`;
	const escaped = tag.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
	if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(line)) return line;
	return `${line.trimEnd()} ${tag}`;
}

/**
 * Returns the unchecked list items from a section, keeping nested children.
 * - `- [x] …` (or any non-space status) is dropped together with its children.
 * - Plain bullets `* foo` / `- foo` become `- [ ] foo`.
 * - Top-level carried items get a carry tag for `fromDate`.
 * - Lines that aren't inside a list (paragraphs) are not carried.
 */
export function extractOpenTasks(sectionLines: string[], fromDate: string, tagPrefix = ""): string[] {
	const out: string[] = [];
	const stack: { indent: number; skip: boolean }[] = [];

	for (const raw of sectionLines) {
		if (raw.trim() === "") continue;
		const ws = /^\s*/.exec(raw)![0];
		const indent = indentWidth(ws);
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		const parent = stack[stack.length - 1];

		const m = LIST_RE.exec(raw);
		if (m) {
			const status = m[2] ?? m[3];
			const done = status !== undefined && status !== " ";
			const skip = (parent?.skip ?? false) || done;
			const topLevel = !parent;
			stack.push({ indent, skip });
			if (skip) continue;
			// Top-level items and checkboxes become "- [ ] …"; nested plain bullets (links, notes) stay as written
			let line = topLevel || status !== undefined ? `${ws}- [ ] ${m[4].trim()}` : raw.trimEnd();
			if (topLevel) line = addCarryTag(line, fromDate, tagPrefix);
			out.push(line);
		} else if (parent && !parent.skip) {
			// continuation text nested under a carried item
			out.push(raw.trimEnd());
		}
	}
	return out;
}

function frontmatterEnd(lines: string[]): number {
	if (lines[0] !== "---") return 0;
	for (let i = 1; i < lines.length; i++) if (lines[i] === "---") return i + 1;
	return 0;
}

export function insertEntry(text: string, opts: InsertOptions): InsertResult {
	const lines = splitLines(text);
	const entries = findEntries(text);

	const existing = entries.find((e) => e.date === opts.today);
	if (existing) return { text, changed: false, cursorLine: existing.line, carried: 0 };

	// Previous entry = newest date before today
	let prev: EntryHeader | undefined;
	for (const e of entries) if (e.date < opts.today && (!prev || e.date > prev.date)) prev = e;

	let tasks: string[] = [];
	if (prev) {
		const next = entries.find((e) => e.line > prev!.line);
		const section = lines.slice(prev.line + 1, next ? next.line : lines.length);
		tasks = extractOpenTasks(section, prev.date, opts.tagPrefix ?? "");
	}

	const block = [opts.header, "", ...tasks];
	if (tasks.length === 0) block.push("- [ ] ");
	const at = entries.length ? Math.min(...entries.map((e) => e.line)) : frontmatterEnd(lines);

	const before = lines.slice(0, at);
	const after = lines.slice(at);
	const afterIsEmpty = after.every((l) => l.trim() === "");
	const merged = [...before, ...block, ...(afterIsEmpty ? [""] : ["", ...after])];

	return {
		text: merged.join("\n"),
		changed: true,
		cursorLine: at + block.length - 1,
		carried: tasks.length,
	};
}
