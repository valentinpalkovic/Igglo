import { readFile } from "node:fs/promises";
import { attachWebMCP } from "@iglo/webmcp-adapter/driver";
export async function probe(path) {
    const text = await readFile(path, "utf8");
    return `${attachWebMCP().browserName}:${text.length}`;
}
//# sourceMappingURL=index.js.map