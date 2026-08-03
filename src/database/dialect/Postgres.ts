import {CreateTableBuilder, Expression, sql} from "kysely";
import {FieldType, getErrorCode, SchemaDialect} from "../SchemaDialect";

const DUPLICATE_TABLE = "42P07";

export const postgresSchemaDialect: SchemaDialect = {

  name: "postgres",

  columnType(field: FieldType): Expression<any> {
    switch (field.type) {
      case "text": return sql.raw(field.variableLength ? `varchar(${field.length})` : `char(${field.length})`);
      // the feed parses booleans to 1 and 0, storing them as a number keeps that representation
      case "boolean": return sql.raw("smallint");
      case "date": return sql.raw("date");
      case "time": return sql.raw("time");
      case "double": return sql.raw(`numeric(${field.length}, ${field.decimalDigits})`);
      case "int": return sql.raw(intType(field.length));
      case "foreignKey": return sql.raw("integer");
    }
  },

  addIdColumn(table: CreateTableBuilder<any, any>): CreateTableBuilder<any, any> {
    return table.addColumn("id", "serial", col => col.primaryKey());
  },

  isDuplicateIndex(error: unknown): boolean {
    return getErrorCode(error) === DUPLICATE_TABLE;
  }

};

/**
 * Postgres has no unsigned types and no display widths, so the type is chosen purely on the range of values
 * the field can hold.
 */
function intType(length: number): string {
  if (length > 9) return "bigint";
  if (length > 4) return "integer";

  return "smallint";
}
