import {Writable} from "stream";
import {describe, it, expect, afterEach} from "vitest";
import {DEFAULT_GTFS_RANGE, OutputGTFSCommand} from "../../src/cli/OutputGTFSCommand";
import {CIFRepository} from "../../src/gtfs/repository/CIFRepository";
import {GTFSOutput} from "../../src/gtfs/output/GTFSOutput";

/**
 * Schedules, z-trains and associations are windowed on the import date and have to agree on how far that window
 * reaches. The command owns that decision, so it is the place the agreement can be pinned down.
 */
describe("OutputGTFSCommand", () => {
  const originalRange = process.env.GTFS_RANGE;

  afterEach(() => {
    if (originalRange === undefined) {
      delete process.env.GTFS_RANGE;
    }
    else {
      process.env.GTFS_RANGE = originalRange;
    }
  });

  it("defaults to a range that covers the booking horizon", () => {
    expect(DEFAULT_GTFS_RANGE).to.equal("6 MONTH");
  });

  it("gives schedules and associations the same range", async () => {
    delete process.env.GTFS_RANGE;
    const {command, ranges} = commandWithSpies();

    await command.run([]);

    expect(ranges).to.deep.equal({ schedules: DEFAULT_GTFS_RANGE, associations: DEFAULT_GTFS_RANGE });
  });

  it("gives schedules and associations the configured range", async () => {
    process.env.GTFS_RANGE = "12 MONTH";
    const {command, ranges} = commandWithSpies();

    await command.run([]);

    expect(ranges).to.deep.equal({ schedules: "12 MONTH", associations: "12 MONTH" });
  });

});

/**
 * A command backed by a repository that records the range it is given and an output that discards everything, so no
 * files are written and the working directory is only checked for existence.
 */
function commandWithSpies() {
  const ranges: { schedules?: string, associations?: string } = {};

  const repository = {
    getSchedules(range: string) {
      ranges.schedules = range;

      return Promise.resolve({ schedules: [], idGenerator: idGenerator() });
    },
    getAssociations(range: string) {
      ranges.associations = range;

      return Promise.resolve([]);
    },
    getTransfers: () => Promise.resolve([]),
    getStops: () => Promise.resolve([]),
    getFixedLinks: () => Promise.resolve([]),
    end: () => Promise.resolve([])
  } as unknown as CIFRepository;

  const output = {
    open: () => new Writable({ objectMode: true, write: (chunk, encoding, callback) => callback() }),
    end: () => {}
  } as unknown as GTFSOutput;

  return { command: new OutputGTFSCommand(repository, output), ranges };
}

function* idGenerator(): IterableIterator<number> {
  let id = 0;

  while (true) {
    yield id++;
  }
}
