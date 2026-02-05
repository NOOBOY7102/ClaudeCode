import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, Check, RotateCcw } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { detectionService, pointsService } from '../../services/api';
import { useMapStore } from '../../store/mapStore';
import type { DetectionResult } from '../../types';

interface CameraCaptureProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CameraCapture({ onClose, onSuccess }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { currentPosition } = useMapStore();

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Failed to start camera:', error);
      alert('カメラへのアクセスを許可してください');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Initialize camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // Capture image
  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageData);
      stopCamera();
    }
  }, [stopCamera]);

  // Detection mutation
  const detectMutation = useMutation({
    mutationFn: async (imageData: string) => {
      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      return detectionService.detect(file);
    },
    onSuccess: (data) => {
      setDetections(data.detections);
      setIsProcessing(false);
    },
    onError: (error) => {
      console.error('Detection failed:', error);
      setIsProcessing(false);
      alert('検出に失敗しました');
    },
  });

  // Save point mutation
  const saveMutation = useMutation({
    mutationFn: async (detection: DetectionResult) => {
      if (!currentPosition) {
        throw new Error('位置情報が取得できません');
      }
      return pointsService.createPoint({
        type: detection.type,
        subtype: detection.subtype || undefined,
        location: currentPosition,
        confidence: detection.confidence,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      console.error('Save failed:', error);
      alert('保存に失敗しました');
    },
  });

  // Process captured image
  const processImage = useCallback(() => {
    if (!capturedImage) return;
    setIsProcessing(true);
    detectMutation.mutate(capturedImage);
  }, [capturedImage, detectMutation]);

  // Retake photo
  const retake = useCallback(() => {
    setCapturedImage(null);
    setDetections([]);
    startCamera();
  }, [startCamera]);

  // Save detections
  const saveDetections = useCallback(() => {
    detections.forEach((detection) => {
      saveMutation.mutate(detection);
    });
  }, [detections, saveMutation]);

  return (
    <div className="camera-overlay flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-safe bg-black/50">
        <button onClick={onClose} className="text-white p-2">
          <X className="w-6 h-6" />
        </button>
        <h1 className="text-white font-semibold">撮影</h1>
        <div className="w-10" />
      </div>

      {/* Camera/Preview area */}
      <div className="flex-1 relative">
        {capturedImage ? (
          <img
            src={capturedImage}
            alt="Captured"
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        )}

        {/* Detection overlay */}
        {detections.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {detections.map((detection, index) => (
              <div
                key={index}
                className="absolute border-2 border-green-500"
                style={{
                  left: `${(detection.bounding_box.x / 1920) * 100}%`,
                  top: `${(detection.bounding_box.y / 1080) * 100}%`,
                  width: `${(detection.bounding_box.width / 1920) * 100}%`,
                  height: `${(detection.bounding_box.height / 1080) * 100}%`,
                }}
              >
                <span className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  {detection.subtype === 'warning' ? '警告' : '誘導'}{' '}
                  {(detection.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="spinner w-12 h-12" />
          </div>
        )}
      </div>

      {/* Canvas for capture (hidden) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="p-4 pb-safe bg-black/50 flex justify-center gap-8">
        {capturedImage ? (
          <>
            {detections.length === 0 ? (
              <>
                <button
                  onClick={retake}
                  className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"
                >
                  <RotateCcw className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={processImage}
                  disabled={isProcessing}
                  className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center"
                >
                  <Check className="w-8 h-8 text-white" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={retake}
                  className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"
                >
                  <RotateCcw className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={saveDetections}
                  disabled={saveMutation.isPending}
                  className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center"
                >
                  <Check className="w-8 h-8 text-white" />
                </button>
              </>
            )}
          </>
        ) : (
          <button
            onClick={captureImage}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center"
          >
            <Camera className="w-8 h-8 text-gray-800" />
          </button>
        )}
      </div>

      {/* Detection results */}
      {detections.length > 0 && (
        <div className="absolute bottom-32 left-4 right-4 bg-white rounded-lg p-4 shadow-lg">
          <h3 className="font-semibold mb-2">検出結果</h3>
          <ul className="space-y-2">
            {detections.map((detection, index) => (
              <li key={index} className="flex items-center justify-between">
                <span>
                  点字ブロック（{detection.subtype === 'warning' ? '警告' : '誘導'}）
                </span>
                <span className="text-sm text-gray-500">
                  {(detection.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CameraCapture;
