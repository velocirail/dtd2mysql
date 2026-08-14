import {boolean, date, float, integer, nullable, time, varchar} from "../../src/database/Schema";
import {gtfsTable} from "../../src/database/GTFSSchema";

/**
 * The tables --gtfs-import loads the GTFS files into.
 *
 * They hold each file as it was written, so the columns are the columns of the file and the key is the
 * one the GTFS specification gives. Declaring them rather than writing the DDL out is what lets the same
 * import run against MySQL, Postgres and SQLite.
 */
export const agency = gtfsTable({
  agency_id: varchar(100),
  agency_name: varchar(255),
  agency_url: varchar(255),
  agency_timezone: varchar(100),
  agency_lang: nullable(varchar(100)),
  agency_phone: nullable(varchar(100)),
  agency_fare_url: nullable(varchar(100)),
}, {
  primaryKey: ["agency_id"]
});

export const calendar = gtfsTable({
  service_id: integer(4),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  start_date: date,
  end_date: date,
}, {
  primaryKey: ["service_id"],
  indexes: [
    "start_date", "end_date", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
  ]
});

export const calendar_dates = gtfsTable({
  service_id: integer(4),
  date: date,
  exception_type: integer(2),
}, {
  primaryKey: ["service_id", "date"]
});

/**
 * Not a GTFS file. The fixed links are written to links.txt in a format of this project's own.
 */
export const links = gtfsTable({
  from_stop_id: varchar(100),
  to_stop_id: varchar(100),
  mode: varchar(15),
  // a number of seconds rather than a time of day
  duration: integer(4),
  start_time: time,
  end_time: time,
  start_date: date,
  end_date: date,
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
});

export const routes = gtfsTable({
  route_id: varchar(100),
  agency_id: nullable(varchar(100)),
  route_short_name: varchar(50),
  route_long_name: varchar(255),
  route_type: integer(7),
  route_text_color: nullable(varchar(255)),
  route_color: nullable(varchar(255)),
  route_url: nullable(varchar(255)),
  route_desc: nullable(varchar(255)),
}, {
  primaryKey: ["route_id"]
});

/**
 * Nothing writes shapes.txt, so this is only ever created empty. It is kept because dropping a table
 * someone may be reading from is not this change's to make.
 */
export const shapes = gtfsTable({
  shape_id: integer(4),
  // a coordinate is signed, so it cannot be one of the feed's unsigned doubles
  shape_pt_lat: float,
  shape_pt_lon: float,
  shape_pt_sequence: integer(3),
  shape_dist_traveled: nullable(varchar(50)),
}, {
  primaryKey: ["shape_id"]
});

export const stop_times = gtfsTable({
  trip_id: integer(7),
  // GTFS counts from noon minus twelve hours and writes 25:30:00 for half past one the next morning.
  // MySQL's time type happens to hold that, Postgres tops out at 24:00:00, so the value is kept as the
  // text it is in the file rather than being called a time of day.
  arrival_time: nullable(varchar(8)),
  departure_time: nullable(varchar(8)),
  stop_id: varchar(100),
  stop_sequence: integer(2),
  stop_headsign: nullable(varchar(50)),
  pickup_type: nullable(integer(2)),
  drop_off_type: nullable(integer(2)),
  shape_dist_traveled: nullable(varchar(50)),
  timepoint: nullable(integer(2)),
}, {
  primaryKey: ["trip_id", "stop_sequence"],
  indexes: ["arrival_time", "departure_time", "stop_id"]
});

export const stops = gtfsTable({
  stop_id: varchar(100),
  stop_code: nullable(varchar(50)),
  stop_name: varchar(255),
  stop_desc: nullable(varchar(255)),
  stop_lat: nullable(float),
  stop_lon: nullable(float),
  zone_id: nullable(varchar(255)),
  stop_url: nullable(varchar(255)),
  location_type: nullable(varchar(2)),
  parent_station: nullable(varchar(100)),
  stop_timezone: nullable(varchar(50)),
  wheelchair_boarding: nullable(integer(2)),
}, {
  primaryKey: ["stop_id"]
});

export const transfers = gtfsTable({
  from_stop_id: varchar(100),
  to_stop_id: varchar(100),
  transfer_type: integer(2),
  min_transfer_time: integer(4),
}, {
  primaryKey: ["from_stop_id", "to_stop_id", "transfer_type"]
});

export const trips = gtfsTable({
  route_id: varchar(255),
  service_id: integer(4),
  trip_id: integer(7),
  trip_headsign: nullable(varchar(50)),
  trip_short_name: nullable(varchar(50)),
  direction_id: nullable(boolean),
  wheelchair_accessible: nullable(integer(2)),
  bikes_allowed: nullable(integer(2)),
}, {
  primaryKey: ["trip_id"],
  indexes: ["service_id", "trip_headsign"]
});

export default {
  agency,
  calendar,
  calendar_dates,
  links,
  routes,
  shapes,
  stop_times,
  stops,
  transfers,
  trips
};
