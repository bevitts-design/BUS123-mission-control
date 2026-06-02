import { parseRoots, printJson, validatePublicMaterials } from "./build-tools-lib.mjs";

printJson(await validatePublicMaterials(parseRoots(process.argv.slice(2))));
