import Head from "next/head";
import styles from "../styles/Home.module.css";

import * as d3 from "d3";

import _ from "lodash";

import { FC, useMemo, useState } from "react";

import imagesData from "../data/images.json";
import stopsData from "../data/stops.json";
import tripsData from "../data/trips.json";
import realtimeData from "../data/realtime.json";

const secondsToTime = (seconds) => {
  const base = new Date("2024-06-17T00:00:00");
  base.setSeconds(base.getSeconds() + seconds);
  return base;
};

const timeToString = (time) => {
  const hh = time.getHours();
  const mm = time.getMinutes();
  return `${hh}:${mm < 10 ? "0" : ""}${mm}`;
};

const Trip: FC<{
  stopTimes: {
    stop_id: string;
    sec: number;
  }[];
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  color: string;
  opacity: number;
  stopCircleR: number;
}> = ({ stopTimes, xScale, yScale, color, opacity, stopCircleR }) => {
  return (
    <g>
      {stopTimes.slice(1).map((d, i) => {
        const origin = stopTimes[i];
        const destination = d;
        const endpoints = {
          x1: xScale(secondsToTime(origin.sec)),
          x2: xScale(secondsToTime(destination.sec)),
          y1: yScale(stopsData[origin.stop_id].position),
          y2: yScale(stopsData[destination.stop_id].position),
        };
        return (
          <>
            <line stroke={color} strokeOpacity={opacity} {...endpoints} />
            <circle
              cx={endpoints.x1}
              cy={endpoints.y1}
              r={stopCircleR}
              fillOpacity={opacity}
              fill={color}
            />
            {i === stopTimes.length - 2 && (
              <circle
                cx={endpoints.x2}
                cy={endpoints.y2}
                r={stopCircleR}
                fillOpacity={opacity}
                fill={color}
              />
            )}
          </>
        );
      })}
    </g>
  );
};

const Visualization: FC<{
  width: number;
  height: number;
  trips: typeof tripsData;
  realtimeTrips: typeof realtimeData;
  stops: {
    stop_id: string;
    position: number;
    stop_name: string;
  }[];
  hoverServiceDate: string | undefined;
  onHoverServiceDateChange: (serviceDate: string | undefined) => void;
  onMouseMove: (date: Date) => void;
}> = ({
  width,
  height,
  trips,
  stops,
  realtimeTrips,
  hoverServiceDate,
  onHoverServiceDateChange,
  onMouseMove,
}) => {
  const boundLeft = 150;
  const boundRight = width - 10;
  const boundTop = 10;
  const boundBottom = height - 20;

  if (trips.length === 0) {
    return (
      <svg width={width} height={height}>
        <text x={boundLeft} y={boundTop + 10}>
          No Trips Selected
        </text>
      </svg>
    );
  }

  const tripsForRange = [
    ...trips,
    ...realtimeTrips.map((trip) => trip.service_dates).flat(),
  ].filter((trip) => trip.stop_times.length > 0);
  const minTime = Math.min(
    ...tripsForRange.map((trip) => trip.stop_times[0].sec)
  );
  const maxTime = Math.max(
    ...tripsForRange.map(
      (trip) => trip.stop_times[trip.stop_times.length - 1].sec
    )
  );

  const minPosition = Math.min(...stops.map((stop) => stop.position));
  const maxPosition = Math.max(...stops.map((stop) => stop.position));

  const xScale = d3
    .scaleTime()
    .domain([secondsToTime(minTime), secondsToTime(maxTime)])
    .range([boundLeft, boundRight]);
  const yScale = d3
    .scaleLinear()
    .domain([minPosition, maxPosition])
    .range([boundTop, boundBottom]);

  const imageY = 0.29;
  const allImageTimestamps = imagesData["south_of_san_antonio"];
  const minImageIndex = _.sortedIndex(
    allImageTimestamps,
    secondsToTime(minTime).valueOf() / 1000
  );
  const maxImageIndex = _.sortedIndex(
    allImageTimestamps,
    secondsToTime(maxTime).valueOf() / 1000
  );
  const imageDates = allImageTimestamps
    .slice(minImageIndex, maxImageIndex)
    .map((ts) => new Date(ts * 1000));

  const stopCircleR = 5;

  const realtimeTripOpacity = (serviceDate: string): number => {
    if (hoverServiceDate === undefined) {
      return 0.5;
    }
    if (serviceDate === hoverServiceDate) {
      return 1;
    }
    return 0.1;
  };

  return (
    <svg
      width={width}
      height={height}
      onMouseMove={(e) => {
        const mouseDate = xScale.invert(e.nativeEvent.offsetX);
        const mouseSeconds =
          mouseDate.getSeconds() +
          60 * mouseDate.getMinutes() +
          3600 * mouseDate.getHours();

        const date = new Date("2024-06-17T00:00:00");
        date.setSeconds(date.getSeconds() + mouseSeconds);

        onMouseMove(date);
      }}
    >
      <g>
        {xScale.ticks(10).map((d) => {
          return (
            <>
              <text x={xScale(d)} y={height} textAnchor="middle">
                {timeToString(d)}
              </text>
              <line
                x1={xScale(d)}
                x2={xScale(d)}
                y1={boundTop}
                y2={boundBottom}
                stroke="black"
                strokeDasharray="5"
              />
            </>
          );
        })}
      </g>
      <g>
        {stops.map((stop) => (
          <>
            <text x={0} y={yScale(stop.position) + 6}>
              {stop.stop_name}
            </text>
            <line
              x1={boundLeft}
              x2={boundRight}
              y1={yScale(stop.position)}
              y2={yScale(stop.position)}
              stroke="black"
              strokeDasharray="5"
            />
          </>
        ))}
      </g>
      {trips.map((trip) => (
        <Trip
          stopTimes={trip.stop_times}
          xScale={xScale}
          yScale={yScale}
          color="black"
          opacity={1}
          stopCircleR={stopCircleR}
        />
      ))}
      {realtimeTrips.map((realtimeTrip) =>
        realtimeTrip.service_dates.map((serviceDate) => (
          <g
            onMouseEnter={() =>
              onHoverServiceDateChange(serviceDate.service_date)
            }
            onMouseLeave={() => onHoverServiceDateChange(undefined)}
          >
            <Trip
              stopTimes={serviceDate.stop_times}
              xScale={xScale}
              yScale={yScale}
              color="red"
              opacity={realtimeTripOpacity(serviceDate.service_date)}
              stopCircleR={stopCircleR}
            />
          </g>
        ))
      )}
      <g>
        {imageDates.map((date) => (
          <circle cx={xScale(date)} cy={yScale(imageY)} r={1} fill="blue" />
        ))}
      </g>
    </svg>
  );
};

