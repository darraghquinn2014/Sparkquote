/**
 * ActionSheet — bottom-sheet menu replacing Alert.alert-based overflow menus.
 *
 * Android's native alert renders AT MOST three buttons — any menu built on
 * Alert.alert with more options silently drops the extras, including Cancel,
 * leaving a dialog the user can't dismiss (this bit the project and wall
 * screens' ••• menus). Use this for any menu with more than two actions;
 * Cancel is built in and always visible.
 */
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export interface ActionSheetItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}

export function ActionSheet({ visible, title, items, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const pick = (item: ActionSheetItem) => {
    onClose();
    item.onPress();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]} onPress={() => {}}>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {items.map((item) => (
            <Pressable key={item.label} style={styles.row} onPress={() => pick(item)}>
              <Text style={[styles.rowText, item.destructive && { color: colors.danger }]}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    padding: space.xl,
  },
  title: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: space.sm, textAlign: 'center' },
  row: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cancel: { alignItems: 'center', paddingTop: space.lg },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
