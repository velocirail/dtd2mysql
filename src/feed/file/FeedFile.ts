
import {Record} from "../record/Record";

export interface FeedFile<R extends Record = Record> {

  /**
   * Return all the possible return types in the file
   */
  recordTypes: R[];

  /**
   * Return the relevant Record for the line
   */
  getRecord(line: string): R | null;
}
