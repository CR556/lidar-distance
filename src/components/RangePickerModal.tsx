import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatDistance, Unit } from '../lib/units';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const STEP_METERS = 0.1;

type Props = {
  visible: boolean;
  title: string;
  unit: Unit;
  /** Current value in meters. */
  valueMeters: number;
  /** Inclusive pickable bounds in meters. */
  minMeters: number;
  maxMeters: number;
  onCancel: () => void;
  onConfirm: (meters: number) => void;
};

/** Scroll-wheel distance picker: spin to a value, then OK. */
export function RangePickerModal({
  visible,
  title,
  unit,
  valueMeters,
  minMeters,
  maxMeters,
  onCancel,
  onConfirm,
}: Props) {
  const values = useMemo(() => {
    const list: number[] = [];
    for (let m = minMeters; m <= maxMeters + 1e-6; m += STEP_METERS) {
      list.push(Number(m.toFixed(1)));
    }
    return list;
  }, [minMeters, maxMeters]);

  const initialIndex = useMemo(() => {
    const index = values.findIndex((v) => v >= valueMeters - 1e-6);
    return index < 0 ? values.length - 1 : index;
  }, [values, valueMeters]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  // Re-sync when the modal opens for a different endpoint/value.
  const lastVisible = useRef(false);
  if (visible && !lastVisible.current) {
    lastVisible.current = true;
    if (selectedIndex !== initialIndex) {
      setSelectedIndex(initialIndex);
    }
  } else if (!visible && lastVisible.current) {
    lastVisible.current = false;
  }

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ROW_HEIGHT);
    setSelectedIndex(Math.min(Math.max(index, 0), values.length - 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.wheelContainer}>
            <ScrollView
              ref={scrollRef}
              style={styles.wheel}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_HEIGHT}
              decelerationRate="fast"
              contentOffset={{ x: 0, y: initialIndex * ROW_HEIGHT }}
              onMomentumScrollEnd={handleScrollEnd}
              onScrollEndDrag={handleScrollEnd}
              contentContainerStyle={{
                paddingVertical: (WHEEL_HEIGHT - ROW_HEIGHT) / 2,
              }}
            >
              {values.map((v, i) => (
                <View key={v} style={styles.row}>
                  <Text style={[styles.rowText, i === selectedIndex && styles.rowTextSelected]}>
                    {formatDistance(v, unit)}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.centerBand} pointerEvents="none" />
          </View>

          <View style={styles.buttons}>
            <Pressable onPress={onCancel} style={styles.button}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(values[selectedIndex])}
              style={[styles.button, styles.okButton]}
            >
              <Text style={styles.okLabel}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 270,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  wheelContainer: {
    height: WHEEL_HEIGHT,
    alignSelf: 'stretch',
  },
  wheel: {
    height: WHEEL_HEIGHT,
  },
  row: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  rowTextSelected: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '600',
  },
  centerBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (WHEEL_HEIGHT - ROW_HEIGHT) / 2,
    height: ROW_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  button: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
  },
  okButton: {
    backgroundColor: '#0a84ff',
  },
  cancelLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  okLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
