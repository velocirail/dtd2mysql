import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import gtfsSchema from "../../config/gtfs/schema";
import {stationCoordinates} from "../../config/gtfs/station-coordinates";
import {Container} from "../../src/cli/Container";
import {GTFSImportCommand} from "../../src/cli/GTFSImportCommand";
import {OutputGTFSCommand} from "../../src/cli/OutputGTFSCommand";
import {CIFRepository} from "../../src/gtfs/repository/CIFRepository";
import {FileOutput} from "../../src/gtfs/output/FileOutput";
import {expectedRows, readTables, zipFixture} from "./support";

/**
 * Writes the GTFS files out of the timetable fixture and loads them straight back in.
 *
 * Every column of every file makes the round trip, which is what says the tables still describe what the
 * output writes. The mapping was a list of column names inside a LOAD DATA statement, and stops.txt had
 * drifted from it: the file has stop_lat and stop_lon at the end, the statement expected them fifth and
 * sixth, so the coordinates arrived in the zone and url columns.
 *
 * The date is pinned because the output only includes schedules that are running.
 */
const today = Temporal.PlainDate.from("2025-07-01");

describe("importing the GTFS files", () => {

  let command: GTFSImportCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dtd-gtfs"));
    const container = new Container();
    const feed = await container.getTimetableImportCommand();

    await feed.doImport(zipFixture("timetable", "RJTTF999.ZIP"));

    const repository = new CIFRepository(container.getKysely(), stationCoordinates, today);

    // writing the files closes the connection they were read through, so the load opens its own
    await new OutputGTFSCommand(repository, new FileOutput()).run(["", "", "", directory]);

    const loader = new Container();

    command = await loader.getImportGTFSCommand();
    db = loader.getKysely();

    await command.doImport(directory);
  });

  afterAll(async () => {
    await command?.end();
  });

  it("loads the same rows it always has", async () => {
    const tables = Object.keys(gtfsSchema).sort();
    const rows = await readTables(db, tables, table => orderOf(table));

    await expect(rows).toMatchFileSnapshot(expectedRows("gtfs-import.json"));
  });

});

/**
 * The key of the table, or every column of it for links, which the specification does not key
 */
function orderOf(table: string): readonly string[] {
  const declared = gtfsSchema[table as keyof typeof gtfsSchema];

  return declared.primaryKey.length > 0 ? declared.primaryKey : Object.keys(declared.columns);
}
