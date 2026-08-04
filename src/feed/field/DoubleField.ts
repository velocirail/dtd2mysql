
import {Field, ParseError} from "./Field";

export class DoubleField<N extends boolean = false> extends Field<N> {

  constructor(position: number, length: number, public readonly decimalDigits: number, isNullable: N = false as N) {
    super(position, length, isNullable, [" ", "*", "9"]);
  }

  /**
   * Cast to a number
   */
  protected parse(value: string): number {
    const floatValue = parseFloat(value);

    if (isNaN(floatValue)) {
      throw new ParseError(`Error parsing float: "${value}"`);
    }

    return floatValue;
  }

}