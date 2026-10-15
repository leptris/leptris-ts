import { readFile, appendFile } from "node:fs/promises";

const pin = JSON.parse(await readFile(new URL("../../engine.json", import.meta.url), "utf8"));
if (
  !/^[\w.-]+\/[\w.-]+$/.test(pin.repository) ||
  !/^[a-f0-9]{40}$/.test(pin.ref) ||
  !/^\d+\.\d+\.\d+$/.test(pin.version)
) {
  throw new Error("engine.json must pin a repository, full commit SHA and engine version");
}
await appendFile(
  process.env.GITHUB_OUTPUT,
  `repository=${pin.repository}\nref=${pin.ref}\nversion=${pin.version}\n`,
);
