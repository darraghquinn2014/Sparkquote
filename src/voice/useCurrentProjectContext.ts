/**
 * Resolves the project (and, where the route pins it to one, the room) the
 * electrician is currently looking at, from the route alone, so voice
 * commands like "add a snag: loose socket" or "add a socket" don't need to
 * repeat the job name / room name while already inside them. Room screens
 * carry a locationId, not a projectId, so those need one extra lookup to
 * find their parent project. Wall screens are one level deeper still — a
 * wallId, which resolves to a locationId, which resolves to a projectId —
 * so those need two, but the locationId (the wall's own room) is known
 * without waiting on either lookup.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { loadLocation } from '../data/project-repo';
import { loadWall } from '../data/floor-plan-repo';

const DIRECT_PROJECT_RE = /^\/project\/(?:quote|snag|drawings)\/([^/]+)$/;
const PLAIN_PROJECT_RE = /^\/project\/([^/]+)$/;
const ROOM_RE = /^\/project\/room\/([^/]+)$/;
const WALL_RE = /^\/project\/wall\/([^/]+)$/;

export interface CurrentProjectContext {
  projectId: string | undefined;
  /** Set only when the route pins the electrician to one specific room
   * (a room or wall screen) — not when just viewing the project as a whole
   * (quote/snag/drawings list, or the project overview). */
  locationId: string | undefined;
}

const EMPTY: CurrentProjectContext = { projectId: undefined, locationId: undefined };

export function useCurrentProjectContext(): CurrentProjectContext {
  const pathname = usePathname();
  const [context, setContext] = useState<CurrentProjectContext>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const direct = pathname.match(DIRECT_PROJECT_RE);
    if (direct) {
      setContext({ projectId: direct[1], locationId: undefined });
      return;
    }

    const room = pathname.match(ROOM_RE);
    if (room) {
      const locationId = room[1];
      loadLocation(locationId)
        .then((loc) => { if (!cancelled) setContext({ projectId: loc.projectId, locationId }); })
        .catch(() => { if (!cancelled) setContext(EMPTY); });
      return () => { cancelled = true; };
    }

    const wall = pathname.match(WALL_RE);
    if (wall) {
      loadWall(wall[1])
        .then((w) => loadLocation(w.locationId).then((loc) => {
          if (!cancelled) setContext({ projectId: loc.projectId, locationId: w.locationId });
        }))
        .catch(() => { if (!cancelled) setContext(EMPTY); });
      return () => { cancelled = true; };
    }

    const plain = pathname.match(PLAIN_PROJECT_RE);
    if (plain && !['new', 'room', 'plan', 'wall', 'quote', 'snag', 'drawings'].includes(plain[1])) {
      setContext({ projectId: plain[1], locationId: undefined });
      return;
    }

    setContext(EMPTY);
  }, [pathname]);

  return context;
}
