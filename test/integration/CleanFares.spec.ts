import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "../../config";
import fares from "../../config/schema/fares";
import {Container} from "../../src/cli/Container";
import {CleanFaresCommand, EXPIRING_TABLES} from "../../src/cli/CleanFaresCommand";
import {expectedRows, readTables, rowOf, tableNames, zipFixture} from "./support";

/**
 * Cleans the fares feed and records every row that is left.
 *
 * The generated feed is one row per table of As and 1s, which says nothing about a clean up that turns on
 * particular railcards, ticket codes and dates. So the rows the clean up is about are seeded on top of it
 * and every fares table is recorded afterwards, which shows both what it changed and what it left alone.
 *
 * The date is pinned because what has expired would otherwise depend on the day the test was run.
 */
const today = Temporal.PlainDate.from("2025-07-01");

const EXPIRED = "2024-06-30";
const CURRENT = "2030-01-01";

/**
 * A flow and the fares on it, which the network area restrictions are worked out from
 */
const FLOW_ID = 900;

describe("cleaning the fares feed", () => {

  let command: CleanFaresCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    const container = new Container();
    const feed = await container.getFaresImportCommand();

    db = container.getKysely();

    await feed.doImport(zipFixture("fares", "RJFAF999.ZIP"));
    await seed(db);

    command = new CleanFaresCommand(db, container.getSchemaDialect(), today);

    await command.doClean();
  });

  afterAll(async () => {
    await command?.end();
  });

  it("leaves the same rows it always has", async () => {
    const tables = [...tableNames(config.fares), "network_flow_restriction"].sort();

    await expect(await readTables(db, tables)).toMatchFileSnapshot(expectedRows("fares-clean.json"));
  });

});

/**
 * The rows the clean up has something to say about
 */
