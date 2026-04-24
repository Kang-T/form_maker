import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

let aiInstance: GoogleGenAI | null = null;

async function getAI(): Promise<GoogleGenAI> {
  if (aiInstance) return aiInstance;
  
  let key: string | undefined = undefined;
  try {
    if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
      key = process.env.GEMINI_API_KEY;
    }
  } catch(e) {}
  
  if (!key) {
    const res = await fetch("/api/config");
    const data = await res.json();
    key = data.GEMINI_API_KEY;
  }
  
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set on the server.");
  }
  
  aiInstance = new GoogleGenAI({ apiKey: key });
  return aiInstance;
}

export async function extractQuestionsFromText(text: string): Promise<Question[]> {
  const ai = await getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      Extract study questions from the following text. 
      For each question, provide:
      1. A clear title/question text.
      2. Type of question: MULTIPLE_CHOICE (객관식) or TEXT (주관식).
      3. Options if it's MULTIPLE_CHOICE (at least 4).
      4. Correct answer (for MULTIPLE_CHOICE, it should be one of the options).
      5. A brief explanation.
      6. Recommended points (default 10).

      TEXT:
      ${text}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["MULTIPLE_CHOICE", "TEXT"] },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            points: { type: Type.NUMBER }
          },
          required: ["title", "type", "correctAnswer", "explanation", "points"]
        }
      }
    }
  });

  const jsonStr = response.text;
  if (!jsonStr) return [];
  
  const parsed = JSON.parse(jsonStr);
  return parsed.map((q: any, i: number) => ({
    ...q,
    id: `q-${i}-${Date.now()}`,
    options: q.options || []
  }));
}
