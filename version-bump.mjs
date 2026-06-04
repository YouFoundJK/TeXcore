import { readFileSync, writeFileSync, copyFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

// Copy manifest.json to the Obsidian plugin directory
try {
  copyFileSync(
    "manifest.json",
    "../plugin-full-calendar/obsidian-dev-vault/.obsidian/plugins/Latex-like-equations/manifest.json"
  );
} catch (e) {
  console.warn("Could not copy manifest.json during version bump:", e.message);
}
