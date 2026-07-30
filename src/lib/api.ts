import type { Bootstrap, Category, Entry, EntryImage, Tag, Tier } from './types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  bootstrap: () => req<Bootstrap>('/api/bootstrap'),

  // entries
  getEntries: (a3: string) => req<Entry[]>(`/api/entries?a3=${encodeURIComponent(a3)}`),
  createEntry: (payload: Partial<Entry>) => req<Entry>('/api/entries', json(payload)),
  updateEntry: (id: number, payload: Partial<Entry>) =>
    req<Entry>(`/api/entries/${id}`, { ...json(payload), method: 'PATCH' }),
  deleteEntry: (id: number) =>
    req<{ ok: boolean }>(`/api/entries/${id}`, { method: 'DELETE' }),

  // images
  uploadImages: (entryId: number, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('images', f);
    return req<Entry>(`/api/entries/${entryId}/images`, { method: 'POST', body: fd });
  },
  updateImage: (id: number, payload: { caption?: string; sort?: number }) =>
    req<EntryImage>(`/api/images/${id}`, { ...json(payload), method: 'PATCH' }),
  deleteImage: (id: number) =>
    req<{ ok: boolean }>(`/api/images/${id}`, { method: 'DELETE' }),

  // categories
  createCategory: (payload: { name: string; emoji?: string; sort?: number }) =>
    req<Category>('/api/categories', json(payload)),
  updateCategory: (id: number, payload: { name?: string; emoji?: string; sort?: number }) =>
    req<Category>(`/api/categories/${id}`, { ...json(payload), method: 'PATCH' }),
  deleteCategory: (id: number) =>
    req<{ ok: boolean; movedCount: number; movedTo: number | null }>(`/api/categories/${id}`, {
      method: 'DELETE',
    }),

  // tags
  createTag: (payload: { name: string; color: string; sort?: number }) =>
    req<Tag>('/api/tags', json(payload)),
  updateTag: (id: number, payload: { name?: string; color?: string; sort?: number }) =>
    req<Tag>(`/api/tags/${id}`, { ...json(payload), method: 'PATCH' }),
  deleteTag: (id: number) => req<{ ok: boolean }>(`/api/tags/${id}`, { method: 'DELETE' }),

  // coverage + settings
  putCoverage: (a3: string, tier: Tier) =>
    req<{ a3: string; tier: Tier }>(`/api/coverage/${a3}`, {
      ...json({ tier }),
      method: 'PUT',
    }),
  putSetting: (key: string, value: string) =>
    req<{ key: string; value: string }>(`/api/settings/${key}`, {
      ...json({ value }),
      method: 'PUT',
    }),

  // per-country media (alphabet chart)
  putCountryMedia: (a3: string, kind: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ a3: string; kind: string; file: string; url: string }>(
      `/api/countries/${a3}/media/${kind}`,
      { method: 'PUT', body: fd }
    );
  },
  deleteCountryMedia: (a3: string, kind: string) =>
    req<{ ok: boolean }>(`/api/countries/${a3}/media/${kind}`, { method: 'DELETE' }),

  // backup
  exportUrl: '/api/export',
  importBackup: (file: File) => {
    const fd = new FormData();
    fd.append('backup', file);
    return req<{ ok: boolean; backedUpTo: string }>('/api/import', { method: 'POST', body: fd });
  },
};
