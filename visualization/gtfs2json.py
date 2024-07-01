from argparse import ArgumentParser
import csv
import json
import os

parser = ArgumentParser()
parser.add_argument("gtfs_dir")
parser.add_argument("service_id")
parser.add_argument(
    "trip_short_name",
    help="The trip used to find and order all the stops."
)
parser.add_argument("out_dir")


def gtfs_time_string_to_sec(t: str) -> int:
    hh, mm, ss = [float(c) for c in t.split(":")]
    return 3600 * hh + 60 * mm + ss


def main():
    args = parser.parse_args()

    with open(os.path.join(args.gtfs_dir, "trips.txt")) as f:
        trips = {
            trip["trip_id"]: trip
            for trip in csv.DictReader(f)
            if trip["service_id"] == args.service_id
        }
    trip_id_for_stops_search = [trip_id for trip_id, trip in trips.items() if trip["trip_short_name"] == args.trip_short_name]
    if len(trip_id_for_stops_search) != 1:
        raise ValueError(f"Wanted exactly 1 trip, got {len(trip_id_for_stops_search)}.")
    trip_id_for_stops = trip_id_for_stops_search[0]

    with open(os.path.join(args.gtfs_dir, "stops.txt")) as f:
        stops = {stop["stop_id"]: stop for stop in csv.DictReader(f)}

    stops_ancestor = {}
    for stop_id, stop in stops.items():
        while stop["parent_station"]:
            stop = stops[stop["parent_station"]]
        stops_ancestor[stop_id] = stop["stop_id"]
    with open(os.path.join(args.out_dir, "stops_ancestor.json"), "w") as f:
        json.dump(stops_ancestor, f, indent=2)

    with open(os.path.join(args.gtfs_dir, "stop_times.txt")) as f:
        stop_times_ungrouped = [stop_time for stop_time in csv.DictReader(f)]
    stop_times = {}
    for stop_time in stop_times_ungrouped:
        if stop_time["trip_id"] not in stop_times:
            stop_times[stop_time["trip_id"]] = []
        stop_times[stop_time["trip_id"]].append(stop_time)
    for trip_id in stop_times:
        stop_times[trip_id].sort(key=lambda stop_time: int(stop_time["stop_sequence"]))    

    stops_result = {}
    for stop_time in stop_times[trip_id_for_stops]:
        stop = stops[stops_ancestor[stop_time["stop_id"]]]
        stops_result[stop["stop_id"]] = {
            "stop_id": stop["stop_id"],
            "stop_name": stop["stop_name"].replace("Caltrain Station", "").strip(),
            "position": float(stop_time["shape_dist_traveled"]) / float(stop_times[trip_id_for_stops][-1]["shape_dist_traveled"]),
        }
    with open(os.path.join(args.out_dir, "stops.json"), "w") as f:
        json.dump(stops_result, f, indent=2)

    trips_result = []
    for trip_id, trip in trips.items():
        stop_times_result = []
        for stop_time in stop_times[trip_id]:
            stop = stops[stops_ancestor[stop_time["stop_id"]]]
            if stop["stop_id"] not in stops_result:
                continue

            stop_times_result.append({
                "sec": gtfs_time_string_to_sec(stop_time["arrival_time"]),
                "stop_id": stop["stop_id"],
            })
        trips_result.append({
            "route_id": trip["route_id"],
            "trip_short_name": trip["trip_short_name"],
            "stop_times": stop_times_result,
        })
    with open(os.path.join(args.out_dir, "trips.json"), "w") as f:
        json.dump(trips_result, f, indent=2)


if __name__ == "__main__":
    main()
