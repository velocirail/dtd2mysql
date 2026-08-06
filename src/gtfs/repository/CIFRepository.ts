
import proj4 from 'proj4';
import {Kysely, sql} from "kysely";
import {Database} from "../../database/Database";
import {Transfer} from "../file/Transfer";
import {CRS, Stop} from "../file/Stop";
import {ScheduleCalendar} from "../native/ScheduleCalendar";
import {Association, AssociationType, DateIndicator} from "../native/Association";
import {RSID, STP, TUID} from "../native/OverlayRecord";
import {ScheduleBuilder, ScheduleResults} from "./ScheduleBuilder";
import {RouteType} from "../file/Route";
import {Duration} from "../native/Duration";
import {FixedLink} from "../file/FixedLink";

/**
 * Provide access to the CIF/TTIS data in a vaguely GTFS-ish shape.
 */
export class CIFRepository {

  constructor(
    private readonly db: Kysely<Database>,
    private readonly stationCoordinates: StationCoordinates,
    // the cut off dates are worked out here rather than by the database, so that the output of a given
    // feed does not depend on which machine ran the query, and can be pinned in a test
    private readonly today: Temporal.PlainDate = Temporal.Now.plainDateISO()
  ) {
    proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs');
  }

  /**
   * Return the interchange time between each station
   */
  public async getTransfers(): Promise<Transfer[]> {
    return this.db
      .selectFrom("physical_station")
      .where("cate_interchange_status", "is not", null)
      .where("id", "in", this.oneStationPerCrs("cate_interchange_status"))
      .select(eb => [
        "crs_code as from_stop_id",
        "crs_code as to_stop_id",
        eb.lit(2).as("transfer_type"),
        sql<number>`${eb.ref("minimum_change_time")} * 60`.as("min_transfer_time")
      ])
      .orderBy("crs_code")
      .execute() as Promise<Transfer[]>;
  }

  /**
   * Return all the stops with some configurable long/lat applied
   */
  public async getStops(): Promise<Stop[]> {
    const results = await this.db
      .selectFrom("physical_station")
      .where("crs_code", "is not", null)
      .where("id", "in", this.oneStationPerCrs("crs_code"))
      .select(eb => [
        "crs_code as stop_id",
        "tiploc_code as stop_code",
        "station_name as stop_name",
        "cate_interchange_status as stop_desc",
        sql<null>`null`.as("zone_id"),
        sql<null>`null`.as("stop_url"),
        sql<null>`null`.as("location_type"),
        sql<null>`null`.as("parent_station"),
        eb.case()
          .when("station_name", "like", "%(CIE%")
          .then(eb.val("Europe/Dublin"))
          .else(eb.val("Europe/London"))
          .end()
          .as("stop_timezone"),
        eb.lit(0).as("wheelchair_boarding"),
        "easting",
        "northing"
      ])
      .orderBy("crs_code")
      .execute();

    // overlay the long and latitude values from configuration
    return results.map(row => {
      const [stop_lon, stop_lat] = proj4('EPSG:27700', 'EPSG:4326', [(row.easting! - 10000) * 100, (row.northing! - 60000) * 100]);
      const {easting, northing, ...stop} = {...row, stop_lon, stop_lat};
      return Object.assign(stop, this.stationCoordinates[stop.stop_id as CRS]) as unknown as Stop;
    });
  }

  /**
   * The physical station rows to use, one per CRS code.
   *
   * The feed has a row per tiploc and several can share a CRS code. This used to be a GROUP BY that left
   * the other columns off it, which MySQL allows and answers by picking a row of its choosing. Postgres
   * rejects it outright, so the row is chosen here rather than left to the database.
   */
  private oneStationPerCrs(notNull: "crs_code" | "cate_interchange_status") {
    return this.db
      .selectFrom("physical_station")
      .where(notNull, "is not", null)
      .select(eb => eb.fn.min("id").as("id"))
      .groupBy("crs_code");
  }

