import {Generated} from "kysely";
import schema from "../../config/schema";
import {Row} from "./Schema";

/**
 * The database as Kysely sees it, read straight off the schema declarations in config/schema.
 *
 * Those declarations are the source of truth. Change a column there and both the table the importer
 * builds and the type queries are checked against move together.
 */
export type Database = Tables & { log: Log };

/**
 * The table recording which feed files have been processed, see createLogSchema
 */
export interface Log {
  id: Generated<number>;
  filename: string | null;
  processed: string | null;
}

type Schemas = typeof schema;

/**
 * Every table of every feed, as a union of name and declaration pairs, so that the tables can be keyed
 * by name rather than by the feed they came from
 */
type Entry = {
  [F in keyof Schemas]: {
    [T in keyof Schemas[F]]: { name: T & string, table: Schemas[F][T] }
  }[keyof Schemas[F]]
}[keyof Schemas];

/**
 * A table defined by more than one feed, currently only location, comes out as a union of its shapes
 * rather than a single merged one. Reading a column that only one of them has will not compile, which is
 * the intended prompt to make them agree.
 */
type Tables = { [N in Entry["name"]]: Row<Extract<Entry, { name: N }>["table"]> };
