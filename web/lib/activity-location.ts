import { locationOf } from "./service-scheduling/field-model";

export type ActivityLocation = ReturnType<typeof locationOf>;

// Location must never prevent the activity heartbeat from being recorded.
export function optionalActivityLocation(raw: unknown): ActivityLocation | null {
  try { return locationOf(raw); } catch { return null; }
}

export function readActivityLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
): Promise<ActivityLocation | null> {
  if (!geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8500);
    const finish = (location: ActivityLocation | null) => {
      clearTimeout(timer);
      resolve(location);
    };
    try {
      geolocation.getCurrentPosition(
        (position) => finish(optionalActivityLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          at: new Date(position.timestamp).toISOString(),
        })),
        () => finish(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    } catch { finish(null); }
  });
}
