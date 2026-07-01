import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'photos',
          columns: [{ name: 'location_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'estimates',
          columns: [{ name: 'show_labor_breakdown', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'photos',
          columns: [
            { name: 'caption', type: 'string', isOptional: true },
            { name: 'note', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'photos',
          columns: [
            { name: 'stage', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
