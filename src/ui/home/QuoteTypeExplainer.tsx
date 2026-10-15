/**
 * "Which one?" sheet on Home — explains Quick quote vs Project side by side,
 * with a button into each. Quick quotes can't be moved into a project later,
 * so the sheet says so: if the job might grow, start a project.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '../theme/tokens';

interface Props {
  visible: boolean;
  quickColor: string;
  projectColor: string;
  onQuick: () => void;
  onProject: () => void;
  onClose: () => void;
}

export function QuoteTypeExplainer({ visible, quickColor, projectColor, onQuick, onProject, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <ScrollView>
            <View style={styles.grabber} />
            <Text style={styles.title}>Quick quote or project?</Text>

            <Option
              color={quickColor}
              icon="⚡"
              name="Quick quote"
              when="A one-off job you can price on the spot — e.g. add 2 sockets, swap a consumer unit."
              gets={['A price in a minute, by tapping jobs or talking', 'PDF quote to sign and send']}
              button="Start a quick quote"
              onPress={onQuick}
            />
            <Option
              color={projectColor}
              icon="⊞"
              name="Project"
              when="A bigger job across several rooms — e.g. a rewire, extension or new build."
              gets={['A quote split by floor and room', 'Photos, snag list, floor plans and certificates', 'Everything for that job kept together']}
              button="Go to projects"
              onPress={onProject}
            />

            <Text style={styles.note}>
              A quick quote can’t be moved into a project later — if the job might grow, start a project.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Option(props: {
  color: string; icon: string; name: string; when: string; gets: string[];
  button: string; onPress: () => void;
}) {
  return (
    <View style={[styles.card, { borderTopColor: props.color }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.icon, { color: props.color }]}>{props.icon}</Text>
        <Text style={styles.name}>{props.name}</Text>
      </View>
      <Text style={styles.when}>{props.when}</Text>
      {props.gets.map((g) => (
        <Text key={g} style={styles.get}>
          <Text style={{ color: props.color }}>•  </Text>{g}
        </Text>
      ))}
      <Pressable style={[styles.button, { backgroundColor: props.color }]} onPress={props.onPress}>
        <Text style={styles.buttonText}>{props.button}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: space.lg, paddingTop: space.sm, maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: space.lg },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg,
    borderTopWidth: 3, marginBottom: space.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  icon: { fontSize: 20, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  when: { fontSize: 15, color: colors.textSecondary, lineHeight: 21, marginBottom: space.sm },
  get: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  button: { borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', marginTop: space.md },
  buttonText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 19, textAlign: 'center', marginTop: space.xs, marginBottom: space.sm },
});
