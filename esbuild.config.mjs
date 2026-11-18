import esbuild from "esbuild";
import builtins from "builtin-modules";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";
// Optional: set OBSIDIAN_PLUGIN_DIR to your <vault>/.obsidian/plugins/daily-log to auto-copy builds there.
const target = process.env.OBSIDIAN_PLUGIN_DIR;

const copyPlugin = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(() => {
      if (!target) return;
      fs.mkdirSync(target, { recursive: true });
      for (const f of ["main.js", "manifest.json"]) fs.copyFileSync(f, path.join(target, f));
      console.log(`Copied main.js + manifest.json to ${target}`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [copyPlugin],
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
