import {afterAll, beforeAll, describe, expect, it} from "vitest";
import config from "../../config";
import {Container} from "../../src/cli/Container";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {DatabaseConnection} from "../../src/database/DatabaseConnection";
import {expectedRows, lastProcessedFile, readTables, tableNames, zipFixture} from "./support";

/**
 * Imports the NFM64 feed and records every row it wrote, see generateFixtures.ts for where the feed
 * itself comes from and what it is and is not evidence of.
 *
 * This feed keys its only file on the empty extension, so the file inside the archive has no extension.
 * It also filters on ticket type, which is why the generated line carries a real one.
 */
describe("importing the nfm64 feed", () => {

  let command: ImportFeedCommand;
  let db: DatabaseConnection;

  beforeAll(async () => {
    const container = new Container();

    command = await container.getNFM64ImportCommand();
    db = container.getDatabaseConnection();

    await command.doImport(zipFixture("nfm64", "nfm64.zip"));
  });

  afterAll(async () => {
    await command?.end();
  });

  it("writes the same rows it always has", async () => {
    const rows = await readTables(db, tableNames(config.nfm64));

    await expect(rows).toMatchFileSnapshot(expectedRows("nfm64.json"));
  });

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("nfm64.zip");
  });

});
