import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  GeoJSON,
  Circle,
  Polyline,
  Marker,
  Tooltip,
  Popup,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { RegionResponse, SimulateResponse, HospitalInfo } from '../types';

interface MapViewProps {
  region?: RegionResponse | null;
  simulation?: SimulateResponse | null;
}

export type LabelPosition = 'left' | 'right' | 'above' | 'below';

export const LABEL_POSITIONS: Record<string, LabelPosition> = {
  h1: 'right', // Sion Hospital
  h2: 'right', // Bhabha (Kurla)
  h3: 'left', // Lilavati
  h4: 'above', // Asian Heart
  h5: 'left', // Guru Nanak
  h6: 'right', // KJ Somaiya
  h7: 'left', // SL Raheja
  h8: 'above', // Surana Sethia
};

const SHORT_NAMES: Record<string, string> = {
  h1: 'Sion Hospital',
  h2: 'Bhabha (Kurla)',
  h3: 'Lilavati',
  h4: 'Asian Heart',
  h5: 'Guru Nanak',
  h6: 'KJ Somaiya',
  h7: 'SL Raheja',
  h8: 'Surana Sethia',
};

const getShortHospitalName = (id: string, name: string): string => {
  return SHORT_NAMES[id] || name.slice(0, 14);
};

const createHospitalIcon = (
  id: string,
  name: string,
  isIsolated: boolean,
  position: LabelPosition = 'right'
) => {
  const shortName = getShortHospitalName(id, name);
  const badgeColor = isIsolated ? '#ef4444' : '#22c55e';
  const statusClass = isIsolated ? 'is-isolated' : 'is-operational';
  const positionClass = `label-${position}`;

  const html = `
    <div class="hospital-marker-root ${statusClass} ${positionClass}">
      <!-- Real Coordinates Anchor Dot -->
      <div class="hospital-marker-dot" style="background: ${badgeColor};"></div>

      <!-- 1px Leader Line from Dot to Pill -->
      <div class="hospital-leader-line"></div>

      <!-- Compact Hospital Label Pill -->
      <div class="hospital-marker-pill">
        <span class="hospital-badge-icon" style="background: ${badgeColor};">H</span>
        <span class="hospital-short-name">${shortName}</span>
        ${
          isIsolated
            ? `<span class="hospital-isolated-tag">ISOLATED</span>`
            : ''
        }
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-hospital-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

interface HospitalMarkersProps {
  hospitals?: HospitalInfo[];
  simulation?: SimulateResponse | null;
}

const HospitalMarkers: React.FC<HospitalMarkersProps> = ({
  hospitals = [],
  simulation,
}) => {
  if (!hospitals || hospitals.length === 0) return null;

  // Requirement 4: Isolated hospitals draw above operational ones
  // Sort so operational markers render first, isolated markers render last
  const sortedHospitals = [...hospitals].sort((a, b) => {
    const aIso =
      simulation?.cascade.hospitals.find((h) => h.id === a.id)?.status ===
      'ISOLATED'
        ? 1
        : 0;
    const bIso =
      simulation?.cascade.hospitals.find((h) => h.id === b.id)?.status ===
      'ISOLATED'
        ? 1
        : 0;
    return aIso - bIso;
  });

  return (
    <>
      {sortedHospitals.map((hospital) => {
        const statusObj = simulation?.cascade.hospitals.find(
          (h) => h.id === hospital.id
        );
        const isIsolated = statusObj?.status === 'ISOLATED';
        const position = LABEL_POSITIONS[hospital.id] || 'right';
        const elevation =
          (hospital as any).elevation ?? (hospital as any).elevation_m;

        const icon = createHospitalIcon(
          hospital.id,
          hospital.name,
          isIsolated,
          position
        );

        return (
          <Marker
            key={`${hospital.id}-${isIsolated}-${position}`}
            position={[hospital.lat, hospital.lon]}
            icon={icon}
            pane="hospitalsPane"
            zIndexOffset={isIsolated ? 1000 : 0}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="font-semibold text-xs">{hospital.name}</div>
              <div
                className={`text-[10px] font-bold ${
                  isIsolated ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {statusObj?.status ?? 'OPERATIONAL'}
              </div>
            </Tooltip>
            <Popup offset={[0, -4]}>
              <div className="p-1 font-sans text-gray-900">
                <div className="font-bold text-xs mb-0.5">
                  {hospital.name}
                </div>
                <div
                  className={`text-[11px] font-bold ${
                    isIsolated ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  Status: {statusObj?.status ?? 'OPERATIONAL'}
                </div>
                {elevation !== undefined && elevation !== null ? (
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Elevation: {elevation} m
                  </div>
                ) : null}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

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
      { name: 'hospitalsPane', zIndex: 600 },
    ];

    for (const p of customPanes) {
      let paneEl = map.getPane(p.name);
      if (!paneEl) {
        paneEl = map.createPane(p.name);
      }
      paneEl.style.zIndex = String(p.zIndex);
    }

    // 2. Fit bounds to region.bbox tighter with padding [20, 20] and maxZoom 14
    const applyBounds = () => {
      map.invalidateSize();
      if (bbox && bbox.length === 4) {
        const [west, south, east, north] = bbox;
        const bounds: LatLngBoundsExpression = [
          [south, west],
          [north, east],
        ];
        const lBounds = L.latLngBounds([south, west], [north, east]);
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
        map.setMaxBounds(lBounds.pad(0.06));
        map.setMinZoom(13);
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

  // Diagnostics console.log as requested
  const roadsCount = region?.roads?.features?.length ?? 0;
  const closedIdsCount = simulation?.flood?.closed_edge_ids?.length ?? 0;
  const floodedNodesCount = simulation?.flood?.flooded_nodes?.length ?? 0;
  const hospitalsCount = region?.hospitals?.length ?? 0;
  const zonesCount = region?.zones?.length ?? 0;

  console.log(
    `[MapView] Roads: ${roadsCount}, Closed IDs: ${closedIdsCount}, Flooded nodes: ${floodedNodesCount}, Hospitals: ${hospitalsCount}, Zones: ${zonesCount}`
  );

  // Separate roads into open (grey) and closed (bright red) using properties.id
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
        zoom={14}
        minZoom={13}
        maxBounds={
          region?.bbox
            ? [
                [region.bbox[1] - 0.005, region.bbox[0] - 0.005],
                [region.bbox[3] + 0.005, region.bbox[2] + 0.005],
              ]
            : undefined
        }
        maxBoundsViscosity={0.8}
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

        {/* Layer 4: Flooded Nodes in Bright Blue (#38bdf8, fill opacity 0.25, no stroke, radius 25 to 60m scaled by depth_m) */}
        {simulation?.flood.flooded_nodes.map((node, i) => {
          const radiusMeters = Math.min(
            60,
            Math.max(25, 25 + node.depth_m * 45)
          );
          return (
            <Circle
              key={`flood-${i}-${node.lat}-${node.lon}`}
              center={[node.lat, node.lon]}
              radius={radiusMeters}
              pane="floodPane"
              pathOptions={{
                stroke: false,
                fillColor: '#38bdf8',
                fillOpacity: 0.25,
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
            <Circle
              key={zone.id}
              center={[zone.lat, zone.lon]}
              radius={radius * 12}
              pane="zonesPane"
              pathOptions={{
                color,
                fillColor,
                fillOpacity: 0.35,
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
            </Circle>
          );
        })}

        {/* Layer 6: Hospital markers with readable name pills and anti-collision offsets */}
        <HospitalMarkers
          hospitals={region?.hospitals}
          simulation={simulation}
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
