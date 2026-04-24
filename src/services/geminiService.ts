import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function extractQuestionsFromText(text: string): Promise<Question[]> {
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
