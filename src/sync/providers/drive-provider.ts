/**
 * Google Drive provider adapter (spec §9.2).
 *
 * One concrete CloudProvider, built first per the architecture doc's advice:
 * prove the adapter interface end-to-end on one provider before adding OneDrive
 * and Dropbox (each becomes one more adapter, no rewrite). Writes to an
 * app-scoped folder using an OAuth access token the user granted for THEIR own
 * Drive — the app never sees their password and stores only tokens (in secure
 * storage, handled by the auth layer).
 *
 * Verified by typecheck + review; live calls need real OAuth + network.
 */

import type { CloudProvider } from '../sync-worker';

export interface DriveConfig {
  /** OAuth access token (refreshed by the auth layer). */
  getAccessToken: () => Promise<string>;
  /** Id of the app-scoped folder created on first connect. */
  appFolderId: string;
  /** Reads a local file as bytes for binary upload. */
  readFileBytes: (localPath: string) => Promise<Uint8Array>;
}

const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

export function createDriveProvider(config: DriveConfig): CloudProvider {
  /** Find an existing file by name in the app folder, returning its id. */
  async function findFileId(token: string, name: string): Promise<string | null> {
    const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${config.appFolderId}' in parents and trashed=false`);
    const res = await fetch(`${DRIVE_FILES}?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = (await res.json()) as { files?: { id: string }[] };
    return data.files?.[0]?.id ?? null;
  }

  /** Upload bytes as a new file or overwrite an existing one (multipart). */
  async function upload(name: string, mimeType: string, body: Uint8Array | string): Promise<void> {
    const token = await config.getAccessToken();
    const existingId = await findFileId(token, name);

    const boundary = `spark${Date.now().toString(36)}`;
    const metadata = existingId
      ? {}
      : { name, parents: [config.appFolderId] };

    const bodyBytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const post = `\r\n--${boundary}--`;

    const multipart = new Uint8Array(
      new TextEncoder().encode(pre).length + bodyBytes.length + new TextEncoder().encode(post).length,
    );
    let offset = 0;
    const preBytes = new TextEncoder().encode(pre);
    multipart.set(preBytes, offset); offset += preBytes.length;
    multipart.set(bodyBytes, offset); offset += bodyBytes.length;
    multipart.set(new TextEncoder().encode(post), offset);

    const method = existingId ? 'PATCH' : 'POST';
    const url = existingId
      ? `${DRIVE_UPLOAD}/${existingId}?uploadType=multipart`
      : `${DRIVE_UPLOAD}?uploadType=multipart`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipart,
    });
    if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  }

  return {
    name: 'Google Drive',

    async putJson(path: string, json: string): Promise<void> {
      await upload(flatten(path), 'application/json', json);
    },

    async putFile(path: string, localFilePath: string): Promise<void> {
      const bytes = await config.readFileBytes(localFilePath);
      await upload(flatten(path), 'image/jpeg', bytes);
    },

    async remove(path: string): Promise<void> {
      const token = await config.getAccessToken();
      const id = await findFileId(token, flatten(path));
      if (!id) return; // already gone — idempotent
      const res = await fetch(`${DRIVE_FILES}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
    },
  };
}

/** Drive's app folder is flat; encode the logical path into a single filename. */
function flatten(path: string): string {
  return path.replace(/\//g, '__');
}
