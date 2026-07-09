import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MeasureMode } from '../../modules/lidar-measure';

const LABELS: Record<MeasureMode, string> = {
  rearTap: 'Tap',
  rearCrosshair: 'Crosshair',
  heatmap: 'Depth',
  front: 'Front',
};

type Props = {
  mode: MeasureMode;
  availableModes: MeasureMode[];
  onChange: (mode: MeasureMode) => void;
};

export function ModeSwitcher({ mode, availableModes, onChange }: Props) {
  return (
    <View style={styles.container}>
      {availableModes.map((m) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          style={[styles.button, mode === m && styles.buttonActive]}
        >
          <Text style={[styles.label, mode === m && styles.labelActive]}>{LABELS[m]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 22,
    padding: 4,
    gap: 4,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
  },
  buttonActive: {
    backgroundColor: '#fff',
  },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '500',
  },
  labelActive: {
    color: '#000',
  },
});
