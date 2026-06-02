import { parseRoots, printJson, regeneratePublicIndex } from "./build-tools-lib.mjs";

printJson(await regeneratePublicIndex(parseRoots(process.argv.slice(2))));
