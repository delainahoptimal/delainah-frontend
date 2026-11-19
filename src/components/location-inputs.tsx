"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

export type Coordinates = { latitude: string; longitude: string };

export function CoordinateFields({ value, onChange }: { value: Coordinates; onChange: (coordinates: Coordinates) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function shareLocation() {
    if (!navigator.geolocation) {
      setError("This browser does not support location sharing.");
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ latitude: coords.latitude.toFixed(7), longitude: coords.longitude.toFixed(7) });
        setBusy(false);
      },
      (reason) => {
        setError(reason.code === reason.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser and try again."
          : reason.code === reason.POSITION_UNAVAILABLE
            ? "Your location could not be determined. Try again where GPS reception is clearer."
            : "Finding your location timed out. Please try again.");
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  return <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <button type="button" className="secondary-button" disabled={busy} onClick={shareLocation}>
        <MapPin size={14} />{busy ? "Waiting for location permission…" : "Share current location"}
      </button>
      <span className="field-hint">Your browser will ask you to allow location access and fill both coordinates.</span>
    </div>
    {(["latitude", "longitude"] as const).map((field) => <label key={field} className="field-label">{field === "latitude" ? "Latitude" : "Longitude"}<input className="field-control" name={field} type="number" step="any" value={value[field]} onChange={(event) => onChange({ ...value, [field]: event.target.value })} /></label>)}
    {error && <p role="alert" className="text-xs text-[#a34e3d] sm:col-span-2">{error}</p>}
  </div>;
}
