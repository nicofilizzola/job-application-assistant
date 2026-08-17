"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addStatusUpdate,
  analyseJobAd,
  ApiError,
  createApplication,
  deleteApplication,
  deleteStatusUpdate,
  patchApplication,
  patchStatusUpdate,
  scoreMatch,
  type JobAnalysis,
} from "@/lib/api";
import { STATUSES, type Status } from "@/lib/status";

export type FormState = { errors?: Record<string, string[]>; saved?: boolean };

const applicationSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company is required"),
  sector: z.string().min(1, "Sector is required"),
  location: z.string().min(1, "Location is required"),
  rating: z
    .number()
    .min(1, "Rating runs from 1 to 5")
    .max(5, "Rating runs from 1 to 5")
    .multipleOf(0.5, "Rating moves in half points")
    .nullable(),
  comment: z.string().nullable(),
  link: z.string().nullable(),
});

const statusUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is required"),
  status: z.enum(STATUSES as unknown as [Status, ...Status[]]),
  note: z.string().nullable(),
});

/** Empty form fields arrive as "" and mean "not set", not "set to empty". */
function optional(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

/** Repeated hidden inputs. An absent list and an empty one both mean "nothing to show", and the
 *  UI renders them identically, so both arrive as null. */
function optionalList(formData: FormData, name: string): string[] | null {
  const items = formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return items.length === 0 ? null : items;
}

function readApplication(formData: FormData) {
  const rating = optional(formData, "rating");
  return {
    title: String(formData.get("title") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim(),
    sector: String(formData.get("sector") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    rating: rating === null ? null : Number(rating),
    comment: optional(formData, "comment"),
    link: optional(formData, "link"),
  };
}

/** Hidden fields, written by AI mode only. Absent on a hand-filled form. */
function readAiFields(formData: FormData) {
  const matchRating = optional(formData, "match_rating");
  return {
    job_ad: optional(formData, "job_ad"),
    match_rating: matchRating === null ? null : Number(matchRating),
    match_summary: optional(formData, "match_summary"),
    match_strengths: optionalList(formData, "match_strengths"),
    match_weaknesses: optionalList(formData, "match_weaknesses"),
  };
}

function readStatusUpdate(formData: FormData) {
  return {
    date: String(formData.get("date") ?? ""),
    status: String(formData.get("status") ?? ""),
    note: optional(formData, "note"),
  };
}

export async function createApplicationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const application = applicationSchema.safeParse(readApplication(formData));
  const firstUpdate = statusUpdateSchema.safeParse(readStatusUpdate(formData));

  if (!application.success || !firstUpdate.success) {
    return {
      errors: {
        ...(application.success ? {} : z.flattenError(application.error).fieldErrors),
        ...(firstUpdate.success ? {} : z.flattenError(firstUpdate.error).fieldErrors),
      },
    };
  }

  const created = await createApplication({
    ...application.data,
    ...readAiFields(formData),
    first_update: firstUpdate.data,
  });
  revalidatePath("/", "layout");
  redirect(`/applications/${created.id}`);
}

export async function updateApplicationAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const application = applicationSchema.safeParse(readApplication(formData));
  if (!application.success) {
    return { errors: z.flattenError(application.error).fieldErrors };
  }

  await patchApplication(id, application.data);
  revalidatePath("/", "layout");
  redirect(`/applications/${id}`);
}

export async function addStatusUpdateAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const update = statusUpdateSchema.safeParse(readStatusUpdate(formData));
  if (!update.success) {
    return { errors: z.flattenError(update.error).fieldErrors };
  }

  await addStatusUpdate(id, update.data);
  revalidatePath("/", "layout");
  return {};
}

export async function editStatusUpdateAction(
  applicationId: string,
  updateId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const update = statusUpdateSchema.safeParse(readStatusUpdate(formData));
  if (!update.success) {
    return { errors: z.flattenError(update.error).fieldErrors };
  }

  await patchStatusUpdate(applicationId, updateId, update.data);
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function deleteStatusUpdateAction(applicationId: string, updateId: string) {
  await deleteStatusUpdate(applicationId, updateId);
  revalidatePath("/", "layout");
}

export type AnalysisState = { analysis?: JobAnalysis; error?: string };

export async function analyseJobAdAction(text: string): Promise<AnalysisState> {
  if (!text.trim()) return { error: "Paste the job advert first" };
  try {
    return { analysis: await analyseJobAd(text) };
  } catch (error) {
    // The browser gets a sentence, not a stack trace; the server log keeps the detail.
    console.error(error);
    return { error: "The advert could not be read. Try again." };
  }
}

export async function scoreMatchAction(id: string): Promise<{ error?: string }> {
  try {
    await scoreMatch(id);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError && error.status === 409) {
      return { error: "Fill in your profile first, on the Profile screen." };
    }
    return { error: "Scoring failed. Try again." };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteApplicationAction(id: string) {
  await deleteApplication(id);
  revalidatePath("/", "layout");
  redirect("/");
}
