import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1); // Required for secure cookies behind a proxy like Cloud Run

app.use(express.json());
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "magic-key-99"],
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production", 
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Required for iframe cross-site cookies in prod
    httpOnly: true,
  })
);

const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let appUrl = process.env.APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    console.error("Missing OAuth config:", { clientId: !!clientId, clientSecret: !!clientSecret, appUrl: !!appUrl });
    throw new Error("Missing required Google OAuth environment variables");
  }

  // Remove trailing slashes from appUrl
  appUrl = appUrl.replace(/\/+$/, "");

  const redirectUri = `${appUrl}/api/auth/callback`;
  console.log(`[OAuth] Using redirect URI: ${redirectUri}`);

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
};

// Auth URL endpoint
app.get("/api/auth/url", (req, res) => {
  try {
    const scopes = [
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    const client = getOAuth2Client();
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
    });

    res.json({ url });
  } catch (error: any) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// Callback endpoint (support both with and without trailing slash)
app.get(["/api/auth/callback", "/api/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  console.log(`[OAuth] Received callback with code: ${code ? "PRESENT" : "MISSING"}`);

  if (!code) {
    return res.status(400).send("No code provided");
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code as string);
    req.session!.tokens = tokens;

    // Pre-fetch user info to have it ready
    try {
      client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: client });
      const userInfo = await oauth2.userinfo.get();
      req.session!.email = userInfo.data.email;
    } catch (e) {
      console.error("Failed to fetch user email during callback", e);
    }

    console.log("[OAuth] Successfully exchanged code for tokens.");

    res.send(`
      <html>
        <head>
          <title>인증 상태 확인</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #1e293b; }
            .card { background: white; border: 3px solid #0f172a; padding: 40px; display: inline-block; box-shadow: 10px 10px 0px #0f172a; font-family: system-ui, -apple-system, sans-serif; }
            h2 { font-size: 24px; font-weight: 900; text-transform: uppercase; margin-bottom: 20px; }
            p { margin-bottom: 30px; letter-spacing: -0.01em; color: #475569; }
            .btn { 
              background: #0f172a; color: white; border: none; padding: 15px 30px; 
              font-weight: 900; text-transform: uppercase; cursor: pointer;
              box-shadow: 4px 4px 0px #cbd5e1;
              transition: all 0.2s;
            }
            .btn:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0px #cbd5e1; }
            .status { font-family: monospace; font-size: 11px; color: #94a3b8; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Successful</h2>
            <p>구글 인증이 성공적으로 완료되었습니다.<br>이제 창을 닫고 메인 화면으로 돌아가세요.</p>
            <button class="btn" onclick="finishAuth()">설정 완료 및 창 닫기</button>
            <div class="status" id="debug-status">로그인 신호를 전송 중...</div>
          </div>

          <script>
            function finishAuth() {
              window.close();
            }

            console.log("[OAuth Callback] Attempting to notify parent window...");
            
            // Try multiple ways to signal success
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                console.log("[OAuth Callback] Sent message to opener");
              }
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                console.log("[OAuth Callback] Sent message to parent");
              }
              
              // Also store in sessionStorage as a fallback
              localStorage.setItem('google_auth_complete', Date.now().toString());
              
              document.getElementById('debug-status').innerText = "모든 신호를 보냈습니다. 자동으로 창이 안 닫히면 위 버튼을 눌러주세요.";
              
              // Auto close attempt
              setTimeout(() => {
                window.close();
              }, 2000);
            } catch (e) {
              console.error("[OAuth Callback] Signal error:", e);
              document.getElementById('debug-status').innerText = "신호 전송 오류가 발생했습니다. 메인 탭에서 새로고침을 해주세요.";
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens", error);
    res.status(500).send("Authentication failed");
  }
});

// Status and diagnostics
app.get("/api/auth/status", async (req, res) => {
  const isAuthenticated = !!req.session?.tokens;
  let email = req.session?.email || null;

  // If we have tokens but no email, try to fetch it
  if (isAuthenticated && !email) {
    try {
      const client = getOAuth2Client();
      client.setCredentials(req.session!.tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: client });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email || null;
      req.session!.email = email; // Cache it
    } catch (e) {
      console.error("Failed to fetch user info for status", e);
    }
  }

  res.json({ 
    isAuthenticated,
    email,
    config: {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      appUrl: process.env.APP_URL,
      isPlaceholderUrl: process.env.APP_URL === "MY_APP_URL" || !process.env.APP_URL,
      expectedRedirectUri: process.env.APP_URL ? `${process.env.APP_URL.replace(/\/+$/, "")}/api/auth/callback` : null
    }
  });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// Import Form API
app.get("/api/forms/import/:formId", async (req, res) => {
  if (!req.session?.tokens) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { formId } = req.params;

  try {
    const client = getOAuth2Client();
    client.setCredentials(req.session.tokens);
    const forms = google.forms({ version: "v1", auth: client });

    const response = await forms.forms.get({ formId });
    const formData = response.data;

    const questions: any[] = [];

    formData.items?.forEach((item: any) => {
      if (!item.questionItem) return;

      const qItem = item.questionItem.question;
      let type: 'MULTIPLE_CHOICE' | 'TEXT' = 'TEXT';
      let options: string[] = [];
      let correctAnswer: string | string[] = "";

      if (qItem.choiceQuestion) {
        type = 'MULTIPLE_CHOICE';
        options = qItem.choiceQuestion.options?.map((opt: any) => opt.value) || [];
      }

      if (qItem.grading?.correctAnswers?.answers) {
        const answers = qItem.grading.correctAnswers.answers.map((a: any) => a.value);
        correctAnswer = answers.length > 1 ? answers : answers[0] || "";
      }

      questions.push({
        id: `imported-${item.itemId}-${Date.now()}`,
        title: item.title || "",
        type,
        options,
        correctAnswer,
        explanation: item.description || "",
        points: qItem.grading?.pointValue || 10
      });
    });

    res.json({
      success: true,
      title: formData.info?.title || "Imported Form",
      questions
    });
  } catch (error: any) {
    console.error("Error importing form:", error);
    res.status(500).json({ error: "Failed to import form. Make sure you have permission and the ID is correct." });
  }
});

// Create Form API
app.post("/api/forms/create", async (req, res) => {
  if (!req.session?.tokens) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { title, questions } = req.body;

  try {
    const client = getOAuth2Client();
    client.setCredentials(req.session.tokens);
    const forms = google.forms({ version: "v1", auth: client });

    // 1. Create a new form
    const createResponse = await forms.forms.create({
      requestBody: {
        info: {
          title: title || "AI Generated Form",
        },
      },
    });

    const formId = createResponse.data.formId;

    // 2. First step: Enable quiz mode
    // This MUST be done first for some grading settings to be valid
    await forms.forms.batchUpdate({
      formId: formId!,
      requestBody: {
        requests: [
          {
            updateSettings: {
              settings: {
                quizSettings: { isQuiz: true },
              },
              updateMask: "quizSettings.isQuiz",
            },
          },
        ],
      },
    });

    // 3. Second step: Add all questions and sections
    const requests: any[] = [];
    let currentSection = "";
    let itemIndex = 0;

    questions.forEach((q: any, qIdx: number) => {
      // Add Page Break if section changed
      if (q.section && q.section !== currentSection) {
        requests.push({
          createItem: {
            item: {
              title: q.section,
              pageBreakItem: {},
            },
            location: { index: itemIndex++ },
          },
        });
        currentSection = q.section;
      }

      const questionTitle = `${qIdx + 1}. ${q.title}`;
      const isMultipleChoice = q.type === "MULTIPLE_CHOICE";
      let validAnswers: string[] = [];

      if (isMultipleChoice) {
        const rawAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [String(q.correctAnswer)];
        
        rawAnswers.forEach((ans: string) => {
          const trimmedAns = String(ans).trim();
          // Direct match
          if (q.options.includes(trimmedAns)) {
            validAnswers.push(trimmedAns);
            return;
          }
          
          // Try to match A, B, C, D... or 1, 2, 3, 4...
          const upperAns = trimmedAns.toUpperCase();
          if (/^[A-Z]$/.test(upperAns)) {
            const idx = upperAns.charCodeAt(0) - 65;
            if (q.options[idx]) validAnswers.push(String(q.options[idx]));
            return;
          }
          if (/^[0-9]+$/.test(trimmedAns)) {
            const idx = parseInt(trimmedAns, 10) - 1;
            if (q.options[idx]) validAnswers.push(String(q.options[idx]));
            return;
          }
          
          // Try to see if an option starts with the answer or vice versa (fuzzy match)
          const matchedOpt = q.options.find((o: string) => String(o).trim() === trimmedAns || String(o).includes(trimmedAns) || trimmedAns.includes(String(o)));
          if (matchedOpt) {
             validAnswers.push(String(matchedOpt));
          }
        });

        // Remove duplicates
        validAnswers = [...new Set(validAnswers)];
      } else {
        validAnswers = Array.isArray(q.correctAnswer) 
          ? q.correctAnswer.map((a: string) => String(a)) 
          : [String(q.correctAnswer)];
      }

      const item: any = {
        title: questionTitle,
        description: q.explanation || "",
        questionItem: {
          question: {
            required: true,
            grading: {
              pointValue: q.points || 10,
              ...(validAnswers.length > 0 ? {
                correctAnswers: {
                  answers: validAnswers.map(a => ({ value: a }))
                }
              } : {})
            },
          },
        },
      };

      if (isMultipleChoice) {
        item.questionItem.question.choiceQuestion = {
          type: "RADIO",
          options: q.options.map((opt: string) => ({ value: String(opt) })),
          shuffle: false,
        };
      } else {
        item.questionItem.question.textQuestion = { paragraph: false };
      }

      requests.push({
        createItem: {
          item,
          location: { index: itemIndex++ },
        },
      });
    });

    if (requests.length > 0) {
      await forms.forms.batchUpdate({
        formId: formId!,
        requestBody: { requests },
      });
    }

    res.json({
      success: true,
      formId,
      formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
    });
  } catch (error: any) {
    console.error("!!! [Form Creation Failed] !!!");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    if (error.response) {
      console.error("Google API Response Data:", JSON.stringify(error.response.data, null, 2));
      console.error("Status Code:", error.response.status);
    }
    
    let errorMessage = error.message;
    if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    }
    
    if (errorMessage.includes("API hasn't been used")) {
      errorMessage = "Google Forms API가 활성화되지 않았습니다. 구글 클라우드 콘솔에서 Forms API를 '사용 설정' 해주세요.";
    } else if (errorMessage.includes("insufficient permissions") || error.code === 403) {
      errorMessage = "권한이 부족합니다. 로그아웃 후 다시 로그인하여 모든 권한(Forms, Drive)을 허용해 주세요.";
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
