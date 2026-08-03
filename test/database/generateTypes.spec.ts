import {describe, it, expect} from 'vitest';
import * as fs from "node:fs";
import * as path from "node:path";
import {generateTypes} from "../../src/database/generateTypes";
import {feedRecords} from "./records";

describe("generateTypes", () => {

  it("matches the checked in Database.ts", () => {
    const generated = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "src", "database", "Database.ts"), "utf8");

    // if this fails a feed definition has changed, run npm run generate-types
    expect(generateTypes()).to.equal(generated);
  });

  it("has an entry for every table the importer creates", () => {
    const types = generateTypes();

    for (const record of feedRecords()) {
      expect(types).to.contain(`  ${record.name}: `);
    }

    expect(types).to.contain("  log: Log;");
  });

  it("types dates and times as strings and booleans as numbers", () => {
    const types = generateTypes();

    // schedule.runs_from is a date, monday is a boolean and the feed parses it to 1 or 0
    expect(types).to.contain("  runs_from: string;");
    expect(types).to.contain("  monday: number;");
  });

  it("marks the surrogate key as generated", () => {
    expect(generateTypes()).to.contain("  id: Generated<number>;");
  });

});
