/**
 * SymbolTypePicker — horizontal row of symbol-family pills (Socket, Switch, …).
 *
 * Families with more than one variant open an ActionSheet on tap (e.g. Socket →
 * Single/Double/Double + USB/Floor/Outdoor); single-variant families select
 * directly. Shared by the three screens that place electrical symbols: the
 * photo annotation editor, the floor-plan tagger, and the wall screen.
 */
import React, { useState } from 'react';
import { Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SymbolType, SymbolFamily } from '@/src/media/annotation-service';
import { SYMBOL_FAMILIES, SYMBOL_VARIANTS, SYMBOL_FAMILY_OF, SYMBOL_LABELS } from './symbols';
import { ActionSheet } from '@/src/ui/ActionSheet';
import { colors, space, radius } from '@/src/ui/theme/tokens';

interface Props {
  selected: SymbolType;
  onSelect: (type: SymbolType) => void;
}

export function SymbolTypePicker({ selected, onSelect }: Props) {
  const [openFamily, setOpenFamily] = useState<SymbolFamily | null>(null);
  const selectedFamily = SYMBOL_FAMILY_OF[selected];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SYMBOL_FAMILIES.map((family) => {
          const variants = SYMBOL_VARIANTS[family];
          const active = family === selectedFamily;
          return (
            <Pressable
              key={family}
              style={[styles.btn, active && styles.btnActive]}
              onPress={() => (variants.length > 1 ? setOpenFamily(family) : onSelect(variants[0]!))}
              hitSlop={4}
            >
              <Text style={[styles.btnText, active && styles.btnTextActive]}>
                {active ? SYMBOL_LABELS[selected] : SYMBOL_LABELS[variants[0]!]}
                {variants.length > 1 ? ' ▾' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ActionSheet
        visible={openFamily != null}
        title={openFamily ? SYMBOL_LABELS[SYMBOL_VARIANTS[openFamily][0]!] : undefined}
        items={(openFamily ? SYMBOL_VARIANTS[openFamily] : []).map((variant) => ({
          label: SYMBOL_LABELS[variant],
          onPress: () => onSelect(variant),
        }))}
        onClose={() => setOpenFamily(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, paddingBottom: space.xs },
  btn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  btnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  btnTextActive: { color: colors.accentInk },
});
