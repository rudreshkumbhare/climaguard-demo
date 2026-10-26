import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  GeoJSON,
  CircleMarker,
  Polyline,
  Marker,
  Tooltip,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { RegionResponse, SimulateResponse } from '../types';

interface MapViewProps {
  region?: RegionResponse | null;
  simulation?: SimulateResponse | null;
}

// Controller for bounds fitting and pane initialization
const MapController: React.FC<{ bbox?: [number, number, number, number] }> = ({
  bbox,
}) => {
  const map = useMap();

  useEffect(() => {
    // 1. Initialize custom panes with explicit z-index above tile pane (200)
    const customPanes = [
      { name: 'roadsPane', zIndex: 350 },
      { name: 'closedRoadsPane', zIndex: 360 },
      { name: 'reroutePane', zIndex: 370 },
      { name: 'floodPane', zIndex: 380 },
      { name: 'zonesPane', zIndex: 390 },
      { name: 'hospitalsPane', zIndex: 450 },
    ];

    for (const p of customPanes) {
      let paneEl = map.getPane(p.name);
      if (!paneEl) {
        paneEl = map.createPane(p.name);
      }
      paneEl.style.zIndex = String(p.zIndex);
    }

    // 2. Fit bounds to region.bbox
    const applyBounds = () => {
      map.invalidateSize();
      if (bbox && bbox.length === 4) {
        const [west, south, east, north] = bbox;
        const bounds: LatLngBoundsExpression = [
          [south, west],
          [north, east],
        ];
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
      }
    };

    applyBounds();
    const timer = setTimeout(applyBounds, 120);
    return () => clearTimeout(timer);
  }, [map, bbox]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ region, simulation }) => {
  const west = region?.bbox?.[0] ?? 72.82;
  const south = region?.bbox?.[1] ?? 19.02;
  const east = region?.bbox?.[2] ?? 72.905;
  const north = region?.bbox?.[3] ?? 19.095;

  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;

  // Single shared canvas renderer for high-performance vector rendering
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);

  // 1. Diagnostics console.log as requested
  const roadsCount = region?.roads?.features?.length ?? 0;
  const closedIdsCount = simulation?.flood?.closed_edge_ids?.length ?? 0;
  const floodedNodesCount = simulation?.flood?.flooded_nodes?.length ?? 0;
  const hospitalsCount = region?.hospitals?.length ?? 0;
  const zonesCount = region?.zones?.length ?? 0;

  console.log(
    `[MapView] Roads: ${roadsCount}, Closed IDs: ${closedIdsCount}, Flooded nodes: ${floodedNodesCount}, Hospitals: ${hospitalsCount}, Zones: ${zonesCount}`
  );

  // 2. Separate roads into open (grey) and closed (bright red) using properties.id
  const closedSet = useMemo(
    () => new Set(simulation?.flood?.closed_edge_ids || []),
    [simulation?.flood?.closed_edge_ids]
  );

  const { openRoads, closedRoads } = useMemo(() => {
    if (!region?.roads?.features) return { openRoads: [], closedRoads: [] };
    const open: any[] = [];
    const closed: any[] = [];
    for (const f of region.roads.features) {
      if (closedSet.has(f.properties?.id)) {
        closed.push(f);
      } else {
        open.push(f);
      }
    }
    return { openRoads: open, closedRoads: closed };
  }, [region?.roads?.features, closedSet]);

  const openRoadsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: openRoads,
    }),
    [openRoads]
  );

  const closedRoadsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: closedRoads,
    }),
    [closedRoads]
  );

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

        <MapController bbox={region?.bbox} />

        {/* Layer 1: Grey Open Roads (Canvas, thin, light grey with opacity 0.5) */}
        {openRoads.length > 0 && (
          <GeoJSON
            key={`open-roads-${openRoads.length}`}
            data={openRoadsGeoJSON}
            pane="roadsPane"
            style={() => ({
              color: '#94a3b8',
              weight: 1.2,
              opacity: 0.5,
              renderer: canvasRenderer,
            })}
          />
        )}

        {/* Layer 2: Closed Roads in Bright Red (#ff3b30, weight 4, opacity 1) on top */}
        {closedRoads.length > 0 && (
          <GeoJSON
            key={`closed-roads-${closedRoads.length}-${simulation?.inputs_effective?.rain_mm_hr}`}
            data={closedRoadsGeoJSON}
            pane="closedRoadsPane"
            style={() => ({
              color: '#ff3b30',
              weight: 4,
              opacity: 1,
              renderer: canvasRenderer,
            })}
          />
        )}

        {/* Layer 3: Reroute Routes in Bright Green (#22c55e, weight 4) */}
        {simulation?.cascade.zones.map((zone) => {
          if (zone.status !== 'REROUTED' || !zone.route?.coordinates) {
            return null;
          }
          const positions: [number, number][] = zone.route.coordinates.map(
            ([lon, lat]: [number, number]) => [lat, lon]
          );
          return (
            <Polyline
              key={`reroute-${zone.id}`}
              positions={positions}
              pane="reroutePane"
              pathOptions={{
                color: '#22c55e',
                weight: 4,
                opacity: 0.95,
              }}
            />
          );
        })}

        {/* Layer 4: Flooded Nodes in Bright Blue (#38bdf8, fill opacity 0.5, radius scaled by depth_m) */}
        {simulation?.flood.flooded_nodes.map((node, i) => {
          const radius = Math.min(
            16,
            Math.max(3, Math.round(node.depth_m * 10))
          );
          return (
            <CircleMarker
              key={`flood-${i}-${node.lat}-${node.lon}`}
              center={[node.lat, node.lon]}
              radius={radius}
              pane="floodPane"
              pathOptions={{
                color: '#0284c7',
                fillColor: '#38bdf8',
                fillOpacity: 0.5,
                weight: 1,
                renderer: canvasRenderer,
              }}
            />
          );
        })}

        {/* Layer 5: Zones scaled by population (green OK, amber REROUTED, red CUT_OFF) */}
        {region?.zones.map((zone) => {
          const statusObj = simulation?.cascade.zones.find(
            (z) => z.id === zone.id
          );
          const status = statusObj?.status ?? 'OK';

          let color = '#22c55e'; // green OK
          let fillColor = '#22c55e';
          if (status === 'REROUTED') {
            color = '#f59e0b'; // amber REROUTED
            fillColor = '#f59e0b';
          } else if (status === 'CUT_OFF') {
            color = '#ef4444'; // red CUT_OFF
            fillColor = '#ef4444';
          }

          const radius = Math.round(
            Math.sqrt(zone.population / 1000) * 1.3 + 6
          );

          return (
            <CircleMarker
              key={zone.id}
              center={[zone.lat, zone.lon]}
              radius={radius}
              pane="zonesPane"
              pathOptions={{
                color,
                fillColor,
                fillOpacity: 0.4,
                weight: 2,
              }}
            >
              <Tooltip direction="top">
                <div className="font-semibold text-xs">{zone.name}</div>
                <div className="text-[11px] text-gray-300">
                  Pop: {zone.population.toLocaleString()} • Status:{' '}
                  <span className="font-bold">{status}</span>
                </div>
                {statusObj?.extra_km ? (
                  <div className="text-[10px] text-amber-300 font-medium">
                    +{statusObj.extra_km.toFixed(1)} km detour
                  </div>
                ) : null}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Layer 6: Hospitals as large coloured divIcon badges (green OPERATIONAL, red ISOLATED) */}
        {region?.hospitals.map((hospital) => {
          const statusObj = simulation?.cascade.hospitals.find(
            (h) => h.id === hospital.id
          );
          const isIsolated = statusObj?.status === 'ISOLATED';

          const icon = L.divIcon({
            className: 'custom-hospital-badge',
            html: isIsolated
              ? `<div style="
                  display: inline-flex;
                  align-items: center;
                  gap: 5px;
                  background: #7f1d1d;
                  border: 2px solid #ef4444;
                  border-radius: 6px;
                  padding: 3px 8px;
                  color: #ffffff;
                  font-family: system-ui, -apple-system, sans-serif;
                  box-shadow: 0 0 16px rgba(239,68,68,0.8), 0 2px 6px rgba(0,0,0,0.8);
                  white-space: nowrap;
                  cursor: pointer;
                ">
                  <span style="background: #ef4444; color: white; border-radius: 3px; padding: 1px 5px; font-weight: 900; font-size: 11px;">H</span>
                  <span style="font-weight: 800; font-size: 11px; color: #fee2e2; letter-spacing: 0.5px;">ISOLATED</span>
                </div>`
              : `<div style="
                  display: inline-flex;
                  align-items: center;
                  gap: 5px;
                  background: #14532d;
                  border: 2px solid #22c55e;
                  border-radius: 6px;
                  padding: 3px 7px;
                  color: #ffffff;
                  font-family: system-ui, -apple-system, sans-serif;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.7);
                  white-space: nowrap;
                  cursor: pointer;
                ">
                  <span style="background: #22c55e; color: #052e16; border-radius: 3px; padding: 1px 5px; font-weight: 900; font-size: 11px;">H</span>
                  <span style="font-weight: 700; font-size: 11px; color: #f0fdf4;">${hospital.name.split(' ')[0]}</span>
                </div>`,
            iconSize: isIsolated ? [96, 28] : [80, 26],
            iconAnchor: isIsolated ? [48, 14] : [40, 13],
          });

          return (
            <Marker
              key={hospital.id}
              position={[hospital.lat, hospital.lon]}
              icon={icon}
              pane="hospitalsPane"
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <div className="font-semibold text-xs">{hospital.name}</div>
                <div
                  className={`text-[11px] font-bold ${
                    isIsolated ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  Status: {statusObj?.status ?? 'OPERATIONAL'}
                </div>
              </Tooltip>
            </Marker>
          );
        })}
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
              Closed roads: <strong className="text-white">{closedRoads.length}</strong>
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
