/**
 * Resolves the project the electrician is currently looking at (if any),
 * from the route alone, so voice commands like "add a snag: loose socket"
 * don't need to repeat the job name while already inside that job. Room
 * screens carry a locationId, not a projectId, so those need one extra
 * lookup to find their parent project.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { loadLocation } from '../data/project-repo';

const DIRECT_PROJECT_RE = /^\/project\/(?:quote|snag|drawings)\/([^/]+)$/;
const PLAIN_PROJECT_RE = /^\/project\/([^/]+)$/;
const ROOM_RE = /^\/project\/room\/([^/]+)$/;

export function useCurrentProjectId(): string | undefined {
  const pathname = usePathname();
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const direct = pathname.match(DIRECT_PROJECT_RE);
    if (direct) {
      setProjectId(direct[1]);
      return;
    }

    const room = pathname.match(ROOM_RE);
    if (room) {
      loadLocation(room[1])
        .then((loc) => { if (!cancelled) setProjectId(loc.projectId); })
        .catch(() => { if (!cancelled) setProjectId(undefined); });
      return () => { cancelled = true; };
    }

    const plain = pathname.match(PLAIN_PROJECT_RE);
    if (plain && !['new', 'room', 'plan', 'wall', 'quote', 'snag', 'drawings'].includes(plain[1])) {
      setProjectId(plain[1]);
      return;
    }

    setProjectId(undefined);
  }, [pathname]);

  return projectId;
}
