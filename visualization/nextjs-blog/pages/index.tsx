import Head from "next/head";

import * as d3 from "d3";

import _ from "lodash";

import { FC, useMemo, useState } from "react";

import imagesData from "../data/images.json";
import stopsData from "../data/stops.json";
import tripsData from "../data/trips.json";
import realtimeData from "../data/realtime.json";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  createTheme,
  CssBaseline,
  FormControlLabel,
  FormGroup,
  IconButton,
  Stack,
  TextField,
  ThemeProvider,
} from "@mui/material";
import {
  KeyboardArrowLeft,
  KeyboardDoubleArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowRight,
} from "@mui/icons-material";

const allServiceDates = _(
  realtimeData
    .map((trip) =>
      trip.service_dates.map((serviceDate) => serviceDate.service_date)
    )
    .flat()
)
  .uniq()
  .sort()
  .value();

const secondsToTime = (seconds) => {
  const base = new Date("2000-01-01T00:00:00");
  base.setSeconds(base.getSeconds() + seconds);
  return base;
};

const timeToString = (time) => {
  const hh = time.getHours();
  const mm = time.getMinutes();
  return `${hh}:${mm < 10 ? "0" : ""}${mm}`;
};

const getDateTime = (date: string, time: Date): Date => {
  const year = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(5, 7), 10) - 1;
  const day = parseInt(date.slice(8, 10), 10);
  return new Date(
    year,
    month,
    day,
    time.getHours(),
    time.getMinutes(),
    time.getSeconds()
  );
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

interface TimeRange {
  start: number; // seconds
  end: number; // seconds
}

interface StopTime {
  stop_id: string;
  sec: number;
}

interface Trip {
  stop_times: StopTime[];
}

function getTimeRangeForTrips(
  positionA: number,
  positionB: number,
  trips: Trip[]
): TimeRange {
  const minPosition = Math.min(positionA, positionB);
  const maxPosition = Math.max(positionA, positionB);
  const result = { start: 86400, end: 0 };
  trips.forEach((trip) => {
    for (let i = 0; i < trip.stop_times.length - 1; i++) {
      const a = trip.stop_times[i];
      const b = trip.stop_times[i + 1];

      const xa = a.sec;
      const ya = stopsData[a.stop_id].position;
      const xb = b.sec;
      const yb = stopsData[b.stop_id].position;

      const y1 = ya < yb ? ya : yb;
      const x1 = ya < yb ? xa : xb;
      const y2 = ya < yb ? yb : ya;
      const x2 = ya < yb ? xb : xa;

      // Now y1 < y2.

      if (y1 > maxPosition || y2 < minPosition) {
        // This segment is completely outside the y-range, so ignore it.
        continue;
      }

      if (y1 < minPosition) {
        // We know that the line (x1, y1) -> (x2, y2) intersects y = minPosition somewhere, and we
        // want to include the intersection point in the range.
        const xIntersection = x1 + ((minPosition - y1) * (x2 - x1)) / (y2 - y1);
        result.start = Math.min(result.start, xIntersection);
        result.end = Math.max(result.end, xIntersection);
      } else {
        // y1 is inside the y-range, so x1 itself should be included.
        result.start = Math.min(result.start, x1);
        result.end = Math.max(result.end, x1);
      }

      if (y2 > maxPosition) {
        // We know that the line (x1, y1) -> (x2, y2) intersects y = maxPosition somewhere, and we
        // want to include the intersection point in the range.
        const xIntersection = x1 + ((maxPosition - y1) * (x2 - x1)) / (y2 - y1);
        result.start = Math.min(result.start, xIntersection);
        result.end = Math.max(result.end, xIntersection);
      } else {
        // y2 is inside the y-range, so x2 itself should be included.
        result.start = Math.min(result.start, x2);
        result.end = Math.max(result.end, x2);
      }
    }
  });
  return result;
}

