import { useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Icon, DivIcon } from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useMapStore } from '../../store/mapStore';
import { pointsService } from '../../services/api';
import type { InfrastructurePoint } from '../../types';
import 'leaflet/dist/leaflet.css';

// Custom marker icons
const createMarkerIcon = (type: string, subtype: string | null) => {
  const color = subtype === 'warning' ? '#fbbf24' : '#f97316';

  return new DivIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Location marker component
function LocationMarker() {
  const { currentPosition, setCurrentPosition, setCenter } = useMapStore();
  const map = useMap();

  useEffect(() => {
    map.locate().on('locationfound', (e) => {
      setCurrentPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      setCenter({ lat: e.latlng.lat, lng: e.latlng.lng });
      map.flyTo(e.latlng, map.getZoom());
    });
  }, [map, setCurrentPosition, setCenter]);

  if (!currentPosition) return null;

  return (
    <Marker
      position={[currentPosition.lat, currentPosition.lng]}
      icon={
        new Icon({
          iconUrl: 'data:image/svg+xml;base64,' + btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          `),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })
      }
    >
      <Popup>現在地</Popup>
    </Marker>
  );
}

// Map events handler
function MapEventHandler() {
  const { setCenter, setZoom } = useMapStore();

  useMapEvents({
    moveend: (e) => {
      const center = e.target.getCenter();
      setCenter({ lat: center.lat, lng: center.lng });
    },
    zoomend: (e) => {
      setZoom(e.target.getZoom());
    },
  });

  return null;
}

// Point marker component
function PointMarker({ point }: { point: InfrastructurePoint }) {
  const { setSelectedPoint } = useMapStore();

  return (
    <Marker
      position={[point.location.lat, point.location.lng]}
      icon={createMarkerIcon(point.type, point.subtype)}
      eventHandlers={{
        click: () => setSelectedPoint(point),
      }}
    >
      <Popup>
        <div className="p-2">
          <h3 className="font-bold">
            {point.type === 'tactile_paving' ? '点字ブロック' : point.type}
          </h3>
          {point.subtype && (
            <p className="text-sm text-gray-600">
              {point.subtype === 'warning' ? '警告ブロック（点状）' : '誘導ブロック（線状）'}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            信頼度: {(point.confidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-500">
            ステータス: {point.status === 'verified' ? '検証済み' : '未検証'}
          </p>
        </div>
      </Popup>
    </Marker>
  );
}

// Main map component
function InfraMap() {
  const {
    center,
    zoom,
    points,
    setPoints,
    showTactilePaving,
    showVerifiedOnly,
    setIsLoading,
  } = useMapStore();

  // Fetch points when center changes
  const { data, isLoading } = useQuery({
    queryKey: ['points', center.lat, center.lng, showVerifiedOnly],
    queryFn: () =>
      pointsService.getPoints(
        center.lat,
        center.lng,
        1000, // 1km radius
        showTactilePaving ? 'tactile_paving' : undefined,
        showVerifiedOnly ? 'verified' : undefined
      ),
    staleTime: 1000 * 60, // 1 minute
  });

  useEffect(() => {
    setIsLoading(isLoading);
    if (data?.points) {
      setPoints(data.points);
    }
  }, [data, isLoading, setPoints, setIsLoading]);

  // Filter points
  const filteredPoints = points.filter((point) => {
    if (!showTactilePaving && point.type === 'tactile_paving') return false;
    if (showVerifiedOnly && point.status !== 'verified') return false;
    return true;
  });

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationMarker />
      <MapEventHandler />
      {filteredPoints.map((point) => (
        <PointMarker key={point.id} point={point} />
      ))}
    </MapContainer>
  );
}

export default InfraMap;
