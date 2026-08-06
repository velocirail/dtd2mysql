import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Container} from "../../src/cli/Container";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {CIFRepository} from "../../src/gtfs/repository/CIFRepository";
import {stationCoordinates} from "../../config/gtfs/station-coordinates";
import {expectedRows, zipFixture} from "./support";

/**
 * Records what the GTFS queries return for the timetable fixture.
 *
 * These are the last queries that still speak to one database directly, so this is the same safety net
 * the import has: the rows are recorded as they are today, and porting the queries has to leave them
 * alone. Run vitest with -u to update it, and treat any change as something to explain.
 *
 * The date is pinned because the queries only return schedules that are running, so what comes back
 * would otherwise depend on the day the test was run.
 */
const today = Temporal.PlainDate.from("2025-07-01");

describe("the GTFS queries", () => {

  let command: ImportFeedCommand;
  let repository: CIFRepository;

  beforeAll(async () => {
    const container = new Container();

    command = await container.getTimetableImportCommand();

    await command.doImport(zipFixture("timetable", "RJTTF999.ZIP"));

    repository = new CIFRepository(
      container.getDatabaseConnection(),
      container.getDatabaseStream(),
      stationCoordinates,
      today
    );
  });

  // the repository and the import share the pools Container hands out, so they are closed once
  afterAll(async () => {
    await repository?.end();
  });

  it("returns the same rows it always has", async () => {
    const [transfers, stops, associations, fixedLinks, schedules] = await Promise.all([
      repository.getTransfers(),
      repository.getStops(),
      repository.getAssociations(),
      repository.getFixedLinks(),
      repository.getSchedules("3 MONTH")
    ]);

    const results = {
      transfers,
      stops,
      associations,
      fixedLinks,
      // the schedules carry their own classes, so they are reduced to what the queries decided
      schedules: schedules.schedules.map(schedule => ({
        id: schedule.id,
        tuid: schedule.tuid,
        rsid: schedule.rsid,
        stp: schedule.stp,
        mode: schedule.mode,
        operator: schedule.operator,
        calendar: schedule.calendar.runsFrom.toString() + " to " + schedule.calendar.runsTo.toString(),
        stops: schedule.stopTimes.map(stop => [stop.stop_id, stop.arrival_time, stop.departure_time])
      }))
    };

    await expect(JSON.stringify(results, null, 2))
      .toMatchFileSnapshot(expectedRows("gtfs-queries.json"));
  });

});
