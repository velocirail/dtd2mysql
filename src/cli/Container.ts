import memoize from "memoized-class-decorator";
import {Kysely, MysqlDialect} from "kysely";
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {CLICommand} from "./CLICommand";
import {ImportFeedCommand} from "./ImportFeedCommand";
import {DatabaseConfiguration, DatabaseConnection} from "../database/DatabaseConnection";
import {DialectName, dialectNames, SchemaDialect} from "../database/SchemaDialect";
import {getSchemaDialect} from "../database/dialect";
import {NodeSqliteDialect} from "../database/NodeSqliteDriver";
import {Database} from "../database/Database";
import config from "../../config";
import schema from "../../config/schema";
import {CleanFaresCommand} from "./CleanFaresCommand";
import {ShowHelpCommand} from "./ShowHelpCommand";
import {OutputGTFSCommand} from "./OutputGTFSCommand";
import {CIFRepository} from "../gtfs/repository/CIFRepository";
import {stationCoordinates} from "../../config/gtfs/station-coordinates";
import {FileOutput} from "../gtfs/output/FileOutput";
import {GTFSOutput} from "../gtfs/output/GTFSOutput";
import {OutputGTFSZipCommand} from "./OutputGTFSZipCommand";
import {DownloadCommand} from "./DownloadCommand";
import {DownloadAndProcessCommand} from "./DownloadAndProcessCommand";
import {GTFSImportCommand} from "./GTFSImportCommand";
import {downloadUrl} from "../../config/nfm64";
import {DownloadFileCommand} from "./DownloadFileCommand";
import {PromiseSFTP} from "../sftp/PromiseSFTP";

export class Container {

  @memoize
  public getCommand(type: string): Promise<CLICommand> {
    switch (type) {
      case "--fares": return this.getFaresImportCommand();
      case "--fares-clean": return this.getCleanFaresCommand();
      case "--routeing": return this.getRouteingImportCommand();
      case "--timetable": return this.getTimetableImportCommand();
      case "--nfm64": return this.getNFM64ImportCommand();
      case "--gtfs": return this.getOutputGTFSCommand();
      case "--gtfs-import": return this.getImportGTFSCommand();
      case "--gtfs-zip": return this.getOutputGTFSZipCommand();
      case "--download-fares": return this.getDownloadCommand("/fares/");
      case "--download-timetable": return this.getDownloadCommand("/timetable/");
      case "--download-routeing": return this.getDownloadCommand("/routing_guide/");
      case "--download-nfm64": return this.getDownloadNFM64Command();
      case "--get-fares": return this.getDownloadAndProcessCommand("/fares/", this.getFaresImportCommand());
      case "--get-timetable": return this.getDownloadAndProcessCommand("/timetable/", this.getTimetableImportCommand());
      case "--get-routeing": return this.getDownloadAndProcessCommand("/routing_guide/", this.getRouteingImportCommand());
      case "--get-nfm64": return this.getDownloadAndProcessNFM64Command();
      default: return this.getShowHelpCommand();
    }
  }

  @memoize
  public async getFaresImportCommand(): Promise<ImportFeedCommand> {
    return new ImportFeedCommand(this.getKysely(), this.getSchemaDialect(), config.fares, schema.fares, fs.mkdtempSync(path.join(os.tmpdir(), "dtd")));
  }

  @memoize
  public async getRouteingImportCommand(): Promise<ImportFeedCommand> {
    return new ImportFeedCommand(this.getKysely(), this.getSchemaDialect(), config.routeing, schema.routeing, fs.mkdtempSync(path.join(os.tmpdir(), "dtd")));
  }

  @memoize
  public async getTimetableImportCommand(): Promise<ImportFeedCommand> {
    return new ImportFeedCommand(this.getKysely(), this.getSchemaDialect(), config.timetable, schema.timetable, fs.mkdtempSync(path.join(os.tmpdir(), "dtd")));
  }

  @memoize
  public async getNFM64ImportCommand(): Promise<ImportFeedCommand> {
    return new ImportFeedCommand(this.getKysely(), this.getSchemaDialect(), config.nfm64, schema.nfm64, fs.mkdtempSync(path.join(os.tmpdir(), "dtd")));
  }


  @memoize
  public async getCleanFaresCommand(): Promise<CLICommand> {
    return new CleanFaresCommand(await this.getDatabaseConnection());
  }

  @memoize
  public async getShowHelpCommand(): Promise<CLICommand> {
    return new ShowHelpCommand();
  }

  @memoize
  public getImportGTFSCommand(): Promise<GTFSImportCommand> {
    return Promise.resolve(new GTFSImportCommand(this.databaseConfiguration));
  }

  @memoize
  private getOutputGTFSCommandWithOutput(output: GTFSOutput): OutputGTFSCommand {
    return new OutputGTFSCommand(
      new CIFRepository(
        this.getDatabaseConnection(),
        this.getDatabaseStream(),
        stationCoordinates
      ),
      output
    );
  }

