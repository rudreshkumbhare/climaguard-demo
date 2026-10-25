import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Rectangle } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { RegionResponse, SimulateResponse } from '../types';

interface MapViewProps {
  region?: RegionResponse | null;
  simulation?: SimulateResponse | null;
}

// Helper to fit map bounds to region bbox
const FitBoundsToRegion: React.FC<{ bounds: LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ region, simulation }) => {
  // Default bounds fallback: Mumbai Sion/Kurla/Dharavi/BKC bbox
  const west = region?.bbox?.[0] ?? 72.82;
  const south = region?.bbox?.[1] ?? 19.02;
  const east = region?.bbox?.[2] ?? 72.905;
  const north = region?.bbox?.[3] ?? 19.095;

  const bounds: LatLngBoundsExpression = [
    [south, west],
    [north, east],
  ];

  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;

  const closedRoadsCount = simulation?.flood.closed_edge_ids.length ?? 0;
  const floodedNodesCount = simulation?.flood.flooded_nodes.length ?? 0;

  return (
    <div className="flex-1 h-full relative bg-[#0b0f19] overflow-hidden">
      <MapContainer
        center={[centerLat, centerLon]}
        zoom={13}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <FitBoundsToRegion bounds={bounds} />

        {/* Study Area Bounding Box visual border */}
        <Rectangle
          bounds={bounds}
          pathOptions={{
            color: '#38bdf8',
            weight: 1.5,
            dashArray: '4, 4',
            fillColor: '#0284c7',
            fillOpacity: 0.03,
          }}
        />
      </MapContainer>

      {/* Region Status Floating Badge */}
      <div className="absolute top-4 left-4 z-[1000] bg-dark-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-dark-600 shadow-lg text-xs space-y-1 max-w-sm pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">
            Mumbai Study Area (Sion–Kurla–Dharavi–BKC)
          </span>
        </div>
        <div className="text-[11px] text-gray-400 flex items-center gap-3">
          <span>Hospitals: {region?.hospitals.length ?? 8}</span>
          <span>•</span>
          <span>Shelters: {region?.shelters.length ?? 8}</span>
          <span>•</span>
          <span>Zones: {region?.zones.length ?? 10}</span>
        </div>
      </div>

      {/* Floating Simulation Overlay Indicator */}
      {simulation && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-dark-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-dark-600 shadow-lg text-xs pointer-events-none space-y-1">
          <div className="text-[11px] text-gray-400 uppercase font-semibold">
            Active Map State
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              Closed roads: <strong className="text-white">{closedRoadsCount}</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Flooded nodes: <strong className="text-white">{floodedNodesCount}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
