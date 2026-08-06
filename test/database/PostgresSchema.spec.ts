import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {PGlite} from "@electric-sql/pglite";
import {Kysely, PGliteDialect, sql} from "kysely";
import {SchemaBuilder} from "../../src/database/SchemaBuilder";
import {postgresSchemaDialect} from "../../src/database/dialect";
import {feedTables, testTable} from "./records";

/**
 * Postgres has no server in CI, so the schema is executed against PGlite, which is the real Postgres engine
 * compiled to WebAssembly. Starting it is slow, so a single database is shared by the whole file.
 */
describe("the postgres schema", () => {
  let db: Kysely<any>;

  beforeAll(async () => {
    db = new Kysely<any>({ dialect: new PGliteDialect({ pglite: new PGlite() }) });

    // PGlite boots the engine lazily on the first query, so pay for it here rather than in the first test
    await sql`select 1`.execute(db);
  }, 120000);

  afterAll(async () => {
    await db?.destroy();
  });

  it("creates, drops and recreates a table", async () => {
    const schema = new SchemaBuilder(db, postgresSchemaDialect, "round_trip", testTable());

    await schema.createSchema();
    await schema.dropSchema();
    await schema.createSchema();

    await db.insertInto("round_trip").values({
      field: 1, field2: "002", field3: "three", field4: "four", field5: "2023-11-20",
      field6: "09:15:00", field7: 1, field8: 1.5
    }).execute();

    const [row] = await db.selectFrom("round_trip").selectAll().execute();

    expect(row.id).to.equal(1);
    expect(row.field).to.equal(1);
    // booleans are stored as smallint so the feed's 1 and 0 survive the round trip
    expect(row.field7).to.equal(1);
    // doubles are stored as double precision, numeric would come back as a string
    expect(row.field8).to.equal(1.5);
  });

  // character(n) would pad this back out to the width of the column, where MySQL strips the padding.
  // Storing fixed length text as varchar is what makes the two return the same string
  it("returns text without padding it out to the width of the column", async () => {
    await new SchemaBuilder(db, postgresSchemaDialect, "padding", testTable()).createSchema();

    await db.insertInto("padding").values({
      field: 1, field2: "002", field3: "ab", field4: "cd", field5: "2023-11-20",
      field6: "09:15:00", field7: 1, field8: 1.5
    }).execute();

    const [row] = await db.selectFrom("padding").selectAll().execute();

    expect(row.field3).to.equal("ab");
    expect(row.field4).to.equal("cd");
  });

  it("creates the schema twice without failing on the indexes", async () => {
    const schema = new SchemaBuilder(db, postgresSchemaDialect, "created_twice", testTable());

    await schema.createSchema();
    await schema.createSchema();

    expect((await db.selectFrom("created_twice").selectAll().execute()).length).to.equal(0);
  });

  it("returns dates as Date objects until the driver is told otherwise", async () => {
    const schema = new SchemaBuilder(db, postgresSchemaDialect, "dates", testTable());

    await schema.createSchema();
    await db.insertInto("dates").values({
      field: 1, field2: "002", field3: "three", field4: "four", field5: "2023-11-20",
      field6: "09:15:00", field7: 1, field8: 1.5
    }).execute();

    const [row] = await db.selectFrom("dates").selectAll().execute();

    // this is why wiring the pg driver needs a type parser for date, see PostgresSchemaDialect. Temporal
    // cannot parse a Date, and building one in the local timezone is what dateStrings avoids on MySQL
    expect(row.field5).to.be.instanceOf(Date);
    expect(row.field6).to.equal("09:15:00");
  });

  it("creates every declared table", async () => {
    for (const [name, table] of feedTables()) {
      await new SchemaBuilder(db, postgresSchemaDialect, name, table).createSchema();
    }

    const tables = await db.introspection.getTables();

    expect(tables.length).to.be.greaterThan(0);
  }, 120000);

});
