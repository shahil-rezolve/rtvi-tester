/** Converts live objects in event payloads (tracks, devices, errors, bytes) into plain JSON for the log and inspector. */
export function toInspectable(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (ArrayBuffer.isView(v)) return { bytes: v.byteLength };
  if (v instanceof ArrayBuffer) return { bytes: v.byteLength };
  if (typeof MediaStreamTrack !== "undefined" && v instanceof MediaStreamTrack) {
    return { kind: v.kind, id: v.id, label: v.label, readyState: v.readyState, enabled: v.enabled, muted: v.muted, settings: v.getSettings?.() };
  }
  if ("toJSON" in v && typeof (v as { toJSON: unknown }).toJSON === "function") return (v as { toJSON(): unknown }).toJSON();
  if (Array.isArray(v)) return v.map(toInspectable);
  return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toInspectable(val)]));
}
