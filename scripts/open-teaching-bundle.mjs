import { openTeachingBundle, parseRoots, printJson } from "./build-tools-lib.mjs";

printJson(await openTeachingBundle(parseRoots(process.argv.slice(2))));
