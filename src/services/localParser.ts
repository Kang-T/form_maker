import { Question } from "../types";

export function parseManualText(text: string): Question[] {
  const questions: Question[] = [];
  // Split by double newlines to separate questions
  const blocks = text.split(/\n\s*\n/);
  
  let currentSection = "";

  blocks.forEach((block, index) => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== "");
    if (lines.length === 0) return;

    // Check for Section/Topic header
    const sectionMatch = lines[0].match(/^(?:###|#|Topic:|주제:|섹션:)\s*(.*)$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      return; // Skip this block as it's just a header
    }

    let title = "";
    const options: string[] = [];
    let correctAnswer = "";
    let explanation = "";
    let points = 10;
    let type: 'MULTIPLE_CHOICE' | 'TEXT' = 'TEXT';

    // Try to find the question title (usually the first line)
    // Clean up leading numbers like "1.", "Q1.", "1)"
    title = lines[0].replace(/^(?:Q|q)?\d+[\.\)]\s*/, ""); 

    // Standard pattern matching
    lines.slice(1).forEach(line => {
      // Find options like A) Option, 1. Option, - Option
      const optionMatch = line.match(/^([A-Da-d]|\d+)\s*[\.\)]\s*(.*)$/) || line.match(/^[-*]\s*(.*)$/);
      if (optionMatch && !line.toLowerCase().startsWith("answer") && !line.toLowerCase().startsWith("explanation") && !line.toLowerCase().startsWith("정답")) {
        options.push(optionMatch[optionMatch.length - 1]);
        type = 'MULTIPLE_CHOICE';
      } 
      // Find Answer
      else if (line.toLowerCase().startsWith("answer") || line.toLowerCase().startsWith("정답")) {
        correctAnswer = line.split(/[:：]/)[1]?.trim() || line.replace(/^(?:answer|정답)\s*[:：]?\s*/i, "").trim();
      }
      // Find Explanation
      else if (line.toLowerCase().startsWith("explanation") || line.toLowerCase().startsWith("해설")) {
        explanation = line.split(/[:：]/)[1]?.trim() || line.replace(/^(?:explanation|해설)\s*[:：]?\s*/i, "").trim();
      }
      // Find Points
      else if (line.toLowerCase().startsWith("points") || line.toLowerCase().startsWith("배점")) {
        const pMatch = line.match(/\d+/);
        if (pMatch) points = parseInt(pMatch[0]);
      }
    });

    // If options were found but no explicit answer, look for markers like *
    if (options.length > 0 && !correctAnswer) {
      const markedIdx = lines.findIndex(l => l.startsWith("*") || l.endsWith("*"));
      if (markedIdx !== -1) {
        correctAnswer = lines[markedIdx].replace(/^\*|\*$/g, "").trim();
      }
    }

    if (title) {
      questions.push({
        id: `parsed-${Date.now()}-${index}`,
        title,
        type,
        options: options.length > 0 ? options : ["Option 1", "Option 2", "Option 3", "Option 4"],
        correctAnswer: correctAnswer || (options.length > 0 ? options[0] : ""),
        explanation,
        points,
        section: currentSection
      });
    }
  });

  return questions;
}
