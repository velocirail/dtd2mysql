import {Kysely, sql} from "kysely";
import {getFieldType, SchemaDialect} from "./SchemaDialect";
import {Record} from "../feed/record/Record";

export const LOG_TABLE = "log";

/**
 * Creates and drops the table for a feed record in whichever database the dialect describes
 */
export class SchemaBuilder {

  constructor(
    private readonly db: Kysely<any>,
    private readonly dialect: SchemaDialect,
    private readonly record: Record
  ) {}

  /**
   * Create the table and its indexes
   */
  public async createSchema(): Promise<void> {
    let table = this.dialect.addIdColumn(this.db.schema.createTable(this.record.name).ifNotExists());

    for (const [name, field] of Object.entries(this.record.fields)) {
      const type = this.dialect.columnType(getFieldType(field));

      table = table.addColumn(name, type, column => field.nullable ? column : column.notNull());
    }

    if (this.record.key.length > 0) {
      table = table.addUniqueConstraint(`${this.record.name}_key`, this.record.key);
    }

    await table.execute();

    for (const index of this.record.indexes) {
      await this.createIndex(index);
    }
  }

  /**
   * Drop the table, taking its indexes with it
   */
  public async dropSchema(): Promise<void> {
    await this.db.schema.dropTable(this.record.name).ifExists().execute();
  }

  /**
   * Index names are unique per database in Postgres and SQLite so they are qualified with the table name.
   *
   * MySQL has no IF NOT EXISTS for indexes, so a duplicate is caught rather than avoided.
   */
  private async createIndex(column: string): Promise<void> {
    try {
      await this.db.schema
        .createIndex(`${this.record.name}_${column}_idx`)
        .on(this.record.name)
        .column(column)
        .execute();
    }
    catch (err) {
      if (!this.dialect.isDuplicateIndex(err)) {
        throw err;
      }
    }
  }

}

/**
 * Create the table that records which feed files have been processed
 */
export async function createLogSchema(db: Kysely<any>, dialect: SchemaDialect): Promise<void> {
  await dialect
    .addIdColumn(db.schema.createTable(LOG_TABLE).ifNotExists())
    .addColumn("filename", sql.raw("varchar(255)"))
    .addColumn("processed", timestampType(dialect))
    .execute();
}

function timestampType(dialect: SchemaDialect) {
  switch (dialect.name) {
    case "mysql": return sql.raw("datetime");
    case "postgres": return sql.raw("timestamp");
    case "sqlite": return sql.raw("text");
  }
}
