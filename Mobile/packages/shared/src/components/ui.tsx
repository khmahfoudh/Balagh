import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { IncidentStatus, Priority } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, spacing, statusColor } from '../theme';

/** Écran avec en-tête vert et le logo « بلاغ » en or (maquettes §14 et §15). */
export function Screen({ title, right, children, scroll = false }: {
  title: string; right?: ReactNode; children: ReactNode; scroll?: boolean;
}) {
  const { isRTL } = useI18n();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, isRTL && styles.rowReverse]}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {right ?? <Text style={styles.logo}>بلاغ</Text>}
      </View>
      <View style={[styles.body, scroll && { padding: 0 }]}>{children}</View>
    </SafeAreaView>
  );
}

type Variant = 'primary' | 'gold' | 'outline' | 'danger' | 'ghost';

/** Gros bouton (≥ 52 px), lisible en plein soleil et utilisable d'une main. */
export function AppButton({ label, onPress, variant = 'primary', loading, disabled, style }: {
  label: string; onPress: () => void; variant?: Variant; loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, v.box, (disabled || loading) && styles.disabled, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const { isRTL } = useI18n();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, isRTL && styles.textRight]}>{label}</Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        style={[styles.input, isRTL && styles.textRight]}
        {...input}
      />
      {hint ? <Text style={[styles.hint, isRTL && styles.textRight]}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: string }) {
  return (
    <View style={[styles.card, accent ? { borderLeftWidth: 5, borderLeftColor: accent } : null, style]}>
      {children}
    </View>
  );
}

/** Badge de statut : URGENT rouge, nouveau orange, en cours bleu, résolu vert. */
export function StatusBadge({ status, priority }: { status: IncidentStatus; priority?: Priority }) {
  const { t } = useI18n();
  const urgent = priority === 'URGENT' && status !== 'RESOLVED' && status !== 'REJECTED';
  return (
    <View style={[styles.badge, { backgroundColor: statusColor(status, priority) }]}>
      <Text style={styles.badgeText}>{urgent ? t('priority.URGENT') : t(`status.${status}`)}</Text>
    </View>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return (
    <View style={[styles.badge, { backgroundColor: priority === 'URGENT' ? colors.red : colors.orange }]}>
      <Text style={styles.badgeText}>{t(`priority.${priority}`)}</Text>
    </View>
  );
}

export function Banner({ message, tone = 'info' }: { message: string; tone?: 'info' | 'error' | 'success' | 'warning' }) {
  const palette = {
    info: { bg: colors.greenLight, fg: colors.greenDark },
    success: { bg: colors.greenLight, fg: colors.greenDark },
    error: { bg: colors.redLight, fg: colors.red },
    warning: { bg: '#FFF4DB', fg: '#8A6100' },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Text style={{ color: palette.fg, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.green} />
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <Text style={styles.empty}>{message}</Text>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { isRTL } = useI18n();
  return <View style={[styles.row, isRTL && styles.rowReverse, style]}>{children}</View>;
}

const buttonVariants: Record<Variant, { box: ViewStyle; text: { color: string } }> = {
  primary: { box: { backgroundColor: colors.green }, text: { color: colors.white } },
  gold: { box: { backgroundColor: colors.gold }, text: { color: colors.white } },
  outline: { box: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.green }, text: { color: colors.green } },
  danger: { box: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.red }, text: { color: colors.red } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: colors.green } },
};

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.green },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.green },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  logo: { color: colors.gold, fontSize: 24, fontWeight: '700' },
  body: { flex: 1, backgroundColor: colors.background },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.lg, marginVertical: spacing.xs },
  buttonText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: spacing.xs },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md,
    fontSize: 16, backgroundColor: colors.white, color: colors.text },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  banner: { borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
});
