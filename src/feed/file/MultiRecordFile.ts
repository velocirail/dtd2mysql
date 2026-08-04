
import {Record} from "../record/Record";
import {FeedFile} from "./FeedFile";

export class MultiRecordFile<R extends RecordTypeMap = RecordTypeMap> implements FeedFile<R[keyof R]> {

  constructor(
    public readonly records: R,
    public readonly typeStart: number = 1,
    public readonly typeLength: number = 1
  ) { }

  /**
   * Return all possible record types
   */
  get recordTypes(): R[keyof R][] {
    return Object.values(this.records) as R[keyof R][];
  }

  /**
   * Look at the characters in the given line to determine which record type is relevant
   */
  public getRecord(line: string): R[keyof R] {
    return this.records[line.substr(this.typeStart, this.typeLength)] as R[keyof R];
  }
}

export type RecordTypeMap = {
  [recordIdentifier: string]: Record
};