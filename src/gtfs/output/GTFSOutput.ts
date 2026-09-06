
import {Writable} from "stream";

export interface GTFSOutput {
  /**
   * Called once every file has been written, and does not return until they are all on the disk
   */
  end(): Promise<void>;
  open(filename: string): Writable;
}
