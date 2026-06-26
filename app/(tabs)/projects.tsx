import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProjectModeScreen } from '@/src/ui/project-mode/ProjectModeScreen';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import type { Estimate, Location } from '@/src/domain/types';

const toggles = seedLaborToggles.map(toLaborToggle);

// Sample project + rooms (stands in for the database on Path B)
const project = { id: 'proj_demo', name: 'Maple Street Office', clientName: 'Northgate Commercial Ltd' };

const locations: Location[] = [
  { id: 'gf', projectId: 'proj_demo', name: 'Ground Floor', sortOrder: 1 },
  { id: 'recep', projectId: 'proj_demo', parentId: 'gf', name: 'Reception', sortOrder: 1 },
  { id: 'office', projectId: 'proj_demo', parentId: 'gf', name: 'Open Office', sortOrder: 2 },
  { id: 'ff', projectId: 'proj_demo', name: 'First Floor', sortOrder: 2 },
  { id: 'server', projectId: 'proj_demo', parentId: 'ff', name: 'Server Room', sortOrder: 1 },
];

const estimate: Estimate = {
  id: 'est_demo', mode: 'project', status: 'draft', currency: 'GBP',
  hourlyRateMinor: 5000, vatRatePct: 20, appliedLaborToggleIds: [], lineItems: [],
};

export default function ProjectsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ProjectModeScreen
        project={project}
        estimate={estimate}
        locations={locations}
        toggles={toggles}
        onPickContainment={() => {}}
      />
    </SafeAreaView>
  );
}
