/**
 * SignAndSendScreen (spec §10).
 *
 * The client-facing close-out: review the total on-screen, sign with a finger,
 * and the signature is embedded into a locked PDF ready to share. The signature
 * pad emits a base64 PNG which goes straight into the PDF template's signature
 * block. Signing transitions the estimate to 'signed' (frozen — see §5.4).
 *
 * Uses react-native-signature-canvas for the finger pad. Verified by typecheck
 * + review; the canvas and print/share calls need a device to execute.
 */

import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import type { ClientEstimate } from '../../pdf/client-view-model';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

interface Props {
  estimate: ClientEstimate;
  /** Called with the base64 PNG data URI when the client signs and confirms. */
  onSigned: (signatureDataUri: string) => void;
  onCancel: () => void;
}

export function SignAndSendScreen({ estimate, onSigned, onCancel }: Props) {
  const ref = useRef<SignatureViewRef>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // The library returns the signature via this callback after a read().
  const handleOK = (signature: string) => {
    onSigned(signature);
  };

  const confirm = () => {
    // triggers handleOK with the drawn image
    ref.current?.readSignature();
  };

  const clear = () => {
    ref.current?.clearSignature();
    setHasDrawn(false);
  };

  // Minimal style injected into the canvas webview to match the dark theme.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; background: ${colors.surface}; }
    .m-signature-pad--body { border: 1px dashed ${colors.hairline}; }
    .m-signature-pad--footer { display: none; }
    body, html { background: ${colors.surface}; }
  `;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Review &amp; sign</Text>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total to accept</Text>
          <Text style={styles.totalValue}>
            {formatMoney(estimate.grandTotalMinor, estimate.currency)}
          </Text>
        </View>
        <Text style={styles.hint}>Sign below with your finger to accept this estimate.</Text>
      </View>

      <View style={styles.pad}>
        <SignatureScreen
          ref={ref}
          onOK={handleOK}
          onBegin={() => setHasDrawn(true)}
          webStyle={webStyle}
          autoClear={false}
          descriptionText=""
        />
      </View>

      <View style={styles.actions}>
        <Pressable onPress={clear} style={[styles.actionBtn, styles.secondaryBtn]}>
          <Text style={styles.secondaryText}>Clear</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={[styles.actionBtn, styles.secondaryBtn]}>
          <Text style={[styles.secondaryText, { color: colors.danger }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={confirm}
          disabled={!hasDrawn}
          style={[styles.actionBtn, styles.primaryBtn, !hasDrawn && styles.primaryDisabled]}
          accessibilityLabel="Accept and sign"
        >
          <Text style={[styles.primaryText, !hasDrawn && styles.primaryTextDisabled]}>
            Accept &amp; sign
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { padding: space.lg, gap: space.sm },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { ...type.body, color: colors.textSecondary },
  totalValue: { ...type.totalLg, color: colors.accent },
  hint: { ...type.caption, color: colors.textMuted },
  pad: { flex: 1, margin: space.lg, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: space.sm, padding: space.lg },
  actionBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center' },
  secondaryBtn: { backgroundColor: colors.surface },
  secondaryText: { ...type.body, color: colors.textSecondary, fontWeight: '700' },
  primaryBtn: { backgroundColor: colors.accent, flex: 1.4 },
  primaryDisabled: { backgroundColor: colors.surfacePressed },
  primaryText: { ...type.body, color: colors.accentInk, fontWeight: '800' },
  primaryTextDisabled: { color: colors.textMuted },
});
