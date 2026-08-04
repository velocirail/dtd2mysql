
import {Field, ParseError} from "./Field";

export class IntField<N extends boolean = false> extends Field<N> {

  constructor(position: number,
              length: number,
              nullable: N = false as N,
              nullChars: string[] = [" ", "*", "9"]) {
    super(position, length, nullable, nullChars);
  }

  /**
   * Try to process this string as an integer
   */
  protected parse(value: string): number {
    const intValue = parseInt(value);

    if (isNaN(intValue)) {
      throw new ParseError(`Error parsing int: "${value}" isNaN`);
    }

    return intValue;
  }

}

export class ZeroFillIntField<N extends boolean = false> extends Field<N> {

  /**
   * Zero filled ints are stored as padded chars
   */
  protected parse(value: string): string {
    return value.padStart(this.length, "0");
  }

}