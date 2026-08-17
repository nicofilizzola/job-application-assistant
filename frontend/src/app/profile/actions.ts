"use server";

import { revalidatePath } from "next/cache";

import { putProfile } from "@/lib/api";

export type ProfileState = { saved?: boolean };

export async function saveProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  await putProfile(String(formData.get("content") ?? ""));
  revalidatePath("/", "layout");
  return { saved: true };
}
