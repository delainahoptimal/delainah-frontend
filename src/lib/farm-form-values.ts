type FarmRow = Record<string, unknown>;

export function farmLocationText(farm?: FarmRow) {
  if (!farm) return "";
  const locationText = farm.location_text;
  if (typeof locationText === "string" && locationText.trim()) return locationText;
  return [farm.community_name, farm.ward_name, farm.lga_name, farm.state_name]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(", ");
}

export function farmSizeInAcres(farm?: FarmRow) {
  const hectares = Number(farm?.size_hectares);
  return Number.isFinite(hectares) && hectares > 0 ? (hectares * 2.47105).toFixed(2) : "";
}
