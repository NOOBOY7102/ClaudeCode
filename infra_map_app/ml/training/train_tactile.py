#!/usr/bin/env python3
"""
Training script for tactile paving detection model.

This script trains a YOLOv8 model to detect tactile paving blocks
(warning and guiding types) from images.

Usage:
    python train_tactile.py --data data.yaml --epochs 100 --imgsz 640
"""

import argparse
import os
from pathlib import Path

import yaml


def create_data_yaml(data_dir: Path, output_path: Path):
    """Create YOLO data configuration file."""
    data_config = {
        "path": str(data_dir.absolute()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {
            0: "warning",  # Dot pattern blocks (警告ブロック)
            1: "guiding",  # Line pattern blocks (誘導ブロック)
        },
        "nc": 2,  # Number of classes
    }

    with open(output_path, "w") as f:
        yaml.dump(data_config, f, default_flow_style=False)

    print(f"Created data configuration at {output_path}")
    return output_path


def train(args):
    """Train the tactile paving detection model."""
    from ultralytics import YOLO

    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Initialize model
    if args.pretrained:
        print(f"Loading pretrained model: {args.pretrained}")
        model = YOLO(args.pretrained)
    else:
        print(f"Initializing new model: {args.model}")
        model = YOLO(args.model)

    # Create data config if not provided
    if args.data and Path(args.data).exists():
        data_path = args.data
    else:
        data_dir = Path(args.data_dir) if args.data_dir else Path("datasets/tactile_paving")
        data_path = output_dir / "data.yaml"
        create_data_yaml(data_dir, data_path)

    # Train
    print(f"\nStarting training...")
    print(f"  Model: {args.model}")
    print(f"  Data: {data_path}")
    print(f"  Epochs: {args.epochs}")
    print(f"  Image size: {args.imgsz}")
    print(f"  Batch size: {args.batch}")
    print(f"  Device: {args.device}")

    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(output_dir),
        name="tactile_paving",
        exist_ok=True,
        pretrained=True,
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        momentum=0.937,
        weight_decay=0.0005,
        warmup_epochs=3,
        warmup_momentum=0.8,
        warmup_bias_lr=0.1,
        box=7.5,
        cls=0.5,
        dfl=1.5,
        pose=12.0,
        kobj=1.0,
        label_smoothing=0.0,
        nbs=64,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=0.0,
        translate=0.1,
        scale=0.5,
        shear=0.0,
        perspective=0.0,
        flipud=0.0,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.0,
        copy_paste=0.0,
        auto_augment="randaugment",
        erasing=0.4,
        crop_fraction=1.0,
    )

    print(f"\nTraining complete!")
    print(f"Results saved to: {output_dir}")

    # Export to different formats
    if args.export:
        print("\nExporting model...")

        # Export to ONNX
        model.export(format="onnx", dynamic=True, simplify=True)
        print(f"  ONNX model exported")

        # Export to TorchScript
        model.export(format="torchscript")
        print(f"  TorchScript model exported")

    return results


def validate(args):
    """Validate a trained model."""
    from ultralytics import YOLO

    model = YOLO(args.weights)
    results = model.val(
        data=args.data,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
    )

    print("\nValidation Results:")
    print(f"  mAP50: {results.box.map50:.4f}")
    print(f"  mAP50-95: {results.box.map:.4f}")

    return results


def predict(args):
    """Run inference on images."""
    from ultralytics import YOLO

    model = YOLO(args.weights)
    results = model.predict(
        source=args.source,
        imgsz=args.imgsz,
        conf=args.conf,
        device=args.device,
        save=True,
        save_txt=True,
        project=args.output,
        name="predictions",
    )

    print(f"\nPredictions saved to: {args.output}/predictions")
    return results


def main():
    parser = argparse.ArgumentParser(description="Train tactile paving detection model")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Train command
    train_parser = subparsers.add_parser("train", help="Train the model")
    train_parser.add_argument(
        "--model", type=str, default="yolov8n.pt", help="Base model (yolov8n/s/m/l/x)"
    )
    train_parser.add_argument(
        "--pretrained", type=str, default=None, help="Pretrained weights path"
    )
    train_parser.add_argument("--data", type=str, default=None, help="Data config path")
    train_parser.add_argument(
        "--data-dir", type=str, default=None, help="Dataset directory"
    )
    train_parser.add_argument("--epochs", type=int, default=100, help="Number of epochs")
    train_parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    train_parser.add_argument("--batch", type=int, default=16, help="Batch size")
    train_parser.add_argument(
        "--device", type=str, default="", help="Device (cuda:0, cpu, etc.)"
    )
    train_parser.add_argument(
        "--output", type=str, default="runs/train", help="Output directory"
    )
    train_parser.add_argument(
        "--export", action="store_true", help="Export model after training"
    )

    # Validate command
    val_parser = subparsers.add_parser("validate", help="Validate the model")
    val_parser.add_argument("--weights", type=str, required=True, help="Model weights")
    val_parser.add_argument("--data", type=str, required=True, help="Data config path")
    val_parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    val_parser.add_argument("--batch", type=int, default=16, help="Batch size")
    val_parser.add_argument("--device", type=str, default="", help="Device")

    # Predict command
    pred_parser = subparsers.add_parser("predict", help="Run predictions")
    pred_parser.add_argument("--weights", type=str, required=True, help="Model weights")
    pred_parser.add_argument(
        "--source", type=str, required=True, help="Image source (file/folder/URL)"
    )
    pred_parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    pred_parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")
    pred_parser.add_argument("--device", type=str, default="", help="Device")
    pred_parser.add_argument(
        "--output", type=str, default="runs/predict", help="Output directory"
    )

    args = parser.parse_args()

    if args.command == "train":
        train(args)
    elif args.command == "validate":
        validate(args)
    elif args.command == "predict":
        predict(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
