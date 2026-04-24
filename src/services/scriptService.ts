import { Question } from "../types";

export function generateGoogleAppsScript(title: string, questions: Question[]): string {
  const scriptLines: string[] = [];

  // Function header
  scriptLines.push(`/**
 * AI Form Magic - Google Apps Script Generator
 * 이 코드를 복사하여 구글 폼의 [스크립트 편집기]에 붙여넣고 실행하세요.
 */
function createMyCustomForm() {
  const title = "${title.replace(/"/g, '\\"').replace(/\n/g, ' ')}";
  const form = FormApp.create(title);
  
  // 퀴즈 모드 설정 필수!
  form.setIsQuiz(true);
  
  // 결과 공개 및 정답 확인 설정
  form.setPublishingSummary(true);
  form.setProgressBar(true);
  
  console.log("Form created: " + form.getEditUrl());
  
  let item;
  let currentSection = "";
`);

  questions.forEach((q, index) => {
    // 1. 섹션 추가 로직
    if (q.section && q.section !== currentSection) {
      scriptLines.push(`  // --- Page Section: ${q.section} ---`);
      scriptLines.push(`  form.addPageBreakItem().setTitle("${q.section.replace(/"/g, '\\"').replace(/\n/g, ' ')}");`);
      currentSection = q.section;
    }

    const questionTitle = `${index + 1}. ${q.title}`;
    scriptLines.push(`  // --- Question ${index + 1} ---`);
    
    if (q.type === 'MULTIPLE_CHOICE') {
      scriptLines.push(`  item = form.addMultipleChoiceItem();
  item.setTitle("${questionTitle.replace(/"/g, '\\"').replace(/\n/g, ' ')}");
  item.setPoints(${q.points || 0});
  item.setRequired(true);
  
  item.setChoices([`);
      
      q.options.forEach((opt, optIndex) => {
        // 정답 비교 로직 (공백 제거 후 비교하여 정확도 향상)
        const isCorrect = String(opt).trim() === String(q.correctAnswer).trim();
        const isLast = optIndex === q.options.length - 1;
        scriptLines.push(`    item.createChoice("${opt.replace(/"/g, '\\"')}", ${isCorrect})${isLast ? '' : ','}`);
      });
      
      scriptLines.push(`  ]);`);
      
      if (q.explanation) {
        scriptLines.push(`  const feedback${index} = FormApp.createFeedback()
    .setText("${q.explanation.replace(/"/g, '\\"').replace(/\n/g, ' ')}")
    .build();
  item.setFeedbackForCorrect(feedback${index});
  item.setFeedbackForIncorrect(feedback${index});`);
      }
    } else {
      // Short Answer (TEXT)
      scriptLines.push(`  item = form.addTextItem();
  item.setTitle("${questionTitle.replace(/"/g, '\\"').replace(/\n/g, ' ')}");
  item.setPoints(${q.points || 0});
  item.setRequired(true);`);
      
      if (q.explanation) {
         scriptLines.push(`  const feedback${index} = FormApp.createFeedback()
    .setText("${q.explanation.replace(/"/g, '\\"').replace(/\n/g, ' ')}")
    .build();
  item.setGeneralFeedback(feedback${index});`);
      }
    }
    scriptLines.push(""); // Spacer
  });

  scriptLines.push(`  console.log("모두 완료되었습니다! 폼을 확인하세요.");
}`);

  return scriptLines.join("\n");
}
