import { api, AppButton, Card, colors, type NotificationItem, Row, Screen, spacing, styles, timeAgo, useAuth, useI18n } from '@balagh/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

/** Profil (maquette 14-6) : identité, compteurs, langue, notifications, déconnexion. */
export default function ProfileScreen() {
  const { t, lang, setLang } = useI18n();
  const { user, signOut, refreshUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useFocusEffect(useCallback(() => {
    refreshUser().catch(() => undefined);
    api.notifications().then((p) => setNotifications(p.items)).catch(() => undefined);
  }, [refreshUser]));

  function changeLanguage() {
    const next = lang === 'fr' ? 'ar' : 'fr';
    setLang(next);
    api.updateLanguage(next).catch(() => undefined);
  }

  if (!user) return null;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  return (
    <Screen title={t('profile.title')}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.green,
            backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.green }}>{initials}</Text>
          </View>
          <Text style={[styles.title, { marginTop: spacing.sm }]}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.muted}>{user.phone}</Text>
        </View>

        <Card>
          <Text style={styles.title}>{t('profile.stats', { r: user.reportsCount ?? 0, s: user.resolvedCount ?? 0 })}</Text>
          <Text style={styles.muted}>{t('profile.thanks')}</Text>
        </Card>

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.title}>{t('profile.language')}</Text>
            <AppButton label={lang === 'fr' ? 'Français · العربية' : 'العربية · Français'} variant="ghost" onPress={changeLanguage} />
          </Row>
        </Card>

        <Card>
          <Text style={[styles.title, { marginBottom: spacing.sm }]}>{t('profile.notifications')}</Text>
          {notifications.length === 0 ? <Text style={styles.muted}>{t('notifications.empty')}</Text> : null}
          {notifications.slice(0, 10).map((n) => (
            <View key={n.id} style={{ paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontWeight: n.readAt ? '400' : '700', color: colors.text }}>{n.title}</Text>
              {n.body ? <Text style={styles.muted}>{n.body}</Text> : null}
              <Text style={[styles.muted, { fontSize: 11 }]}>{timeAgo(n.createdAt, t)}</Text>
            </View>
          ))}
        </Card>

        <AppButton label={t('profile.logout')} variant="danger" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}
