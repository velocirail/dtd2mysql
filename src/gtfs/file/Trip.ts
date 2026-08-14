import {RSID, TUID} from "../native/OverlayRecord";

export interface Trip {
  route_id: number;
  service_id: number;
  trip_id: number;
  trip_headsign: TUID;
  trip_short_name: RSID;
  direction_id: 0 | 1;
  wheelchair_accessible: 0 | 1 | 2;
  bikes_allowed: 0 | 1 | 2;

  /**
   * The CIF train UID this trip came from, as an extra (non-standard) GTFS field.
   *
   * Consumers that do not know the column ignore it. It exists because trip_id is a surrogate with
   * no meaning outside this export, so the UID is the only handle anything upstream of the DTD feed
   * has on a trip - notably a real-time feed, which has to re-attach Darwin messages (keyed on the
   * UID, not the GTFS trip) to the trips in here.
   *
   * For a service formed by joining or splitting others this is the composite UID the association
   * produced, e.g. "C12345_C67890", not a single CIF UID.
   */
  train_uid: TUID;
}