"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addStatusUpdate,
  createApplication,
  deleteApplication,
  patchApplication,
} from "@/lib/api";
import { STATUSES, type Status } from "@/lib/status";

export type FormState = { errors?: Record<string, string[]> };

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

export async function deleteApplicationAction(id: string) {
  await deleteApplication(id);
  revalidatePath("/", "layout");
  redirect("/");
}
