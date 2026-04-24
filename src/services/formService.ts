import { Question } from "../types";

export interface CreateFormResponse {
  success: boolean;
  formId?: string;
  formUrl?: string;
  error?: string;
}

export async function createGoogleForm(title: string, questions: Question[]): Promise<CreateFormResponse> {
  const res = await fetch("/api/forms/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, questions }),
  });

  return res.json();
}

export async function importGoogleForm(formId: string): Promise<{ success: boolean; title: string; questions: Question[] }> {
  const response = await fetch(`/api/forms/import/${formId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to import form");
  }
  return response.json();
}
