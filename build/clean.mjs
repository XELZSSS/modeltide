import fs from "node:fs";

fs.rmSync("dist", { recursive: true, force: true });
fs.rmSync("functions/api/[[route]].js", { force: true });
