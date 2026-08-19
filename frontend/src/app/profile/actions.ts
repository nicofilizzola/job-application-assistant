"use server";

import { revalidatePath } from "next/cache";

import { enrichProfile, putProfile } from "@/lib/api";

export type ProfileState = { saved?: boolean };

export async function saveProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  await putProfile(String(formData.get("content") ?? ""));
  revalidatePath("/", "layout");
  return { saved: true };
}

export type EnrichState = { content?: string; error?: string };

/** No revalidatePath: nothing was written. The draft is the browser's until the user saves it. */
export async function enrichProfileAction(
  content: string,
  instruction: string,
): Promise<EnrichState> {
  if (!instruction.trim()) return { error: "Say what to add first" };
  try {
    const draft = await enrichProfile(content, instruction);
    return { content: draft.content };
  } catch (error) {
    // The browser gets a sentence, not a stack trace; the server log keeps the detail.
    console.error(error);
    return { error: "The rewrite failed. Try again." };
  }
}
