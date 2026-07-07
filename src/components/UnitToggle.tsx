import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { Unit } from '../lib/units';

type Props = {
  unit: Unit;
  onPress: () => void;
};

export function UnitToggle({ unit, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Text style={styles.label}>{unit}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 22,
    minWidth: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
