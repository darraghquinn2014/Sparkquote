/**
 * WatermelonDB database instance.
 *
 * The polyfill import MUST be first — it fixes the window.performance.now.bind
 * startup crash before any WatermelonDB code runs. Uses the JSI adapter
 * (jsi: true) wired by the Morrow config plugin during the native build.
 */
import './polyfills';
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { migrations } from './migrations';
import {
  MaterialModel,
  AssemblyModel,
  AssemblyComponentModel,
  LaborToggleModel,
  ProjectModel,
  LocationModel,
  EstimateModel,
  LineItemModel,
  PhotoModel,
  FloorPlanModel,
  WallModel,
  WallSymbolModel,
  SnagItemModel,
  SyncQueueModel,
} from './models';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup failed:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    MaterialModel,
    AssemblyModel,
    AssemblyComponentModel,
    LaborToggleModel,
    ProjectModel,
    LocationModel,
    EstimateModel,
    LineItemModel,
    PhotoModel,
    FloorPlanModel,
    WallModel,
    WallSymbolModel,
    SnagItemModel,
    SyncQueueModel,
  ],
});
