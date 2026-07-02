import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

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
    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'snag_items',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'description', type: 'string' },
            { name: 'resolved', type: 'boolean' },
            { name: 'photo_path', type: 'string', isOptional: true },
            { name: 'sort_order', type: 'number' },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        createTable({
          name: 'floor_plans',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'location_id', type: 'string', isIndexed: true },
            { name: 'file_path', type: 'string' },
            { name: 'width', type: 'number' },
            { name: 'height', type: 'number' },
            { name: 'created_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'walls',
          columns: [
            { name: 'floor_plan_id', type: 'string', isIndexed: true },
            { name: 'location_id', type: 'string', isIndexed: true },
            { name: 'start_x', type: 'number' },
            { name: 'start_y', type: 'number' },
            { name: 'end_x', type: 'number' },
            { name: 'end_y', type: 'number' },
            { name: 'label', type: 'string', isOptional: true },
            { name: 'photo_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'sort_order', type: 'number' },
            { name: 'created_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'wall_symbols',
          columns: [
            { name: 'wall_id', type: 'string', isIndexed: true },
            { name: 'type', type: 'string' },
            { name: 'position_along_wall', type: 'number' },
            { name: 'photo_y', type: 'number' },
            { name: 'color', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
