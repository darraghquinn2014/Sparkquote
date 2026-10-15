/**
 * client-repo — persistence for the saved client list.
 *
 * Projects link to a client via client_id but also keep a denormalised
 * client_name (used by PDFs, search and certificates without a join). Every
 * write here that changes a client's name or a project's client keeps the two
 * in sync.
 */
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { database } from './database';
import { ClientModel, ProjectModel } from './models';
import type { Client } from '../domain/types';
import { planClientBackfill } from '../domain/clients';

export interface ClientFields {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

function toClient(r: ClientModel): Client {
  const c: Client = { id: r.id, name: r.name, createdAt: r.createdAt.getTime() };
  if (r.phone) c.phone = r.phone;
  if (r.email) c.email = r.email;
  if (r.address) c.address = r.address;
  return c;
}

function applyFields(r: ClientModel, f: ClientFields) {
  r.name = f.name.trim();
  r.phone = f.phone?.trim() || null;
  r.email = f.email?.trim() || null;
  r.address = f.address?.trim() || null;
}

export async function loadClients(): Promise<Client[]> {
  const rows = await database.get<ClientModel>('clients').query().fetch();
  return rows.map(toClient).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadClient(id: string): Promise<Client | null> {
  try {
    return toClient(await database.get<ClientModel>('clients').find(id));
  } catch {
    return null;
  }
}

export async function createClient(fields: ClientFields): Promise<Client> {
  let created: Client | null = null;
  await database.write(async () => {
    const row = await database.get<ClientModel>('clients').create((r) => applyFields(r, fields));
    created = toClient(row);
  });
  return created!;
}

/** Update a client and rename it on every project linked to it. */
export async function updateClient(id: string, fields: ClientFields): Promise<void> {
  await database.write(async () => {
    const row = await database.get<ClientModel>('clients').find(id);
    const projects = await database.get<ProjectModel>('projects').query(Q.where('client_id', id)).fetch();
    await database.batch([
      row.prepareUpdate((r) => applyFields(r, fields)),
      ...projects.map((p) => p.prepareUpdate((r) => { r.clientName = fields.name.trim(); })),
    ]);
  });
}

/** Delete a client. Linked projects keep the client's name as plain text. */
export async function deleteClient(id: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<ClientModel>('clients').find(id);
    const projects = await database.get<ProjectModel>('projects').query(Q.where('client_id', id)).fetch();
    await database.batch([
      ...projects.map((p) => p.prepareUpdate((r) => { r.clientId = null; })),
      row.prepareDestroyPermanently(),
    ]);
  });
}

/** Link a project to a client (or clear it with null). */
export async function setProjectClient(projectId: string, client: Client | null): Promise<void> {
  await database.write(async () => {
    const row = await database.get<ProjectModel>('projects').find(projectId);
    await row.update((r) => {
      r.clientId = client?.id ?? null;
      r.clientName = client?.name ?? null;
    });
  });
}

/** Number of projects linked to each client id. */
export async function projectCountsByClient(): Promise<Map<string, number>> {
  const rows = await database.get<ProjectModel>('projects').query(Q.where('client_id', Q.notEq(null))).fetch();
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.clientId!, (counts.get(r.clientId!) ?? 0) + 1);
  return counts;
}

/**
 * One-time upgrade: turn the free-text client names on existing projects into
 * saved clients and link them. Safe to re-run — only unlinked projects with a
 * client name are touched — but the caller runs it once (settings flag) so a
 * deliberately deleted client isn't recreated from its old projects.
 */
export async function backfillClientsFromProjects(): Promise<number> {
  let linked = 0;
  await database.write(async () => {
    const [projectRows, clientRows] = await Promise.all([
      database.get<ProjectModel>('projects').query().fetch(),
      database.get<ClientModel>('clients').query().fetch(),
    ]);
    const plan = planClientBackfill(
      projectRows.map((r) => ({ id: r.id, clientName: r.clientName ?? undefined, clientId: r.clientId ?? undefined })),
      clientRows.map((r) => ({ id: r.id, name: r.name })),
    );
    if (plan.links.length === 0) return;

    const ops: Model[] = [];
    const newIdByName = new Map<string, string>();
    for (const name of plan.toCreate) {
      const c = database.get<ClientModel>('clients').prepareCreate((r) => applyFields(r, { name }));
      newIdByName.set(name, c.id);
      ops.push(c);
    }
    const projectById = new Map(projectRows.map((r) => [r.id, r]));
    for (const link of plan.links) {
      const clientId = link.clientId ?? newIdByName.get(link.newClientName!)!;
      ops.push(projectById.get(link.projectId)!.prepareUpdate((r) => { r.clientId = clientId; }));
    }
    await database.batch(ops);
    linked = plan.links.length;
  });
  return linked;
}
