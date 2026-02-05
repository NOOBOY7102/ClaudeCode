import { useState } from 'react';
import { Layers, Navigation, Filter } from 'lucide-react';
import InfraMap from '../components/Map/InfraMap';
import { useMapStore } from '../store/mapStore';
import { clsx } from 'clsx';

function MapPage() {
  const [showFilters, setShowFilters] = useState(false);
  const {
    currentPosition,
    setCenter,
    showTactilePaving,
    showVerifiedOnly,
    toggleTactilePaving,
    toggleVerifiedOnly,
    isLoading,
  } = useMapStore();

  const handleLocate = () => {
    if (currentPosition) {
      setCenter(currentPosition);
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Location error:', error);
          alert('位置情報を取得できませんでした');
        }
      );
    }
  };

  return (
    <div className="relative h-full">
      {/* Map */}
      <InfraMap />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
          <div className="spinner w-4 h-4" />
          <span className="text-sm">読み込み中...</span>
        </div>
      )}

      {/* Control buttons */}
      <div className="absolute right-4 top-4 flex flex-col gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={clsx(
            'w-10 h-10 rounded-full shadow-lg flex items-center justify-center',
            showFilters ? 'bg-primary-500 text-white' : 'bg-white text-gray-700'
          )}
        >
          <Filter className="w-5 h-5" />
        </button>
        <button
          onClick={handleLocate}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700"
        >
          <Navigation className="w-5 h-5" />
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="absolute right-4 top-20 bg-white rounded-lg shadow-lg p-4 w-64">
          <h3 className="font-semibold mb-3">フィルター</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={showTactilePaving}
                onChange={toggleTactilePaving}
                className="w-4 h-4 text-primary-500 rounded"
              />
              <span className="text-sm">点字ブロック</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={showVerifiedOnly}
                onChange={toggleVerifiedOnly}
                className="w-4 h-4 text-primary-500 rounded"
              />
              <span className="text-sm">検証済みのみ</span>
            </label>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute left-4 bottom-4 bg-white rounded-lg shadow-lg p-3">
        <h4 className="text-xs font-semibold text-gray-500 mb-2">凡例</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-tactile-warning border border-white shadow" />
            <span className="text-xs">警告ブロック（点状）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-tactile-guiding border border-white shadow" />
            <span className="text-xs">誘導ブロック（線状）</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapPage;