async function seed(db: Kysely<any>): Promise<void> {
  // one row that has expired and one that has not, in every table the clean up expires rows from
  for (const table of EXPIRING_TABLES) {
    const declared = fares[table];

    await db.insertInto(table).values([
      rowOf(declared, { end_date: EXPIRED } as any),
      rowOf(declared, { end_date: CURRENT } as any)
    ]).execute();
  }

  // two flows sharing an origin, destination and route, so the restriction has to be picked from one of
  // them rather than left to the database to choose
  await db.insertInto("flow").values([
    rowOf(fares.flow, {
      origin_code: "0001", destination_code: "0002", route_code: "00001", status_code: "000",
      direction: "R", flow_id: FLOW_ID, end_date: CURRENT
    }),
    rowOf(fares.flow, {
      origin_code: "0001", destination_code: "0002", route_code: "00001", status_code: "001",
      direction: "S", flow_id: FLOW_ID + 1, end_date: CURRENT
    })
  ]).execute();

  await db.insertInto("fare").values([
    // the cheapest fare on the flow, which is the one the restriction is taken from
    rowOf(fares.fare, { flow_id: FLOW_ID, ticket_code: "SVR", fare: 1000, restriction_code: "AA" }),
    rowOf(fares.fare, { flow_id: FLOW_ID + 1, ticket_code: "CDR", fare: 2000, restriction_code: "BB" }),
    // a ticket the restrictions are not worked out from, and a fare without a restriction on it
    rowOf(fares.fare, { flow_id: FLOW_ID, ticket_code: "XXX", fare: 3000, restriction_code: "CC" }),
    rowOf(fares.fare, { flow_id: FLOW_ID, ticket_code: "SVS", fare: 4000, restriction_code: null }),
    // fares that are removed, so they cannot carry a restriction into the table either
    rowOf(fares.fare, { flow_id: FLOW_ID, ticket_code: "ODT", fare: 3, restriction_code: "DD" }),
    rowOf(fares.fare, { flow_id: FLOW_ID, ticket_code: "CDS", fare: 99999, restriction_code: "EE" }),
    rowOf(fares.fare, { flow_id: FLOW_ID + 1, ticket_code: "SVR", fare: 1000000, restriction_code: "FF" })
  ]).execute();

  // the two London Underground zones at either end of the list, and a location that is in neither
  await db.insertInto("location").values([
    rowOf(fares.location, { uic: "0000027", nlc: "0027", end_date: CURRENT }),
    rowOf(fares.location, { uic: "0000071", nlc: "0071", end_date: CURRENT }),
    rowOf(fares.location, { uic: "0009999", nlc: "9999", end_date: CURRENT })
  ]).execute();

  // a railcard the passenger numbers are known for and one they are not
  await db.insertInto("railcard").values([
    rowOf(fares.railcard, { railcard_code: "YNG", end_date: CURRENT }),
    rowOf(fares.railcard, { railcard_code: "FAM", end_date: CURRENT }),
    rowOf(fares.railcard, { railcard_code: "ZZZ", end_date: CURRENT })
  ]).execute();

  // only a status that is neither 000 nor 001 and gives nothing away is marked as no discount
  await db.insertInto("status_discount").values([
    rowOf(fares.status_discount, { status_code: "000", end_date: CURRENT, discount_category: 1, discount_indicator: "A", discount_percentage: 0 }),
    rowOf(fares.status_discount, { status_code: "002", end_date: CURRENT, discount_category: 1, discount_indicator: "A", discount_percentage: 0 }),
    rowOf(fares.status_discount, { status_code: "002", end_date: CURRENT, discount_category: 2, discount_indicator: "A", discount_percentage: 50 })
  ]).execute();

  // the two values the feed uses to mean there is no fare, and a fare that is real
  await db.insertInto("non_derivable_fare_override").values([
    rowOf(fares.non_derivable_fare_override, { origin_code: "0001", nd_record_type: "N", end_date: CURRENT, adult_fare: 99999, child_fare: 1000000 }),
    rowOf(fares.non_derivable_fare_override, { origin_code: "0002", nd_record_type: "N", end_date: CURRENT, adult_fare: 500, child_fare: 250 })
  ]).execute();

  // a real feed has exactly one current and one future restriction date, the generated row is neither
  await db.deleteFrom("restriction_date").execute();
  await db.insertInto("restriction_date").values([
    rowOf(fares.restriction_date, { cf_mkr: "C", start_date: "2025-05-01", end_date: "2026-05-01" }),
    rowOf(fares.restriction_date, { cf_mkr: "F", start_date: "2026-05-01", end_date: "2027-05-01" })
  ]).execute();

  // a range inside the year, one that wraps around the end of it, and one that is not a date at all
  await db.insertInto("restriction_time_date").values([
    rowOf(fares.restriction_time_date, { cf_mkr: "C", restriction_code: "AA", sequence_no: "0001", out_ret: "O", date_from: "0301", date_to: "0930" }),
    rowOf(fares.restriction_time_date, { cf_mkr: "C", restriction_code: "AA", sequence_no: "0002", out_ret: "O", date_from: "1201", date_to: "0131" }),
    rowOf(fares.restriction_time_date, { cf_mkr: "F", restriction_code: "AA", sequence_no: "0003", out_ret: "O", date_from: "0301", date_to: "0930" }),
    rowOf(fares.restriction_time_date, { cf_mkr: "C", restriction_code: "AA", sequence_no: "0004", out_ret: "O", date_from: "0229", date_to: "0930" })
  ]).execute();

  await db.insertInto("restriction_header_date").values([
    rowOf(fares.restriction_header_date, { cf_mkr: "C", restriction_code: "BB", date_from: "0401", date_to: "0401" })
  ]).execute();

  await db.insertInto("restriction_train_date").values([
    rowOf(fares.restriction_train_date, { cf_mkr: "F", restriction_code: "CC", train_no: "000001", out_ret: "R", date_from: "0601", date_to: "0801" })
  ]).execute();

  await db.insertInto("restriction_ticket_calendar").values([
    rowOf(fares.restriction_ticket_calendar, { cf_mkr: "C", ticket_code: "SVR", cal_type: "A", route_code: "00001", country_code: "G", date_from: "0101", date_to: "1231" })
  ]).execute();
}
