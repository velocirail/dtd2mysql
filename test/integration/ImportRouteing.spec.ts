import {afterAll, beforeAll, describe, expect, it} from "vitest";
import config from "../../config";
import {Container} from "../../src/cli/Container";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {Kysely} from "kysely";
import {expectedRows, lastProcessedFile, readTables, tableNames, zipFixture} from "./support";

/**
 * Imports the routeing guide and records every row it wrote, see generateFixtures.ts for where the feed
 * itself comes from and what it is and is not evidence of.
 *
 * The routeing guide and the fares feed both define a location table, and each import drops and recreates
 * its own tables, so whichever ran last owns it. That is why the rows are read straight after the import.
 */
describe("importing the routeing feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    const container = new Container();

    command = await container.getRouteingImportCommand();
    db = container.getKysely();

    await command.doImport(zipFixture("routeing", "RJRGF999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  it("writes the same rows it always has", async () => {
    const rows = await readTables(db, tableNames(config.routeing));

    await expect(rows).toMatchFileSnapshot(expectedRows("routeing.json"));
  });

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJRGF999.ZIP");
  });

});
