# CLAUDE.md — Daily Log (Obsidian plugin)

An Obsidian plugin for desktop and iPhone. It keeps one running `Daily.md` with the newest day at the top. When the user opens today's daily note, it:

1. Inserts a header like `# 2026-11-18 Wednesday 09:13` at the top of the file. It goes above the first dated entry, so any intro text and frontmatter stay first.
2. Copies the **unchecked** tasks from the previous entry into it. Each copied top-level task gets a tag for the date it came from (`#2026-11-17`). A task carried over several days collects several tags.
3. Leaves the previous entry untouched.

This repo is public. Don't add the owner's vault name, local paths or note contents here; those stay in the owner's private notes, outside this repo.

## Commands

```bash
npm install
npm test          # vitest unit tests for src/entry.ts
npm run build     # tsc --noEmit + esbuild → main.js
npm run dev       # esbuild watch mode
```

Install into a vault (a synced vault then carries it to the iPhone):

```bash
cp main.js manifest.json "<vault>/.obsidian/plugins/daily-log/"
```

Alternatively, set `OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/daily-log"` and `npm run build` / `npm run dev` copies the files there automatically.
After installing, the user has to reload the plugin in Obsidian: Settings → Community plugins → turn Daily Log off and on again.

## Layout

- `src/entry.ts`: **pure text logic**, with no Obsidian imports. It handles finding entry headers, extracting open tasks, adding carry tags and inserting the new entry. All behaviour changes to the text format belong here, together with a test.
- `src/main.ts`: the Obsidian side: the plugin class, ribbon icon, command, settings tab, and the override of the core Daily notes plugin.
- `tests/entry.test.ts`: vitest tests, including cases taken from the user's real file.
- `manifest.json`: `isDesktopOnly: false`. This must stay false for the plugin to work on iPhone.
- `esbuild.config.mjs`: bundles to CommonJS `main.js`, with `obsidian` treated as external.

## Rules

- **No Node or Electron APIs in `src/`.** The plugin must run on iOS. Use only `app.vault` and `app.workspace`, and take `moment` from `obsidian`.
- Edit `Daily.md` only through `app.vault.process()`. It is atomic and safe with sync.
- Running the plugin twice on the same day must not change the file. If an entry for today exists, it only opens the file.
- Before changing parsing logic, dry-run it against a **copy** of a real `Daily.md` in a scratch folder (outside the repo), never against the original, and never commit it.

## Behaviour details (src/entry.ts)

- **Entry headers**
  - Optional `#`–`######` prefix, then `YYYY-MM-DD`, then any mix of weekday words and `HH:mm` in either order.
  - These all match: `# 2026-11-17 09:54 Tuesday`, `# 2026-11-15 Sunday `, `2026-11-06 Friday 09:13`.
  - Any other text on the line means it isn't a header.
- **Previous entry:** the newest date before today, even if days were skipped.
- **Which lines count as tasks**
  - Recognised list items: `- foo`, `* foo`, `+ foo`, `1. foo`, `- [ ] foo`, and a bare `[ ] foo` with no bullet.
  - A done item (any status other than a space, such as `[x]` or `[-]`) is dropped together with all of its children.
  - Lines outside a list, such as paragraphs, are not carried.
- **How carried lines are written**
  - Top-level items and checkbox items become `- [ ] text`.
  - Nested plain bullets (links, notes) stay as written.
  - Only top-level items get the carry tag.
- **Indentation:** tabs count as 4 spaces when working out what is nested under what. The user's file mixes tabs and spaces.
- **Empty previous day:** if nothing is carried over, the new entry gets an empty `- [ ] ` placeholder line.

## How the core Daily notes override works (src/main.ts)

The core Daily notes plugin starts everything from `instance.onOpenDailyNote()`: its ribbon icon, the `daily-notes` command (and its hotkey), and the mobile quick action. That method then calls `this.getDailyNote()` with no date argument.

The plugin uses `monkey-around` to wrap `app.internalPlugins.getPluginById('daily-notes').instance.getDailyNote`:

