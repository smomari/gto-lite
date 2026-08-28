import type { RangeManifest, RangeScenario } from "@/types/rangeData";

export async function loadManifest(): Promise<RangeManifest> {
  const res = await fetch("/data/ranges/manifest.json");
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  return res.json();
}

export async function loadScenario(filePath: string): Promise<RangeScenario> {
  const res = await fetch(filePath);
  if (!res.ok) throw new Error(`Failed to load scenario ${filePath}: ${res.status}`);
  return res.json();
}