  /**
   * Return the schedules and z trains. These queries probably require some explanation:
   *
   * The first query selects the stop times for all passenger services between now and + 3 months. It's important that
   * the stop time location is mapped to physical stations to avoid getting fake CRS codes from the tiploc data.
   *
   * The second query selects all the z-trains (usually replacement buses) within three months. They already use CRS
   * codes as the location so avoid the disaster above.
   *
   * The range is a period like '3 MONTH', which is parsed rather than pasted into the SQL.
   */
  public async getSchedules(range: string): Promise<ScheduleResults> {
    const scheduleBuilder = new ScheduleBuilder();
    const [lastSchedule] = await this.db
      .selectFrom("schedule")
      .select("id")
      .orderBy("id", "desc")
      .limit(1)
      .execute();

    const from = this.today.toString();
    const until = this.today.add(parseRange(range)).toString();
    const threeMonths = this.today.add({ months: 3 }).toString();

    // loaded one after the other rather than at once, as they push into the same list and the order
    // they finish in would otherwise depend on how fast each driver happens to deliver its rows
    await scheduleBuilder.loadSchedules(this.streamSchedules(from, until));
    await scheduleBuilder.loadSchedules(this.streamZSchedules(from, threeMonths, lastSchedule?.id ?? 0));

    return scheduleBuilder.results;
  }

  private streamSchedules(from: string, until: string): AsyncIterable<ScheduleStopTimeRow> {
    return this.db
      .selectFrom("schedule")
      .leftJoin("schedule_extra", "schedule.id", "schedule_extra.schedule")
      .leftJoin("stop_time", "schedule.id", "stop_time.schedule")
      .leftJoin("physical_station as ps", "stop_time.location", "ps.tiploc_code")
      .where(eb => eb.or([
        eb("stop_time.id", "is", null),
        eb("ps.crs_code", "is not", null)
      ]))
      .where("schedule.runs_from", "<", until)
      .where("schedule.runs_to", ">=", from)
      .where("stop_time.scheduled_pass_time", "is", null)
      .select(eb => [
        "schedule.id as id",
        "schedule.train_uid",
        "schedule_extra.retail_train_id",
        "schedule.runs_from",
        "schedule.runs_to",
        "schedule.monday", "schedule.tuesday", "schedule.wednesday", "schedule.thursday",
        "schedule.friday", "schedule.saturday", "schedule.sunday",
        "ps.crs_code",
        "schedule.stp_indicator",
        "stop_time.public_arrival_time",
        "stop_time.public_departure_time",
        eb.case()
          .when("schedule.train_status", "=", "S")
          .then(eb.val("SS"))
          .else(eb.ref("schedule.train_category"))
          .end()
          .as("train_category"),
        "stop_time.scheduled_arrival_time",
        "stop_time.scheduled_departure_time",
        "stop_time.platform",
        "schedule_extra.atoc_code",
        "stop_time.id as stop_id",
        "stop_time.activity",
        "schedule.reservations",
        "schedule.train_class"
      ])
      .orderBy("schedule.stp_indicator", "desc")
      .orderBy("schedule.id")
      .orderBy("stop_time.id")
      .stream() as AsyncIterable<ScheduleStopTimeRow>;
  }

  private streamZSchedules(from: string, until: string, lastScheduleId: number): AsyncIterable<ScheduleStopTimeRow> {
    return this.db
      .selectFrom("z_schedule")
      .leftJoin("z_schedule_extra", "z_schedule.id", "z_schedule_extra.schedule")
      .innerJoin("z_stop_time", "z_schedule.id", "z_stop_time.z_schedule")
      .where("z_schedule.runs_from", "<", until)
      .where("z_schedule.runs_to", ">=", from)
      .select(eb => [
        sql<number>`${eb.lit(lastScheduleId)} + ${eb.ref("z_schedule.id")}`.as("id"),
        "z_schedule.train_uid",
        sql<null>`null`.as("retail_train_id"),
        "z_schedule.runs_from",
        "z_schedule.runs_to",
        "z_schedule.monday", "z_schedule.tuesday", "z_schedule.wednesday", "z_schedule.thursday",
        "z_schedule.friday", "z_schedule.saturday", "z_schedule.sunday",
        "z_schedule.stp_indicator",
        "z_stop_time.location as crs_code",
        "z_schedule.train_category",
        "z_stop_time.public_arrival_time",
        "z_stop_time.public_departure_time",
        "z_stop_time.scheduled_arrival_time",
        "z_stop_time.scheduled_departure_time",
        "z_stop_time.platform",
        "z_schedule_extra.atoc_code",
        "z_stop_time.id as stop_id",
        "z_stop_time.activity",
        sql<null>`null`.as("reservations"),
        eb.val("S").as("train_class")
      ])
      .orderBy("z_stop_time.id")
      .stream() as AsyncIterable<ScheduleStopTimeRow>;
  }

