import { authedApi } from "./auth-api";

export type Culture = {
  id: string;
  slug: string;
  title: string;
  problem_text: string;
  treatment_types: string[];
  effective_for: string[];
  image_url: string;
  image_alt: string;
  catalog_url: string;
  button_label: string;
  is_active: boolean;
  is_default_open: boolean;
  order: number;
  created_at?: string;
  updated_at?: string;
};

export type CultureCreate = {
  title: string;
  slug?: string;
  problem_text?: string;
  treatment_types?: string[];
  effective_for?: string[];
  image_url?: string;
  image_alt?: string;
  catalog_url?: string;
  button_label?: string;
  is_active?: boolean;
  is_default_open?: boolean;
  order?: number;
};

export type CulturePatch = Partial<CultureCreate>;

// ====== Public ======
export async function listCulturesPublic(): Promise<Culture[]> {
  const { data } = await authedApi.get<Culture[]>("/cultures");
  return data;
}

// ====== Admin ======
export async function listCulturesAdmin(): Promise<Culture[]> {
  const { data } = await authedApi.get<Culture[]>("/admin/cultures");
  return data;
}

export async function createCulture(payload: CultureCreate): Promise<Culture> {
  const { data } = await authedApi.post<Culture>("/admin/cultures", payload);
  return data;
}

export async function patchCulture(id: string, payload: CulturePatch): Promise<Culture> {
  const { data } = await authedApi.patch<Culture>(`/admin/cultures/${id}`, payload);
  return data;
}

export async function deleteCulture(id: string): Promise<void> {
  await authedApi.delete(`/admin/cultures/${id}`);
}

export async function reorderCultures(ids: string[]): Promise<Culture[]> {
  const { data } = await authedApi.put<Culture[]>("/admin/cultures/reorder", { ids });
  return data;
}

// ====== NEW: image upload ======
export type UploadedImage = {
  url: string;
  filename: string;
  size: number;
  content_type: string;
};

export async function uploadCultureImage(file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await authedApi.post<UploadedImage>(
    "/admin/cultures/upload-image",
    form,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 },
  );
  return data;
}

// ====== NEW: suggestions (categories + autocomplete tags) ======
export type CategoryOption = { slug: string; label: string };
export type CultureSuggestions = {
  categories: CategoryOption[];
  treatment_types: string[];
  effective_for: string[];
};

export async function getCultureSuggestions(): Promise<CultureSuggestions> {
  const { data } = await authedApi.get<CultureSuggestions>("/admin/cultures/suggestions");
  return data;
}
