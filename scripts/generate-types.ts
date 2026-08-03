import * as fs from "node:fs";
import * as path from "node:path";
import {generateTypes} from "../src/database/generateTypes";

const target = path.join(import.meta.dirname, "..", "src", "database", "Database.ts");

fs.writeFileSync(target, generateTypes());

console.log(`Wrote ${target}`);