  /**
   * Get associations
   */
  public async getAssociations(): Promise<Association[]> {
    const results = await this.db
      .selectFrom("association as a")
      .innerJoin("tiploc", "a.assoc_location", "tiploc.tiploc_code")
      .where("a.start_date", "<", this.today.add({ months: 3 }).toString())
      .where("a.end_date", ">=", this.today.toString())
      .select([
        "a.id as id", "a.base_uid", "a.assoc_uid", "tiploc.crs_code", "a.assoc_date_ind", "a.assoc_cat",
        "a.monday", "a.tuesday", "a.wednesday", "a.thursday", "a.friday", "a.saturday", "a.sunday",
        "a.start_date", "a.end_date", "a.stp_indicator"
      ])
      .orderBy("a.stp_indicator", "desc")
      .orderBy("a.id")
      .execute() as unknown as AssociationRow[];

    return results.map(row => new Association(
      row.id,
      row.base_uid,
      row.assoc_uid,
      row.crs_code,
      row.assoc_date_ind,
      row.assoc_cat,
      new ScheduleCalendar(
        Temporal.PlainDate.from(row.start_date),
        Temporal.PlainDate.from(row.end_date), {
        0: row.sunday,
        1: row.monday,
        2: row.tuesday,
        3: row.wednesday,
        4: row.thursday,
        5: row.friday,
        6: row.saturday
      }),
      row.stp_indicator
    ));
  }

  /**
   * Return the ALF information
   */
  public async getFixedLinks(): Promise<FixedLink[]> {
    // use the additional fixed links if possible and fill the missing data with fixed_links
    const additional = this.db
      .selectFrom("additional_fixed_link")
      .where("origin", "in", this.db.selectFrom("physical_station").select("crs_code"))
      .where("destination", "in", this.db.selectFrom("physical_station").select("crs_code"))
      .select(eb => [
        "mode", sql<number>`${eb.ref("duration")} * 60`.as("duration"), "origin", "destination",
        "start_time", "end_time", "start_date", "end_date",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
      ]);

    // matched on the pair rather than the two values glued together, which could match the wrong link
    const fallback = this.db
      .selectFrom("fixed_link")
      .where(({ not, exists, selectFrom }) => not(exists(
        selectFrom("additional_fixed_link as a")
          .select(eb => eb.lit(1).as("one"))
          .whereRef("a.origin", "=", "fixed_link.origin")
          .whereRef("a.destination", "=", "fixed_link.destination")
      )))
      .select(eb => [
        "mode", sql<number>`${eb.ref("duration")} * 60`.as("duration"), "origin", "destination",
        eb.val("00:00:00").as("start_time"), eb.val("23:59:59").as("end_time"),
        eb.val("2017-01-01").as("start_date"), eb.val("2038-01-19").as("end_date"),
        eb.lit(1).as("monday"), eb.lit(1).as("tuesday"), eb.lit(1).as("wednesday"),
        eb.lit(1).as("thursday"), eb.lit(1).as("friday"), eb.lit(1).as("saturday"),
        eb.lit(1).as("sunday")
      ]);

    const rows = await additional
      .union(fallback)
      .orderBy("origin")
      .orderBy("destination")
      .execute() as unknown as FixedLinkRow[];

    const results: FixedLink[] = [];

    for (const row of rows) {
      results.push(this.getFixedLinkRow(row.origin, row.destination, row));
      results.push(this.getFixedLinkRow(row.destination, row.origin, row));
    }

    return results;
  }

