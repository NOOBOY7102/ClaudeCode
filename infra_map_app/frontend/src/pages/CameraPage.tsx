import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MapPin, AlertCircle } from 'lucide-react';
import CameraCapture from '../components/Camera/CameraCapture';
import { useMapStore } from '../store/mapStore';

function CameraPage() {
  const [showCamera, setShowCamera] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const navigate = useNavigate();
  const { currentPosition } = useMapStore();

  const handleSuccess = () => {
    setSuccessCount((prev) => prev + 1);
    setShowCamera(false);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {showCamera ? (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onSuccess={handleSuccess}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          {/* Location status */}
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full mb-8 ${
              currentPosition
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {currentPosition ? (
              <>
                <MapPin className="w-4 h-4" />
                <span className="text-sm">位置情報取得済み</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">位置情報を取得中...</span>
              </>
            )}
          </div>

          {/* Instructions */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">
              点字ブロックを撮影
            </h1>
            <p className="text-gray-600 max-w-sm">
              歩道の点字ブロックを撮影すると、AIが自動で検出してマップに登録します。
            </p>
          </div>

          {/* Tips */}
          <div className="bg-white rounded-lg p-4 mb-8 shadow-sm max-w-sm w-full">
            <h3 className="font-semibold text-gray-700 mb-2">撮影のコツ</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary-500">1.</span>
                点字ブロック全体が画面に入るように
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-500">2.</span>
                真上から撮影すると検出精度が向上
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-500">3.</span>
                明るい場所で撮影してください
              </li>
            </ul>
          </div>

          {/* Success count */}
          {successCount > 0 && (
            <div className="bg-green-50 rounded-lg p-4 mb-8 text-center">
              <p className="text-green-700">
                今日の貢献: <span className="font-bold">{successCount}</span> ポイント
              </p>
            </div>
          )}

          {/* Capture button */}
          <button
            onClick={() => setShowCamera(true)}
            disabled={!currentPosition}
            className="w-20 h-20 bg-primary-500 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Camera className="w-10 h-10 text-white" />
          </button>
          <p className="text-sm text-gray-500 mt-4">タップして撮影開始</p>
        </div>
      )}
    </div>
  );
}

export default CameraPage;