  @memoize
  private async getOutputGTFSCommand(): Promise<OutputGTFSCommand> {
    return this.getOutputGTFSCommandWithOutput(new FileOutput());
  }

  @memoize
  private async getOutputGTFSZipCommand(): Promise<OutputGTFSZipCommand> {
    return new OutputGTFSZipCommand(await this.getOutputGTFSCommand());
  }

  @memoize
  private async getDownloadCommand(path: string): Promise<DownloadCommand> {
    return new DownloadCommand(await this.getDatabaseConnection(), await this.getSFTP(), path);
  }

  @memoize
  private async getDownloadNFM64Command(): Promise<DownloadFileCommand> {
    return Promise.resolve(new DownloadFileCommand(downloadUrl));
  }

  @memoize
  private async getDownloadAndProcessCommand(path: string, process: Promise<ImportFeedCommand>): Promise<DownloadAndProcessCommand> {
    return new DownloadAndProcessCommand(await this.getDownloadCommand(path), await process);
  }

  @memoize
  private async getDownloadAndProcessNFM64Command(): Promise<DownloadAndProcessCommand> {
    return new DownloadAndProcessCommand(
      await this.getDownloadNFM64Command(),
      await this.getNFM64ImportCommand()
    );
  }

  @memoize
  private getSFTP(): Promise<PromiseSFTP> {
    return PromiseSFTP.connect({
      host: process.env.SFTP_HOSTNAME || "dtd.atocrsp.org",
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD,
      algorithms: {
        kex: [
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha1"
        ],
        cipher: [
          "3des-cbc",
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
          "aes128-gcm",
          "aes128-gcm@openssh.com",
          "aes256-gcm",
          "aes256-gcm@openssh.com"
        ],
        serverHostKey: [
          "ssh-dss",
          "ssh-rsa",
          "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384",
          "ecdsa-sha2-nistp521"
        ],
        hmac: [
          "hmac-sha2-256",
          "hmac-sha2-512",
          "hmac-sha1"
        ]
      }
    });
  }

  /**
   * The row writer and the GTFS queries still speak MySQL directly, so anything that needs them fails here
   * rather than further down with a confusing connection error
   */
  @memoize
  public getDatabaseConnection(): DatabaseConnection {
    const { dialect } = this.databaseConfiguration;

    if (dialect !== "mysql") {
      throw new Error(`Only the schema layer supports ${dialect}, everything else still requires mysql.`);
    }

    return require('mysql2/promise').createPool({
      ...this.driverConfiguration,
      //debug: ['ComQueryPacket', 'RowDataPacket']
    });
  }

  @memoize
  public getDatabaseStream() {
    return require('mysql2').createPool(this.driverConfiguration);
  }

  @memoize
  public getSchemaDialect(): SchemaDialect {
    return getSchemaDialect(this.databaseConfiguration.dialect);
  }

  /**
   * The schema layer talks to the database through Kysely so that it can target more than just MySQL.
   *
   * MySQL shares the streaming pool rather than opening a third one.
   */
  @memoize
  public getKysely(): Kysely<Database> {
    const configuration = this.databaseConfiguration;

    switch (configuration.dialect) {
      case "mysql":
        return new Kysely({ dialect: new MysqlDialect({ pool: this.getDatabaseStream() }) });
      case "sqlite":
        return new Kysely({ dialect: new NodeSqliteDialect(configuration.database) });
      case "postgres":
        throw new Error("The postgres driver is not wired up yet, only the schema layer supports it.");
    }
  }

  /**
   * The database configuration without the fields that mysql2 does not understand
   */
  private get driverConfiguration() {
    const { dialect, ...configuration } = this.databaseConfiguration;

    return configuration;
  }

  public get databaseConfiguration(): DatabaseConfiguration {
    if (!process.env.DATABASE_NAME) {
      throw new Error("Please set the DATABASE_NAME environment variable.");
    }

    return {
      dialect: getDialectName(),
      host: process.env.DATABASE_HOSTNAME || "localhost",
      user: process.env.DATABASE_USERNAME || "root",
      password: process.env.DATABASE_PASSWORD || null,
      database: <string>process.env.DATABASE_NAME,
      port: +(process.env.DATABASE_PORT || 3306),
      connectionLimit: 20,
      multipleStatements: true,
      // return DATE columns as YYYY-MM-DD rather than a Date at local midnight, so that reading a
      // date out of the database does not depend on the timezone of the machine doing the reading
      dateStrings: true
    };
  }

}

/**
 * The database the CLI is pointed at, defaulting to MySQL for backwards compatibility
 */
function getDialectName(): DialectName {
  const name = process.env.DATABASE_DIALECT || "mysql";

  if (!dialectNames.includes(name as DialectName)) {
    throw new Error(`Unknown DATABASE_DIALECT "${name}", expected one of ${dialectNames.join(", ")}.`);
  }

  return name as DialectName;
}
