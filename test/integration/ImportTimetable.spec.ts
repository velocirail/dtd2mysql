import {afterAll, beforeAll, describe, expect, it} from "vitest";
import config from "../../config";
import {Container} from "../../src/cli/Container";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {Kysely} from "kysely";
import {expectedRows, lastProcessedFile, readTables, tableNames, zipFixture} from "./support";

/**
 * Imports a hand built timetable feed and records every row it wrote.
 *
 * The point of this is the expected rows file. It is the import as it behaves today, so that porting the
 * writer off MySQL can be checked row for row rather than by reading the diff and hoping. Run vitest with
 * -u to update it, and treat any change to it as something to explain rather than accept.
 *
 * The fixture keeps the header and trailer lines the real feeds carry, quirks included. The first row of
 * physical_station is the MSN header, which the file definition reads as a station because the S of
 * FILE-SPEC lands on the interchange status field. That is what the import does today, so it is recorded.
 */
describe("importing the timetable feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    const container = new Container();

    command = await container.getTimetableImportCommand();
    db = container.getKysely();

    await command.doImport(zipFixture("timetable", "RJTTF999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  it("writes the same rows it always has", async () => {
    const rows = await readTables(db, tableNames(config.timetable));

    await expect(rows).toMatchFileSnapshot(expectedRows("timetable.json"));
  });

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJTTF999.ZIP");
  });

});
