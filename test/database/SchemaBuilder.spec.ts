import {describe, it, expect} from 'vitest';
import {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  Driver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler
} from "kysely";
import {SchemaBuilder} from "../../src/database/SchemaBuilder";
import {SchemaDialect} from "../../src/database/SchemaDialect";
import {mysqlSchemaDialect, postgresSchemaDialect, sqliteSchemaDialect} from "../../src/database/dialect";
import {NodeSqliteDialect} from "../../src/database/NodeSqliteDriver";
import {Record} from "../../src/feed/record/Record";
import config, {FeedConfig} from "../../config";
import {FixedWidthRecord} from "../../src/feed/record/FixedWidthRecord";
import {IntField, ZeroFillIntField} from "../../src/feed/field/IntField";
import {TextField, VariableLengthText} from "../../src/feed/field/TextField";
import {DateField} from "../../src/feed/field/DateField";
import {TimeField} from "../../src/feed/field/TimeField";
import {BooleanField} from "../../src/feed/field/BooleanField";
import {DoubleField} from "../../src/feed/field/DoubleField";

describe("SchemaBuilder", () => {
  const record = new FixedWidthRecord(
    "test",
    ["field", "field4"], {
      "field": new IntField(0, 4),
      "field2": new ZeroFillIntField(1, 3),
      "field3": new TextField(2, 5),
      "field4": new VariableLengthText(3, 5),
      "field5": new DateField(7),
      "field6": new TimeField(7, 4),
      "field7": new BooleanField(7),
      "field8": new DoubleField(7, 7, 5),
    },
    ["field5", "field6"]
  );

  it("drops a table", async () => {
    const [statement] = await compile(mysqlSchemaDialect, record, schema => schema.dropSchema());

    expect(statement).to.equal("drop table if exists `test`");
  });

  it("creates a mysql table", async () => {
    const [create, ...indexes] = await compile(mysqlSchemaDialect, record, schema => schema.createSchema());

    expect(create).to.equal(
      "create table if not exists `test` (" +
      "`id` int(11) unsigned not null primary key auto_increment, " +
      "`field` smallint(4) unsigned not null, " +
      "`field2` char(3) not null, " +
      "`field3` char(5) not null, " +
      "`field4` varchar(5) not null, " +
      "`field5` date not null, " +
      "`field6` time, " +
      "`field7` tinyint(1) unsigned not null, " +
      "`field8` double(7, 5) unsigned not null, " +
      "constraint `test_key` unique (`field`, `field4`))"
    );

    expect(indexes).to.deep.equal([
      "create index `test_field5_idx` on `test` (`field5`)",
      "create index `test_field6_idx` on `test` (`field6`)"
    ]);
  });

  it("creates a postgres table without unsigned types", async () => {
    const [create] = await compile(postgresSchemaDialect, record, schema => schema.createSchema());

    expect(create).to.equal(
      'create table if not exists "test" (' +
      '"id" serial primary key, ' +
      '"field" smallint not null, ' +
      '"field2" char(3) not null, ' +
      '"field3" char(5) not null, ' +
      '"field4" varchar(5) not null, ' +
      '"field5" date not null, ' +
      '"field6" time, ' +
      '"field7" smallint not null, ' +
      '"field8" numeric(7, 5) not null, ' +
      'constraint "test_key" unique ("field", "field4"))'
    );
  });

  it("creates a sqlite table using storage classes", async () => {
    const [create] = await compile(sqliteSchemaDialect, record, schema => schema.createSchema());

    expect(create).to.equal(
      'create table if not exists "test" (' +
      '"id" integer primary key autoincrement, ' +
      '"field" integer not null, ' +
      '"field2" text not null, ' +
      '"field3" text not null, ' +
      '"field4" text not null, ' +
      '"field5" text not null, ' +
      '"field6" text, ' +
      '"field7" integer not null, ' +
      '"field8" numeric not null, ' +
      'constraint "test_key" unique ("field", "field4"))'
    );
  });

  it("picks the smallest mysql integer type that fits", async () => {
    const types = await Promise.all([2, 4, 7, 9, 12].map(async length => {
      const [create] = await compile(mysqlSchemaDialect, intRecord(length), schema => schema.createSchema());

      return create.match(/`sized` (\w+)/)?.[1];
    }));

    expect(types).to.deep.equal(["tinyint", "smallint", "mediumint", "int", "bigint"]);
  });

  it("creates the schema in a real sqlite database", async () => {
    const db = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });
    const schema = new SchemaBuilder(db, sqliteSchemaDialect, record);

    await schema.createSchema();
    // a full refresh drops and recreates, so both have to work against a live database
    await schema.dropSchema();
    await schema.createSchema();

    await db.insertInto("test").values({
      field: 1, field2: "002", field3: "three", field4: "four", field5: "2023-11-20",
      field6: "09:15:00", field7: 1, field8: 1.5
    }).execute();

    const rows = await db.selectFrom("test").selectAll().execute();

    expect(rows.length).to.equal(1);
    expect(rows[0].id).to.equal(1);
    expect(rows[0].field5).to.equal("2023-11-20");

    await db.destroy();
  });

  it("creates the schema twice without failing on the indexes", async () => {
    const db = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });
    const schema = new SchemaBuilder(db, sqliteSchemaDialect, record);

    await schema.createSchema();
    await schema.createSchema();

    expect((await db.selectFrom("test").selectAll().execute()).length).to.equal(0);

    await db.destroy();
  });

  it("creates a table for every record in the feed configuration", async () => {
    const records = feedRecords();

    expect(records.length).to.be.greaterThan(0);

    // sqlite is executed for real and the others are compiled, so a field with no column type fails either way
    const sqlite = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });

    for (const feedRecord of records) {
      await new SchemaBuilder(sqlite, sqliteSchemaDialect, feedRecord).createSchema();
      await compile(mysqlSchemaDialect, feedRecord, schema => schema.createSchema());
      await compile(postgresSchemaDialect, feedRecord, schema => schema.createSchema());
    }

    expect((await sqlite.introspection.getTables()).length).to.be.greaterThan(0);

    await sqlite.destroy();
  });

});

