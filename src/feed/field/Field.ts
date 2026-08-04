
import memoize from "memoized-class-decorator";

/**
 * Parent class for all fields.
 *
 * The nullable flag is a type parameter rather than a boolean so that a column declared as
 * new TextField(0, 4, true) is derived as string | null and one without it as string.
 *
 * Note that parse is protected on purpose. Several field types are structurally identical, and a
 * protected member is what makes TypeScript treat them as distinct types, which is what lets the
 * derived column types tell a date from a piece of text.
 */
export abstract class Field<N extends boolean = boolean> {

  constructor(
    public readonly position: number,
    public readonly length: number,
    public readonly nullable: N = false as N,
    public readonly nullChars: string[] = [" ", "*"]
  ) {}

  /**
   * Return the possible null values for this field. For example, if the nullChars are " " and "*" and the length
   * is 3 this method will return ["   ", "***"]
   */
  @memoize
  public get nullValues(): string[] {
    return this.nullChars.map(c => Array(this.length + 1).join(c));
  }

  /**
   * Do some null checking then offload to the sub classes parse method
   */
  public extract(value: string): FieldValue {
    const isNull = (value === null || value === undefined) || value === "" || this.nullValues.indexOf(value) > -1;

    if (isNull) {
      if (this.nullable) return null;
      else throw new ParseError(`Non-nullable field received null value: "${value}" at position ${this.position}`);
    }

    return this.parse(value);
  }

  protected abstract parse(value: string): FieldValue;

}

export class ParseError extends Error {}

export type FieldValue = null | string | number;