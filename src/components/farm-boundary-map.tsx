"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polygon, TileLayer, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";

type FarmBoundaryGeometry = { type: "Polygon"; coordinates: number[][][] };

function FitBoundary({ positions }: { positions: LatLngTuple[][] }) {
  const map = useMap();
  const outerRing = positions[0];

  useEffect(() => {
    if (outerRing.length > 0) map.fitBounds(outerRing, { padding: [24, 24] });
  }, [map, outerRing]);

  return null;
}

export default function FarmBoundaryMap({ geometry }: { geometry: FarmBoundaryGeometry }) {
  const [open, setOpen] = useState(false);
  const positions = useMemo(
    () => geometry.coordinates.map((ring) => ring.map(([longitude, latitude]) => [latitude, longitude] as LatLngTuple)),
    [geometry],
  );
  const outerRing = positions[0];

  return <div className="mt-3">
    <button type="button" className="secondary-button" onClick={() => setOpen((value) => !value)}>{open ? "Close farm map" : "Open farm map"}</button>
    {open && outerRing?.length > 0 && <MapContainer center={outerRing[0]} zoom={15} scrollWheelZoom={false} className="mt-3 h-72 w-full rounded-lg border border-[var(--line)]">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Polygon positions={positions} pathOptions={{ color: "#237957", fillColor: "#3f8861", fillOpacity: 0.25, weight: 3 }} />
      <FitBoundary positions={positions} />
    </MapContainer>}
  </div>;
}
