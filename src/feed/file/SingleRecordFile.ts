
import {FeedFile} from "./FeedFile";
import {Record} from "../record/Record";

export class SingleRecordFile<R extends Record = Record> implements FeedFile<R> {

  constructor(
    private readonly recordType: R,
    private readonly filter: RecordFilter | null = null
  ) {}

  /**
   * Return the record type wrapped in an array
   */
  public get recordTypes(): R[] {
    return [this.recordType];
  }

  /**
   * Return the record type
   */
  public getRecord(line: string): R | null {
    if (this.filter === null || this.filter(line)) {
      return this.recordType;
    }

    return null;
  }
}

export type RecordFilter = (line: string) => boolean;
