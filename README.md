# Daily Log (Obsidian plugin)

Keeps one running `Daily.md`, newest day on top. Each time you open today's daily note it:

1. Adds `# 2026-11-18 Wednesday 09:13` at the top of `Daily.md`.
2. Copies the **unchecked** tasks (`- [ ]`) from the previous entry, tagged with the day they came from (`#2026-11-17`). A task carried over several days collects several tags.
3. Leaves the previous entry untouched. Checked tasks (`- [x]`) stay behind.

Plain `*` / `-` bullets from older entries count as open tasks and become `- [ ]` when they are carried over. Running it twice on the same day only opens the file.

## Install

The plugin is just two files: `main.js` and `manifest.json`.

### Desktop
1. Build: `npm install && npm run build`
2. Copy `main.js` and `manifest.json` to `<your vault>/.obsidian/plugins/daily-log/`
   (or build straight into it: `OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/daily-log" npm run build`)
3. Obsidian → Settings → Community plugins → turn off Restricted mode if needed → enable **Daily Log**.

### iPhone
If your vault syncs with iCloud or Obsidian Sync (with "Installed community plugins" sync enabled), the plugin folder reaches the phone automatically. Open Obsidian on the phone → Settings → Community plugins → enable **Daily Log**.

## Use
- Obsidian's core Daily notes plugin is redirected to `Daily.md`: its ribbon icon, the **"Open today's daily note"** command, its hotkey and the mobile quick action all add today's entry. You can turn this off in the plugin settings. The core Daily notes plugin must stay enabled for this.
- The plugin also adds its own ribbon icon (calendar with a +) and the command **"Daily Log: Add today's entry"**, which work even with core Daily notes disabled.

## Settings
- **Daily log file**: default `Daily.md`
- **Heading prefix**: default `# `
- **Header format**: default `YYYY-MM-DD dddd HH:mm` (must start with the date)
- **Carry tag prefix**: default empty → `#2026-11-17`; `carried/` → `#carried/2026-11-17`
- **Replace core Daily notes command**: default on

## Develop
`npm test` runs the unit tests for the text logic in `src/entry.ts`.
