
import {CLICommand} from "./CLICommand";
import {ImportFeedCommand} from "./ImportFeedCommand";

export class DownloadAndProcessCommand implements CLICommand {

  constructor(
    private readonly download: FileProvider,
    private readonly process: ImportFeedCommand
  ) {}

  /**
   * Download and process the feed in one command.
   *
   * The download is asked for the files rather than run as a command of its own, as the import still has
   * the connection they were worked out through to finish with.
   */
  public async run(argv: string[]): Promise<any> {
    const files = await this.download.download(argv[3] || "/tmp/");

    for (const filename of files) {
      try {
        await this.process.doImport(filename);
      }
      catch (err) {
        console.error(err);
      }
    }

    return this.process.end();
  }

}

export interface FileProvider {
  download(outputDirectory: string): Promise<string[]>;
}