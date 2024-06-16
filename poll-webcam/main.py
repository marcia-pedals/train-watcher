import datetime
import json
import httpx
import time
import os
from dataclasses import dataclass

@dataclass
class SourceInfo:
    name: str
    url: str
    refresh_rate: int

def latest_dt_in_folder(folder):
    """
    Return the latest datetime in the folder which has files of the form
    YYYY-mm-dd/HH/MM_SS.jpg.
    """
    dates = os.listdir(folder)
    dates.sort()
    for latest_date in reversed(dates):
        hours = os.listdir(os.path.join(folder, latest_date))
        hours.sort()
        for latest_hour in reversed(hours):
            times = os.listdir(os.path.join(folder, latest_date, latest_hour))
            times.sort()
            if times:
                return datetime.datetime.strptime(f"{latest_date}/{latest_hour}/{times[-1]}", "%Y-%m-%d/%H/%M_%S.jpg")
    return None

with open("secrets.json") as f:
    secrets = json.load(f)

directory_request = secrets["directory_request"]
image_request = secrets["image_request"]
desired_images = {x["directory_name"]: x["output_name"] for x in secrets["desired_images"]}

def get_sources(client):
    response = client.get(directory_request["url"], headers=directory_request["headers"])
    response.raise_for_status()
    sources = []
    for x in response.json():
        output_name = desired_images.get(x["name"])
        if output_name is None:
            continue
        sources.append(SourceInfo(
            name=output_name,
            url=x["content"]["fullJpeg"],
            refresh_rate=x["policy"]["refreshRate"],
        ))
    return sources

def maybe_fetch_image(client, source):
    source_folder = f"data/{source.name}"
    os.makedirs(source_folder, exist_ok=True)
    latest_dt = latest_dt_in_folder(source_folder)
    dt = datetime.datetime.now()
    if latest_dt is not None and (dt - latest_dt).total_seconds() * 1000 < source.refresh_rate:
        return

    folder = os.path.join(source_folder, dt.strftime("%Y-%m-%d"), dt.strftime("%H"))
    os.makedirs(folder, exist_ok=True)
    filename = dt.strftime("%M_%S.jpg")
    path = os.path.join(folder, filename)
    try:
        response = client.get(source.url, headers=image_request["headers"])
        response.raise_for_status()
    except httpx.HTTPError as e:
        print(f"Error fetching image: {e}")
        time.sleep(10)  # "Backoff"
        return
    with open(path, "wb") as f:
        f.write(response.content)


with httpx.Client() as client:
    last_sources_fetch_dt = None
    sources = []

    while True:
        if last_sources_fetch_dt is None or (datetime.datetime.now() - last_sources_fetch_dt).total_seconds() > 10 * 60:
            try:
                print("Getting sources...")
                sources = get_sources(client)
                last_sources_fetch_dt = datetime.datetime.now()
                print(f"Got {len(sources)} sources.")  # TODO: Maybe error if we don't find all expected sources?
            except httpx.HTTPError as e:
                print(f"Error fetching sources: {e}")
                time.sleep(10)  # "Backoff"

        for source in sources:
            maybe_fetch_image(client, source)

        time.sleep(0.1)
