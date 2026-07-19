"""Build OneDish's Xiamen restaurant artifact from an Overture places parquet file."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path


BBOX = [117.85, 24.38, 118.30, 24.75]


def build(input_path: Path, output_path: Path) -> None:
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Install duckdb to build the Overture artifact") from exc
    connection = duckdb.connect()
    rows = connection.execute(
        """
        SELECT id, names.primary AS name, categories.primary AS category,
               geometry.y AS latitude, geometry.x AS longitude,
               confidence, sources
        FROM read_parquet(?)
        WHERE geometry.x BETWEEN ? AND ?
          AND geometry.y BETWEEN ? AND ?
          AND categories.primary IN ('restaurant', 'fast_food_restaurant', 'cafe')
          AND names.primary IS NOT NULL
        ORDER BY id
        """,
        [str(input_path), BBOX[0], BBOX[2], BBOX[1], BBOX[3]],
    ).fetchall()
    places = [
        {
            "id": str(row[0]),
            "name": row[1],
            "category": row[2],
            "latitude": row[3],
            "longitude": row[4],
            "confidence": row[5] or 0.5,
            "upstream_sources": sorted({str(source) for source in (row[6] or [])}),
        }
        for row in rows
        if row[6]
    ]
    payload = {
        "schema_version": "onedish-overture.v1",
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "bbox": BBOX,
        "attribution": "Overture Maps Foundation · upstream attribution retained per record",
        "places": places,
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.input, args.output)


if __name__ == "__main__":
    main()
