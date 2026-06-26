/**
 * Print & share service (spec §10).
 *
 * Wraps expo-print (HTML -> PDF file) and expo-sharing (system share sheet:
 * WhatsApp, email, etc). Kept thin and behind an interface so the pure HTML
 * generation stays testable and the native calls are isolated.
 *
 * Verified by typecheck + review — the native modules require a device/dev
 * client to execute.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ClientEstimate } from '../pdf/client-view-model';
import { renderEstimateHtml, type SignatureBlock } from '../pdf/render-html';

export interface GeneratedPdf {
  uri: string;
}

/** Render a client estimate to a PDF file on disk, returning its uri. */
export async function generatePdf(
  estimate: ClientEstimate,
  signature?: SignatureBlock,
): Promise<GeneratedPdf> {
  const html = renderEstimateHtml(estimate, signature);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return { uri };
}

/** Share a generated PDF via the system share sheet. */
export async function sharePdf(uri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Send estimate',
    UTI: 'com.adobe.pdf',
  });
}

/** Convenience: generate then immediately share. */
export async function generateAndShare(
  estimate: ClientEstimate,
  signature?: SignatureBlock,
): Promise<GeneratedPdf> {
  const pdf = await generatePdf(estimate, signature);
  await sharePdf(pdf.uri);
  return pdf;
}
