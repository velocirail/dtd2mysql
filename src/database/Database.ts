import {Generated} from "kysely";
import config from "../../config";
import {Field} from "../feed/field/Field";
import {TextField, VariableLengthText} from "../feed/field/TextField";
import {IntField, ZeroFillIntField} from "../feed/field/IntField";
import {BooleanField} from "../feed/field/BooleanField";
import {DateField, NullDateField, ShortDateField} from "../feed/field/DateField";
import {TimeField} from "../feed/field/TimeField";
import {DoubleField} from "../feed/field/DoubleField";
import {ForeignKeyField} from "../feed/field/ForeignKeyField";
import {AnyFieldMap} from "../feed/record/Record";

/**
 * The database schema, derived from the feed definitions in config rather than declared separately.
 *
 * The feed definitions already say what every column is, so restating them would be two sources of truth
 * that could disagree. Everything from the config barrel down to the individual fields carries its literal
 * type, so the tables and their columns are read straight back out of them here.
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

type Feeds = typeof config;
// keyof on a union only gives the keys the members share, so each feed is indexed on its own first
type Files = { [F in keyof Feeds]: Feeds[F][keyof Feeds[F]] }[keyof Feeds];
type Records = Files["recordTypes"][number];

type Tables = { [R in Records as R["name"]]: Row<R["fields"]> };

/**
 * Every table has the surrogate key the schema builder adds, plus a column per field.
 *
 * This distributes over F so that a table defined by more than one feed, currently only location, comes
 * out as a union of its shapes rather than a single merged one. Reading a column that only one of them
 * has will not compile, which is the intended prompt to make them agree.
 */
type Row<F> = F extends AnyFieldMap
  ? { [K in keyof F | "id"]: K extends "id" ? Generated<number> : K extends keyof F ? Column<F[K]> : never }
  : never;

/**
 * The order here matches the order the schema dialects check field types in, because the field classes
 * form a hierarchy. They can be told apart at all only because Field.parse is protected, which is what
 * makes TypeScript treat otherwise identical field classes as distinct types.
 */
type Column<T> =
  T extends VariableLengthText<infer N> ? Nullable<string, N> :
  T extends TextField<infer N> ? Nullable<string, N> :
  T extends BooleanField<infer N> ? Nullable<number, N> :
  T extends ShortDateField<infer N> ? Nullable<string, N> :
  T extends DateField<infer N> ? Nullable<string, N> :
  T extends NullDateField ? string | null :
  T extends TimeField<infer N> ? Nullable<string, N> :
  T extends DoubleField<infer N> ? Nullable<number, N> :
  // zero filled ints are parsed as padded strings
  T extends ZeroFillIntField<infer N> ? Nullable<string, N> :
  T extends IntField<infer N> ? Nullable<number, N> :
  T extends ForeignKeyField ? number :
  // a record that declares its fields as a plain FieldMap cannot say more than what a field can hold
  T extends Field<infer N> ? Nullable<string | number, N> :
  never;

type Nullable<T, N> = N extends true ? T | null : T;