  /**
   * The day flags are declared as 0 or 1, but a union of a column and a literal is typed differently by
   * each database and MySQL hands these back as strings, so they are made numbers here.
   */
  private getFixedLinkRow(origin: CRS, destination: CRS, row: FixedLinkRow): FixedLink {
    return {
      from_stop_id: origin,
      to_stop_id: destination,
      mode: row.mode,
      duration: Number(row.duration),
      start_time: row.start_time,
      end_time: row.end_time,
      start_date: (row.start_date || "2017-01-01"),
      end_date: (row.end_date || "2038-01-19"),
      monday: Number(row.monday) as 0 | 1,
      tuesday: Number(row.tuesday) as 0 | 1,
      wednesday: Number(row.wednesday) as 0 | 1,
      thursday: Number(row.thursday) as 0 | 1,
      friday: Number(row.friday) as 0 | 1,
      saturday: Number(row.saturday) as 0 | 1,
      sunday: Number(row.sunday) as 0 | 1
    };
  }

  /**
   * Close the underlying database
   */
  public end(): Promise<void> {
    return this.db.destroy();
  }

}

export interface ScheduleStopTimeRow {
  id: number,
  train_uid: TUID,
  retail_train_id: RSID,
  runs_from: string,
  runs_to: string,
  monday: 0 | 1,
  tuesday: 0 | 1,
  wednesday: 0 | 1,
  thursday: 0 | 1,
  friday: 0 | 1,
  saturday: 0 | 1,
  sunday: 0 | 1,
  stp_indicator: STP,
  crs_code: CRS,
  train_category: string,
  atoc_code: string | null,
  public_arrival_time: string | null,
  public_departure_time: string | null,
  scheduled_arrival_time: string | null,
  scheduled_departure_time: string | null,
  platform: string,
  activity: string,
  train_class: null | "S" | "B",
  reservations: null | "R" | "S" | "A"
}

export type StationCoordinates = {
  [crs: string]: {
    stop_lat: number,
    stop_lon: number,
    stop_name: string,
    wheelchair_boarding: 0 | 1 | 2
  }
};

interface AssociationRow {
  id: number;
  base_uid: string;
  assoc_uid: string;
  crs_code: CRS;
  start_date: string;
  end_date: string;
  assoc_date_ind: DateIndicator,
  assoc_cat: AssociationType,
  sunday: 0 | 1;
  monday: 0 | 1;
  tuesday: 0 | 1;
  wednesday: 0 | 1;
  thursday: 0 | 1;
  friday: 0 | 1;
  saturday: 0 | 1;
  stp_indicator: STP;
}

interface FixedLinkRow {
  mode: FixedLinkMode;
  duration: Duration;
  origin: CRS;
  destination: CRS;
  start_time: string;
  end_time: string;
  start_date: string | null;
  end_date: string | null;
  monday: 0 | 1;
  tuesday: 0 | 1;
  wednesday: 0 | 1;
  thursday: 0 | 1;
  friday: 0 | 1;
  saturday: 0 | 1;
  sunday: 0 | 1;
}

/**
 * Turn a period like "3 MONTH" into something that can be added to a date
 */
export function parseRange(range: string): Temporal.Duration {
  const units: { [unit: string]: string } = {
    DAY: "days", WEEK: "weeks", MONTH: "months", YEAR: "years"
  };
  const [amount, unit] = range.trim().split(/\s+/);
  const key = units[(unit ?? "").toUpperCase()];

  if (!key || !Number.isInteger(Number(amount))) {
    throw new Error(`Unable to read "${range}" as a range, expected something like "3 MONTH".`);
  }

  return Temporal.Duration.from({ [key]: Number(amount) });
}

enum FixedLinkMode {
  Walk = "WALK",
  Metro = "METRO",
  Transfer = "TRANSFER",
  Tube = "TUBE",
  Bus = "BUS"
}
