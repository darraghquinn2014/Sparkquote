import { Q } from '@nozbe/watermelondb';
import { database } from './database';
import { CertificateModel } from './models';
import type { Certificate, CertificateType, CertificateStatus, MinorWorksFields, EicFields, EicrFields } from '../domain/types';

function defaultFieldsFor(type: CertificateType): MinorWorksFields | EicFields | EicrFields {
  switch (type) {
    case 'minorWorks':
      return { descriptionOfWork: '', testResults: {} };
    case 'eic':
      return {
        descriptionOfInstallation: '',
        supply: {},
        origin: {},
        circuits: [],
        declarationRoles: { design: true, construction: true, inspectionAndTesting: true },
      };
    case 'eicr':
      return {
        supply: {},
        origin: {},
        circuits: [],
        observations: [],
      };
  }
}

function toCertificate(r: CertificateModel): Certificate {
  const base = {
    id: r.id,
    status: r.status as CertificateStatus,
    projectId: r.projectId,
    locationId: r.locationId ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (r.type === 'eic') {
    return { ...base, type: 'eic', fields: JSON.parse(r.fieldsJson) as EicFields };
  }
  if (r.type === 'eicr') {
    return { ...base, type: 'eicr', fields: JSON.parse(r.fieldsJson) as EicrFields };
  }
  return { ...base, type: 'minorWorks', fields: JSON.parse(r.fieldsJson) as MinorWorksFields };
}

export async function certificatesForProject(projectId: string): Promise<Certificate[]> {
  const rows = await database
    .get<CertificateModel>('certificates')
    .query(Q.where('project_id', projectId))
    .fetch();
  return rows.map(toCertificate).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCertificate(id: string): Promise<Certificate | null> {
  try {
    const row = await database.get<CertificateModel>('certificates').find(id);
    return toCertificate(row);
  } catch {
    return null;
  }
}

export async function createCertificate(
  projectId: string,
  type: CertificateType = 'minorWorks',
  locationId?: string,
): Promise<Certificate> {
  let created!: CertificateModel;
  await database.write(async () => {
    created = await database.get<CertificateModel>('certificates').create((r) => {
      r.projectId = projectId;
      r.locationId = locationId ?? null;
      r.type = type;
      r.status = 'draft';
      r.fieldsJson = JSON.stringify(defaultFieldsFor(type));
      r.createdAt = Date.now();
      r.updatedAt = Date.now();
    });
  });
  return toCertificate(created);
}

/** Shallow-merges the given partial fields into the certificate's stored fields (nested objects like testResults/supply/origin are replaced wholesale, not deep-merged — callers pass the full nested value). */
export async function updateCertificateFields(
  id: string,
  fields: Partial<MinorWorksFields> | Partial<EicFields> | Partial<EicrFields>,
): Promise<void> {
  await database.write(async () => {
    const row = await database.get<CertificateModel>('certificates').find(id);
    const current = JSON.parse(row.fieldsJson);
    const next = { ...current, ...fields };
    await row.update((r) => {
      r.fieldsJson = JSON.stringify(next);
      r.updatedAt = Date.now();
    });
  });
}

export async function setCertificateStatus(id: string, status: Certificate['status']): Promise<void> {
  await database.write(async () => {
    const row = await database.get<CertificateModel>('certificates').find(id);
    await row.update((r) => {
      r.status = status;
      r.updatedAt = Date.now();
    });
  });
}

export async function deleteCertificate(id: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<CertificateModel>('certificates').find(id);
    await row.destroyPermanently();
  });
}
