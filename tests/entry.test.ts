import { describe, expect, it } from "vitest";
import { addCarryTag, extractOpenTasks, findEntries, insertEntry } from "../src/entry";

const SAMPLE = `2026-11-06 Friday 09:13

* Write the weekly review
* 💪 Gym session
* Read article https://example.com/abc
`;

describe("findEntries", () => {
	it("finds headed and legacy headers", () => {
		const text = "# 2026-11-07 Saturday 08:00\n- [ ] a\n\n2026-11-06 Friday 09:13\n* b\n## 2026-11-05\nNot 2026-11-04 a header";
		expect(findEntries(text)).toEqual([
			{ line: 0, date: "2026-11-07" },
			{ line: 3, date: "2026-11-06" },
			{ line: 5, date: "2026-11-05" },
		]);
	});
	it("accepts time before weekday", () => {
		expect(findEntries("# 2026-11-17 09:54 Tuesday\n# 2026-11-15 Sunday ")).toEqual([
			{ line: 0, date: "2026-11-17" },
			{ line: 1, date: "2026-11-15" },
		]);
	});
});

describe("addCarryTag", () => {
	it("appends once", () => {
		expect(addCarryTag("- [ ] a", "2026-11-06")).toBe("- [ ] a #2026-11-06");
		expect(addCarryTag("- [ ] a #2026-11-06", "2026-11-06")).toBe("- [ ] a #2026-11-06");
	});
	it("accumulates across days", () => {
		expect(addCarryTag("- [ ] a #2026-11-06", "2026-11-07")).toBe("- [ ] a #2026-11-06 #2026-11-07");
	});
	it("supports a prefix", () => {
		expect(addCarryTag("- [ ] a", "2026-11-06", "carried/")).toBe("- [ ] a #carried/2026-11-06");
	});
});

describe("extractOpenTasks", () => {
	it("keeps unchecked, drops checked with children, keeps nested open items", () => {
		const section = [
			"- [ ] open",
			"  - [ ] sub open",
			"  - [x] sub done",
			"- [x] done",
			"  - [ ] child of done",
			"Some paragraph",
			"* legacy bullet",
			"\t- tab child",
			"- [-] cancelled",
		];
		expect(extractOpenTasks(section, "2026-11-06")).toEqual([
			"- [ ] open #2026-11-06",
			"  - [ ] sub open",
			"- [ ] legacy bullet #2026-11-06",
			"\t- tab child",
		]);
	});
	it("treats a bare [ ] line as a task and keeps its children with it", () => {
		const section = ["[ ] Explore these websites", "  - https://example.com/a", "[x] done bare", "  - https://example.com/b"];
		expect(extractOpenTasks(section, "2026-11-17")).toEqual([
			"- [ ] Explore these websites #2026-11-17",
			"  - https://example.com/a",
		]);
	});
});

describe("insertEntry", () => {
	const opts = { today: "2026-11-18", header: "# 2026-11-18 Wednesday 09:13" };

	it("converts the user's sample and puts the new entry on top", () => {
		const r = insertEntry(SAMPLE, opts);
		expect(r.changed).toBe(true);
		expect(r.carried).toBe(3);
		expect(r.text).toBe(
			`# 2026-11-18 Wednesday 09:13

- [ ] Write the weekly review #2026-11-06
- [ ] 💪 Gym session #2026-11-06
- [ ] Read article https://example.com/abc #2026-11-06

` + SAMPLE,
		);
		expect(r.cursorLine).toBe(4);
	});

	it("accumulates tags over two carries", () => {
		const day1 = insertEntry(SAMPLE, { today: "2026-11-07", header: "# 2026-11-07 Saturday 09:00" }).text;
		const day2 = insertEntry(day1, { today: "2026-11-08", header: "# 2026-11-08 Sunday 09:00" }).text;
		expect(day2.split("\n")[2]).toBe("- [ ] Write the weekly review #2026-11-06 #2026-11-07");
	});

	it("skips completed tasks from the previous day", () => {
		const text = "# 2026-11-17 Tuesday 08:00\n\n- [x] done\n- [ ] todo\n";
		const r = insertEntry(text, opts);
		expect(r.text.startsWith("# 2026-11-18 Wednesday 09:13\n\n- [ ] todo #2026-11-17\n\n# 2026-11-17")).toBe(true);
	});

	it("does nothing when today's entry exists", () => {
		const text = "# 2026-11-18 Wednesday 07:00\n\n- [ ] x\n";
		const r = insertEntry(text, opts);
		expect(r.changed).toBe(false);
		expect(r.text).toBe(text);
	});

	it("handles an empty file", () => {
		const r = insertEntry("", opts);
		expect(r.text).toBe("# 2026-11-18 Wednesday 09:13\n\n- [ ] \n");
		expect(r.carried).toBe(0);
	});

	it("keeps frontmatter and text above the first entry in place", () => {
		const text = "---\ntags: log\n---\n# 2026-11-17 Tuesday\n- [ ] a\n";
		const r = insertEntry(text, opts);
		expect(r.text).toBe("---\ntags: log\n---\n# 2026-11-18 Wednesday 09:13\n\n- [ ] a #2026-11-17\n\n# 2026-11-17 Tuesday\n- [ ] a\n");
	});
});
