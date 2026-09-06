import {CLICommand} from "./CLICommand";
import {FileProvider} from "./DownloadAndProcessCommand";
import {PromiseSFTP} from "../sftp/PromiseSFTP";
import {Kysely} from "kysely";
import {Database} from "../database/Database";
import {LOG_TABLE} from "../database/SchemaBuilder";
import { FileEntry } from "ssh2";

export class DownloadCommand implements CLICommand, FileProvider {

  constructor(
    private readonly db: Kysely<Database>,
    private readonly sftp: PromiseSFTP,
    private readonly directory: string
  ) {}

  /**
   * On its own the download is the whole command, so the connection it read the log through is closed
   * afterwards. Downloading as part of an import leaves that to the import, see DownloadAndProcessCommand.
   */
  public async run(argv: string[]): Promise<string[]> {
    const files = await this.download(argv[3] || "/tmp/");

    await this.end();

    return files;
  }

  /**
   * Download the latest refresh file from an SFTP server
   */
  public async download(outputDirectory: string): Promise<string[]> {
    const [remoteFiles, lastProcessedFile] = await Promise.all([
      this.sftp.readdir(this.directory),
      this.getLastProcessedFile()
    ]);

    const files = this.getFilesToProcess(remoteFiles!, lastProcessedFile);

    if (files.length > 0) {
      console.log(`Downloading ${files.length} feed file(s)`);
    }
    else {
      console.log("No files to update.");
    }

    try {
      await Promise.all(
        files.map(f => this.sftp.fastGet(this.directory + f, outputDirectory + f, { concurrency: 1 }))
      );
    }
    catch (err) {
      console.error(err);
    }

    this.sftp.end();

    return files.map(filename => outputDirectory + filename);
  }

  /**
   * Close the underlying database connection
   */
  public async end(): Promise<void> {
    await this.db.destroy();
  }

  /**
   * The last file an import recorded, or nothing at all when no feed has been imported yet and the table
   * the imports write to does not exist
   */
  private async getLastProcessedFile(): Promise<string | undefined> {
    try {
      const [log] = await this.db
        .selectFrom(LOG_TABLE)
        .select("filename")
        .orderBy("id", "desc")
        .limit(1)
        .execute();

      return log?.filename ?? undefined;
    }
    catch (err) {
      return undefined;
    }
  }

  /**
   * Do a directory listing to get the filename of the last full refresh
   */
  private getFilesToProcess(dir: FileEntry[], lastProcessed: string | undefined): string[] {
    dir.sort((a: FileEntry, b: FileEntry) => b.attrs.mtime - a.attrs.mtime);

    const lastRefresh = dir.findIndex(i => i.filename.charAt(4) === "F" || i.filename.startsWith("RJRG"));
    const lastFile = dir.findIndex(i => i.filename === lastProcessed);
    const files = lastFile > -1 && (lastFile <= lastRefresh || lastRefresh < 0)
      ? dir.slice(0, lastFile)
      : dir.slice(0, lastRefresh + 1);

    return files.map(f => f.filename).reverse();
  }

}