const ServiceDateBar: FC<{
  width: number;
  height: number;
  realtimeTrips: typeof realtimeData;
  selectedServiceDates: string[];
  hoverServiceDate: string | undefined;
  onHoverServiceDateChange: (serviceDate: string | undefined) => void;
}> = ({
  width,
  height,
  realtimeTrips,
  selectedServiceDates,
  hoverServiceDate,
  onHoverServiceDateChange,
}) => {
  const boundLeft = 100;
  const boundRight = width - 100;
  const boundTop = 20;
  const boundBottom = height - 20;

  const counts: Record<string, number> = {};
  realtimeTrips.forEach((realtime) => {
    realtime.service_dates.forEach((serviceDate) => {
      if (counts[serviceDate.service_date] === undefined) {
        counts[serviceDate.service_date] = 0;
      }
      counts[serviceDate.service_date]++;
    });
  });
  const maxCount = Math.max(...Object.values(counts));

  const xScale = d3
    .scaleLinear()
    .domain([0, selectedServiceDates.length])
    .range([boundLeft, boundRight]);
  const yScale = d3
    .scaleLinear()
    .domain([0, maxCount])
    .range([boundBottom, boundTop]);

  const fillOpacity = (serviceDate: string) => {
    if (hoverServiceDate === undefined) {
      return 0.5;
    }
    if (serviceDate === hoverServiceDate) {
      return 1;
    }
    return 0.1;
  };

  return (
    <svg width={width} height={height}>
      {selectedServiceDates.map((serviceDate, i) => (
        <g
          onMouseEnter={() => onHoverServiceDateChange(serviceDate)}
          onMouseLeave={() => onHoverServiceDateChange(undefined)}
        >
          <text x={xScale(i + 0.5)} y={height} textAnchor="middle">
            {serviceDate.slice(5)}
          </text>
          <rect
            x={xScale(i + 0.1)}
            y={yScale(counts[serviceDate])}
            width={xScale(0.8) - xScale(0)}
            height={yScale(0) - yScale(counts[serviceDate])}
            fill="blue"
            fillOpacity={fillOpacity(serviceDate)}
          />
        </g>
      ))}
    </svg>
  );
};

const tripDescription = (trip) => {
  const origin = trip.stop_times[0];
  const originName = stopsData[origin.stop_id].stop_name;
  const originTime = timeToString(secondsToTime(origin.sec));
  const destination = trip.stop_times[trip.stop_times.length - 1];
  const destinationName = stopsData[destination.stop_id].stop_name;
  return `${trip.route_id} ${originTime} ${originName} -> ${destinationName}: ${trip.trip_short_name}`;
};

const transformRelativeTime = (trips: typeof tripsData): typeof tripsData => {
  return trips.map((trip) => ({
    ...trip,
    stop_times: trip.stop_times.map((stop) => ({
      ...stop,
      sec: stop.sec - trip.stop_times[0].sec,
    })),
  }));
};