const Visualization: FC<{
  width: number;
  height: number;
  trips: typeof tripsData;
  realtimeTrips: typeof realtimeData;
  timeRange: TimeRange;
  topStopId: string;
  bottomStopId: string;
  hoverServiceDate: string | undefined;
  onHoverServiceDateChange: (serviceDate: string | undefined) => void;
  onMouseMove: (date: Date) => void;
  webcamDate: string | undefined;
}> = ({
  width,
  height,
  trips,
  timeRange,
  topStopId,
  bottomStopId,
  realtimeTrips,
  hoverServiceDate,
  onHoverServiceDateChange,
  onMouseMove,
  webcamDate,
}) => {
  const boundLeft = 120;
  const boundRight = width - 10;
  const boundTop = 10;
  const boundBottom = height - 20;

  const topStopPosition = stopsData[topStopId].position;
  const bottomStopPosition = stopsData[bottomStopId].position;
  const minPosition = Math.min(topStopPosition, bottomStopPosition);
  const maxPosition = Math.max(topStopPosition, bottomStopPosition);
  const yScale = d3
    .scaleLinear()
    .domain([topStopPosition, bottomStopPosition])
    .range([boundTop, boundBottom]);

  const xScale = d3
    .scaleTime()
    .domain([secondsToTime(timeRange.start), secondsToTime(timeRange.end)])
    .range([boundLeft, boundRight]);

  const imageY = 0.29;
  const imageDates = useMemo(() => {
    if (webcamDate == undefined) {
      return [];
    }

    const allImageTimestamps = imagesData["south_of_san_antonio"];
    const minImageIndex = _.sortedIndex(
      allImageTimestamps,
      getDateTime(webcamDate, secondsToTime(timeRange.start)).valueOf() / 1000
    );
    const maxImageIndex = _.sortedIndex(
      allImageTimestamps,
      getDateTime(webcamDate, secondsToTime(timeRange.end)).valueOf() / 1000
    );
    return allImageTimestamps
      .slice(minImageIndex, maxImageIndex)
      .map((ts) => getDateTime("2000-01-01", new Date(ts * 1000)));
  }, [webcamDate, timeRange]);

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
        {Object.values(stopsData).map((stop) => {
          if (stop.position < minPosition || stop.position > maxPosition) {
            return null;
          }
          return (
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
          );
        })}
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

const tripDirection = (trip) => {
  const origin = trip.stop_times[0];
  const destination = trip.stop_times[trip.stop_times.length - 1];
  return stopsData[origin.stop_id].position <
    stopsData[destination.stop_id].position
    ? "NB"
    : "SB";
};

const tripType = (trip): "local" | "limited" | "bullet" => {
  if (
    trip.trip_short_name.startsWith("1") ||
    trip.trip_short_name.startsWith("2")
  ) {
    return "local";
  }
  if (trip.trip_short_name.startsWith("7")) {
    return "bullet";
  }
  return "limited";
};

const TripLabel = ({ trip }) => {
  const origin = trip.stop_times[0];
  const originName = stopsData[origin.stop_id].stop_name;
  const originTime = timeToString(secondsToTime(origin.sec));
  return (
    <Box fontFamily="monospace" whiteSpace="pre">
      <Chip
        size="small"
        label={trip.trip_short_name}
        sx={{ fontFamily: "inherit" }}
        color={tripType(trip)}
      />{" "}
      {originTime.length === 4 ? " " : ""}
      {originTime} @ {originName}
    </Box>
  );
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

const StopSelect: FC<{
  stopId: string;
  onChange: (stopId: string) => void;
}> = ({ stopId, onChange }) => {
  return (
    <select value={stopId} onChange={(e) => onChange(e.target.value)}>
      {Object.values(stopsData)
        .toReversed()
        .map((stop) => (
          <option value={stop.stop_id}>{stop.stop_name}</option>
        ))}
    </select>
  );
};

const SmallCheckbox = (props) => (
  <Checkbox size="small" sx={{ py: 0 }} {...props} />
);

const Facets: FC<{
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ options, selected, onChange }) => {
  const handleClickAll = () => {
    onChange([]);
  };

  const handleClickOption = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter((o) => o !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <FormGroup>
      <FormControlLabel
        label="All"
        control={
          <SmallCheckbox
            checked={selected.length === 0}
            onClick={handleClickAll}
          />
        }
      />
      {options.map((option) => (
        <FormControlLabel
          key={option}
          label={option}
          control={
            <SmallCheckbox
              checked={selected.includes(option)}
              onClick={() => handleClickOption(option)}
            />
          }
        />
      ))}
    </FormGroup>
  );
};

const ROUTE_IDS = _(tripsData.map((trip) => trip.route_id))
  .uniq()
  .sort()
  .value();

const TRIPS_SORTED = _.sortBy(
  tripsData,
  tripDirection,
  (trip) => trip.stop_times[0].sec
);

const TripSelect: FC<{
  selectedTrips: string[];
  onChange: (selectedTrips: string[]) => void;
}> = ({ selectedTrips, onChange }) => {
  const [directions, setDirections] = useState<string[]>([]);
  const [routes, setRoutes] = useState<string[]>([]);
  const [onlyShowSelected, setOnlyShowSelected] = useState(false);

  const tripsFiltered = useMemo(() => {
    return TRIPS_SORTED.filter(
      (trip) =>
        (directions.length === 0 || directions.includes(tripDirection(trip))) &&
        (routes.length === 0 || routes.includes(trip.route_id)) &&
        (!onlyShowSelected || selectedTrips.includes(trip.trip_short_name))
    );
  }, [directions, routes, selectedTrips, onlyShowSelected]);

  const selectedNotVisibleCount = useMemo(() => {
    return selectedTrips.filter(
      (trip) =>
        !tripsFiltered.map((trip) => trip.trip_short_name).includes(trip)
    ).length;
  }, [tripsFiltered, selectedTrips]);

  const handleClickAll = () => {
    onChange(
      _.uniq([
        ...tripsFiltered.map((trip) => trip.trip_short_name),
        ...selectedTrips,
      ])
    );
  };
  const handleClickClear = () => {
    onChange([]);
  };

  return (
    <Box flex={4} overflow="hidden">
      <Stack direction="row" height="100%">
        <Stack spacing={4}>
          <Box height="6px" />
          <FormGroup>
            <FormControlLabel
              label="Seld"
              control={
                <SmallCheckbox
                  checked={onlyShowSelected}
                  onClick={() => setOnlyShowSelected(!onlyShowSelected)}
                />
              }
            />
          </FormGroup>
          <Facets
            options={["NB", "SB"]}
            selected={directions}
            onChange={setDirections}
          />
          <Facets options={ROUTE_IDS} selected={routes} onChange={setRoutes} />
        </Stack>
        <Stack flex={1}>
          <Stack direction="row" alignItems="center">
            <Box>
              {selectedTrips.length}
              {selectedNotVisibleCount > 0 && (
                <>, {selectedNotVisibleCount} hidden</>
              )}
            </Box>
            <Box flex={1} />
            <Button onClick={handleClickAll}>All</Button>
            <Button onClick={handleClickClear}>Clear</Button>
          </Stack>
          <Box overflow="auto">
            <FormGroup>
              {tripsFiltered.map((trip) => (
                <FormControlLabel
                  key={trip.trip_short_name}
                  label={<TripLabel trip={trip} />}
                  control={
                    <SmallCheckbox
                      checked={selectedTrips.includes(trip.trip_short_name)}
                      onChange={(e) => {
                        const newSelectedTrips = e.target.checked
                          ? [...selectedTrips, trip.trip_short_name]
                          : selectedTrips.filter(
                              (t) => t !== trip.trip_short_name
                            );
                        onChange(newSelectedTrips);
                      }}
                    />
                  }
                />
              ))}
            </FormGroup>
          </Box>
        </Stack>
      </Stack>
      {/* <select
        multiple
        value={selectedTrips}
        onChange={handleSelectedTripsChange}
      >
        {tripsData.map((trip) => (
          <option value={trip.trip_short_name}>{tripDescription(trip)}</option>
        ))}
      </select> */}
    </Box>
  );
};

const XAxisControl: FC<{
  allDataTimeRange: TimeRange;
  customTimeRange: TimeRange | undefined;
  onChangeCustomTimeRange: (customTimeRange: TimeRange | undefined) => void;
}> = ({ allDataTimeRange, customTimeRange, onChangeCustomTimeRange }) => {
  const autoXAxis = customTimeRange == undefined;
  const effectiveTimeRange = customTimeRange ?? allDataTimeRange;

  const handleClickAuto = () => {
    if (autoXAxis) {
      onChangeCustomTimeRange(allDataTimeRange);
    } else {
      onChangeCustomTimeRange(undefined);
    }
  };

  const bigShift = 3600;
  const smallShift = 60;
  const handleShift = (delta: number) => {
    onChangeCustomTimeRange({
      start: effectiveTimeRange.start + delta,
      end: effectiveTimeRange.end + delta,
    });
  };

  return (
    <Stack alignItems="center" spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton size="small" onClick={() => handleShift(-bigShift)}>
          <KeyboardDoubleArrowLeft />
        </IconButton>
        <IconButton size="small" onClick={() => handleShift(-smallShift)}>
          <KeyboardArrowLeft />
        </IconButton>
        <TextField
          size="small"
          value={timeToString(secondsToTime(effectiveTimeRange.start))}
        />
        <Box>{" - "}</Box>
        <TextField
          size="small"
          value={timeToString(secondsToTime(effectiveTimeRange.end))}
        />
        <IconButton size="small" onClick={() => handleShift(smallShift)}>
          <KeyboardArrowRight />
        </IconButton>
        <IconButton size="small" onClick={() => handleShift(bigShift)}>
          <KeyboardDoubleArrowRight />
        </IconButton>
      </Stack>
      <FormControlLabel
        label="Auto"
        control={
          <SmallCheckbox checked={autoXAxis} onClick={handleClickAuto} />
        }
      />
    </Stack>
  );
};

export default function Home() {
  const theme = createTheme({
    palette: {
      local: {
        main: "#c5c5c5",
        light: "#c5c5c5",
        dark: "#c5c5c5",
        contrastText: "#000000",
      },
      limited: {
        main: "#fcedc7",
        light: "#fcedc7",
        dark: "#fcedc7",
        contrastText: "#000000",
      },
      bullet: {
        main: "#e31837",
        light: "#e31837",
        dark: "#e31837",
        contrastText: "#ffffff",
      },
    },
  });

  const [hoverServiceDate, setHoverServiceDate] = useState<string | undefined>(
    undefined
  );

  const [relativeTime, setRelativeTime] = useState(false);
  const handleRelativeTimeChange = (e) => {
    setRelativeTime(e.target.checked);
  };

  const [showScheduledTime, setShowScheduledTime] = useState(true);
  const handleShowScheduledTimeChange = (e) => {
    setShowScheduledTime(e.target.checked);
  };

  const [topStopId, setTopStopId] = useState("san_francisco");
  const [bottomStopId, setBottomStopId] = useState("tamien");

  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);

  const [selectedServiceDates, setSelectedServiceDates] = useState<string[]>(
    []
  );
  const handleSelectedServiceDatesChange = (e) => {
    const options = e.target.options;
    const selectedServiceDates = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selectedServiceDates.push(options[i].value);
      }
    }
    setSelectedServiceDates(selectedServiceDates);
  };

  const [autoXAxis, setAutoXAxis] = useState(true);

  const webcamDate: string | undefined =
    selectedServiceDates.length > 0 ? selectedServiceDates[0] : undefined;

  const [imgSrcs, setImgSrcs] = useState<string[]>([]);
  const handleVisualizationMouseMove = (date: Date) => {
    if (webcamDate == undefined) {
      setImgSrcs([]);
      return;
    }

    date = getDateTime(webcamDate, date);

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

  const tripsToShow = useMemo(() => {
    if (!showScheduledTime) {
      return [];
    }
    const trips = tripsData.filter((trip) =>
      selectedTrips.includes(trip.trip_short_name)
    );
    if (relativeTime) {
      return transformRelativeTime(trips);
    }
    return trips;
  }, [relativeTime, selectedTrips, showScheduledTime]);

  const realtimeTripsToShow = useMemo(() => {
    return realtimeData
      .filter((trip) => selectedTrips.includes(trip.trip_short_name))
      .map((trip) => ({
        ...trip,
        service_dates: trip.service_dates.filter((serviceDate) =>
          selectedServiceDates.includes(serviceDate.service_date)
        ),
      }));
  }, [selectedTrips, selectedServiceDates]);

  const allDataTimeRange = getTimeRangeForTrips(
    stopsData[topStopId].position,
    stopsData[bottomStopId].position,
    [
      ...tripsToShow,
      ...realtimeTripsToShow.map((trip) => trip.service_dates).flat(),
    ]
  );
  const [customTimeRange, setCustomTimeRange] = useState<
    TimeRange | undefined
  >();
  const effectiveTimeRange = customTimeRange ?? allDataTimeRange;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Head>
        <title>Exciting Train Visualization</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Container maxWidth={false} sx={{ height: "100vh" }}>
        {imgSrcs.length > 0 && (
          <div style={{ position: "fixed", bottom: 0 }}>
            {imgSrcs.map((imgSrc) => (
              <img src={imgSrc} />
            ))}
          </div>
        )}
        <Stack direction="row" spacing={1} height="100%">
          <Stack height="100%">
            <Visualization
              width={1100}
              height={650}
              trips={tripsToShow}
              realtimeTrips={realtimeTripsToShow}
              timeRange={effectiveTimeRange}
              topStopId={topStopId}
              bottomStopId={bottomStopId}
              hoverServiceDate={hoverServiceDate}
              onHoverServiceDateChange={setHoverServiceDate}
              onMouseMove={handleVisualizationMouseMove}
              webcamDate={webcamDate}
            />
            <ServiceDateBar
              width={1000}
              height={100}
              realtimeTrips={realtimeTripsToShow}
              selectedServiceDates={selectedServiceDates}
              hoverServiceDate={hoverServiceDate}
              onHoverServiceDateChange={setHoverServiceDate}
            />
          </Stack>
          <Stack flexGrow={1} height="100%">
            {/* <div>
              <label>Relative Time</label>
              <input
                type="checkbox"
                value={relativeTime ? "on" : "off"}
                onChange={handleRelativeTimeChange}
              />
            </div> */}
            <div>
              <label>Top</label>
              <StopSelect stopId={topStopId} onChange={setTopStopId} />
            </div>
            <div>
              <label>Bottom</label>
              <StopSelect stopId={bottomStopId} onChange={setBottomStopId} />
            </div>
            <XAxisControl
              allDataTimeRange={allDataTimeRange}
              customTimeRange={customTimeRange}
              onChangeCustomTimeRange={setCustomTimeRange}
            />
            <TripSelect
              selectedTrips={selectedTrips}
              onChange={setSelectedTrips}
            />
            <div>
              <label>Show Scheduled Time</label>
              <input
                type="checkbox"
                value={showScheduledTime ? "on" : "off"}
                onChange={handleShowScheduledTimeChange}
              />
            </div>
            <select
              multiple
              value={selectedServiceDates}
              onChange={handleSelectedServiceDatesChange}
              style={{ flexGrow: 1 }}
            >
              {allServiceDates.map((serviceDate) => (
                <option value={serviceDate}>{serviceDate}</option>
              ))}
            </select>
          </Stack>
        </Stack>
      </Container>
    </ThemeProvider>
  );
}

// Okay so the first thing I want to try to do is create a visualization of the schedule of a single train.
// I need to get a list of stations in order and make a y-axis for them. Let's do that first!!
// Should I get the stations from the GTFS or the SIRI?
// How about I get it from the GTFS because that is more "static" and also easier to understand.
// Okay, how do I load the GTFS into my javascript?
// I think I'll make a Python program that converts it to JSON.
// Cool! First task. Python program to turn GTFS into a JSON list of stops, in order, with nice attributes like name.
