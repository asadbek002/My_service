'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useMe } from './queries';

export type Branch = { id: string; name: string; address: string | null; phone: string | null; archived: boolean; createdAt: string; staff: number; open: number };
export type Branches = { limit: number | null; manage: boolean; branches: Branch[] };

export const useBranches = (enabled = true) => useQuery({ queryKey: ['branches'], queryFn: () => api<Branches>('/branches'), staleTime: 60_000, enabled });

// The branch chosen in the header, per service and device; every screen follows it at once.
const listeners = new Set<() => void>();
const keyOf = (org: string) => 'ms_branch:' + org;
function read(org: string) { try { return localStorage.getItem(keyOf(org)) ?? ''; } catch { return ''; } }
function write(org: string, id: string) {
  try { if (id) localStorage.setItem(keyOf(org), id); else localStorage.removeItem(keyOf(org)); } catch { /* private mode */ }
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/**
 * Where the user works right now. `branch` is '' for "all branches" (and whenever there is only one);
 * `open` are the branches that still take work; `multi` says whether choosing makes sense at all.
 */
export function useCurrentBranch() {
  const { data: me } = useMe();
  const org = me?.organizationId ?? '';
  const { data } = useBranches(!!me && !me.mustChangePassword && !me.support);
  const stored = useSyncExternalStore(subscribe, () => (org ? read(org) : ''), () => '');
  const open = (data?.branches ?? []).filter(b => !b.archived);
  const multi = open.length > 1;
  const branch = multi && open.some(b => b.id === stored) ? stored : '';
  return { branch, open, multi, all: data?.branches ?? [], manage: !!data?.manage, limit: data?.limit ?? null, set: (id: string) => org && write(org, id), name: open.find(b => b.id === branch)?.name ?? null };
}

/** `path` with the chosen branch as a query parameter (nothing when all branches are shown). */
export function withBranch(path: string, branch: string) {
  return branch ? path + (path.includes('?') ? '&' : '?') + 'branch=' + encodeURIComponent(branch) : path;
}
