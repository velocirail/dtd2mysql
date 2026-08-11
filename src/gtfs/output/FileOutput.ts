import csvWriter from 'csv-write-stream';
import * as fs from "fs";
import {GTFSOutput} from "./GTFSOutput";
import {Writable} from "stream";
import {finished} from "node:stream/promises";

export class FileOutput implements GTFSOutput {

  /**
   * The file behind each writer. A CSV writer finishing only says it has handed everything to the pipe,
   * not that the pipe has written it, so this is what says the files are really there.
   */
  private readonly written: Promise<void>[] = [];

  /**
   * Wrapper around file output library that returns a file as a WritableStream
   */
  public open(filename: string): Writable {
    const writer = csvWriter();
    const file = fs.createWriteStream(filename);

    writer.pipe(file);
    this.written.push(finished(file));

    return writer;
  }

  /**
   * Wait for every file to reach the disk
   */
  public async end(): Promise<void> {
    await Promise.all(this.written);
  }

}
