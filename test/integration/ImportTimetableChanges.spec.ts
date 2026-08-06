import {afterAll, beforeAll, describe, expect, it} from "vitest";
import config from "../../config";
import {schedule, stop} from "../../config/timetable/file/MCA";
import {Container} from "../../src/cli/Container";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {DatabaseConnection} from "../../src/database/DatabaseConnection";
import {expectedRows, lastProcessedFile, readTables, tableNames, zipFixture} from "./support";

/**
 * Applies a changes file on top of a full refresh.
 *
 * A full refresh only ever inserts. The revise and withdraw actions, which are the REPLACE INTO and the
 * DELETE in MySQLTable, only happen here, and so does removing the stop times a withdrawn schedule
 * leaves behind. Without this the two SQL statements the port has to replace would never run.
 *
 * The recorded rows include one thing worth knowing before reading them. Schedule identifiers are handed
 * out in memory rather than by the database, and only the schedule counter is restored from the schedule
 * table at the start of an import. The stop time counter is not, so the revised stops are numbered from
 * one again, collide with the stop times already in the table and are dropped by the INSERT IGNORE. The
 * originals are then removed as orphans. That is what the import does today, so it is what is recorded.
 */
describe("applying a timetable changes file", () => {

  let command: ImportFeedCommand;
  let db: DatabaseConnection;

  beforeAll(async () => {
    await refresh();

    // the changes file is a separate run of the CLI, where the in memory identifiers start again
    schedule.lastId = 0;
    stop.lastId = 0;

    const container = new Container();

    command = await container.getTimetableImportCommand();
    db = container.getDatabaseConnection();

    await command.doImport(zipFixture("timetable-changes", "RJTTC999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  it("writes the same rows it always has", async () => {
    const rows = await readTables(db, tableNames(config.timetable));

    await expect(rows).toMatchFileSnapshot(expectedRows("timetable-changes.json"));
  });

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJTTC999.ZIP");
  });

});

/**
 * Import the full refresh the changes are applied to, on its own connections so that closing it down
 * leaves nothing behind for the import that follows
 */
async function refresh(): Promise<void> {
  const container = new Container();
  const full = await container.getTimetableImportCommand();

  await full.doImport(zipFixture("timetable", "RJTTF999.ZIP"));
  await full.end();
}
