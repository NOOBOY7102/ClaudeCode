#!/usr/bin/env python3
"""
Dataset preparation script for tactile paving detection.

This script helps prepare a YOLO-format dataset from various sources.
"""

import argparse
import json
import os
import random
import shutil
from pathlib import Path

import yaml


def create_directory_structure(base_dir: Path):
    """Create YOLO dataset directory structure."""
    dirs = [
        "images/train",
        "images/val",
        "images/test",
        "labels/train",
        "labels/val",
        "labels/test",
    ]
    for d in dirs:
        (base_dir / d).mkdir(parents=True, exist_ok=True)
    print(f"Created directory structure at {base_dir}")


def convert_coco_to_yolo(coco_path: Path, output_dir: Path, split_ratio=(0.8, 0.1, 0.1)):
    """Convert COCO format annotations to YOLO format."""
    with open(coco_path) as f:
        coco_data = json.load(f)

    # Create category mapping
    category_map = {}
    for cat in coco_data.get("categories", []):
        name = cat["name"].lower()
        if "warning" in name or "dot" in name or "点" in name:
            category_map[cat["id"]] = 0  # warning
        elif "guiding" in name or "line" in name or "線" in name:
            category_map[cat["id"]] = 1  # guiding
        else:
            category_map[cat["id"]] = 0  # default to warning

    # Create image ID to filename mapping
    images = {img["id"]: img for img in coco_data.get("images", [])}

    # Group annotations by image
    annotations_by_image = {}
    for ann in coco_data.get("annotations", []):
        img_id = ann["image_id"]
        if img_id not in annotations_by_image:
            annotations_by_image[img_id] = []
        annotations_by_image[img_id].append(ann)

    # Shuffle and split
    image_ids = list(images.keys())
    random.shuffle(image_ids)

    n_train = int(len(image_ids) * split_ratio[0])
    n_val = int(len(image_ids) * split_ratio[1])

    splits = {
        "train": image_ids[:n_train],
        "val": image_ids[n_train : n_train + n_val],
        "test": image_ids[n_train + n_val :],
    }

    for split_name, split_ids in splits.items():
        for img_id in split_ids:
            img_info = images[img_id]
            img_width = img_info["width"]
            img_height = img_info["height"]
            img_filename = img_info["file_name"]

            # Convert annotations to YOLO format
            yolo_annotations = []
            for ann in annotations_by_image.get(img_id, []):
                cat_id = category_map.get(ann["category_id"], 0)
                bbox = ann["bbox"]  # [x, y, width, height]

                # Convert to YOLO format [class, x_center, y_center, width, height] (normalized)
                x_center = (bbox[0] + bbox[2] / 2) / img_width
                y_center = (bbox[1] + bbox[3] / 2) / img_height
                width = bbox[2] / img_width
                height = bbox[3] / img_height

                yolo_annotations.append(f"{cat_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")

            # Write label file
            label_filename = Path(img_filename).stem + ".txt"
            label_path = output_dir / "labels" / split_name / label_filename
            with open(label_path, "w") as f:
                f.write("\n".join(yolo_annotations))

            # Copy image (if source exists)
            # Note: You'll need to copy images separately if they're in a different location

    print(f"Converted {len(image_ids)} images to YOLO format")
    print(f"  Train: {len(splits['train'])}")
    print(f"  Val: {len(splits['val'])}")
    print(f"  Test: {len(splits['test'])}")


def create_sample_dataset(output_dir: Path, num_samples=10):
    """Create a sample dataset with placeholder data for testing."""
    create_directory_structure(output_dir)

    # Create sample data.yaml
    data_config = {
        "path": str(output_dir.absolute()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {
            0: "warning",  # Dot pattern blocks
            1: "guiding",  # Line pattern blocks
        },
        "nc": 2,
    }

    with open(output_dir / "data.yaml", "w") as f:
        yaml.dump(data_config, f, default_flow_style=False)

    print(f"Created sample dataset structure at {output_dir}")
    print("\nTo complete the dataset:")
    print("1. Add training images to: images/train/")
    print("2. Add validation images to: images/val/")
    print("3. Add test images to: images/test/")
    print("4. Add corresponding label files (YOLO format) to labels/")
    print("\nLabel format: <class> <x_center> <y_center> <width> <height>")
    print("  class 0: warning (dot pattern)")
    print("  class 1: guiding (line pattern)")


def download_sample_images(output_dir: Path):
    """Download sample tactile paving images for training."""
    print("Note: In a real implementation, this would download sample images")
    print("from public datasets or APIs.")
    print("\nRecommended data sources:")
    print("1. Open Images Dataset (https://storage.googleapis.com/openimages/)")
    print("2. Roboflow public datasets")
    print("3. Custom data collection with labeling tools like Label Studio or CVAT")


def main():
    parser = argparse.ArgumentParser(description="Prepare tactile paving detection dataset")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Create structure command
    create_parser = subparsers.add_parser("create", help="Create dataset directory structure")
    create_parser.add_argument(
        "--output", type=str, default="datasets/tactile_paving", help="Output directory"
    )

    # Convert COCO command
    convert_parser = subparsers.add_parser("convert", help="Convert COCO to YOLO format")
    convert_parser.add_argument("--coco", type=str, required=True, help="COCO annotations file")
    convert_parser.add_argument(
        "--output", type=str, default="datasets/tactile_paving", help="Output directory"
    )
    convert_parser.add_argument(
        "--split", type=str, default="0.8,0.1,0.1", help="Train/val/test split ratio"
    )

    # Sample command
    sample_parser = subparsers.add_parser("sample", help="Create sample dataset structure")
    sample_parser.add_argument(
        "--output", type=str, default="datasets/tactile_paving", help="Output directory"
    )

    args = parser.parse_args()

    if args.command == "create":
        create_directory_structure(Path(args.output))
    elif args.command == "convert":
        split_ratio = tuple(map(float, args.split.split(",")))
        convert_coco_to_yolo(Path(args.coco), Path(args.output), split_ratio)
    elif args.command == "sample":
        create_sample_dataset(Path(args.output))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
