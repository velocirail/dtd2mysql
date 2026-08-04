
import {Field, FieldValue} from "../field/Field";

export interface Record<Name extends string = string, F extends AnyFieldMap = FieldMap> {

  name: Name;
  key: (keyof F & string)[];
  fields: F;
  indexes: (keyof F & string)[];
  orderedInserts: boolean;

  /**
   * Turn the given line into a list of values
   */
  extractValues(line: string): ParsedRecord;

}

export interface FieldMap {
  [field: string]: Field;
}

/**
 * The constraint for a generic field map.
 *
 * It deliberately says nothing about the fields. Naming any property of Field here, nullable in
 * particular, would make it the contextual type for the field map literals in config, and the nullability
 * of every field that relies on the default would widen from false back to boolean, taking the derived
 * column types with it.
 */
export type AnyFieldMap = { [field: string]: object };

export enum RecordAction {
  Insert = "I",
  Update = "A",
  Delete = "D",
  DelayedInsert = "DI"
}

export interface ParsedRecord {
  action: RecordAction;
  values: {
    [field: string]: FieldValue;
  };
  keysValues: {
    [keyField: string]: FieldValue;
  }
}
