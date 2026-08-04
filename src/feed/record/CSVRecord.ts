
import {Field, FieldValue} from "../field/Field";
import {AnyFieldMap, FieldMap, ParsedRecord, Record, RecordAction} from "./Record";
import memoize from "memoized-class-decorator";

export class CSVRecord<Name extends string = string, F extends AnyFieldMap = FieldMap> implements Record<Name, F> {

  constructor(
    public readonly name: Name,
    public readonly key: (keyof F & string)[],
    public readonly fields: F,
    public readonly indexes: (keyof F & string)[] = [],
    public readonly fieldDelimiter: string | RegExp = ",",
    public readonly orderedInserts: boolean = false
  ) {}

  @memoize
  private get fieldValues(): [string, Field][] {
    return Object.entries(this.fields as FieldMap);
  }

  /**
   * Split the CSV string and look up the relevant field to do the parsing
   */
  extractValues(line: string): ParsedRecord {
    const fieldValues = line.trim().split(this.fieldDelimiter);
    const values: { [field: string]: FieldValue } = { id: null };
    const action = RecordAction.Insert;

    for (let i = 0; i < fieldValues.length; i++) {
      const entry = this.fieldValues.find(([k, f]) => (f.position + fieldValues.length) % fieldValues.length === i);

      if (entry) {
        const [key, field] = entry;

        values[key] = field.extract(fieldValues[i]);
      }
    }

    const keysValues = this.key.reduce((vals: { [field: string]: FieldValue }, key) => {
      vals[key] = values[key];

      return vals;
    }, {});

    return { action, values , keysValues};
  }

}
