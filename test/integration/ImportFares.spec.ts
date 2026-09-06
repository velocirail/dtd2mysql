import {afterAll, beforeAll, describe, expect, it} from "vitest";
import config from "../../config";
import {Container} from "../../src/cli/Container";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {Kysely} from "kysely";
import {expectedRows, lastProcessedFile, readTables, tableNames, zipFixture} from "./support";

/**
 * Imports the fares feed and records every row it wrote, see generateFixtures.ts for where the feed
 * itself comes from and what it is and is not evidence of.
 */
describe("importing the fares feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    const container = new Container();

    command = await container.getFaresImportCommand();
    db = container.getKysely();

    await command.doImport(zipFixture("fares", "RJFAF999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  it("writes the same rows it always has", async () => {
    const rows = await readTables(db, tableNames(config.fares));

    await expect(rows).toMatchFileSnapshot(expectedRows("fares.json"));
  });

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJFAF999.ZIP");
  });

});
