
import {Field} from "./Field";

/**
 * Basic text field, with a fixed length
 */
export class TextField<N extends boolean = false> extends Field<N> {

  /**
   * Return the string as is
   */
  protected parse(value: string): string {
    return value;
  }

}

/**
 * Text field with a variable length
 */
export class VariableLengthText<N extends boolean = false> extends TextField<N> {}