/**
 * Every record type across all of the feeds
 */
function feedRecords(): Record[] {
  const feeds: FeedConfig[] = Object.values(config);

  return feeds.flatMap(feed => Object.values(feed).flatMap(file => file.recordTypes));
}

const intRecord = (length: number) => new FixedWidthRecord("ints", [], { "sized": new IntField(0, length) }, []);

/**
 * Run a schema operation against a driver that records the SQL instead of executing it
 */
async function compile(dialect: SchemaDialect, record: Record, operation: (schema: SchemaBuilder) => Promise<void>): Promise<string[]> {
  const statements: string[] = [];
  const db = new Kysely<any>({ dialect: new RecordingDialect(dialect, statements) });

  await operation(new SchemaBuilder(db, dialect, record));
  await db.destroy();

  return statements;
}

class RecordingDialect implements Dialect {

  constructor(
    private readonly dialect: SchemaDialect,
    private readonly statements: string[]
  ) {}

  public createAdapter() {
    switch (this.dialect.name) {
      case "mysql": return new MysqlAdapter();
      case "postgres": return new PostgresAdapter();
      case "sqlite": return new SqliteAdapter();
    }
  }

  public createQueryCompiler() {
    switch (this.dialect.name) {
      case "mysql": return new MysqlQueryCompiler();
      case "postgres": return new PostgresQueryCompiler();
      case "sqlite": return new SqliteQueryCompiler();
    }
  }

  public createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    switch (this.dialect.name) {
      case "mysql": return new MysqlIntrospector(db);
      case "postgres": return new PostgresIntrospector(db);
      case "sqlite": return new SqliteIntrospector(db);
    }
  }

  public createDriver(): Driver {
    return new RecordingDriver(this.statements);
  }

}

class RecordingDriver implements Driver {

  constructor(private readonly statements: string[]) {}

  public async init(): Promise<void> {}

  public async acquireConnection(): Promise<DatabaseConnection> {
    const statements = this.statements;

    return {
      async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
        statements.push(compiledQuery.sql);

        return { rows: [] };
      },
      async* streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {}
    };
  }

  public async beginTransaction(): Promise<void> {}
  public async commitTransaction(): Promise<void> {}
  public async rollbackTransaction(): Promise<void> {}
  public async releaseConnection(): Promise<void> {}
  public async destroy(): Promise<void> {}

}