export default function Home() {
  const [hoverServiceDate, setHoverServiceDate] = useState<string | undefined>(
    undefined
  );

  const [relativeTime, setRelativeTime] = useState(false);
  const handleRelativeTimeChange = (e) => {
    setRelativeTime(e.target.checked);
  };

  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const handleSelectedTripsChange = (e) => {
    const options = e.target.options;
    const selectedTrips = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selectedTrips.push(options[i].value);
      }
    }
    setSelectedTrips(selectedTrips);
  };

  const [imgSrcs, setImgSrcs] = useState<string[]>([]);
  const handleVisualizationMouseMove = (date: Date) => {
    const imageTimestamps = imagesData["south_of_san_antonio"];
    const timestamp = date.valueOf() / 1000;
    const imageIndex = _.sortedIndex(imageTimestamps, timestamp);

    const n = 1;
    const minIndex = Math.max(0, imageIndex - n);
    const maxIndex = Math.min(imageTimestamps.length - 1, imageIndex + n);

    const result = [];
    for (let i = minIndex; i <= maxIndex; i++) {
      const imageTimestamp = imageTimestamps[i];
      if (Math.abs(imageTimestamp - timestamp) > 20) {
        continue;
      }

      const imageDate = new Date(imageTimestamp * 1000);
      const year = imageDate.getFullYear();
      const month = String(imageDate.getMonth() + 1).padStart(2, "0");
      const day = String(imageDate.getDate()).padStart(2, "0");
      const hours = String(imageDate.getHours()).padStart(2, "0");
      const minutes = String(imageDate.getMinutes()).padStart(2, "0");
      const seconds = String(imageDate.getSeconds()).padStart(2, "0");
      result.push(
        `webcam-data/south_of_san_antonio/${year}-${month}-${day}/${hours}/${minutes}_${seconds}.jpg`
      );
    }
    setImgSrcs(result);
  };

  const selectedServiceDates = [
    "2024-06-17",
    "2024-06-18",
    "2024-06-19",
    "2024-06-20",
    "2024-06-21",

    "2024-06-24",
    "2024-06-25",
    "2024-06-26",
    "2024-06-27",
    "2024-06-28",
  ];

  const selectedStops = [
    "palo_alto",
    "california_ave",
    "san_antonio",
    "mountain_view",
    "sunnyvale",
  ];

  const tripsToShow = useMemo(() => {
    const trips = tripsData
      .filter((trip) => selectedTrips.includes(trip.trip_short_name))
      .map((trip) => ({
        ...trip,
        stop_times: trip.stop_times.filter((stop) =>
          selectedStops.includes(stop.stop_id)
        ),
      }));
    if (relativeTime) {
      return transformRelativeTime(trips);
    }
    return trips;
  }, [relativeTime, selectedTrips]);

  const realtimeTripsToShow = useMemo(() => {
    return realtimeData
      .filter((trip) => selectedTrips.includes(trip.trip_short_name))
      .map((trip) => ({
        ...trip,
        service_dates: trip.service_dates
          .filter((serviceDate) =>
            selectedServiceDates.includes(serviceDate.service_date)
          )
          .map((serviceDate) => ({
            ...serviceDate,
            stop_times: serviceDate.stop_times.filter((stop) =>
              selectedStops.includes(stop.stop_id)
            ),
          })),
      }));
  }, [selectedTrips]);

  const stopsToShow = useMemo(() => {
    return Object.values(stopsData).filter((stop) =>
      selectedStops.includes(stop.stop_id)
    );
  }, [selectedStops]);

  return (
    <div className={styles.container}>
      <Head>
        <title>Exciting Train Visualization</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        {imgSrcs.length > 0 && (
          <div style={{ position: "fixed", bottom: 0 }}>
            {imgSrcs.map((imgSrc) => (
              <img src={imgSrc} />
            ))}
          </div>
        )}
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Visualization
              width={1000}
              height={650}
              trips={tripsToShow}
              realtimeTrips={realtimeTripsToShow}
              stops={stopsToShow}
              hoverServiceDate={hoverServiceDate}
              onHoverServiceDateChange={setHoverServiceDate}
              onMouseMove={handleVisualizationMouseMove}
            />
            <ServiceDateBar
              width={1000}
              height={100}
              realtimeTrips={realtimeTripsToShow}
              selectedServiceDates={selectedServiceDates}
              hoverServiceDate={hoverServiceDate}
              onHoverServiceDateChange={setHoverServiceDate}
            />
          </div>
          <div style={{ flexGrow: 1 }}>
            <input
              type="checkbox"
              value={relativeTime ? "on" : "off"}
              onChange={handleRelativeTimeChange}
            />
            <label>Relative Time</label>
            <select
              multiple
              value={selectedTrips}
              onChange={handleSelectedTripsChange}
              style={{ width: "100%", height: "100%" }}
            >
              {tripsData.map((trip) => (
                <option value={trip.trip_short_name}>
                  {tripDescription(trip)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </main>
    </div>
  );
}

// Okay so the first thing I want to try to do is create a visualization of the schedule of a single train.
// I need to get a list of stations in order and make a y-axis for them. Let's do that first!!
// Should I get the stations from the GTFS or the SIRI?
// How about I get it from the GTFS because that is more "static" and also easier to understand.
// Okay, how do I load the GTFS into my javascript?
// I think I'll make a Python program that converts it to JSON.
// Cool! First task. Python program to turn GTFS into a JSON list of stops, in order, with nice attributes like name.
