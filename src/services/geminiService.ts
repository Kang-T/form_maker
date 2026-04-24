import { Question } from "../types";

export async function extractQuestionsFromText(text: string): Promise<Question[]> {
  try {
    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    return data as Question[];
  } catch (error) {
    console.error("Error calling /api/ai/parse:", error);
    throw error;
  }
}
