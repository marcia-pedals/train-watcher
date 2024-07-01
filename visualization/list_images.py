from argparse import ArgumentParser
import datetime
import csv
import json
import os
import glob

parser = ArgumentParser()
parser.add_argument("images_dir")
parser.add_argument("out_dir")


def main():
    args = parser.parse_args()

    files = glob.glob(os.path.join(args.images_dir, "**", "*.jpg"), recursive=True)

    result = {}
    for file in files:
        path, filename = os.path.split(file)
        path, hour = os.path.split(path)
        path, date = os.path.split(path)
        path, location = os.path.split(path)
        dt = datetime.datetime.strptime(date, "%Y-%m-%d")
        dt = dt.replace(
            hour=int(hour),
            minute=int(filename[0:2]),
            second=int(filename[3:5]),
        )
        result.setdefault(location, []).append(int(dt.timestamp()))
    
    for location in result:
        result[location].sort()

    with open(os.path.join(args.out_dir, "images.json"), "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
