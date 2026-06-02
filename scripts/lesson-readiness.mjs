import { lessonReadiness, parseRoots, printJson } from "./build-tools-lib.mjs";

printJson(await lessonReadiness(parseRoots(process.argv.slice(2))));
