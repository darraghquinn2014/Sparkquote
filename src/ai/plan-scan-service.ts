/**
 * AI Plan Mode (spec: guided wall-photo capture) — the one network-dependent
 * call in the app. Sends the floor plan image + the walls already traced on
 * it to Claude, asking which electrical symbols are near each wall and their
 * position along it (0-1, horizontal only — a top-down plan carries no
 * height data, so vertical position always stays a manual review step, same
 * as PlanSymbolTagger's DEFAULT_PHOTO_Y for hand-tagged symbols).
 *
 * Raw fetch against the Messages API, not the @anthropic-ai/sdk package —
 * the SDK's credential-resolution code path does a dynamic `import('node:fs')`
 * that Metro can't bundle for React Native (confirmed: `expo export` fails
 * with "Unable to resolve module node:fs"). Raw fetch is also the existing
 * convention for the app's one other outbound API call
 * (src/sync/providers/drive-provider.ts).
 *
 * Deliberately isolated in this one file: the API key is currently read
 * client-side (EXPO_PUBLIC_ANTHROPIC_API_KEY, baked into the compiled JS
 * bundle — acceptable only while distribution stays to hand-installed/EAS
 * ad-hoc builds on registered devices, not an app store). Before this ships
 * to paying customers, this call needs to move behind a small backend proxy
 * that holds the key server-side — isolating it here is what makes that a
 * one-file swap instead of a UI rewrite.
 */
import { z } from 'zod';
import * as FileSystem from 'expo-file-system/legacy';
import type { FloorPlan, Wall } from '../domain/types';
import type { SymbolType } from '../media/annotation-service';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const SYMBOL_TYPE_VALUES: SymbolType[] = [
  'socket',
  'switch',
  'ceiling_rose',
  'downlight',
  'consumer_unit',
  'junction_box',
  'smoke_detector',
  'fan',
];

export interface AiSymbolDetection {
  wallId: string;
  type: SymbolType;
  positionAlongWall: number;
}

function wallLabelFor(wall: Wall, index: number): string {
  return wall.label && wall.label.trim() ? wall.label : `Wall ${index + 1}`;
}

function buildResponseSchema(wallIds: [string, ...string[]]) {
  return z.object({
    detections: z.array(
      z.object({
        wallId: z.enum(wallIds),
        type: z.enum(SYMBOL_TYPE_VALUES as [SymbolType, ...SymbolType[]]),
        positionAlongWall: z
          .number()
          .describe("0 to 1, fraction of the distance from the wall's start point to its end point"),
      }),
    ),
  });
}

/**
 * Scan a floor plan image and return AI-suggested symbol placements for the
 * given walls. Throws on any failure (missing API key, network error,
 * malformed response) — callers show an Alert and fall back to manual
 * tagging, same convention as camera-service.ts's capture functions.
 */
export async function scanFloorPlanForSymbols(
  floorPlan: Pick<FloorPlan, 'filePath' | 'width' | 'height'>,
  walls: Wall[],
): Promise<AiSymbolDetection[]> {
  if (walls.length === 0) return [];

  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('AI scan is not configured (missing EXPO_PUBLIC_ANTHROPIC_API_KEY).');
  }

  const imageBase64 = await FileSystem.readAsStringAsync(floorPlan.filePath, { encoding: 'base64' });

  const wallList = walls
    .map((w, i) => {
      const startPx = { x: Math.round(w.start.x * floorPlan.width), y: Math.round(w.start.y * floorPlan.height) };
      const endPx = { x: Math.round(w.end.x * floorPlan.width), y: Math.round(w.end.y * floorPlan.height) };
      return `- id "${w.id}" (${wallLabelFor(w, i)}): from (${startPx.x}, ${startPx.y}) to (${endPx.x}, ${endPx.y}) px`;
    })
    .join('\n');

  const wallIds = walls.map((w) => w.id) as [string, ...string[]];
  const schema = buildResponseSchema(wallIds);
  // z.toJSONSchema already emits enum/additionalProperties:false correctly
  // for the Messages API's structured-outputs format — strip only the
  // top-level $schema meta field, which the API doesn't expect.
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const res = await fetch(MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: jsonSchema } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text:
                "This is a UK/Ireland electrician's floor plan. The following wall segments have already " +
                'been traced on it, given as pixel coordinates on this image:\n\n' +
                `${wallList}\n\n` +
                'For each wall, identify any electrical symbols drawn on the plan near that wall — sockets, ' +
                'switches, ceiling roses, downlights, consumer units, junction boxes, smoke detectors, fans. ' +
                'For each symbol you find, report which wall it belongs to (by exact id) and its position ' +
                "along that wall as a 0-1 fraction from the wall's start point to its end point, projecting " +
                "the symbol onto the wall line if it isn't exactly on it. If a wall has no symbols near it, " +
                "omit it. If you're not confident a mark is an electrical symbol, leave it out.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI scan request failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (data.stop_reason === 'refusal') {
    throw new Error('AI declined to process this plan.');
  }
  const textBlock = data.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!textBlock?.text) {
    throw new Error('AI scan returned no usable result.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textBlock.text);
  } catch {
    throw new Error('AI scan returned malformed JSON.');
  }
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('AI scan result did not match the expected shape.');
  }

  const knownIds = new Set(walls.map((w) => w.id));
  return parsed.data.detections
    .filter((d) => knownIds.has(d.wallId))
    .map((d) => ({
      wallId: d.wallId,
      type: d.type,
      positionAlongWall: Math.max(0, Math.min(1, d.positionAlongWall)),
    }));
}
