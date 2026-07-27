"use client";

import type { User } from "@supabase/supabase-js";
import { appLocalStorageKeys } from "@/lib/local-store-keys";

export interface AppUser {
  id: string;
  email: string | null;
  name: string;
  accent: string;
  createdAt: string;
}

export const maxAppUsers = 3;

const appUserKeys = {
  users: "adfc_app_users_v2",
  activeUser: "adfc_active_app_user_v2",
  legacyMigration: "adfc_legacy_data_migrated_v2"
} as const;

const accentPool = ["mint", "sky", "coral"] as const;
const guestAppUserId = "synthetic-demo-profile-v1";
const retiredGuestAppUserIds = new Set(["guest-reviewer"]);
export const appUserChangeEvent = "adfc-active-user-changed";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeName(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 24) : "사용자";
}

function nameFromAuthUser(user: User, fallback = "") {
  const metadataName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : "";
  return normalizeName(fallback || metadataName || user.email?.split("@")[0] || "사용자");
}

export function isAccountAuthUser(user: User | null | undefined): user is User {
  return Boolean(user?.email) && user?.is_anonymous !== true;
}

export function isGuestAppUser(user: AppUser | null | undefined) {
  return user?.id === guestAppUserId;
}

function emitUserChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(appUserChangeEvent));
}

function saveAppUsers(users: AppUser[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(appUserKeys.users, JSON.stringify(users.slice(0, maxAppUsers)));
}

export function loadAppUsers(): AppUser[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(appUserKeys.users);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppUser[];
    return parsed
      .filter(
        (user) =>
          user.id
          && user.name
          && !retiredGuestAppUserIds.has(user.id)
      )
      .slice(0, maxAppUsers);
  } catch {
    return [];
  }
}

export function getActiveAppUserId() {
  if (!canUseStorage()) return null;
  const activeId = window.localStorage.getItem(appUserKeys.activeUser);
  if (activeId && retiredGuestAppUserIds.has(activeId)) {
    window.localStorage.removeItem(appUserKeys.activeUser);
    return null;
  }
  return activeId;
}

export function getActiveAppUser() {
  const activeId = getActiveAppUserId();
  if (!activeId) return null;
  return loadAppUsers().find((user) => user.id === activeId) ?? null;
}

export function getScopedLocalStoreKey(baseKey: string, userId = getActiveAppUserId()) {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function copyStoredValue(sourceKey: string, destinationKey: string) {
  if (!canUseStorage()) return 0;
  if (window.localStorage.getItem(destinationKey) !== null) return 0;
  const sourceValue = window.localStorage.getItem(sourceKey);
  if (sourceValue === null) return 0;
  window.localStorage.setItem(destinationKey, sourceValue);
  return 1;
}

function migrateExistingDataToUser(userId: string, previousUserId: string | null) {
  if (!canUseStorage()) return;

  const migrationKey = `${appUserKeys.legacyMigration}:${userId}`;
  if (window.localStorage.getItem(migrationKey)) return;

  let copied = 0;
  appLocalStorageKeys.forEach((baseKey) => {
    const destinationKey = getScopedLocalStoreKey(baseKey, userId);
    if (previousUserId && previousUserId !== userId) {
      copied += copyStoredValue(getScopedLocalStoreKey(baseKey, previousUserId), destinationKey);
    }
    copied += copyStoredValue(baseKey, destinationKey);
  });

  window.localStorage.setItem(
    migrationKey,
    JSON.stringify({ userId, copied, migratedAt: new Date().toISOString() })
  );
}

export function activateAppUserFromAuth(user: User, preferredName = "") {
  if (!canUseStorage()) return null;

  const previousActiveUserId = getActiveAppUserId();
  const users = loadAppUsers();
  const existing = users.find((item) => item.id === user.id);
  const nextUser: AppUser = {
    id: user.id,
    email: user.email ?? null,
    name: nameFromAuthUser(user, preferredName || existing?.name),
    accent: existing?.accent ?? accentPool[users.length % accentPool.length],
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  const nextUsers = [nextUser, ...users.filter((item) => item.id !== user.id)].slice(
    0,
    maxAppUsers
  );

  saveAppUsers(nextUsers);
  window.localStorage.setItem(appUserKeys.activeUser, nextUser.id);
  migrateExistingDataToUser(nextUser.id, previousActiveUserId);
  emitUserChange();
  return nextUser;
}

export function activateGuestAppUser() {
  if (!canUseStorage()) return null;

  const users = loadAppUsers();
  const existing = users.find((item) => item.id === guestAppUserId);
  const nextUser: AppUser = {
    id: guestAppUserId,
    email: null,
    name: "합성 데모",
    accent: existing?.accent ?? "sky",
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  const nextUsers = [nextUser, ...users.filter((item) => item.id !== guestAppUserId)].slice(
    0,
    maxAppUsers
  );

  saveAppUsers(nextUsers);
  window.localStorage.setItem(appUserKeys.activeUser, nextUser.id);
  emitUserChange();
  return nextUser;
}

export function clearActiveAppUser() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(appUserKeys.activeUser);
  emitUserChange();
}

export function getUserInitial(name: string) {
  return normalizeName(name).slice(0, 1).toUpperCase();
}
