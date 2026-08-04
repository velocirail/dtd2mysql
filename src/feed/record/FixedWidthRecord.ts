
import {AnyFieldMap, FieldMap, ParsedRecord, Record, RecordAction} from "./Record";
import {Field, FieldValue} from "../field/Field";

/**
 * Record with fixed with fields
 */
export class FixedWidthRecord<Name extends string = string, F extends AnyFieldMap = FieldMap> implements Record<Name, F> {

  constructor(
    public readonly name: Name,
    public readonly key: (keyof F & string)[],
    public readonly fields: F,
    public readonly indexes: (keyof F & string)[] = [],
    public readonly actionMap: ActionMap = {},
    public readonly charPosition: number = 0,
    public readonly orderedInserts: boolean = false
  ) {}

  /**
   * The fields as fields. The generic parameter is constrained loosely so that the config literals keep
   * their nullability, see AnyFieldMap.
   */
  protected get fieldEntries(): [string, Field][] {
    return Object.entries(this.fields as FieldMap);
  }

  /**
   * Extract the relevant part of the line for each field and then get the value from the field
   */
  public extractValues(line: string): ParsedRecord {
    const action = this.actionMap[line.charAt(this.charPosition)] || RecordAction.Insert;
    const values: { [field: string]: FieldValue } = { id: null };

    for (const [key, field] of this.fieldEntries) {
      values[key] = field.extract(line.substr(field.position, field.length));
    }

    const keysValues = this.key.reduce((vals: { [field: string]: FieldValue }, key) => {
      vals[key] = values[key];

      return vals;
    }, {});

    return { action, values, keysValues } as ParsedRecord;
  }

}

/**
 * Different feeds use different characters for different actions, this map provides a look up from char to action
 */
export interface ActionMap {
  [char: string]: RecordAction;
}

/**
 * This record type uses a generated integer rather than the standard auto_increment. The only reason to do this use
 * this record type is to reference a row in another table that has not been inserted yet see {@link ForeignKeyField}
 */
export class RecordWithManualIdentifier<Name extends string = string, F extends AnyFieldMap = FieldMap> extends FixedWidthRecord<Name, F> {
  public lastId: number = 0;

  public extractValues(line: string): ParsedRecord {
    const action = this.actionMap[line.charAt(this.charPosition)] || RecordAction.Insert;
    const values: { [field: string]: FieldValue } = action === RecordAction.Delete ? {} : { id: ++this.lastId };

    for (const [key, field] of this.fieldEntries) {
      values[key] = field.extract(line.substr(field.position, field.length));
    }

    const keysValues = this.key.reduce((vals: { [field: string]: FieldValue }, key) => {
      vals[key] = values[key];

      return vals;
    }, {});

    return { action, values, keysValues } as ParsedRecord;
  }

}
