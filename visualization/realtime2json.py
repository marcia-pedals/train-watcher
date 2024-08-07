"""
The plan.

First we're gonna just do a simple "when did the train arrive at each stop for each day".
It's gonna look like this.

[
    {
        "trip_short_name": "123",
        "service_dates": [
            {
                "service_date": "2021-01-01",
                "stop_times": [
                    {
                        "stop_id": "millbrae",
                        "sec": 12345
                    } 
                ] 
            } 
        ]
    }
]

The "time" of the stop will be the time of the last response where that stop is the train's next
stop. Not sure if this is the right way to do it, but we'll see when we plot things.

TODO: This will incorrectly infer that a train arrives at its next stop immediately whenever
realtime information drops out.

Ok, that seems to mostly work but there are problems:
- maybe it's consistently off by a minute
- sometimes data drops out
- when the data drops out, it looks like the train immediately arrives at the next stop(s)

So the next thing I will do is make a second kind of realtime data, where we project the realtime
positions to our axis. I can plot this alongside my first attempt, and this should help me see how
to fix some of the problems in the first data. And it'll also give me a sense of how often my first
kind of data is working correctly when the realtime position data drops out.

"""

from argparse import ArgumentParser
import datetime
import glob
import json
import os
import tqdm
import shapely

parser = ArgumentParser()
parser.add_argument("stop_monitoring_dir")
parser.add_argument("out_dir")


def main():
    args = parser.parse_args()
    with open(os.path.join(args.out_dir, "stops.json")) as f:
        stops = json.load(f)
    with open(os.path.join(args.out_dir, "stops_ancestor.json")) as f:
        stops_ancestor = json.load(f)
    with open(os.path.join(args.out_dir, "trips.json")) as f:
        trips = json.load(f)
    with open(os.path.join(args.out_dir, "points.json")) as f:
        points = json.load(f)
        route_shape = shapely.LineString(points)

    stops_included = {stop["stop_id"] for stop in stops.values()}

    trips_included = set()
    trips_past_midnight = set()
    for trip in trips:
        trips_included.add(trip["trip_short_name"])
        for stop_time in trip["stop_times"]:
            if stop_time["sec"] > 86400:
                trips_past_midnight.add(trip["trip_short_name"])
                break

    # Map from (service_date, trip_short_name, stop_id) to the latest response time (in sec since
    # beginning of service date) that included a monitored call for that stop.
    latest_time_call_visible = {}

    # Map from (service_date, trip_short_name, response_sec) to the vehicle's projected position at
    # that time, if available, or None, if not.
    positions = {}

    files = glob.glob(os.path.join(args.stop_monitoring_dir, "**", "*.json"))
    files.sort()
    for file in tqdm.tqdm(files):
        with open(file) as f:
            data = json.load(f)

        path, filename = os.path.split(file)
        hh = int(filename[0:2])
        mm = int(filename[2:4])
        response_sec = hh * 3600 + mm * 60
        response_date = datetime.date.fromisoformat(os.path.basename(path))

        monitored_stop_visits = data["ServiceDelivery"]["StopMonitoringDelivery"][
            "MonitoredStopVisit"
        ]
        for monitored_stop_visit in monitored_stop_visits:
            journey = monitored_stop_visit["MonitoredVehicleJourney"]

            stop_id = stops_ancestor[journey["MonitoredCall"]["StopPointRef"]]
            if stop_id not in stops_included:
                continue

            vehicle_ref = journey["FramedVehicleJourneyRef"]["DatedVehicleJourneyRef"]
            if vehicle_ref not in trips_included:
                continue

            if vehicle_ref in trips_past_midnight and response_sec < 12 * 3600:
                service_date = (response_date - datetime.timedelta(days=1)).isoformat()
                service_date_sec = response_sec + 24 * 3600
            else:
                service_date = response_date.isoformat()
                service_date_sec = response_sec

            id = (service_date, vehicle_ref, stop_id)
            if id not in latest_time_call_visible:
                latest_time_call_visible[id] = service_date_sec
            latest_time_call_visible[id] = max(
                latest_time_call_visible[id], service_date_sec
            )

            position_id = (service_date, vehicle_ref, response_sec)
            if position_id not in positions:
                positions[position_id] = None
            if (
                (vehicle_location := journey.get("VehicleLocation"))
                and (longitude := vehicle_location.get("Longitude"))
                and (latitude := vehicle_location.get("Latitude"))
            ):
                point = shapely.Point(float(longitude), float(latitude))
                positions[position_id] = route_shape.project(point, normalized=True)

    # trip_short_name -> service_date -> stop_id -> sec
    grouped_result = {}
    for (
        service_date,
        trip_short_name,
        stop_id,
    ), sec in latest_time_call_visible.items():
        if trip_short_name not in grouped_result:
            grouped_result[trip_short_name] = {}
        if service_date not in grouped_result[trip_short_name]:
            grouped_result[trip_short_name][service_date] = {}
        grouped_result[trip_short_name][service_date][stop_id] = sec

    # trip_short_name -> service_date -> sec -> position
    grouped_positions = {}
    for (service_date, trip_short_name, response_sec), position in positions.items():
        if trip_short_name not in grouped_positions:
            grouped_positions[trip_short_name] = {}
        if service_date not in grouped_positions[trip_short_name]:
            grouped_positions[trip_short_name][service_date] = {}
        grouped_positions[trip_short_name][service_date][response_sec] = position

    result = []
    for trip_short_name, service_dates in grouped_result.items():
        result.append(
            {
                "trip_short_name": trip_short_name,
                "service_dates": [
                    {
                        "service_date": service_date,
                        "stop_times": sorted(
                            [
                                {"stop_id": stop_id, "sec": sec}
                                for stop_id, sec in stop_times.items()
                            ],
                            key=lambda x: x["sec"],
                        ),
                        "positions": sorted(
                            [
                                {"sec": response_sec, "position": position}
                                for response_sec, position in grouped_positions[trip_short_name][service_date].items()
                            ],
                            key=lambda x: x["sec"],
                        )
                    }
                    for service_date, stop_times in service_dates.items()
                ],
            }
        )

    with open(os.path.join(args.out_dir, "realtime.json"), "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
