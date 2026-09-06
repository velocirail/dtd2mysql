import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {Kysely} from "kysely";
import {FeedConfig} from "../../config";
import {Row, Table} from "../../src/database/Schema";

/**
 * Which database the suite runs against. MySQL is the default because that is what the recorded rows
 * were taken from, and every dialect is compared against the same ones.
 */
export const dialect = process.env.DATABASE_DIALECT ?? "mysql";

// docker-compose.yml and the CI service both provide this database, sqlite just needs somewhere to live
process.env.DATABASE_NAME ??= dialect === "sqlite"
  ? path.join(os.tmpdir(), "dtd2mysql-integration.sqlite")
  : "dtd2mysql";

// the project compiles to CommonJS so import.meta is out, and vitest runs from the project root
const directory = path.join(process.cwd(), "test", "integration");

/**
 * The recorded rows for a feed, which the import is compared against
 */
export function expectedRows(name: string): string {
  return path.join(directory, "expected", name);
}

/**
 * Zip a fixture folder up, as the import takes an archive rather than a folder.
 *
 * The archive name matters, the fifth character says whether the feed is a full refresh or a set of
 * changes to apply on top of one.
 */
export function zipFixture(fixture: string, archive: string): string {
  const zip = new AdmZip();

  zip.addLocalFolder(path.join(directory, "fixture", fixture));

  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-fixture")), archive);

  zip.writeZip(filename);

  return filename;
}

/**
 * The tables a feed writes to, in a stable order, deduplicated because some files share their records
 */
export function tableNames(feed: FeedConfig): string[] {
  const names = Object.values(feed).flatMap(file => file.recordTypes.map(record => record.name));

  return [...new Set(names)].sort();
}

/**
 * Every row of every table, JSON so that the driver's row objects compare as plain data.
 *
 * Rows come back in whatever order the database feels like, so they are ordered by the generated id the
 * feed tables all have. The GTFS tables are keyed by the specification instead, so they say what to use.
 */
export async function readTables(
  db: Kysely<any>,
  tables: string[],
  orderBy: (table: string) => readonly string[] = () => ["id"]
): Promise<string> {
  const contents: { [table: string]: unknown[] } = {};

  for (const table of tables) {
    let query = db.selectFrom(table).selectAll();

    for (const column of orderBy(table)) {
      query = query.orderBy(column);
    }

    contents[table] = JSON.parse(JSON.stringify(await query.execute()));
  }

  return JSON.stringify(contents, null, 2);
}

/**
 * A row of the given table, carrying the given values and something acceptable everywhere else.
 *
 * A fares table is forty columns wide and a test that spells all of them out says nothing about which of
 * them it is actually about. The declaration already says what each column holds, so the rest are filled
 * from it and the test names only the values it is making a point with.
 */
export function rowOf<T extends Table>(table: T, values: Partial<Values<T>>): Values<T> {
  const row: { [column: string]: unknown } = {};

  for (const [name, column] of Object.entries(table.columns)) {
    // a column that can be empty is left empty, so a value in a recorded row was put there on purpose
    if (column.nullable) {
      row[name] = null;
      continue;
    }

    switch (column.type.type) {
      case "int": case "boolean": case "double": case "float": case "foreignKey": row[name] = 0; break;
      case "date": row[name] = "2000-01-01"; break;
      case "time": row[name] = "00:00:00"; break;
      default: row[name] = "";
    }
  }

  return { ...row, ...values } as Values<T>;
}

/**
 * The columns of a table without the id the database generates
 */
type Values<T extends Table> = Omit<Row<T>, "id">;

/**
 * The most recent file the import recorded, which is appended to rather than reset
 */
export async function lastProcessedFile(db: Kysely<any>): Promise<string | undefined> {
  const [row] = await db.selectFrom("log").select("filename").orderBy("id", "desc").limit(1).execute();

  return row?.filename;
}
