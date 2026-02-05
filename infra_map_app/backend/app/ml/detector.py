"""Infrastructure detection using YOLO models."""
import logging
from pathlib import Path

import numpy as np
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)


class InfrastructureDetector:
    """Detector for infrastructure elements like tactile paving."""

    # Class mapping for tactile paving model
    CLASS_NAMES = {
        0: ("tactile_paving", "warning"),   # Dot pattern blocks
        1: ("tactile_paving", "guiding"),   # Line pattern blocks
    }

    def __init__(self):
        """Initialize the detector."""
        self.model = None
        self.model_loaded = False
        self._load_model()

    def _load_model(self):
        """Load YOLO model for detection."""
        model_path = Path(settings.MODEL_PATH) / settings.TACTILE_PAVING_MODEL

        if not model_path.exists():
            logger.warning(
                f"Model not found at {model_path}. "
                "Using placeholder detector. Train a model first."
            )
            return

        try:
            from ultralytics import YOLO
            self.model = YOLO(str(model_path))
            self.model_loaded = True
            logger.info(f"Model loaded from {model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")

    def detect(self, image: Image.Image) -> list[dict]:
        """
        Detect infrastructure in an image.

        Args:
            image: PIL Image to analyze

        Returns:
            List of detection results with type, subtype, confidence, and bounding box
        """
        if not self.model_loaded:
            # Return placeholder results for development
            return self._placeholder_detection(image)

        # Convert PIL Image to numpy array
        img_array = np.array(image)

        # Run inference
        results = self.model(
            img_array,
            conf=settings.DETECTION_CONFIDENCE_THRESHOLD,
            verbose=False,
        )

        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                bbox = box.xyxy[0].tolist()  # x1, y1, x2, y2

                if class_id in self.CLASS_NAMES:
                    infra_type, subtype = self.CLASS_NAMES[class_id]
                    detections.append({
                        "type": infra_type,
                        "subtype": subtype,
                        "confidence": confidence,
                        "bbox": {
                            "x": bbox[0],
                            "y": bbox[1],
                            "width": bbox[2] - bbox[0],
                            "height": bbox[3] - bbox[1],
                        },
                    })

        return detections

    def _placeholder_detection(self, image: Image.Image) -> list[dict]:
        """
        Generate placeholder detections for development.

        This is used when no trained model is available.
        In production, this should never be called.
        """
        logger.warning("Using placeholder detection - train a model for production use")

        # Return empty list - no detections without a real model
        # You could add random detections for testing UI, but
        # it's better to clearly indicate when no model is available
        return []

    def get_model_info(self) -> dict:
        """Get information about the loaded model."""
        return {
            "model_loaded": self.model_loaded,
            "model_path": str(Path(settings.MODEL_PATH) / settings.TACTILE_PAVING_MODEL),
            "confidence_threshold": settings.DETECTION_CONFIDENCE_THRESHOLD,
            "classes": list(self.CLASS_NAMES.values()),
        }


# Alternative detector using ONNX for faster inference
class ONNXDetector:
    """ONNX-based detector for faster CPU inference."""

    def __init__(self, model_path: str):
        """Initialize ONNX detector."""
        import onnxruntime as ort

        self.session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape

    def preprocess(self, image: Image.Image) -> np.ndarray:
        """Preprocess image for ONNX model."""
        # Resize to model input size
        target_size = (self.input_shape[2], self.input_shape[3])
        image = image.resize(target_size)

        # Convert to numpy and normalize
        img_array = np.array(image).astype(np.float32) / 255.0

        # Transpose to NCHW format
        img_array = img_array.transpose(2, 0, 1)

        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)

        return img_array

    def detect(self, image: Image.Image) -> list[dict]:
        """Run detection using ONNX model."""
        # Preprocess
        input_tensor = self.preprocess(image)

        # Run inference
        outputs = self.session.run(None, {self.input_name: input_tensor})

        # Post-process (implementation depends on model output format)
        # This is a placeholder - actual implementation depends on exported model
        return []
