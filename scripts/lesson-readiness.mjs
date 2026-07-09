import { parseRoots, printJson } from "./build-tools-lib.mjs";
import { courseHealth } from "./course-health-lib.mjs";

printJson(await courseHealth(parseRoots(process.argv.slice(2))));
