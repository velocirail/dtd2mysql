
import {DialectName} from "./SchemaDialect";

export interface DatabaseConfiguration {
  dialect: DialectName,
  host: string,
  user: string,
  password: string | null,
  database: string,
  connectionLimit: number,
  multipleStatements: boolean,
  port: number,
  dateStrings: boolean,
  promise?: any
}
