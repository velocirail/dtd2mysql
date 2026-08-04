import {EventEmitter} from "events";
import {Pool} from "mysql2";
import {describe, it, expect} from "vitest";
import {CIFRepository} from "../../../src/gtfs/repository/CIFRepository";
import {DatabaseConnection} from "../../../src/database/DatabaseConnection";

/**
 * The schedule, z-train and association queries all window on the import date. They have to agree on how far ahead
 * that window reaches, otherwise the feed contains passenger services whose replacement buses and portion working
 * have been silently dropped.
 */
describe("CIFRepository", () => {

  it("applies the given range to the schedule and z-train queries", async () => {
    const {repository, streamQueries} = repositoryWithSpies();

    await repository.getSchedules("6 MONTH");

    expect(streamQueries.length).to.equal(2);

    for (const query of streamQueries) {
      expect(query).to.contain("CURDATE() + INTERVAL 6 MONTH");
      expect(query).to.not.contain("INTERVAL 3 MONTH");
    }
  });

  it("applies the given range to the association query", async () => {
    const {repository, associationQueries} = repositoryWithSpies();

    await repository.getAssociations("6 MONTH");

    expect(associationQueries().length).to.equal(1);
    expect(associationQueries()[0]).to.contain("CURDATE() + INTERVAL 6 MONTH");
    expect(associationQueries()[0]).to.not.contain("INTERVAL 3 MONTH");
  });

  it("uses the same cutoff for schedules, z-trains and associations", async () => {
    const {repository, associationQueries, streamQueries} = repositoryWithSpies();

    await repository.getSchedules("6 MONTH");
    await repository.getAssociations("6 MONTH");

    const cutoffs = [...streamQueries, ...associationQueries()]
      .map(query => query.match(/CURDATE\(\) \+ INTERVAL (.+)/))
      .map(match => match && match[1].trim());

    expect(cutoffs.length).to.equal(3);
    expect(new Set(cutoffs).size).to.equal(1);
  });

});

/**
 * A repository backed by stubs that record the SQL they are given. The schedule query reads the id of the last
 * schedule to offset the z-train ids, so that single query returns a row rather than an empty result.
 */
function repositoryWithSpies() {
  const queries: string[] = [];
  const streamQueries: string[] = [];

  const db = {
    query(sql: string): Promise<[any[], any]> {
      queries.push(sql);

      return Promise.resolve<[any[], any]>(
        sql.includes("FROM schedule ORDER BY id desc") ? [[{ id: 0 }], null] : [[], null]
      );
    }
  } as DatabaseConnection;

  const stream = {
    query(sql: string) {
      streamQueries.push(sql);

      const results = new EventEmitter();
      // the builder attaches its listeners synchronously after this returns
      setImmediate(() => results.emit("end"));

      return results;
    }
  } as unknown as Pool;

  return {
    repository: new CIFRepository(db, stream, {}),
    // the last-schedule lookup is not part of the windowing, so keep it out of the assertions
    associationQueries: () => queries.filter(q => !q.includes("FROM schedule ORDER BY id desc")),
    streamQueries
  };
}
