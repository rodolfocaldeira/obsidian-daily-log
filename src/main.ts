import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, moment, normalizePath } from "obsidian";
import { around } from "monkey-around";
import { insertEntry } from "./entry";

interface DailyLogSettings {
	filePath: string;
	headingPrefix: string;
	headerFormat: string;
	tagPrefix: string;
	overrideDailyNotes: boolean;
}

const DEFAULT_SETTINGS: DailyLogSettings = {
	filePath: "Daily.md",
	headingPrefix: "# ",
	headerFormat: "YYYY-MM-DD dddd HH:mm",
	tagPrefix: "",
	overrideDailyNotes: true,
};

// Id of Obsidian's core "Daily notes" plugin
const CORE_DAILY_PLUGIN = "daily-notes";

export default class DailyLogPlugin extends Plugin {
	settings!: DailyLogSettings;
	private unpatch: (() => void) | null = null;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("calendar-plus", "Add today's entry to Daily log", () => this.addTodayEntry());
		this.addCommand({
			id: "add-today-entry",
			name: "Add today's entry",
			callback: () => this.addTodayEntry(),
		});
		this.addSettingTab(new DailyLogSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => this.applyOverride());
	}

	onunload() {
		this.removeOverride();
	}

	/**
	 * Redirect the core Daily notes plugin to Daily.md.
	 * Its ribbon icon, "Open today's daily note" command and mobile quick action all call
	 * `instance.onOpenDailyNote()`, which calls `this.getDailyNote()` with no date and opens the
	 * returned file. We wrap `getDailyNote` (undocumented internal API): for "today" we add the entry
	 * and return Daily.md; calls for a specific date (e.g. the date-property link) go to the original.
	 */
	applyOverride() {
		this.removeOverride();
		if (!this.settings.overrideDailyNotes) return;
		const core = (this.app as any).internalPlugins?.getPluginById?.(CORE_DAILY_PLUGIN);
		const instance = core?.instance;
		if (!instance || typeof instance.getDailyNote !== "function") {
			console.warn("Daily Log: core Daily notes plugin not found; use the Daily Log command/icon instead.");
			return;
		}
		const plugin = this;
		this.unpatch = around(instance, {
			getDailyNote: (original: (...args: any[]) => Promise<TFile | null>) =>
				async function (this: unknown, date?: unknown, ...rest: any[]) {
					if (date !== undefined && date !== null) return original.call(this, date, ...rest);
					const prepared = await plugin.prepareTodayEntry();
					if (!prepared) return original.call(this, date, ...rest);
					// Core opens the file after we return; place the cursor once it is shown.
					window.setTimeout(() => plugin.placeCursor(prepared.file, prepared.cursorLine), 150);
					return prepared.file;
				},
		});
	}

	removeOverride() {
		this.unpatch?.();
		this.unpatch = null;
	}

	async getOrCreateFile(): Promise<TFile> {
		const path = normalizePath(this.settings.filePath);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		return this.app.vault.create(path, "");
	}

	/** Adds today's entry to Daily.md (if missing). Returns null on failure. */
	async prepareTodayEntry(): Promise<{ file: TFile; cursorLine: number } | null> {
		try {
			const file = await this.getOrCreateFile();
			const now = moment();
			const header = `${this.settings.headingPrefix}${now.format(this.settings.headerFormat)}`;
			let result = { changed: false, cursorLine: 0, carried: 0 };

			await this.app.vault.process(file, (text) => {
				const r = insertEntry(text, {
					today: now.format("YYYY-MM-DD"),
					header,
					tagPrefix: this.settings.tagPrefix,
				});
				result = r;
				return r.text;
			});

			if (result.changed) {
				new Notice(`Daily log: added today, carried ${result.carried} task${result.carried === 1 ? "" : "s"}`);
			}
			return { file, cursorLine: result.cursorLine };
		} catch (e) {
			console.error("Daily Log:", e);
			new Notice(`Daily log failed: ${(e as Error).message}`);
			return null;
		}
	}

	placeCursor(file: TFile, cursorLine: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== file.path) return;
		const editor = view.editor;
		const line = Math.min(cursorLine, editor.lineCount() - 1);
		editor.setCursor({ line, ch: editor.getLine(line).length });
		editor.scrollIntoView({ from: { line: 0, ch: 0 }, to: { line, ch: 0 } }, true);
		editor.focus();
	}

	async addTodayEntry() {
		const prepared = await this.prepareTodayEntry();
		if (!prepared) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(prepared.file, { state: { mode: "source" } });
		this.placeCursor(prepared.file, prepared.cursorLine);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class DailyLogSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DailyLogPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl)
			.setName("Daily log file")
			.setDesc("Path inside your vault, e.g. Daily.md or Journal/Daily.md")
			.addText((t) => t.setValue(s.filePath).onChange(async (v) => { s.filePath = v.trim() || DEFAULT_SETTINGS.filePath; await save(); }));

		new Setting(containerEl)
			.setName("Heading prefix")
			.setDesc('Put before the date, e.g. "# " for a heading, or empty for a plain line')
			.addText((t) => t.setValue(s.headingPrefix).onChange(async (v) => { s.headingPrefix = v; await save(); }));

		new Setting(containerEl)
			.setName("Header format")
			.setDesc("Moment.js format. Must start with YYYY-MM-DD so entries can be found again.")
			.addText((t) => t.setValue(s.headerFormat).onChange(async (v) => { s.headerFormat = v || DEFAULT_SETTINGS.headerFormat; await save(); }));

		new Setting(containerEl)
			.setName("Carry tag prefix")
			.setDesc('Text between # and the date on carried tasks. Empty gives #2026-11-17, "carried/" gives #carried/2026-11-17.')
			.addText((t) => t.setValue(s.tagPrefix).onChange(async (v) => { s.tagPrefix = v.trim(); await save(); }));

		new Setting(containerEl)
			.setName("Replace core Daily notes command")
			.setDesc("Make Obsidian's Daily notes (ribbon icon, \"Open today's daily note\" command, hotkey, mobile button) add today's entry here instead.")
			.addToggle((t) => t.setValue(s.overrideDailyNotes).onChange(async (v) => {
				s.overrideDailyNotes = v;
				await save();
				this.plugin.applyOverride();
			}));
	}
}
