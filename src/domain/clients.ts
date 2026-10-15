/**
 * Client matching — pure logic for the saved client list.
 *
 * Projects created before the client list existed only have a free-text
 * clientName. planClientBackfill works out which saved clients to create and
 * which projects to link to them, matching names case- and space-insensitively
 * so "John Smith" and " john smith" become one client.
 */

/** Normalised key for matching client names. */
export function clientNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface BackfillProject {
  id: string;
  clientName?: string;
  clientId?: string;
}

export interface BackfillClient {
  id: string;
  name: string;
}

export interface ClientBackfillPlan {
  /** Names of new clients to create (first spelling seen, trimmed). */
  toCreate: string[];
  /** Each unlinked project with a client name → the client it belongs to:
   * an existing client's id, or the name of a client in toCreate. */
  links: { projectId: string; clientId?: string; newClientName?: string }[];
}

export function planClientBackfill(
  projects: BackfillProject[],
  existing: BackfillClient[],
): ClientBackfillPlan {
  const existingByKey = new Map<string, string>();
  for (const c of existing) {
    const key = clientNameKey(c.name);
    if (key && !existingByKey.has(key)) existingByKey.set(key, c.id);
  }

  const newNameByKey = new Map<string, string>();
  const links: ClientBackfillPlan['links'] = [];

  for (const p of projects) {
    if (p.clientId || !p.clientName) continue;
    const key = clientNameKey(p.clientName);
    if (!key) continue;
    const existingId = existingByKey.get(key);
    if (existingId) {
      links.push({ projectId: p.id, clientId: existingId });
      continue;
    }
    if (!newNameByKey.has(key)) newNameByKey.set(key, p.clientName.trim().replace(/\s+/g, ' '));
    links.push({ projectId: p.id, newClientName: newNameByKey.get(key) });
  }

  return { toCreate: [...newNameByKey.values()], links };
}

/** Case-insensitive search across a client's name, phone, email and address. */
export function clientMatches(
  client: { name: string; phone?: string; email?: string; address?: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [client.name, client.phone, client.email, client.address]
    .some((v) => v != null && v.toLowerCase().includes(q));
}