- **No date argument:** it runs `prepareTodayEntry()` and returns the `Daily.md` file. The core plugin then opens that file itself, and the plugin places the cursor after a 150 ms delay.
- **A date argument** (for example the link on a date property): it calls the original method.

This relies on undocumented internals, so there is a settings toggle to turn it off, and `onunload` removes the wrapper.

## TODO

### Done
* [X] plan the feature with the user: checkboxes mark completion, old bullets count as open tasks, carried items get date tags, the previous entry stays unchanged, replace core Daily notes, own repo
* [X] set up the repo with TypeScript, esbuild, vitest and monkey-around
* [X] write the text logic in `src/entry.ts`: find entries, extract open tasks, add carry tags, insert today's entry
* [X] add the settings tab: file path, heading prefix, header format, carry-tag prefix, override toggle
* [X] add the plugin's own ribbon icon and the "Add today's entry" command
* [X] write 13 unit tests, all passing
* [X] dry-run against a copy of a real `Daily.md`
* [X] fix headers with the time before the weekday (`# 2026-11-17 09:54 Tuesday`)
* [X] treat bare `[ ] text` lines as tasks and keep their child links with them
* [X] keep nested plain bullets (links, notes) as written instead of turning them into checkboxes
* [X] install into the owner's vault and enable it
* [X] replace the broken command-callback override with a hook on the core plugin's `getDailyNote`
* [X] write the README with install steps for desktop and iPhone
* [X] write this CLAUDE.md

### Still open
* [ ] check the new override in Obsidian on the Mac, then on the iPhone
* [ ] see the first real carry-over on 2026-11-19 and check the tags and nesting
* [ ] confirm that `#2026-11-17` shows up as a tag in Obsidian; if not, change the default carry-tag prefix (e.g. `carried/`)
* [ ] re-apply the override if Daily Notes is turned on after the plugin loads
* [ ] make the cursor placement more reliable than the 150 ms delay (e.g. a one-off `file-open` listener)
* [ ] decide whether new headers should match the old order (`YYYY-MM-DD HH:mm dddd`)
* [X] commit and push to the public GitHub repo
* [ ] optional: add `versions.json` and a GitHub release for sharing or BRAT installs

## Findings and learnings

- **The core Daily notes plugin can't be overridden through the command registry.** The core plugin registers its command with `callback: this.onOpenDailyNote.bind(this)`. Its ribbon item and mobile quick action use their own bound copies of the same method, so patching the command object misses all of them. The common point is the unbound call `this.getDailyNote()` inside `onOpenDailyNote`; patch that on the instance.
- **How the core plugin was inspected:** with `strings`/`grep` on `~/Library/Application Support/obsidian/obsidian-<version>.asar`. The newest asar there is the one in use; the copy in `/Applications/Obsidian.app` can be older. Obsidian 1.15.1 was the version checked. A future Obsidian update could rename these internals, so re-check if the override stops working.
- **The real file doesn't match the sample.** The sample pasted in chat was cleaner than the actual `Daily.md`, which has:
  - time before weekday in headers, and trailing spaces
  - bare `[ ]` tasks with no bullet
  - tabs and spaces mixed for nesting
  - free text above the first entry

  Always test against a copy of the real file.
- **Nested sub-bullets are usually links or notes, not sub-tasks.** Turning them into checkboxes added clutter, so only top-level items and existing checkboxes are normalised to `- [ ]`.
- **Carrying tasks also carries whatever is in them.** Anything inside an unchecked task, including its nested lines, gets copied into every new day. Secrets don't belong in tasks.
- **Running vitest outside the repo:** `--root /` failed with EPERM while scanning `/Library`. For quick scripts against `src/entry.ts`, bundle with `npx esbuild <script>.ts --bundle --platform=node` and run the result with `node`.
- **The plugin reaches the iPhone through the vault itself.** In a synced vault (iCloud, or Obsidian Sync with plugin sync on), `.obsidian/plugins/daily-log` syncs like any other folder, so no separate install step is needed. It still has to be enabled on each device, and community plugins have to be turned on there.
