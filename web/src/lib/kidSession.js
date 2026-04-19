'use client';

// ============================================================
// kidSession.js — web client for the kid-profile unlock flow.
// Mirrors the RPCs defined in schema/reset_and_rebuild_v2.sql.
//
// Client stores (kid_profile_id, token) in sessionStorage while
// a kid profile is active. Pass these through to the permissions
// layer via setKidSession().
// ============================================================

import { createClient } from './supabase/client';
import { setKidSession, clearKidSession } from './permissions';

const KID_STORAGE_KEY  = 'vp.kidSession';
const DEVICE_ID_KEY    = 'vp.deviceId';

// --------- Stable device ID ---------
export function getDeviceId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// --------- Persisted kid session ---------
export function loadKidSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KID_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.kid_profile_id && s.token) {
      setKidSession(s);
      return s;
    }
  } catch { /* ignore */ }
  return null;
}

function persistKidSession(s) {
  if (typeof window === 'undefined') return;
  if (s) sessionStorage.setItem(KID_STORAGE_KEY, JSON.stringify(s));
  else   sessionStorage.removeItem(KID_STORAGE_KEY);
}

// --------- RPCs ---------
export async function listProfilesForDevice() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_profiles_for_device', {
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  return data || [];
}

export async function unlockAsParent(pin) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('unlock_as_parent', {
    p_pin: pin,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  persistKidSession(null);
  clearKidSession();
  return data;
}

export async function unlockAsKid(kidProfileId, pin) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('unlock_as_kid', {
    p_kid_profile_id: kidProfileId,
    p_pin: pin,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  if (data?.ok && data?.kid_profile_id && data?.token) {
    const session = { kid_profile_id: data.kid_profile_id, token: data.token };
    persistKidSession(session);
    setKidSession(session);
    return session;
  }
  throw new Error('unlock_as_kid returned unexpected payload');
}

export async function lockDevice() {
  const supabase = createClient();
  const { error } = await supabase.rpc('lock_device', {
    p_device_id: getDeviceId(),
  });
  persistKidSession(null);
  clearKidSession();
  if (error) throw error;
  return true;
}

export async function setDeviceMode(mode, boundKidProfileId = null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_device_mode', {
    p_device_id: getDeviceId(),
    p_mode: mode,
    p_bound_kid_profile_id: boundKidProfileId,
  });
  if (error) throw error;
  return true;
}

export async function setParentPin(pin) {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_parent_pin', { p_pin: pin });
  if (error) throw error;
  return true;
}

export async function setKidPin(kidProfileId, pin) {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_kid_pin', {
    p_kid_profile_id: kidProfileId,
    p_pin: pin,
  });
  if (error) throw error;
  return true;
}

export async function clearKidLockout(kidProfileId, parentPin) {
  const supabase = createClient();
  const { error } = await supabase.rpc('clear_kid_lockout', {
    p_kid_profile_id: kidProfileId,
    p_parent_pin: parentPin,
  });
  if (error) throw error;
  return true;
}
